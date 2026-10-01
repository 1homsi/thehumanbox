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
    std::env::var("LLM_KEY")
        .or_else(|_| std::env::var("GROQ_API_KEY"))
        .unwrap_or_default()
}

const DEFAULT_LLM_URL: &str = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_LLM_MODEL: &str = "llama-3.1-8b-instant";

pub static NARRATION_LLM_URL: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| lane_env("NARRATION_LLM_URL", "LLM_URL", DEFAULT_LLM_URL));
pub static NARRATION_LLM_MODEL: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| lane_env("NARRATION_LLM_MODEL", "LLM_MODEL", DEFAULT_LLM_MODEL));
pub static NARRATION_LLM_KEY: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| lane_key("NARRATION_LLM_KEY"));

pub static THINK_LLM_URL: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| lane_env("THINK_LLM_URL", "LLM_URL", DEFAULT_LLM_URL));
pub static THINK_LLM_MODEL: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| lane_env("THINK_LLM_MODEL", "LLM_MODEL", DEFAULT_LLM_MODEL));
pub static THINK_LLM_KEY: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| lane_key("THINK_LLM_KEY"));

#[allow(dead_code)]
pub static LLM_URL: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| env_or("LLM_URL", DEFAULT_LLM_URL));
#[allow(dead_code)]
pub static LLM_MODEL: std::sync::LazyLock<String> =
    std::sync::LazyLock::new(|| env_or("LLM_MODEL", DEFAULT_LLM_MODEL));
#[allow(dead_code)]
pub static LLM_KEY: std::sync::LazyLock<String> = std::sync::LazyLock::new(llm_key_default);

#[derive(Serialize)]
pub struct GroqMessage {
    pub role: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct GroqRequest {
    pub model: String,
    pub messages: Vec<GroqMessage>,
    pub max_tokens: u32,
    pub temperature: f32,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub stop: Vec<String>,
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
    prompt: String,
    max_tokens: u32,
    model: &str,
    temp: f32,
    stop: Vec<String>,
) -> GroqRequest {
    GroqRequest {
        model: model.to_string(),
        messages: vec![GroqMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens,
        temperature: temp,
        stop,
    }
}

pub fn llm_body(prompt: String, max_tokens: u32, model: &str) -> GroqRequest {
    GroqRequest {
        model: model.to_string(),
        messages: vec![GroqMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens,
        temperature: 0.7,
        stop: Vec::new(),
    }
}

pub fn llm_extract(resp: GroqResponse) -> String {
    resp.choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default()
}

/// Case-insensitive search returning a byte offset into `haystack` itself.
///
/// Deliberately not `haystack.to_lowercase().find(needle)`: lowercasing is not
/// length-preserving in UTF-8. U+0130 'İ' expands from 2 bytes to 3 ("i" +
/// U+0307) and the Kelvin sign U+212A shrinks from 3 bytes to 1, so offsets
/// taken from the lowercased copy are not valid indices into the original —
/// they either run past the end (panic) or land inside a multi-byte character
/// (panic on the char-boundary check), and when they happen to stay in bounds
/// they silently delete the wrong span.
///
/// Callers use ASCII needles, so folding only the ASCII range is sufficient and
/// keeps the match positions aligned with the original bytes. Non-ASCII bytes
/// compare exactly, meaning a Kelvin sign is correctly *not* treated as a `k`.
/// `get` rejects any window that would split a character, so every returned
/// offset is a valid char boundary in the original string.
fn find_ascii_ci(haystack: &str, needle: &str) -> Option<usize> {
    let n = needle.len();
    if n == 0 || haystack.len() < n {
        return None;
    }
    haystack
        .char_indices()
        .filter_map(|(i, _)| haystack.get(i..i + n).map(|w| (i, w)))
        .find(|(_, window)| window.eq_ignore_ascii_case(needle))
        .map(|(i, _)| i)
}

pub fn strip_thinking(s: &str) -> String {
    let mut out = s.to_string();
    for tag in &["thinking", "think"] {
        let open = format!("<{}>", tag);
        let close = format!("</{}>", tag);
        loop {
            match (find_ascii_ci(&out, &open), find_ascii_ci(&out, &close)) {
                (Some(a), Some(b)) if b >= a => {
                    out.drain(a..b + close.len());
                }
                (Some(a), _) => {
                    out.drain(a..);
                    break;
                }
                _ => break,
            }
        }
    }
    out.trim().to_string()
}

#[cfg(test)]
mod strip_thinking_tests {
    use super::{find_ascii_ci, strip_thinking};

    #[test]
    fn strips_a_wrapped_thinking_block() {
        assert_eq!(strip_thinking("<thinking>secret</thinking>visible"), "visible");
    }

    #[test]
    fn strips_the_short_think_tag() {
        assert_eq!(strip_thinking("<think>secret</think>visible"), "visible");
    }

    #[test]
    fn matching_is_case_insensitive() {
        assert_eq!(strip_thinking("<THINKING>secret</THINKING>visible"), "visible");
        assert_eq!(strip_thinking("<Think>secret</Think>visible"), "visible");
    }

    #[test]
    fn drops_an_unterminated_block() {
        assert_eq!(strip_thinking("visible<thinking>secret"), "visible");
    }

    #[test]
    fn leaves_untagged_text_alone() {
        assert_eq!(strip_thinking("just some narration"), "just some narration");
        assert_eq!(strip_thinking(""), "");
    }

    /// U+0130 lowercases from 2 bytes to 3, so the lowercased copy is *longer*.
    /// Sitting between the tags it pushed the close-tag offset one past the end
    /// of the original string and panicked in `drain`.
    #[test]
    fn handles_a_lengthening_character_between_the_tags() {
        assert_eq!(strip_thinking("<thinking>\u{0130}secret</thinking>"), "");
        assert_eq!(
            strip_thinking("before\u{0130}<thinking>x</thinking>after"),
            "before\u{0130}after"
        );
    }

    /// U+212A (Kelvin sign) lowercases from 3 bytes to 1. Placed *before* the
    /// tags it shifted the offsets down, so the old code drained a wrong span
    /// and returned truncated garbage (`"ing>"`) instead of removing the block.
    #[test]
    fn handles_a_shrinking_character_before_the_tags() {
        // The Kelvin sign is not an ASCII 'k', so this is not a tag at all and
        // must survive untouched — the old code ate a shifted span here.
        assert_eq!(
            strip_thinking("<thin\u{212A}ing>secret</thin\u{212A}ing>"),
            "<thin\u{212A}ing>secret</thin\u{212A}ing>"
        );
        // The genuine tag still strips, with the multi-byte text next to it.
        assert_eq!(
            strip_thinking("\u{212A}<thinking>secret</thinking>ok"),
            "\u{212A}ok"
        );
    }

    #[test]
    fn handles_multi_byte_text_around_the_tags() {
        assert_eq!(
            strip_thinking("héllo <thinking>秘密</thinking> wörld"),
            "héllo  wörld"
        );
        assert_eq!(strip_thinking("→ <thinking>🙂</thinking> ✓"), "→  ✓");
    }

    #[test]
    fn find_ascii_ci_returns_original_string_offsets() {
        let hay = "a\u{212A}<think>";
        // "a" + 3-byte Kelvin sign, so the tag starts at byte 4.
        assert_eq!(find_ascii_ci(hay, "<think>"), Some(4));
        // Never returns an offset that splits a character.
        assert_eq!(find_ascii_ci("\u{212A}", "k"), None);
        assert_eq!(find_ascii_ci("abc", ""), None);
        assert_eq!(find_ascii_ci("ab", "abc"), None);
    }
}
