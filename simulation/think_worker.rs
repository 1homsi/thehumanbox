

use std::sync::Arc;

use rand::SeedableRng;
use tokio::sync::{Mutex, mpsc};

use crate::llm::{GroqResponse, THINK_LLM_MODEL, THINK_LLM_URL, llm_body_with_stop, llm_extract, strip_thinking};
use crate::llm_stats::SharedLlmStats;
use crate::llm_rate::SharedGroqLimiter;
use crate::sim::local_think;
use crate::sim::simulation::ThinkTrigger;

#[derive(Default)]
pub struct ThinkResult {
    pub org_id:           String,
    pub target_lineage:   Option<String>,
    pub attitude_delta:   Option<f32>,
    pub thought:          Option<String>,
    pub strategy_lineage: Option<String>,
    pub strategy:         Option<String>,
    pub directive:        Option<String>,
    pub directive_ticks:  u64,
    pub new_discovery:    Option<String>,
    pub trait_delta:      Option<(String, f32)>,
    pub alliance_type:    Option<String>,
    pub teaching:         Option<String>,
    pub target_org_id:    Option<String>,
}

pub fn build_result_from_local(trigger: &ThinkTrigger, local: local_think::LocalResult) -> Option<ThinkResult> {
    let result = match trigger.scenario.as_str() {
        "first_contact" => ThinkResult {
            org_id:         trigger.org_id.clone(),
            target_lineage: trigger.target_lineage.clone(),
            attitude_delta: local.attitude_delta,
            thought:        Some(local.thought.to_string()),
            ..Default::default()
        },
        "council" => ThinkResult {
            org_id:           trigger.org_id.clone(),
            thought:          Some(format!("the tribe should {}", local.strategy.unwrap_or(local.word))),
            strategy_lineage: Some(trigger.lineage_id.clone()),
            strategy:         local.strategy.map(|s| s.to_string()),
            ..Default::default()
        },
        "survival_crisis" => ThinkResult {
            org_id:          trigger.org_id.clone(),
            thought:         Some(local.thought.to_string()),
            directive:       local.directive.map(|s| s.to_string()),
            directive_ticks: local.directive_ticks,
            ..Default::default()
        },
        "abundance" => ThinkResult {
            org_id:          trigger.org_id.clone(),
            thought:         Some(local.thought.to_string()),
            directive:       local.directive.map(|s| s.to_string()),
            directive_ticks: local.directive_ticks,
            ..Default::default()
        },
        "threat" => ThinkResult {
            org_id:          trigger.org_id.clone(),
            thought:         Some(local.thought.to_string()),
            directive:       local.directive.map(|s| s.to_string()),
            directive_ticks: local.directive_ticks,
            ..Default::default()
        },
        "lonely" => ThinkResult {
            org_id:          trigger.org_id.clone(),
            thought:         Some(local.thought.to_string()),
            directive:       local.directive.map(|s| s.to_string()),
            directive_ticks: local.directive_ticks,
            ..Default::default()
        },
        "restless" => ThinkResult {
            org_id:          trigger.org_id.clone(),
            thought:         Some(local.thought.to_string()),
            directive:       local.directive.map(|s| s.to_string()),
            directive_ticks: local.directive_ticks,
            ..Default::default()
        },
        "invention" => ThinkResult {
            org_id:        trigger.org_id.clone(),
            new_discovery: local.discovery,
            thought:       Some(local.thought.to_string()),
            ..Default::default()
        },
        "reflection" => ThinkResult {
            org_id:      trigger.org_id.clone(),
            thought:     Some(local.thought.to_string()),
            trait_delta: local.trait_name.zip(local.trait_delta)
                             .map(|(n, d)| (n.to_string(), d)),
            ..Default::default()
        },
        "negotiation" => ThinkResult {
            org_id:        trigger.org_id.clone(),
            target_lineage: trigger.target_lineage.clone(),
            target_org_id:  trigger.target_org_id.clone(),
            alliance_type:  local.alliance.map(|s| s.to_string()),
            thought:        Some(format!("{} with {}",
                local.alliance.unwrap_or("deal").replace('_', " "),
                trigger.other_name.as_deref().unwrap_or("them"))),
            ..Default::default()
        },
        "grief" => ThinkResult {
            org_id:  trigger.org_id.clone(),
            thought: Some(local.thought.to_string()),
            ..Default::default()
        },
        "illness" => ThinkResult {
            org_id:          trigger.org_id.clone(),
            directive:       local.directive.map(|s| s.to_string()),
            directive_ticks: local.directive_ticks,
            thought:         Some(local.thought.to_string()),
            ..Default::default()
        },
        "migration" => ThinkResult {
            org_id:          trigger.org_id.clone(),
            thought:         Some(local.thought.to_string()),
            directive:       local.directive.map(|s| s.to_string()),
            directive_ticks: local.directive_ticks,
            ..Default::default()
        },
        "discovery" => ThinkResult {
            org_id:  trigger.org_id.clone(),
            thought: Some(local.thought.to_string()),
            ..Default::default()
        },
        _ => return None,
    };
    Some(result)
}

