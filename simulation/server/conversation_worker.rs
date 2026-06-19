use std::sync::Arc;

use tokio::sync::{mpsc, Mutex};

use crate::server::llm::{
    llm_body, llm_extract, strip_thinking, GroqResponse, NARRATION_LLM_MODEL, NARRATION_LLM_URL,
};
use crate::server::llm_rate::SharedGroqLimiter;
use crate::server::llm_stats::SharedLlmStats;
use crate::sim::convo_req::{ConversationReq, ConvoSpeaker};

pub type ConvoLines = Vec<[String; 2]>;
pub type ConvoStore = Arc<Mutex<std::collections::HashMap<String, ConvoLines>>>;

fn merge_vocab(a: &ConvoSpeaker, b: &ConvoSpeaker) -> String {
    let present = |s: Option<&String>| s.map(|w| !w.trim().is_empty()).unwrap_or(false);
    let mut keys: Vec<&str> = Vec::new();
    for k in [
        "food", "water", "fire", "danger", "friend", "shelter", "home", "child", "tribe", "hunt",
    ] {
        if present(a.vocab.get(k)) || present(b.vocab.get(k)) {
            keys.push(k)
        }
    }
    if keys.is_empty() {
        return "  (no shared tribe words yet)".to_string();
    }
    keys.iter()
        .map(|&k| {
            let aw = a
                .vocab
                .get(k)
                .map(|s| s.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("-");
            let bw = b
                .vocab
                .get(k)
                .map(|s| s.as_str())
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("-");
            if aw == bw {
                format!("  {}: both say \"{}\"", k, aw)
            } else {
                format!("  {}: {} says \"{}\", {} says \"{}\"", k, a.name, aw, b.name, bw)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn kind_brief(kind: &str) -> &'static str {
    match kind {
        "courtship" => "Flirting; tentative, warm, increasingly bold. They are not yet partners.",
        "excited" => "Sharing genuine excitement about a recent event in their day.",
        "bonded" => "Established partners checking in; intimate, familiar.",
        "chat" => "Casual chat between tribemates passing time.",
        "gossip" => "Trading gossip about someone else — hushed, curious, a little judgmental.",
        "argue" => "Disagreement; tense, voices rising. Don't resolve it neatly.",
        "farewell" => "Saying goodbye for the night, the season, or longer.",
        _ => "A brief exchange.",
    }
}

fn era_register(era: &str) -> (&'static str, &'static str) {
    match era {
        "pre-stone" | "stone" | "bronze" => (
            "primitive tribespeople in a tribal-survival sim. Basic English with a few invented tribe words",
            "",
        ),
        "iron" | "classical" | "medieval" => (
            "people of an age of iron, law and faith. Plain speech with a little formality; no modern words",
            "\n- Forbidden words: factory, engine, steam, machine, gun, code, phone, electricity.",
        ),
        "renaissance" => (
            "people of an age of art, trade and discovery. Speak plainly with occasional flourish; no industrial words",
            "\n- Forbidden words: engine, steam, machine, gun, code, phone, electricity.",
        ),
        "industrial" | "modern" => (
            "people of an age of machines, cities and trade. Ordinary modern-ish speech",
            "",
        ),
        _ => (
            "people of a far-future age of advanced technology. Clipped, knowing speech",
            "",
        ),
    }
}

fn anchor_line(req: &ConversationReq) -> String {
    match &req.topic {
        Some(t) => format!(
            "\nANCHOR: {who} recently experienced this — \"{text}\". The talk centers on it; reference it naturally.",
            who = t.who,
            text = t.text,
        ),
        None => String::new(),
    }
}

fn build_prompt(req: &ConversationReq) -> String {
    let (register, forbidden) = era_register(&req.era);
    format!("\
Short dialogue for {register}.

SCENE: {scene}{anchor}

A — {a_name} ({a_sex}, {a_age} days, mood: {a_mood}, tribe: {a_tribe}{a_partner})
  recent: {a_recent}
B — {b_name} ({b_sex}, {b_age} days, mood: {b_mood}, tribe: {b_tribe}{b_partner})
  recent: {b_recent}

TRIBE WORDS (only these, never invent new ones):
{vocab}

RULES:
- Output EXACTLY {n} lines, each ending in . ? or !, alternating \"{a_name}:\" / \"{b_name}:\" starting with {a_name}:.
- 3-12 words per line; real speech, not narration. Reference recent/mood/scene.
- Mostly ordinary English; you MAY substitute one tribe word per line where it fits.
- No stage directions, parentheses, markdown, translations, or preamble.{forbidden}

Output ONLY the lines, one per line.",
        scene    = kind_brief(&req.kind),
        anchor   = anchor_line(req),
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
    format!(
        "\
Your previous response was rejected. Output {n} lines, plain text, one per line. \
Each line MUST start with \"{a}:\" or \"{b}:\" alternating, starting with {a}: \
Each line 3-12 words, real speech, ends with . ? or !. \
Scene: {scene}. No preamble, no markdown, no narration. Output only the {n} lines.",
        n = req.n_lines,
        a = req.a.name,
        b = req.b.name,
        scene = kind_brief(&req.kind),
    )
}

fn parse_and_validate(raw: &str, req: &ConversationReq) -> Result<ConvoLines, &'static str> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("empty");
    }

    let a_prefix = format!("{}:", req.a.name);
    let b_prefix = format!("{}:", req.b.name);

    let mut out: ConvoLines = Vec::with_capacity(req.n_lines);
    for line in raw.lines() {
        let mut line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("- ") {
            line = line[2..].to_string()
        }
        if line.starts_with("* ") {
            line = line[2..].to_string()
        }
        if line.starts_with("```") {
            continue;
        }

        let (speaker, text) = if let Some(rest) = line.strip_prefix(&a_prefix) {
            (req.a.name.clone(), rest.trim().to_string())
        } else if let Some(rest) = line.strip_prefix(&b_prefix) {
            (req.b.name.clone(), rest.trim().to_string())
        } else {
            continue;
        };

        let mut text = text.trim_matches(|c| c == '"' || c == '\'').to_string();
        text = text.trim().to_string();
        if text.is_empty() {
            continue;
        }
        if text.len() > 140 {
            return Err("line too long");
        }
        if text.contains("**") || text.contains("```") {
            return Err("markdown");
        }
        if text.contains('*') || text.contains('(') {
            return Err("stage direction");
        }
        let words = text.split_whitespace().count();
        if words < 2 {
            return Err("line too short");
        }
        if words > 18 {
            return Err("line too long");
        }
        let last = text.chars().last().unwrap_or(' ');
        if last != '.' && last != '?' && last != '!' {
            return Err("no punctuation");
        }
        let lower = text.to_lowercase();
        if lower.starts_with("here is") || lower.starts_with("sure") || lower.starts_with("okay,") {
            return Err("meta prefix");
        }
        out.push([speaker, text]);
    }

    if out.len() < (req.n_lines.saturating_sub(1)) {
        return Err("too few lines");
    }
    if out.len() > req.n_lines + 2 {
        return Err("too many lines");
    }

    let expected_first = req.a.name.clone();
    if out.first().map(|p| p[0] != expected_first).unwrap_or(true) {
        return Err("wrong first speaker");
    }
    for w in out.windows(2) {
        if w[0][0] == w[1][0] {
            return Err("speaker did not alternate");
        }
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
    // 5s cap on permit acquisition: if Groq is unreachable and the permit
    // pool stays drained, blocking here would wedge the worker. Treat a
    // timeout as a rate-limit miss — return Err so the caller falls back
    // to its template path without recording a success.
    if tokio::time::timeout(std::time::Duration::from_secs(5), limiter.acquire())
        .await
        .is_err()
    {
        tracing::warn!(target: "convo", "rate limiter acquire timed out after 5s — abort");
        return Err(());
    }
    let started = std::time::Instant::now();
    let resp = client
        .post(&**NARRATION_LLM_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&llm_body(prompt, max_tokens, &NARRATION_LLM_MODEL))
        .send()
        .await;
    let resp = match resp {
        Ok(r) => r,
        Err(_) => {
            stats.record_conversation(started.elapsed().as_millis() as u64, true);
            return Err(());
        }
    };
    // Status-check before body parse — same rationale as the
    // narration worker. A 429 body is JSON-shaped error that won't
    // fit GroqResponse and was being silently classified as a
    // generic decode failure.
    let status = resp.status();
    if !status.is_success() {
        let elapsed = started.elapsed().as_millis() as u64;
        if status.as_u16() == 429 {
            stats.note_conversation_429();
        } else if status.as_u16() >= 500 {
            stats.note_conversation_5xx();
        }
        stats.record_conversation(elapsed, true);
        tracing::warn!(target: "convo", "http {} from {}", status, &**NARRATION_LLM_URL);
        return Err(());
    }
    let data: GroqResponse = match resp.json().await {
        Ok(d) => d,
        Err(_) => {
            stats.record_conversation(started.elapsed().as_millis() as u64, true);
            return Err(());
        }
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
        let raw = one_call(
            &client,
            &api_key,
            build_prompt(&req),
            &stats,
            max_tokens,
            &limiter,
        )
        .await;
        let lines = match raw {
            Ok(s) => match parse_and_validate(&s, &req) {
                Ok(v) => Some(v),
                Err(why) => {
                    tracing::info!(target: "convo", "reject first ({} ↔ {} / {}): {} — raw: {:?}",
                             req.a.name, req.b.name, req.kind, why, s);
                    let retry = one_call(
                        &client,
                        &api_key,
                        build_retry_prompt(&req),
                        &stats,
                        max_tokens,
                        &limiter,
                    )
                    .await;
                    match retry {
                        Ok(s2) => match parse_and_validate(&s2, &req) {
                            Ok(v) => Some(v),
                            Err(why2) => {
                                tracing::info!(target: "convo", "reject retry ({}): {}", req.kind, why2);
                                None
                            }
                        },
                        Err(_) => None,
                    }
                }
            },
            Err(_) => None,
        };

        // Always insert SOMETHING. If both the initial call and the
        // retry failed validation/network, the convo entry would have
        // hung forever on the client (UI shows the templated lines
        // but flagged as "thinking..." indefinitely). Drop in a one-
        // shot template fallback that reflects the scene + a recent
        // event so the entry resolves.
        let final_lines = lines.unwrap_or_else(|| convo_template_fallback(&req));
        tracing::info!(target: "convo", "{} ↔ {} ({}): {} lines",
                 req.a.name, req.b.name, req.kind, final_lines.len());
        let mut s = store.lock().await;
        s.insert(req.entry_id, final_lines);
    }
}

/// Last-resort fallback when both LLM attempts fail. Generates a
/// shaped-by-scene two-line exchange referencing a recent event from
/// either speaker's life log. Better than leaving the entry empty.
fn convo_template_fallback(req: &ConversationReq) -> ConvoLines {
    let scene_line = match req.kind.as_str() {
        "courtship" => "I find myself glancing at you.",
        "excited" => "Did you see that today?",
        "bonded" => "Stay close tonight.",
        "argue" => "That is not how it should be.",
        "farewell" => "Until the next dawn.",
        _ => "It has been a strange day.",
    };
    let reply = match req.kind.as_str() {
        "courtship" => "I noticed too.",
        "excited" => "Yes, the whole tribe will speak of it.",
        "bonded" => "I will. I am here.",
        "argue" => "Then say what is.",
        "farewell" => "Walk safely.",
        _ => "Strange — and not yet finished.",
    };
    vec![
        [req.a.name.clone(), scene_line.to_string()],
        [req.b.name.clone(), reply.to_string()],
    ]
}
