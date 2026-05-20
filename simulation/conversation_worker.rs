use std::sync::Arc;

use tokio::sync::{Mutex, mpsc};

use crate::llm::{GroqResponse, NARRATION_LLM_MODEL, NARRATION_LLM_URL, llm_body, llm_extract, strip_thinking};
use crate::llm_stats::SharedLlmStats;
use crate::llm_rate::SharedGroqLimiter;
use crate::sim::convo_req::{ConvoSpeaker, ConversationReq};

pub type ConvoLines = Vec<[String; 2]>;
pub type ConvoStore = Arc<Mutex<std::collections::HashMap<String, ConvoLines>>>;

fn merge_vocab(a: &ConvoSpeaker, b: &ConvoSpeaker) -> String {
    let mut keys: Vec<&str> = Vec::new();
    for k in ["food", "water", "fire", "danger", "friend", "shelter", "home", "child", "tribe", "hunt"] {
        if a.vocab.contains_key(k) || b.vocab.contains_key(k) { keys.push(k) }
    }
    if keys.is_empty() { return "  (no shared tribe words yet)".to_string() }
    keys.iter()
        .map(|&k| {
            let aw = a.vocab.get(k).map(|s| s.as_str()).unwrap_or("-");
            let bw = b.vocab.get(k).map(|s| s.as_str()).unwrap_or("-");
            if aw == bw { format!("  {}: both say \"{}\"", k, aw) }
            else        { format!("  {}: {} says \"{}\", {} says \"{}\"", k, a.name, aw, b.name, bw) }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn kind_brief(kind: &str) -> &'static str {
    match kind {
        "courtship" => "Flirting; tentative, warm, increasingly bold. They are not yet partners.",
        "excited"   => "Sharing genuine excitement about a recent event in their day.",
        "bonded"    => "Established partners checking in; intimate, familiar.",
        "chat"      => "Casual chat between tribemates passing time.",
        "argue"     => "Disagreement; tense, voices rising. Don't resolve it neatly.",
        "farewell"  => "Saying goodbye for the night, the season, or longer.",
        _           => "A brief exchange.",
    }
}

fn build_prompt(req: &ConversationReq) -> String {
    format!("\
You write short authentic dialogue for primitive tribespeople in a tribal-survival simulation. \
They speak basic English; their tribe has only a few invented words for key concepts.

SCENE: {scene}
EXPECTED LENGTH: exactly {n} lines, alternating speakers starting with {a_name}.

SPEAKER A — {a_name} ({a_sex}, {a_age} days, mood: {a_mood}, tribe: {a_tribe}{a_partner})
  recent: {a_recent}
SPEAKER B — {b_name} ({b_sex}, {b_age} days, mood: {b_mood}, tribe: {b_tribe}{b_partner})
  recent: {b_recent}

THEIR TRIBE'S WORDS (only these, never invent new ones):
{vocab}

RULES:
- Output EXACTLY {n} lines.
- Each line MUST start with either \"{a_name}:\" or \"{b_name}:\" alternating, starting with {a_name}:
- Each line is short — 3 to 12 words. Real speech, not narration.
- They have a small vocabulary. Most words must be ordinary English. You MAY substitute one tribe word per line where it fits naturally (e.g. \"there is bo this way\" for water).
- Reference something concrete from their `recent` activity, mood, or scene.
- No stage directions, no \"*smiles*\", no parentheses, no narration.
- No translations. No glossary. No preamble. Just the lines.
- Each line ends with a period, question mark, or exclamation.

Output ONLY the lines, one per line.",
        scene    = kind_brief(&req.kind),
        n        = req.n_lines,
        a_name   = req.a.name, a_sex = req.a.sex, a_age = req.a.age_days, a_mood = req.a.mood,
        a_tribe  = req.a.tribe_name.as_deref().unwrap_or("unnamed"),
        a_partner = match &req.a.partner_of {
            Some(p) if p == &req.b.name => format!(", partner of {}", req.b.name),
            Some(p)                     => format!(", partner of {}", p),
            None                        => String::new(),
        },
        a_recent = if req.a.recent.is_empty() { "—".to_string() }
                   else { req.a.recent.join(" / ") },
        b_name   = req.b.name, b_sex = req.b.sex, b_age = req.b.age_days, b_mood = req.b.mood,
        b_tribe  = req.b.tribe_name.as_deref().unwrap_or("unnamed"),
        b_partner = match &req.b.partner_of {
            Some(p) if p == &req.a.name => format!(", partner of {}", req.a.name),
            Some(p)                     => format!(", partner of {}", p),
            None                        => String::new(),
        },
        b_recent = if req.b.recent.is_empty() { "—".to_string() }
                   else { req.b.recent.join(" / ") },
        vocab    = merge_vocab(&req.a, &req.b),
    )
}

fn build_retry_prompt(req: &ConversationReq) -> String {
    format!("\
Your previous response was rejected. Output {n} lines, plain text, one per line. \
Each line MUST start with \"{a}:\" or \"{b}:\" alternating, starting with {a}: \
Each line 3-12 words, real speech, ends with . ? or !. \
Scene: {scene}. No preamble, no markdown, no narration. Output only the {n} lines.",
        n = req.n_lines, a = req.a.name, b = req.b.name, scene = kind_brief(&req.kind),
    )
}

fn parse_and_validate(raw: &str, req: &ConversationReq) -> Result<ConvoLines, &'static str> {
    let raw = raw.trim();
    if raw.is_empty() { return Err("empty"); }

    let a_prefix = format!("{}:", req.a.name);
    let b_prefix = format!("{}:", req.b.name);

    let mut out: ConvoLines = Vec::with_capacity(req.n_lines);
    for line in raw.lines() {
        let mut line = line.trim().to_string();
        if line.is_empty() { continue }
        if line.starts_with("- ") { line = line[2..].to_string() }
        if line.starts_with("* ") { line = line[2..].to_string() }
        if line.starts_with("```") { continue }

        let (speaker, text) =
            if let Some(rest) = line.strip_prefix(&a_prefix) {
                (req.a.name.clone(), rest.trim().to_string())
            } else if let Some(rest) = line.strip_prefix(&b_prefix) {
                (req.b.name.clone(), rest.trim().to_string())
            } else {
                continue
            };

        let mut text = text.trim_matches(|c| c == '"' || c == '\'').to_string();
        text = text.trim().to_string();
        if text.is_empty() { continue }
        if text.len() > 140 { return Err("line too long"); }
        if text.contains("**") || text.contains("```") { return Err("markdown"); }
        if text.contains('*') || text.contains('(') { return Err("stage direction"); }
        let words = text.split_whitespace().count();
        if words < 2 { return Err("line too short"); }
        if words > 18 { return Err("line too long"); }
        let last = text.chars().last().unwrap_or(' ');
        if last != '.' && last != '?' && last != '!' { return Err("no punctuation"); }
        let lower = text.to_lowercase();
        if lower.starts_with("here is") || lower.starts_with("sure") || lower.starts_with("okay,") {
            return Err("meta prefix");
        }
        out.push([speaker, text]);
    }

    if out.len() < (req.n_lines.saturating_sub(1)) { return Err("too few lines"); }
    if out.len() > req.n_lines + 2 { return Err("too many lines"); }

    let expected_first = req.a.name.clone();
    if out.first().map(|p| &p[0] != &expected_first).unwrap_or(true) {
        return Err("wrong first speaker");
    }
    for w in out.windows(2) {
        if w[0][0] == w[1][0] { return Err("speaker did not alternate"); }
    }

    Ok(out)
}

async fn one_call(
    client: &reqwest::Client,
    api_key: &str,
    prompt: String,
    stats: &SharedLlmStats,
    max_tokens: u32,
    limiter: &SharedGroqLimiter,
) -> Result<String, ()> {
    limiter.acquire().await;
    let started = std::time::Instant::now();
    let resp = client.post(&**NARRATION_LLM_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&llm_body(prompt, max_tokens, &NARRATION_LLM_MODEL))
        .send().await;
    let resp = match resp {
        Ok(r) => r,
        Err(_) => { stats.record_conversation(started.elapsed().as_millis() as u64, true); return Err(()) }
    };
    let data: GroqResponse = match resp.json().await {
        Ok(d) => d,
        Err(_) => { stats.record_conversation(started.elapsed().as_millis() as u64, true); return Err(()) }
    };
    stats.record_conversation(started.elapsed().as_millis() as u64, false);
    Ok(strip_thinking(&llm_extract(data)))
}

pub async fn conversation_worker(
    mut rx: mpsc::Receiver<ConversationReq>,
    store: ConvoStore,
    api_key: String,
    stats: SharedLlmStats,
    limiter: SharedGroqLimiter,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build()
        .unwrap_or_default();

    while let Some(req) = rx.recv().await {
        let max_tokens = 32 + (req.n_lines as u32) * 28;
        let raw = one_call(&client, &api_key, build_prompt(&req), &stats, max_tokens, &limiter).await;
        let lines = match raw {
            Ok(s) => match parse_and_validate(&s, &req) {
                Ok(v) => Some(v),
                Err(why) => {
                    println!("[convo] reject first ({} ↔ {} / {}): {} — raw: {:?}",
                             req.a.name, req.b.name, req.kind, why, s);
                    let retry = one_call(&client, &api_key, build_retry_prompt(&req), &stats, max_tokens, &limiter).await;
                    match retry {
                        Ok(s2) => match parse_and_validate(&s2, &req) {
                            Ok(v) => Some(v),
                            Err(why2) => {
                                println!("[convo] reject retry ({}): {}", req.kind, why2);
                                None
                            }
                        },
                        Err(_) => None,
                    }
                }
            },
            Err(_) => None,
        };

        if let Some(lines) = lines {
            println!("[convo] ok {} ↔ {} ({}): {} lines",
                     req.a.name, req.b.name, req.kind, lines.len());
            let mut s = store.lock().await;
            s.insert(req.entry_id, lines);
        }
    }
}
