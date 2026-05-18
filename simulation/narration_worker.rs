use std::sync::Arc;

use tokio::sync::{Mutex, mpsc};

use crate::llm::{GroqResponse, NARRATION_LLM_MODEL, NARRATION_LLM_URL, llm_body, llm_extract, strip_thinking};
use crate::llm_stats::SharedLlmStats;
use crate::llm_rate::SharedGroqLimiter;

pub struct NarrationReq {
    pub org_id:        String,
    pub org_name:      String,
    pub sex:           String,
    pub age_days:      u32,
    pub tribe_name:    Option<String>,
    pub life_log:      Vec<String>,
    pub vocab:         std::collections::HashMap<String, String>,
    pub partner_name:  Option<String>,
    pub children:      u32,
    pub era:           String,
    pub mood:          String,
}

fn format_events(log: &[String]) -> String {
    if log.is_empty() {
        return "wandered the world without notable events".to_string()
    }
    log.iter()
        .enumerate()
        .map(|(i, e)| format!("{}. {}", i + 1, e))
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_vocab(vocab: &std::collections::HashMap<String, String>) -> String {
    let mut pairs: Vec<String> = ["food", "water", "fire", "danger", "friend", "shelter", "home", "child", "tribe"]
        .iter()
        .filter_map(|&c| vocab.get(c).map(|w| format!("  {} = \"{}\"", c, w)))
        .collect();
    pairs.sort();
    if pairs.is_empty() { "  (no tribe words yet)".to_string() } else { pairs.join("\n") }
}

fn build_prompt(req: &NarrationReq) -> String {
    format!("\
You write a single-sentence vignette about what one primitive tribesperson did today, \
for a tribal-survival simulation.

ORG:
  name: {name}
  sex: {sex}
  age: {age} days
  mood: {mood}
  partner: {partner}
  children: {children}
  tribe: {tribe}
  world era: {era}

THEIR TRIBE'S WORDS:
{vocab}

TODAY this org did, in order:
{events}

WRITE exactly one English sentence (max 25 words) describing this day.

RULES:
- Past tense, active voice, concrete.
- Reference at least one specific event from the list — do not invent events.
- You MAY embed 1-2 tribe words from the list above for flavor (e.g. write \"the bo\" instead of \"the water\"). Do not invent new tribe words.
- Do NOT start with their name.
- No preamble like \"Here is a sentence:\" or surrounding quotes. No markdown.
- End with a period.

Output ONLY the sentence.",
        name = req.org_name,
        sex = req.sex,
        age = req.age_days,
        mood = req.mood,
        partner = req.partner_name.as_deref().unwrap_or("none"),
        children = req.children,
        tribe = req.tribe_name.as_deref().unwrap_or("unnamed"),
        era = req.era,
        vocab = format_vocab(&req.vocab),
        events = format_events(&req.life_log),
    )
}

fn build_strict_retry_prompt(req: &NarrationReq) -> String {
    format!("\
Earlier output was rejected. Try again, even stricter:

ORG: {name} ({sex}, {age} days, mood: {mood})
EVENTS:
{events}
TRIBE WORDS (optional flavor): {vocab}

OUTPUT exactly ONE past-tense English sentence under 25 words.
- Start with a verb, pronoun, or noun (NOT the name {name}).
- Reference one event above.
- End with a period.
- No preamble, no quotes, no markdown.
Output ONLY the sentence.",
        name = req.org_name,
        sex = req.sex,
        age = req.age_days,
        mood = req.mood,
        events = format_events(&req.life_log),
        vocab = req.vocab.iter().take(4).map(|(c,w)| format!("{}={}", c, w)).collect::<Vec<_>>().join(", "),
    )
}

fn validate(s: &str, org_name: &str) -> Result<String, &'static str> {
    let mut s = s.trim().to_string();
    while s.starts_with('"') || s.starts_with('\'') || s.starts_with('“') || s.starts_with('‘') {
        s.remove(0);
    }
    while s.ends_with('"') || s.ends_with('\'') || s.ends_with('”') || s.ends_with('’') {
        s.pop();
    }
    let s = s.trim().to_string();

    if s.is_empty() { return Err("empty"); }
    if s.len() < 10 { return Err("too short"); }
    if s.len() > 280 { return Err("too long"); }

    let lower = s.to_lowercase();
    for bad in [
        "here is", "here's", "sure,", "okay,", "ok,", "sentence:", "story:",
        "narration:", "output:", "alright,", "got it",
    ] {
        if lower.starts_with(bad) { return Err("meta prefix"); }
    }

    if lower.starts_with(&format!("{} ", org_name.to_lowercase())) {
        return Err("starts with org name");
    }

    let words = s.split_whitespace().count();
    if words > 38 { return Err("too many words"); }
    if words < 3 { return Err("too few words"); }

    if !s.ends_with('.') && !s.ends_with('!') && !s.ends_with('?') {
        return Err("no terminal punctuation");
    }

    if s.contains("**") || s.contains("```") || s.contains("##") {
        return Err("contains markdown");
    }

    if lower.contains("as an ai") || lower.contains("i cannot") || lower.contains("i can't") {
        return Err("refusal-style text");
    }

    Ok(s)
}

fn template_fallback(req: &NarrationReq) -> String {
    let food_word  = req.vocab.get("food").map(|s| s.as_str()).unwrap_or("food");
    let water_word = req.vocab.get("water").map(|s| s.as_str()).unwrap_or("water");
    let log = &req.life_log;
    if let Some(ev) = log.iter().find(|e| e.contains("offspring")) {
        let child = ev.split("offspring ").nth(1)
            .and_then(|s| s.split(" at").next()).unwrap_or("a child");
        format!("{} brought {} into the world today.", req.org_name, child)
    } else if log.iter().any(|e| e.contains("hut")) {
        format!("{} raised a shelter from gathered wood.", req.org_name)
    } else if log.iter().any(|e| e.contains("campfire")) {
        format!("{} lit a fire and kept the dark at bay.", req.org_name)
    } else if log.iter().any(|e| e.contains("hunted")) {
        let prey = log.iter().find(|e| e.contains("hunted"))
            .and_then(|e| e.split("hunted a ").nth(1))
            .and_then(|s| s.split(" at").next()).unwrap_or("prey");
        format!("{} ran down a {} and fed well.", req.org_name, prey)
    } else if log.iter().any(|e| e.contains("ate food")) {
        format!("{} found {} and did not go hungry.", req.org_name, food_word)
    } else if log.iter().any(|e| e.contains("drank")) {
        format!("{} drank deep from {} and moved on.", req.org_name, water_word)
    } else if log.iter().any(|e| e.contains("challenged")) {
        format!("{} faced a stranger and held their ground.", req.org_name)
    } else if log.iter().any(|e| e.contains("knowledge")) {
        format!("{} guided their kin to richer ground.", req.org_name)
    } else {
        format!("{} roamed and watched the world pass by.", req.org_name)
    }
}

async fn one_call(
    client: &reqwest::Client,
    api_key: &str,
    prompt: String,
    stats: &SharedLlmStats,
    limiter: &SharedGroqLimiter,
) -> Result<String, ()> {
    limiter.acquire().await;
    let started = std::time::Instant::now();
    let resp = client.post(&**NARRATION_LLM_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&llm_body(prompt, 96, &NARRATION_LLM_MODEL))
        .send().await;
    let resp = match resp {
        Ok(r) => r,
        Err(_) => { stats.record_narration(started.elapsed().as_millis() as u64, true); return Err(()) }
    };
    let data: GroqResponse = match resp.json().await {
        Ok(d) => d,
        Err(_) => { stats.record_narration(started.elapsed().as_millis() as u64, true); return Err(()) }
    };
    stats.record_narration(started.elapsed().as_millis() as u64, false);
    Ok(strip_thinking(&llm_extract(data)))
}

pub async fn narration_worker(
    mut rx: mpsc::Receiver<NarrationReq>,
    stories: Arc<Mutex<std::collections::HashMap<String, String>>>,
    api_key: String,
    stats: SharedLlmStats,
    limiter: SharedGroqLimiter,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_default();

    while let Some(req) = rx.recv().await {
        println!("[narrate] queuing story for {} - {} events, mood={}", req.org_name, req.life_log.len(), req.mood);

        let raw = one_call(&client, &api_key, build_prompt(&req), &stats, &limiter).await;
        let story = match raw {
            Ok(s) => match validate(&s, &req.org_name) {
                Ok(ok) => Some(ok),
                Err(why) => {
                    println!("[narrate] rejected first response for {} ({}): {:?}", req.org_name, why, s);
                    let retry = one_call(&client, &api_key, build_strict_retry_prompt(&req), &stats, &limiter).await;
                    match retry {
                        Ok(s2) => match validate(&s2, &req.org_name) {
                            Ok(ok) => Some(ok),
                            Err(why2) => {
                                println!("[narrate] rejected retry for {} ({}): {:?}", req.org_name, why2, s2);
                                None
                            }
                        },
                        Err(_) => None,
                    }
                }
            },
            Err(_) => None,
        };

        let final_story = story.unwrap_or_else(|| template_fallback(&req));
        println!("[narrate] {} → {}", req.org_name, final_story);
        let mut store = stories.lock().await;
        store.insert(req.org_id, final_story);
    }
}
