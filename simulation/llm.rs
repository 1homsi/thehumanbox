//! Groq / OpenAI-compatible chat-completions client primitives.
//!
//! Two independent lanes:
//!  - Narration (slow, story-quality prose, runs in narration_worker):
//!    NARRATION_LLM_URL / NARRATION_LLM_MODEL / NARRATION_LLM_KEY.
//!    Defaults to the remote Groq endpoint - narration tolerates the
//!    100-300ms round-trip because it's not on the user-visible path.
//!  - Think (fast, terse first-person thoughts, runs in think_worker):
//!    THINK_LLM_URL / THINK_LLM_MODEL / THINK_LLM_KEY. In prod this
//!    points at a local llama.cpp server running gemma-3-270m on the
//!    same EC2 box - sub-30ms round-trip, never leaves the instance.
//!
//! Backward compatibility: if NARRATION_LLM_* or THINK_LLM_* aren't
//! set, they fall back to LLM_* (and LLM_KEY further falls back to
//! GROQ_API_KEY). A single-lane setup that just sets LLM_URL /
//! LLM_MODEL / LLM_KEY keeps working as before with both lanes
//! pointed at the same endpoint.

use serde::{Deserialize, Serialize};

pub fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// Read a lane-specific env var, fall back to the legacy LLM_* var,
/// finally to the hardcoded default. Used by both NARRATION_* and
/// THINK_* getters so the resolution order is identical.
fn lane_env(lane_key: &str, fallback_key: &str, default: &str) -> String {
    std::env::var(lane_key)
        .or_else(|_| std::env::var(fallback_key))
        .unwrap_or_else(|_| default.to_string())
}

fn lane_key(lane_key_env: &str) -> String {
    // Per-lane key -> LLM_KEY -> legacy GROQ_API_KEY -> empty.
    std::env::var(lane_key_env)
        .or_else(|_| std::env::var("LLM_KEY"))
        .or_else(|_| std::env::var("GROQ_API_KEY"))
        .unwrap_or_default()
}

pub fn llm_key_default() -> String {
    std::env::var("LLM_KEY").or_else(|_| std::env::var("GROQ_API_KEY")).unwrap_or_default()
}

const DEFAULT_LLM_URL:   &str = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_LLM_MODEL: &str = "llama-3.1-8b-instant";

// ── Lane A: narration (Groq by default - tolerates latency) ─────────────
pub static NARRATION_LLM_URL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("NARRATION_LLM_URL", "LLM_URL", DEFAULT_LLM_URL));
pub static NARRATION_LLM_MODEL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("NARRATION_LLM_MODEL", "LLM_MODEL", DEFAULT_LLM_MODEL));
pub static NARRATION_LLM_KEY: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_key("NARRATION_LLM_KEY"));

// ── Lane B: think (local llama-server in prod) ──────────────────────────
pub static THINK_LLM_URL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("THINK_LLM_URL", "LLM_URL", DEFAULT_LLM_URL));
pub static THINK_LLM_MODEL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("THINK_LLM_MODEL", "LLM_MODEL", DEFAULT_LLM_MODEL));
pub static THINK_LLM_KEY: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_key("THINK_LLM_KEY"));

// ── Legacy single-lane handles (kept so existing imports compile) ───────
// Same defaults / same env fallback chain as before. Code that hasn't
// migrated to the lane-specific handles still works. #[allow(dead_code)]
// because the in-tree workers have been migrated; these stay published
// for any external integration or future use.
#[allow(dead_code)]
pub static LLM_URL:   std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    env_or("LLM_URL", DEFAULT_LLM_URL));
#[allow(dead_code)]
pub static LLM_MODEL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    env_or("LLM_MODEL", DEFAULT_LLM_MODEL));
#[allow(dead_code)]
pub static LLM_KEY:   std::sync::LazyLock<String> = std::sync::LazyLock::new(llm_key_default);

#[derive(Serialize)]
pub struct GroqMessage {
    pub role:    String,
    pub content: String,
}

#[derive(Serialize)]
pub struct GroqRequest {
    pub model:       String,
    pub messages:    Vec<GroqMessage>,
    pub max_tokens:  u32,
    pub temperature: f32,
}

#[derive(Deserialize)]
pub struct GroqChoice {
    pub message: GroqMessageResp,
}

#[derive(Deserialize)]
pub struct GroqMessageResp {
    pub content: String,
}

#[derive(Deserialize)]
pub struct GroqResponse {
    pub choices: Vec<GroqChoice>,
}

pub fn llm_body(prompt: String, max_tokens: u32, model: &str) -> GroqRequest {
    GroqRequest {
        model:       model.to_string(),
        messages:    vec![GroqMessage { role: "user".to_string(), content: prompt }],
        max_tokens,
        temperature: 0.7,
    }
}

pub fn llm_extract(resp: GroqResponse) -> String {
    resp.choices.into_iter().next()
        .map(|c| c.message.content)
        .unwrap_or_default()
}

/// Strip `<think>...</think>` (and `<thinking>...`) blocks that some models
/// emit before the actual answer. Handles both well-formed pairs and a
/// dangling `<think>` with no close tag (cuts everything from the open tag
/// to end-of-output).
pub fn strip_thinking(s: &str) -> String {
    let mut out = s.to_string();
    for tag in &["thinking", "think"] {
        loop {
            let lo = out.to_lowercase();
            let open  = format!("<{}>",  tag);
            let close = format!("</{}>", tag);
            match (lo.find(&open), lo.find(&close)) {
                (Some(a), Some(b)) if b >= a => {
                    out.drain(a..b + close.len());
                }
                (Some(a), _) => { out.drain(a..); break; }
                _ => break,
            }
        }
    }
    out.trim().to_string()
}
