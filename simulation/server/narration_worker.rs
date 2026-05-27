use std::sync::Arc;

use tokio::sync::{mpsc, Mutex};

use crate::server::llm::{
    llm_body, llm_extract, strip_thinking, GroqResponse, NARRATION_LLM_MODEL, NARRATION_LLM_URL,
};
use crate::server::llm_rate::SharedGroqLimiter;
use crate::server::llm_stats::SharedLlmStats;

pub struct NarrationReq {
    pub org_id: String,
    pub org_name: String,
    pub sex: String,
    pub age_days: u32,
    pub tribe_name: Option<String>,
    pub life_log: Vec<String>,
    pub vocab: std::collections::HashMap<String, String>,
    pub partner_name: Option<String>,
    pub children: u32,
    pub era: String,
    pub mood: String,
    pub aspiration: String,
    pub memories: Vec<String>,
    pub zodiac: String,
    pub moon_phase: String,
}

fn format_events(log: &[String]) -> String {
    if log.is_empty() {
        return "wandered the world without notable events".to_string();
    }
    log.iter()
        .enumerate()
        .map(|(i, e)| format!("{}. {}", i + 1, e))
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_vocab(vocab: &std::collections::HashMap<String, String>) -> String {
    let mut pairs: Vec<String> = [
        "food", "water", "fire", "danger", "friend", "shelter", "home", "child", "tribe", "death", "joy",
        "spirit", "stranger", "hunt", "trade",
    ]
    .iter()
    .filter_map(|&c| {
        vocab
            .get(c)
            .filter(|w| !w.trim().is_empty())
            .map(|w| format!("  {} = \"{}\"", c, w))
    })
    .collect();
    pairs.sort();
    if pairs.is_empty() {
        "  (no tribe words yet)".to_string()
    } else {
        pairs.join("\n")
    }
}

fn build_prompt(req: &NarrationReq) -> String {
    let aspiration_line = if req.aspiration.is_empty() {
        String::new()
    } else {
        format!("\nLIFE AIM: a {} at heart — let this colour their reading of the day, but do not name the aim.\n", req.aspiration)
    };
    let memory_block = if req.memories.is_empty() {
        String::new()
    } else {
        let lines: Vec<String> = req
            .memories
            .iter()
            .take(4)
            .enumerate()
            .map(|(i, m)| format!("  {}. {}", i + 1, m))
            .collect();
        format!(
            "\nWHAT STAYS IN THEIR MIND (older memories, not from today):\n{}\n",
            lines.join("\n")
        )
    };
    let cosmic_line = if req.zodiac.is_empty() && req.moon_phase.is_empty() {
        String::new()
    } else {
        let mut parts: Vec<String> = Vec::new();
        if !req.zodiac.is_empty() {
            parts.push(format!("born under {}", req.zodiac));
        }
        if !req.moon_phase.is_empty() {
            parts.push(format!(
                "under the {} moon tonight",
                req.moon_phase.replace('_', " ")
            ));
        }
        format!("\nCOSMIC NOTE: {}\n", parts.join(", "))
    };
    format!("\
One-sentence vignette of a person's day in a living tribal-to-civic sim.

ORG: {name} ({sex}, {age_human}, mood: {mood}, partner: {partner}, children: {children}, tribe: {tribe}, era: {era}){aspiration}{cosmic_line}{memory_block}

TRIBE WORDS:
{vocab}

TODAY, in order:
{events}

GUIDANCE:
- Hunts, harvests, births, deaths, weddings, war drums, treaties, new buildings, furniture brought home, books written, festivals, and witnessed kin moments are all valid material.
- Witnessed events (\"saw\", \"watched\", \"heard\") are second-hand — let them ripple through the line as awe, dread, or grief, not as direct action.
- A joyful or mourning mood may bleed into tone; do not state the mood as a label.

RULES:
- One past-tense active sentence, max 30 words, ending in a period.
- Reference at least one event above; do not invent events.
- You MAY embed 1-2 tribe words from the list (e.g. \"the bo\" for water). Do not invent new ones.
- Do NOT start with the name {name}. No preamble, quotes, or markdown.

Output ONLY the sentence.",
        name = req.org_name,
        sex = req.sex,
        age_human = if req.age_days >= 84 {
            let years = req.age_days / 84;
            let extra = req.age_days % 84;
            if extra > 0 {
                format!("{} years {} days old", years, extra)
            } else {
                format!("{} years old", years)
            }
        } else {
            format!("{} days old", req.age_days)
        },
        mood = req.mood,
        partner = req.partner_name.as_deref().unwrap_or("none"),
        children = req.children,
        tribe = req.tribe_name.as_deref().unwrap_or("unnamed"),
        era = req.era,
        aspiration = aspiration_line,
        cosmic_line = cosmic_line,
        memory_block = memory_block,
        vocab = format_vocab(&req.vocab),
        events = format_events(&req.life_log),
    )
}

fn build_strict_retry_prompt(req: &NarrationReq) -> String {
    format!(
        "\
Earlier output was rejected. Try again, even stricter:

ORG: {name} ({sex}, {age} days, mood: {mood})
EVENTS:
{events}
TRIBE WORDS (optional flavor): {vocab}

OUTPUT exactly ONE past-tense English sentence under 30 words.
- Start with a verb, pronoun, or noun (NOT the name {name}).
- Reference one event above (witnessed/heard counts; treat second-hand as awe, dread, or grief).
- End with a period.
- No preamble, no quotes, no markdown.
Output ONLY the sentence.",
        name = req.org_name,
        sex = req.sex,
        age = req.age_days,
        mood = req.mood,
        events = format_events(&req.life_log),
        vocab = req
            .vocab
            .iter()
            .take(4)
            .map(|(c, w)| format!("{}={}", c, w))
            .collect::<Vec<_>>()
            .join(", "),
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

    if s.is_empty() {
        return Err("empty");
    }
    if s.len() < 10 {
        return Err("too short");
    }
    if s.len() > 280 {
        return Err("too long");
    }

    let lower = s.to_lowercase();
    for bad in [
        "here is",
        "here's",
        "sure,",
        "okay,",
        "ok,",
        "sentence:",
        "story:",
        "narration:",
        "output:",
        "alright,",
        "got it",
    ] {
        if lower.starts_with(bad) {
            return Err("meta prefix");
        }
    }

    if lower.starts_with(&format!("{} ", org_name.to_lowercase())) {
        return Err("starts with org name");
    }

    let words = s.split_whitespace().count();
    // Prompt asks for ≤30; validator allows a little slack (35) so a
    // single extra clause doesn't waste a retry slot.
    if words > 35 {
        return Err("too many words");
    }
    if words < 3 {
        return Err("too few words");
    }

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
    let food_word = req.vocab.get("food").map(|s| s.as_str()).unwrap_or("food");
    let water_word = req.vocab.get("water").map(|s| s.as_str()).unwrap_or("water");
    let log = &req.life_log;
    if let Some(ev) = log.iter().find(|e| e.contains("offspring")) {
        let child = ev
            .split("offspring ")
            .nth(1)
            .and_then(|s| s.split(" at").next())
            .unwrap_or("a child");
        format!("{} brought {} into the world today.", req.org_name, child)
    } else if log.iter().any(|e| e.contains("war drums")) {
        format!(
            "{} heard distant war drums and gathered their kin closer.",
            req.org_name
        )
    } else if log.iter().any(|e| e.contains("battle")) {
        format!("{} braced as word of battle reached the camp.", req.org_name)
    } else if let Some(ev) = log.iter().find(|e| e.contains("watched") && e.contains("pass")) {
        let who = ev
            .split("watched ")
            .nth(1)
            .and_then(|s| s.split(" pass").next())
            .unwrap_or("a kinsman");
        format!("{} watched {} pass and could not speak.", req.org_name, who)
    } else if log.iter().any(|e| e.contains("first breath")) {
        format!(
            "{} saw new life take its first breath and felt the camp warm.",
            req.org_name
        )
    } else if let Some(ev) = log.iter().find(|e| e.contains("brought home a")) {
        let thing = ev
            .split("brought home a ")
            .nth(1)
            .and_then(|s| s.split(' ').next())
            .unwrap_or("trinket");
        format!(
            "{} brought home a {} and set it by the hearth.",
            req.org_name, thing
        )
    } else if log.iter().any(|e| e.contains("wed") || e.contains("married")) {
        format!("{} bound their life to another before the tribe.", req.org_name)
    } else if log.iter().any(|e| e.contains("hut") || e.contains("raised a")) {
        format!("{} raised a shelter from gathered wood.", req.org_name)
    } else if log
        .iter()
        .any(|e| e.contains("campfire") || e.contains("lit a fire"))
    {
        format!("{} lit a fire and kept the dark at bay.", req.org_name)
    } else if log.iter().any(|e| e.contains("hunted")) {
        let prey = log
            .iter()
            .find(|e| e.contains("hunted"))
            .and_then(|e| e.split("hunted a ").nth(1))
            .and_then(|s| s.split(" at").next())
            .unwrap_or("prey");
        format!("{} ran down a {} and fed well.", req.org_name, prey)
    } else if log.iter().any(|e| e.contains("fled") || e.contains("escaped")) {
        format!(
            "{} fled with a hammering heart and lived to see dusk.",
            req.org_name
        )
    } else if log.iter().any(|e| e.contains("wrote") || e.contains("book")) {
        format!(
            "{} set words to page and left a thought for kin yet unborn.",
            req.org_name
        )
    } else if log
        .iter()
        .any(|e| e.contains("learned") && e.contains("religion"))
    {
        format!(
            "{} heard a new faith named and turned it over in their mind.",
            req.org_name
        )
    } else if log.iter().any(|e| e.contains("trade") || e.contains("bartered")) {
        format!(
            "{} bartered at the edge of camp and came away the richer.",
            req.org_name
        )
    } else if log.iter().any(|e| e.contains("ate food")) {
        format!("{} found {} and did not go hungry.", req.org_name, food_word)
    } else if log.iter().any(|e| e.contains("drank")) {
        format!("{} drank deep from {} and moved on.", req.org_name, water_word)
    } else if log.iter().any(|e| e.contains("challenged")) {
        format!("{} faced a stranger and held their ground.", req.org_name)
    } else if log.iter().any(|e| e.contains("knowledge")) {
        format!("{} guided their kin to richer ground.", req.org_name)
    } else if req.mood == "joyful" {
        format!(
            "{} walked through the day with a quiet brightness in their chest.",
            req.org_name
        )
    } else if req.mood == "mourning" {
        format!(
            "{} carried grief through the camp and spoke little.",
            req.org_name
        )
    } else if let Some(first) = req.memories.first() {
        let lower = first.trim_end_matches('.').to_lowercase();
        format!("{} moved through the day, thinking of {}.", req.org_name, lower)
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
    // 5s cap on permit acquisition: if Groq is unreachable and the permit
    // pool stays drained, blocking here would wedge the worker. Treat a
    // timeout as a rate-limit miss — return Err so the caller falls back
    // to its template path without recording a success.
    if tokio::time::timeout(std::time::Duration::from_secs(5), limiter.acquire())
        .await
        .is_err()
    {
        tracing::warn!(target: "narrate", "rate limiter acquire timed out after 5s — abort");
        return Err(());
    }
    let started = std::time::Instant::now();
    let resp = client
        .post(&**NARRATION_LLM_URL)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&llm_body(prompt, 96, &NARRATION_LLM_MODEL))
        .send()
        .await;
    let resp = match resp {
        Ok(r) => r,
        Err(_) => {
            stats.record_narration(started.elapsed().as_millis() as u64, true);
            return Err(());
        }
    };
    // Honour HTTP status before attempting to parse the body — Groq's
    // 429/5xx return JSON-shaped errors that won't deserialise into
    // GroqResponse and were silently bucketed as generic errors.
    let status = resp.status();
    if !status.is_success() {
        let elapsed = started.elapsed().as_millis() as u64;
        if status.as_u16() == 429 {
            stats.note_narration_429();
        } else if status.as_u16() >= 500 {
            stats.note_narration_5xx();
        }
        stats.record_narration(elapsed, true);
        tracing::warn!(target: "narrate", "http {} from {}", status, &**NARRATION_LLM_URL);
        return Err(());
    }
    let data: GroqResponse = match resp.json().await {
        Ok(d) => d,
        Err(_) => {
            stats.record_narration(started.elapsed().as_millis() as u64, true);
            return Err(());
        }
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
        tracing::info!(target: "narrate", "queuing story for {} - {} events, mood={}", req.org_name, req.life_log.len(), req.mood);

        let raw = one_call(&client, &api_key, build_prompt(&req), &stats, &limiter).await;
        let story = match raw {
            Ok(s) => match validate(&s, &req.org_name) {
                Ok(ok) => Some(ok),
                Err(why) => {
                    tracing::info!(target: "narrate", "rejected first response for {} ({}): {:?}", req.org_name, why, s);
                    let retry = one_call(
                        &client,
                        &api_key,
                        build_strict_retry_prompt(&req),
                        &stats,
                        &limiter,
                    )
                    .await;
                    match retry {
                        Ok(s2) => match validate(&s2, &req.org_name) {
                            Ok(ok) => Some(ok),
                            Err(why2) => {
                                tracing::info!(target: "narrate", "rejected retry for {} ({}): {:?}", req.org_name, why2, s2);
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
        tracing::info!(target: "narrate", "{} → {}", req.org_name, final_story);
        let mut store = stories.lock().await;
        store.insert(req.org_id, final_story);
    }
}
