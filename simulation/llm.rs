//! Groq / OpenAI-compatible chat-completions client primitives.
//!
//! Both narration_worker and think_worker hit a chat-completions endpoint
//! through this layer. Pulling it out of main.rs gives both workers a
//! single source of truth for env-driven config + request/response shape.

use serde::{Deserialize, Serialize};

pub fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

pub fn llm_key_default() -> String {
    std::env::var("LLM_KEY").or_else(|_| std::env::var("GROQ_API_KEY")).unwrap_or_default()
}

pub static LLM_URL:   std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    env_or("LLM_URL", "https://api.groq.com/openai/v1/chat/completions"));
pub static LLM_MODEL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    env_or("LLM_MODEL", "llama-3.1-8b-instant"));
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