pub fn deterministic_think_seed(trigger: &ThinkTrigger, attempt: u8) -> u64 {
    fn mix_bytes(mut h: u64, bytes: &[u8]) -> u64 {
        for &b in bytes {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        h
    }

    fn mix_str(h: u64, s: &str) -> u64 {
        mix_bytes(h, s.as_bytes())
    }

    fn mix_f32(h: u64, v: f32) -> u64 {
        mix_bytes(h, &v.to_bits().to_le_bytes())
    }

    let mut h = 0xcbf29ce484222325u64;
    h = mix_str(h, &trigger.org_id);
    h = mix_str(h, &trigger.lineage_id);
    h = mix_str(h, &trigger.scenario);
    h = mix_str(h, trigger.target_lineage.as_deref().unwrap_or(""));
    h = mix_bytes(h, &(trigger.kin_count as u64).to_le_bytes());
    h = mix_f32(h, trigger.energy_avg);
    h = mix_str(h, &trigger.context);
    for d in &trigger.discoveries { h = mix_str(h, d); }
    for l in &trigger.life_log_top { h = mix_str(h, l); }
    h = mix_str(h, &trigger.emotional_state);
    h = mix_str(h, trigger.other_name.as_deref().unwrap_or(""));
    for d in &trigger.other_discoveries { h = mix_str(h, d); }
    h = mix_str(h, trigger.target_org_id.as_deref().unwrap_or(""));
    h = mix_f32(h, trigger.aggression);
    h = mix_f32(h, trigger.fear);
    h = mix_f32(h, trigger.social_tendency);
    h = mix_f32(h, trigger.curiosity);
    h = mix_f32(h, trigger.resilience);
    mix_bytes(h, &[attempt])
}

// Translate trait floats into a plain-English personality summary for the LLM.
fn personality_summary(t: &ThinkTrigger) -> String {
    let mut parts = Vec::new();
    if t.aggression > 0.7        { parts.push("aggressive"); }
    else if t.aggression < 0.3   { parts.push("peaceful"); }
    if t.curiosity > 0.7         { parts.push("curious"); }
    else if t.curiosity < 0.3    { parts.push("incurious"); }
    if t.social_tendency > 0.7   { parts.push("very social"); }
    else if t.social_tendency < 0.3 { parts.push("solitary"); }
    if t.fear > 0.7              { parts.push("fearful"); }
    else if t.fear < 0.3         { parts.push("brave"); }
    if t.resilience > 0.7        { parts.push("resilient"); }
    else if t.resilience < 0.3   { parts.push("fragile"); }
    if parts.is_empty()          { "balanced".to_string() }
    else                         { parts.join(", ") }
}

// Build a rich first-person prompt for the given scenario.
// Returns (prompt_string, token_budget).
fn build_prompt(trigger: &ThinkTrigger) -> (String, u32) {
    let name        = &trigger.org_name;
    let personality = personality_summary(trigger);
    let emotion     = if trigger.emotional_state.is_empty() { "calm".to_string() }
                      else { trigger.emotional_state.clone() };
    let knowledge   = if trigger.discoveries.is_empty() { "nothing yet".to_string() }
                      else { trigger.discoveries.join(", ") };
    let memories    = if trigger.life_log_top.is_empty() { "no notable events".to_string() }
                      else { trigger.life_log_top.join("; ") };

    let preamble = format!(
        "You are {name}, a primitive creature surviving in a harsh world.\n\
         Personality: {personality}.\n\
         Emotional state: {emotion}.\n\
         Knowledge: {knowledge}.\n\
         Memories: {memories}.\n"
    );

    let (scenario_text, action_choices, ticks) = match trigger.scenario.as_str() {
        "first_contact" => (
            format!(
                "You just spotted {} for the first time. They are strangers. Your tribe has {} members nearby.",
                trigger.other_name.as_deref().unwrap_or("an unknown group"),
                trigger.kin_count
            ),
            "friendly, cautious, hostile",
            0u64,
        ),
        "council" => (
            format!(
                "Your tribe of {} is well-fed and safe. As a leader you must decide the tribe's next goal.",
                trigger.kin_count
            ),
            "settle, hunt, explore",
            0,
        ),
        "survival_crisis" => (
            format!("You are in a survival crisis: {}. You must act immediately.", trigger.context),
            "food, water, shelter",
            300,
        ),
        "abundance" => (
            format!(
                "You have plenty of food and water. {} kin are nearby. You feel free to do something meaningful.",
                trigger.kin_count
            ),
            "build, explore, socialize",
            400,
        ),
        "threat" => (
            format!(
                "You sense danger: {}. You have {} allies nearby.",
                trigger.context, trigger.kin_count
            ),
            "fight, flee, trade",
            250,
        ),
        "lonely" => (
            "You have been alone too long. Loneliness gnaws at you.".to_string(),
            "seek_kin, find_stranger, wander",
            500,
        ),
        "restless" => (
            "You are safe and fed but feel an aching restlessness — a need to do something more.".to_string(),
            "explore, build, create",
            500,
        ),
        "invention" => (
            format!(
                "A sudden insight strikes you. You could discover: {}.",
                trigger.context
            ),
            "excited, focused, uncertain",
            0,
        ),
        "reflection" => (
            format!(
                "You sit quietly and reflect on your life so far. You feel {}.",
                trigger.emotional_state
            ),
            "braver, more_social, more_curious, more_resilient",
            0,
        ),
        "negotiation" => (
            format!(
                "You are meeting {} face to face. They know: {}. You know: {}. There is an opportunity to make a deal.",
                trigger.other_name.as_deref().unwrap_or("another tribe"),
                trigger.other_discoveries.join(", "),
                knowledge
            ),
            "territory, food_sharing, defense_pact, knowledge_exchange",
            0,
        ),
        "elder_teaching" => (
            format!(
                "You are an elder. A newborn named {} sits before you, eager to learn. You have seen: {}.",
                trigger.other_name.as_deref().unwrap_or("the child"),
                memories
            ),
            "",  // no ACTION for elder_teaching — free-form teaching
            0,
        ),
        "grief" => (
            format!("You just lost someone close. Context: {}.", trigger.context),
            "mourn, rage, endure",
            0,
        ),
        "illness" => (
            format!("You are gravely ill: {}.", trigger.context),
            "rest, isolate, seek_help",
            200,
        ),
        "migration" => (
            format!(
                "Your tribe of {} faces scarcity. {}.",
                trigger.kin_count, trigger.context
            ),
            "migrate, forage, wait",
            400,
        ),
        "discovery" => (
            format!("You just discovered: {}.", trigger.context),
            "excited, grateful, cautious",
            0,
        ),
        _ => return (String::new(), 0),
    };

    let _ = ticks; // ticks are set during result construction, not in prompt

    let prompt = if trigger.scenario == "elder_teaching" {
        format!(
            "{preamble}\n{scenario_text}\n\n\
             Give ONE piece of wisdom to pass on. \
             Start with Remember, Always, or Never. Under 12 words.\n\
             TEACHING: "
        )
    } else {
        format!(
            "{preamble}\n{scenario_text}\n\n\
             Respond in EXACTLY this format (no other text):\n\
             THOUGHT: [your inner thought, 1-2 sentences, first person, as {name}]\n\
             ACTION: [one word from: {action_choices}]"
        )
    };

    let max_tokens = if trigger.scenario == "elder_teaching" { 30 } else { 60 };
    (prompt, max_tokens)
}

// Extract the value after a line-prefix like "THOUGHT: " from the LLM response.
fn extract_tagged(response: &str, tag: &str) -> Option<String> {
    let lower = response.to_lowercase();
    let tag_lower = tag.to_lowercase();
    let start = lower.find(&tag_lower)?;
    let after = &response[start + tag.len()..];
    let line = after.lines().next().unwrap_or("").trim();
    if line.is_empty() { None } else { Some(line.to_string()) }
}

// Build a ThinkResult from the LLM response for the given scenario.
fn build_result_from_llm(
    trigger: &ThinkTrigger,
    response: &str,
) -> Option<ThinkResult> {
    let resp_lower = response.to_lowercase();

    // Elder teaching: the whole response is the teaching itself
    if trigger.scenario == "elder_teaching" {
        // Try TEACHING: tag first, then use the full response
        let teaching_raw = extract_tagged(response, "TEACHING:")
            .unwrap_or_else(|| strip_thinking(response));
        let teaching = teaching_raw.trim().to_string();
        let teaching = if teaching.len() > 90 {
            teaching.split_whitespace().take(14).collect::<Vec<_>>().join(" ")
        } else { teaching };
        if teaching.is_empty() { return None; }
        println!("[think/llm] elder {} teaching → {}", trigger.org_name, teaching);
        return Some(ThinkResult {
            org_id:        trigger.org_id.clone(),
            target_org_id: trigger.target_org_id.clone(),
            teaching:      Some(teaching.clone()),
            thought:       Some(format!("teaching {}", trigger.other_name.as_deref().unwrap_or("the child"))),
            ..Default::default()
        });
    }

    // All other scenarios: extract THOUGHT and ACTION
    let thought = extract_tagged(response, "THOUGHT:")
        .unwrap_or_else(|| {
            // Fallback: use first non-empty line that isn't an ACTION line
            response.lines()
                .filter(|l| {
                    let ll = l.to_lowercase();
                    !ll.starts_with("action:") && !l.trim().is_empty()
                })
                .next()
                .unwrap_or("")
                .trim()
                .to_string()
        });

    let action_raw = extract_tagged(response, "ACTION:")
        .unwrap_or_default();
    let action = action_raw.split_whitespace().next().unwrap_or("").to_lowercase();
    let action = action.trim_matches(|c: char| !c.is_alphanumeric() && c != '_').to_string();

    // Cap thought at 120 chars so it fits in the UI
    let thought = if thought.len() > 120 {
        thought.split_whitespace().take(18).collect::<Vec<_>>().join(" ")
    } else { thought };

    println!("[think/llm] {} {}→action={:?} thought={:?}", trigger.org_name, trigger.scenario, action, thought);

    match trigger.scenario.as_str() {
        "first_contact" => {
            let delta: f32 = if action.starts_with("friend") { 0.35 }
                else if action.starts_with("hostil") || action.starts_with("attack") { -0.4 }
                else { 0.0 };
            Some(ThinkResult {
                org_id:         trigger.org_id.clone(),
                target_lineage: trigger.target_lineage.clone(),
                attitude_delta: Some(delta),
                thought:        Some(if thought.is_empty() { "watching the stranger".to_string() } else { thought }),
                ..Default::default()
            })
        }
        "council" => {
            let strategy = if action.starts_with("settle") || action.starts_with("build") { "settle" }
                else if action.starts_with("hunt") || action.starts_with("food") { "hunt" }
                else { "explore" };
            Some(ThinkResult {
                org_id:           trigger.org_id.clone(),
                thought:          Some(if thought.is_empty() { format!("the tribe should {}", strategy) } else { thought }),
                strategy_lineage: Some(trigger.lineage_id.clone()),
                strategy:         Some(strategy.to_string()),
                ..Default::default()
            })
        }
        "survival_crisis" => {
            let directive = if action.starts_with("food") || action.starts_with("eat") || action.starts_with("hunt") { "seek_food" }
                else if action.starts_with("water") || action.starts_with("drink") { "seek_water" }
                else { "flee" };
            Some(ThinkResult {
                org_id:          trigger.org_id.clone(),
                thought:         Some(if thought.is_empty() { format!("desperate for {}", directive.replace("seek_", "")) } else { thought }),
                directive:       Some(directive.to_string()),
                directive_ticks: 300,
                ..Default::default()
            })
        }
        "abundance" => {
            let directive = if action.starts_with("social") || action.starts_with("gather") || action.starts_with("celebrat") { "socialize" }
                else if action.starts_with("explor") || action.starts_with("wander") { "explore" }
                else { "socialize" };
            Some(ThinkResult {
                org_id:          trigger.org_id.clone(),
                thought:         Some(if thought.is_empty() { format!("wanting to {}", directive) } else { thought }),
                directive:       Some(directive.to_string()),
                directive_ticks: 400,
                ..Default::default()
            })
        }
        "threat" => {
            let directive = if action.starts_with("fight") || action.starts_with("attack") || action.starts_with("defend") { "fight" }
                else if action.starts_with("trade") || action.starts_with("peace") || action.starts_with("gift") { "trade" }
                else { "flee" };
            Some(ThinkResult {
                org_id:          trigger.org_id.clone(),
                thought:         Some(if thought.is_empty() { format!("decided to {}", directive) } else { thought }),
                directive:       Some(directive.to_string()),
                directive_ticks: 250,
                ..Default::default()
            })
        }
        "lonely" => {
            let directive = if action.starts_with("seek_kin") || action.starts_with("family") || action.starts_with("kin") { "socialize" }
                else if action.starts_with("find_stranger") || action.starts_with("stranger") { "trade" }
                else { "explore" };
            Some(ThinkResult {
                org_id:          trigger.org_id.clone(),
                thought:         Some(if thought.is_empty() { "longing for company".to_string() } else { thought }),
                directive:       Some(directive.to_string()),
                directive_ticks: 500,
                ..Default::default()
            })
        }
        "restless" => {
            let directive = if action.starts_with("build") { "explore" }
                else if action.starts_with("create") { "socialize" }
                else { "explore" };
            Some(ThinkResult {
                org_id:          trigger.org_id.clone(),
                thought:         Some(if thought.is_empty() { "driven to explore".to_string() } else { thought }),
                directive:       Some(directive.to_string()),
                directive_ticks: 500,
                ..Default::default()
            })
        }
        "invention" => {
            let candidates: Vec<&str> = trigger.context.split(", ").map(str::trim).filter(|s| !s.is_empty()).collect();
            let valid = ["cooking", "stone_tools", "masonry", "spear", "torch"];
            let discovery = valid.iter()
                .find(|&&v| resp_lower.contains(v) && candidates.contains(&v))
                .copied()
                .or_else(|| candidates.first().copied())
                .unwrap_or("stone_tools");
            Some(ThinkResult {
                org_id:        trigger.org_id.clone(),
                new_discovery: Some(discovery.to_string()),
                thought:       Some(if thought.is_empty() { format!("eureka: {}", discovery.replace('_', " ")) } else { thought }),
                ..Default::default()
            })
        }
        "reflection" => {
            let (trait_name, delta): (&str, f32) = if resp_lower.contains("brave") || resp_lower.contains("courag") { ("fear", -0.06) }
                else if resp_lower.contains("social") || resp_lower.contains("kind") || resp_lower.contains("friend") { ("social_tendency", 0.05) }
                else if resp_lower.contains("curious") || resp_lower.contains("wonder") || resp_lower.contains("explor") { ("curiosity", 0.05) }
                else if resp_lower.contains("aggress") || resp_lower.contains("fierce") || resp_lower.contains("strong") { ("aggression", 0.04) }
                else { ("resilience", 0.04) };
            Some(ThinkResult {
                org_id:      trigger.org_id.clone(),
                thought:     Some(if thought.is_empty() { "reflecting on life".to_string() } else { thought }),
                trait_delta: Some((trait_name.to_string(), delta)),
                ..Default::default()
            })
        }
        "negotiation" => {
            let alliance = if resp_lower.contains("food") || resp_lower.contains("share") || resp_lower.contains("feast") { "food_sharing" }
                else if resp_lower.contains("defense") || resp_lower.contains("defend") || resp_lower.contains("protect") || resp_lower.contains("pact") { "defense_pact" }
                else if resp_lower.contains("knowledge") || resp_lower.contains("teach") || resp_lower.contains("learn") { "knowledge_exchange" }
                else { "territory" };
            Some(ThinkResult {
                org_id:        trigger.org_id.clone(),
                target_lineage: trigger.target_lineage.clone(),
                target_org_id:  trigger.target_org_id.clone(),
                alliance_type:  Some(alliance.to_string()),
                thought:        Some(if thought.is_empty() {
                    format!("{} with {}", alliance.replace('_', " "), trigger.other_name.as_deref().unwrap_or("them"))
                } else { thought }),
                ..Default::default()
            })
        }
        "grief" => {
            Some(ThinkResult {
                org_id:  trigger.org_id.clone(),
                thought: Some(if thought.is_empty() { "lost someone close".to_string() } else { thought }),
                ..Default::default()
            })
        }
        "illness" => {
            let directive = if action.starts_with("rest") { "rest" }
                else if action.starts_with("isolat") { "isolate" }
                else { "seek_help" };
            Some(ThinkResult {
                org_id:          trigger.org_id.clone(),
                directive:       Some(directive.to_string()),
                directive_ticks: 200,
                thought:         Some(if thought.is_empty() { "sick and suffering".to_string() } else { thought }),
                ..Default::default()
            })
        }
        "migration" => {
            let directive = if action.starts_with("migrat") || action.starts_with("move") { "explore" }
                else if action.starts_with("forage") || action.starts_with("hunt") { "seek_food" }
                else { "rest" };
            Some(ThinkResult {
                org_id:          trigger.org_id.clone(),
                directive:       Some(directive.to_string()),
                directive_ticks: 400,
                thought:         Some(if thought.is_empty() {
                    match directive { "explore" => "time to move on", "seek_food" => "foraging for food", _ => "waiting out scarcity" }.to_string()
                } else { thought }),
                ..Default::default()
            })
        }
        "discovery" => {
            Some(ThinkResult {
                org_id:  trigger.org_id.clone(),
                thought: Some(if thought.is_empty() {
                    format!("discovered {} - feeling {}", trigger.context, action)
                } else { thought }),
                ..Default::default()
            })
        }
        _ => None,
    }
}

pub async fn think_worker(
    mut rx: mpsc::Receiver<ThinkTrigger>,
    results: Arc<Mutex<Vec<ThinkResult>>>,
    api_key: String,
    stats: SharedLlmStats,
    limiter: Option<SharedGroqLimiter>,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(18))
        .build()
        .unwrap_or_default();

    let mut retry_queue: std::collections::VecDeque<(ThinkTrigger, u8)> =
        std::collections::VecDeque::new();

    loop {
        let (trigger, attempt) = if let Some(item) = retry_queue.pop_front() {
            let delay_secs = 5u64 * (item.1 as u64);
            tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
            item
        } else {
            match rx.recv().await {
                Some(t) => (t, 0u8),
                None    => break,
            }
        };

        let (prompt, max_tokens) = build_prompt(&trigger);
        if prompt.is_empty() {
            // Unknown scenario — fall back to local
            let mut rng = rand::rngs::SmallRng::seed_from_u64(deterministic_think_seed(&trigger, attempt));
            if let Some(local) = local_think::resolve(&trigger, &mut rng) {
                if let Some(r) = build_result_from_local(&trigger, local) {
                    results.lock().await.push(r);
                }
            }
            continue;
        }

        // (Removed: 200ms unconditional warmup that was burning ~48s of
        // wall-clock per minute against the local 240/min budget for no
        // measurable benefit. Rate limiting is now enforced by the
        // shared GroqRateLimiter immediately before the POST.)

        println!("[think] {} scenario={}{}", trigger.org_name, trigger.scenario,
            if attempt > 0 { format!(" (retry {})", attempt) } else { String::new() });

        if let Some(ref l) = limiter {
            l.acquire().await;
        }

        let started = std::time::Instant::now();
        let response = match client.post(&**THINK_LLM_URL)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&llm_body_with_stop(
                prompt, max_tokens, &THINK_LLM_MODEL,
                vec!["\n\n\n".to_string()],
            ))
            .send().await
        {
            Ok(resp) => {
                let status = resp.status();
                if status == 429 { stats.note_think_429(); }
                else if status.is_server_error() { stats.note_think_5xx(); }
                if status == 429 || status.is_server_error() {
                    stats.record_think(started.elapsed().as_millis() as u64, true);
                    if attempt < 3 && retry_queue.len() < 20 {
                        println!("[think] llm {} - queuing retry {}/3 for {}",
                            status, attempt + 1, trigger.org_name);
                        retry_queue.push_back((trigger, attempt + 1));
                    } else {
                        println!("[think] llm {} - falling back to local for {}", status, trigger.org_name);
                        stats.note_think_local_fallback();
                        let mut rng = rand::rngs::SmallRng::seed_from_u64(
                            deterministic_think_seed(&trigger, attempt));
                        if let Some(local) = local_think::resolve(&trigger, &mut rng) {
                            if let Some(r) = build_result_from_local(&trigger, local) {
                                results.lock().await.push(r);
                            }
                        }
                    }
                    continue;
                }
                if !status.is_success() {
                    // 4xx non-429 (e.g. revoked key, bad model name) used
                    // to silently parse as empty and slip into the "looks
                    // slow" bucket. Log + fallback like 5xx.
                    stats.note_think_5xx();
                    stats.record_think(started.elapsed().as_millis() as u64, true);
                    let body = resp.text().await.unwrap_or_default();
                    let body_snip: String = body.chars().take(200).collect();
                    println!("[think] llm {} for {}: {} — local fallback",
                        status, trigger.org_name, body_snip);
                    stats.note_think_local_fallback();
                    let mut rng = rand::rngs::SmallRng::seed_from_u64(
                        deterministic_think_seed(&trigger, attempt));
                    if let Some(local) = local_think::resolve(&trigger, &mut rng) {
                        if let Some(r) = build_result_from_local(&trigger, local) {
                            results.lock().await.push(r);
                        }
                    }
                    continue;
                }
                let parsed = resp.json::<GroqResponse>().await
                    .map(|r| strip_thinking(&llm_extract(r)))
                    .unwrap_or_default();
                stats.record_think(started.elapsed().as_millis() as u64, parsed.is_empty());
                parsed
            }
            Err(e) => {
                stats.record_think(started.elapsed().as_millis() as u64, true);
                println!("[think] llm error for {} ({}): {} — using local fallback",
                    trigger.org_name, trigger.scenario, e);
                // Network error → local fallback immediately (no retry)
                let mut rng = rand::rngs::SmallRng::seed_from_u64(
                    deterministic_think_seed(&trigger, attempt));
                if let Some(local) = local_think::resolve(&trigger, &mut rng) {
                    if let Some(r) = build_result_from_local(&trigger, local) {
                        results.lock().await.push(r);
                    }
                }
                continue;
            }
        };

        if response.is_empty() {
            // Empty response → local fallback
            let mut rng = rand::rngs::SmallRng::seed_from_u64(
                deterministic_think_seed(&trigger, attempt));
            if let Some(local) = local_think::resolve(&trigger, &mut rng) {
                if let Some(r) = build_result_from_local(&trigger, local) {
                    results.lock().await.push(r);
                }
            }
            continue;
        }

        if let Some(result) = build_result_from_llm(&trigger, &response) {
            results.lock().await.push(result);
        } else {
            // Parse failure → local fallback
            let mut rng = rand::rngs::SmallRng::seed_from_u64(
                deterministic_think_seed(&trigger, attempt));
            if let Some(local) = local_think::resolve(&trigger, &mut rng) {
                if let Some(r) = build_result_from_local(&trigger, local) {
                    results.lock().await.push(r);
                }
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    fn local_trigger(context: &str) -> ThinkTrigger {
        ThinkTrigger {
            org_id: "org-1".to_string(),
            org_name: "Org".to_string(),
            lineage_id: "lineage-1".to_string(),
            scenario: "migration".to_string(),
            context: context.to_string(),
            kin_count: 4,
            aggression: 0.2,
            fear: 0.4,
            social_tendency: 0.6,
            curiosity: 0.8,
            resilience: 0.3,
            ..Default::default()
        }
    }

    #[test]
    fn local_think_seed_is_stable_for_identical_triggers() {
        let a = local_trigger("food scarce");
        let b = local_trigger("food scarce");
        assert_eq!(deterministic_think_seed(&a, 0), deterministic_think_seed(&b, 0));
    }

    #[test]
    fn local_think_seed_changes_with_context_and_attempt() {
        let a = local_trigger("food scarce");
        let b = local_trigger("water scarce");
        assert_ne!(deterministic_think_seed(&a, 0), deterministic_think_seed(&b, 0));
        assert_ne!(deterministic_think_seed(&a, 0), deterministic_think_seed(&a, 1));
    }

    #[test]
    fn build_prompt_covers_all_known_scenarios() {
        let base = ThinkTrigger {
            org_id: "o1".to_string(), org_name: "Oru".to_string(),
            lineage_id: "l1".to_string(), kin_count: 3,
            aggression: 0.6, fear: 0.3, social_tendency: 0.7, curiosity: 0.5, resilience: 0.4,
            ..Default::default()
        };
        for scenario in &[
            "first_contact","council","survival_crisis","abundance","threat","lonely","restless",
            "invention","reflection","negotiation","elder_teaching","grief","illness","migration","discovery",
        ] {
            let mut t = ThinkTrigger { scenario: scenario.to_string(), ..base.clone() };
            t.context = "test context".to_string();
            let (prompt, tokens) = build_prompt(&t);
            assert!(!prompt.is_empty(), "empty prompt for scenario {}", scenario);
            assert!(tokens > 0, "zero tokens for scenario {}", scenario);
        }
    }

    #[test]
    fn extract_tagged_finds_thought_and_action() {
        let resp = "THOUGHT: I feel hungry and must find food soon.\nACTION: food";
        assert_eq!(extract_tagged(resp, "THOUGHT:").as_deref(), Some("I feel hungry and must find food soon."));
        assert_eq!(extract_tagged(resp, "ACTION:").as_deref(), Some("food"));
    }

    #[test]
    fn build_result_from_llm_survival_crisis() {
        let t = ThinkTrigger {
            org_id: "o1".to_string(), org_name: "Oru".to_string(),
            lineage_id: "l1".to_string(), scenario: "survival_crisis".to_string(),
            context: "starving".to_string(), ..Default::default()
        };
        let resp = "THOUGHT: My stomach aches and I cannot go on without food.\nACTION: food";
        let r = build_result_from_llm(&t, resp).unwrap();
        assert_eq!(r.directive.as_deref(), Some("seek_food"));
        assert!(r.thought.as_deref().unwrap().contains("stomach"));
    }
}
