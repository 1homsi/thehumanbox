//! Daily-story narration worker.
//!
//! Pulls a queue of NarrationReq off the channel the broadcast loop fills,
//! sends each through the chat-completions endpoint, and parks the resulting
//! one-line story in the shared per-organism map. If the LLM is
//! unreachable, falls back to a deterministic story stitched from life_log
//! events so users still see something.

use std::sync::Arc;

use tokio::sync::{Mutex, mpsc};

use crate::llm::{GroqResponse, NARRATION_LLM_MODEL, NARRATION_LLM_URL, llm_body, llm_extract, strip_thinking};

pub struct NarrationReq {
    pub org_id:   String,
    pub org_name: String,
    pub life_log: Vec<String>,
    pub vocab:    std::collections::HashMap<String, String>,
}

pub async fn narration_worker(
    mut rx: mpsc::Receiver<NarrationReq>,
    stories: Arc<Mutex<std::collections::HashMap<String, String>>>,
    api_key: String,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .unwrap_or_default();

    while let Some(req) = rx.recv().await {
        let events_str = if req.life_log.is_empty() {
            "wandered the world".to_string()
        } else {
            req.life_log.iter()
                .enumerate()
                .map(|(i, e)| format!("{}. {}", i + 1, e))
                .collect::<Vec<_>>()
                .join("; ")
        };

        let vocab_hint: Vec<String> = ["food", "water", "fire", "danger", "friend", "shelter"]
            .iter()
            .filter_map(|&c| req.vocab.get(c).map(|w| format!("{}={}", c, w)))
            .collect();
        let vocab_str = if vocab_hint.is_empty() {
            String::new()
        } else {
            format!(" Their words: {}.", vocab_hint.join(", "))
        };

        let prompt = format!(
            "You are narrating the life of a primitive creature named {}. \
            Today they actually did these things: {}.\
            {} \
            Write ONE vivid sentence (under 25 words) telling their story. \
            Reference specific events and locations. Use their invented words naturally. \
            Do not start with their name.",
            req.org_name, events_str, vocab_str
        );

        println!("[narrate] queuing story for {} - {} events", req.org_name, req.life_log.len());
        match client.post(&**NARRATION_LLM_URL)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&llm_body(prompt, 80, &NARRATION_LLM_MODEL))
            .send().await
        {
            Ok(resp) => {
                match resp.json::<GroqResponse>().await {
                    Ok(data) => {
                        let story = strip_thinking(&llm_extract(data));
                        if !story.is_empty() {
                            println!("[narrate] {} → {}", req.org_name, story);
                            let mut store = stories.lock().await;
                            store.insert(req.org_id, story);
                        }
                    }
                    Err(e) => println!("[narrate] Groq parse error for {}: {}", req.org_name, e),
                }
            }
            Err(e) => {
                println!("[narrate] Groq error for {}: {}", req.org_name, e);
                // LLM unreachable - generate a minimal story from life_log
                // events so the user still sees something useful.
                let food_word  = req.vocab.get("food").map(|s| s.as_str()).unwrap_or("food");
                let water_word = req.vocab.get("water").map(|s| s.as_str()).unwrap_or("water");
                let story = if let Some(ev) = req.life_log.iter().find(|e| e.contains("offspring")) {
                    let child = ev.split("offspring ").nth(1)
                        .and_then(|s| s.split(" at").next()).unwrap_or("a child");
                    format!("{} brought {} into the world today.", req.org_name, child)
                } else if req.life_log.iter().any(|e| e.contains("hut")) {
                    format!("{} raised a shelter from gathered wood.", req.org_name)
                } else if req.life_log.iter().any(|e| e.contains("campfire")) {
                    format!("{} lit a fire and kept the dark at bay.", req.org_name)
                } else if req.life_log.iter().any(|e| e.contains("hunted")) {
                    let prey = req.life_log.iter().find(|e| e.contains("hunted"))
                        .and_then(|e| e.split("hunted a ").nth(1))
                        .and_then(|s| s.split(" at").next()).unwrap_or("prey");
                    format!("{} ran down a {} and fed well.", req.org_name, prey)
                } else if req.life_log.iter().any(|e| e.contains("ate food")) {
                    format!("{} found {} and did not go hungry.", req.org_name, food_word)
                } else if req.life_log.iter().any(|e| e.contains("drank")) {
                    format!("{} drank deep from {} and moved on.", req.org_name, water_word)
                } else if req.life_log.iter().any(|e| e.contains("challenged")) {
                    format!("{} faced a stranger and held their ground.", req.org_name)
                } else if req.life_log.iter().any(|e| e.contains("knowledge")) {
                    format!("{} guided their kin to richer ground.", req.org_name)
                } else {
                    format!("{} roamed and watched the world pass by.", req.org_name)
                };
                let mut store = stories.lock().await;
                store.insert(req.org_id, story);
            }
        }
    }
}
