

use serde::{Deserialize, Serialize};

pub fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn lane_env(lane_key: &str, fallback_key: &str, default: &str) -> String {
    std::env::var(lane_key)
        .or_else(|_| std::env::var(fallback_key))
        .unwrap_or_else(|_| default.to_string())
}

fn lane_key(lane_key_env: &str) -> String {
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

pub static NARRATION_LLM_URL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("NARRATION_LLM_URL", "LLM_URL", DEFAULT_LLM_URL));
pub static NARRATION_LLM_MODEL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("NARRATION_LLM_MODEL", "LLM_MODEL", DEFAULT_LLM_MODEL));
pub static NARRATION_LLM_KEY: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_key("NARRATION_LLM_KEY"));

pub static THINK_LLM_URL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("THINK_LLM_URL", "LLM_URL", DEFAULT_LLM_URL));
pub static THINK_LLM_MODEL: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_env("THINK_LLM_MODEL", "LLM_MODEL", DEFAULT_LLM_MODEL));
pub static THINK_LLM_KEY: std::sync::LazyLock<String> = std::sync::LazyLock::new(||
    lane_key("THINK_LLM_KEY"));

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
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub stop:        Vec<String>,
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

pub fn llm_body_with_temp_stop(
    prompt: String, max_tokens: u32, model: &str, temp: f32, stop: Vec<String>,
) -> GroqRequest {
    GroqRequest {
        model:       model.to_string(),
        messages:    vec![GroqMessage { role: "user".to_string(), content: prompt }],
        max_tokens,
        temperature: temp,
        stop,
    }
}

pub fn llm_body(prompt: String, max_tokens: u32, model: &str) -> GroqRequest {
    GroqRequest {
        model:       model.to_string(),
        messages:    vec![GroqMessage { role: "user".to_string(), content: prompt }],
        max_tokens,
        temperature: 0.7,
        stop:        Vec::new(),
    }
}

pub fn llm_extract(resp: GroqResponse) -> String {
    resp.choices.into_iter().next()
        .map(|c| c.message.content)
        .unwrap_or_default()
}

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
