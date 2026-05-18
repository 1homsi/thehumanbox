

use std::sync::Arc;

use rand::SeedableRng;
use tokio::sync::{Mutex, mpsc};

use crate::llm::{GroqResponse, THINK_LLM_MODEL, THINK_LLM_URL, llm_body_with_stop, llm_extract, strip_thinking};
use crate::llm_stats::SharedLlmStats;
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

pub async fn think_worker(
    mut rx: mpsc::Receiver<ThinkTrigger>,
    results: Arc<Mutex<Vec<ThinkResult>>>,
    api_key: String,
    stats: SharedLlmStats,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
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

        if trigger.scenario != "elder_teaching" {
            use rand::SeedableRng;
            let mut rng = rand::rngs::SmallRng::seed_from_u64(deterministic_think_seed(&trigger, attempt));
            if let Some(local) = local_think::resolve(&trigger, &mut rng) {
                println!("[think] {} {}→{} (local)", trigger.org_name, trigger.scenario, local.word);
                let result = build_result_from_local(&trigger, local);
                if let Some(r) = result {
                    results.lock().await.push(r);
                }
            }
            continue;
        }

        if attempt == 0 {
            tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
        }

        println!("[think] {} scenario={}{}", trigger.org_name, trigger.scenario,
            if attempt > 0 { format!(" (retry {})", attempt) } else { String::new() });

        let prompt = match trigger.scenario.as_str() {
            "first_contact" => format!(
                "Primitive creature {} spots a stranger tribe for the first time. \
                Reply with ONE word: friendly, cautious, or hostile.",
                trigger.org_name
            ),
            "council" => format!(
                "{} leads a thriving tribe of {} creatures with plenty of food. \
                What should the tribe focus on? Reply with ONE word: settle, hunt, or explore.",
                trigger.org_name, trigger.kin_count
            ),
            "survival_crisis" => format!(
                "Primitive creature {} is both starving and dying of thirst ({}). \
                What is most urgent? Reply with ONE word: food, water, or shelter.",
                trigger.org_name, trigger.context
            ),
            "abundance" => format!(
                "Primitive creature {} has a full belly and plenty of water. \
                {} tribe members are nearby. What should they do with their free time? \
                Reply with ONE word: build, explore, or socialize.",
                trigger.org_name, trigger.kin_count
            ),
            "threat" => format!(
                "Primitive creature {} sees enemies approaching. \
                They have {} allies nearby. What should they do? \
                Reply with ONE word: fight, flee, or trade.",
                trigger.org_name, trigger.kin_count
            ),
            "lonely" => format!(
                "Primitive creature {} has been wandering alone for too long and feels deeply isolated. \
                What should they seek? Reply with ONE word: family, stranger, or wander.",
                trigger.org_name
            ),
            "restless" => format!(
                "Primitive creature {} has food, water, and safety but feels purposeless and restless. \
                What should they pursue? Reply with ONE word: build, explore, or create.",
                trigger.org_name
            ),
            "invention" => format!(
                "Creature {} knows: {}. They just made a breakthrough. \
                What did they invent? Reply with ONE of: {}. \
                Only use a word from that exact list.",
                trigger.org_name,
                trigger.discoveries.join(", "),
                trigger.context
            ),
            "reflection" => format!(
                "Creature {} has lived: {}. Emotional state: {}. \
                Life has made them: Reply with ONE word: more_brave, more_social, more_aggressive, more_curious, or more_resilient.",
                trigger.org_name,
                trigger.life_log_top.join("; "),
                trigger.emotional_state
            ),
            "negotiation" => format!(
                "Tribe {} ({} members, knows: {}) meets tribe {} (knows: {}). \
                They trust each other. What agreement do they reach? \
                Reply with ONE of: territory, food_sharing, defense_pact, knowledge_exchange.",
                trigger.org_name, trigger.kin_count,
                trigger.discoveries.join(", "),
                trigger.other_name.as_deref().unwrap_or("them"),
                trigger.other_discoveries.join(", ")
            ),
            "elder_teaching" => format!(
                "Elder {} teaches newborn {}. Elder's life: {}. \
                Write ONE teaching under 10 words. Start with Remember, Always, or Never.",
                trigger.org_name,
                trigger.other_name.as_deref().unwrap_or("the child"),
                trigger.life_log_top.join("; ")
            ),
            "grief" => format!(
                "Creature {} just lost a kin. Context: {}. \
                How do they respond? Reply with ONE word: mourn, rage, or endure.",
                trigger.org_name, trigger.context
            ),
            "illness" => format!(
                "Creature {} is gravely sick ({}). \
                What do they do? Reply with ONE word: rest, isolate, or seek_help.",
                trigger.org_name, trigger.context
            ),
            "migration" => format!(
                "Tribe {} has {} members. {}. Food is scarce. \
                What should the tribe do? Reply with ONE word: migrate, forage, or wait.",
                trigger.org_name, trigger.kin_count, trigger.context
            ),
            "discovery" => format!(
                "Creature {} just discovered {}. They know: {}. \
                How does this change them? Reply with ONE word: excited, grateful, or cautious.",
                trigger.org_name, trigger.context,
                if trigger.discoveries.is_empty() { "nothing yet".to_string() } else { trigger.discoveries.join(", ") }
            ),
            _ => continue,
        };

        let started = std::time::Instant::now();
        let response = match client.post(&**THINK_LLM_URL)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&llm_body_with_stop(
                prompt, 25, &THINK_LLM_MODEL,
                vec!["\n".to_string(), ".".to_string(), "\"".to_string()],
            ))
            .send().await
        {
            Ok(resp) => {
                let status = resp.status();
                if status == 429 || status.is_server_error() {
                    stats.record_think(started.elapsed().as_millis() as u64, true);
                    if attempt < 3 && retry_queue.len() < 20 {
                        println!("[think] llm {} - queuing retry {}/3 for {}",
                            status, attempt + 1, trigger.org_name);
                        retry_queue.push_back((trigger, attempt + 1));
                    } else {
                        println!("[think] llm {} - giving up on {} after {} attempts",
                            status, trigger.org_name, attempt);
                    }
                    continue;
                }
                let parsed = resp.json::<GroqResponse>().await
                    .map(|r| strip_thinking(&llm_extract(r)).to_lowercase())
                    .unwrap_or_default();
                stats.record_think(started.elapsed().as_millis() as u64, parsed.is_empty());
                parsed
            }
            Err(e) => {
                stats.record_think(started.elapsed().as_millis() as u64, true);
                if attempt < 3 && retry_queue.len() < 20 {
                    println!("[think] llm network error (retry {}/3 for {}): {}",
                        attempt + 1, trigger.org_name, e);
                    retry_queue.push_back((trigger, attempt + 1));
                } else {
                    println!("[think] Groq unreachable - giving up on {} after {} attempts: {}",
                        trigger.org_name, attempt, e);
                }
                continue;
            }
        };

        let first = response.split_whitespace().next().unwrap_or("cautious");

        let result = match trigger.scenario.as_str() {
            "first_contact" => {
                let (delta, thought) = if first.starts_with("friend") {
                    (0.35f32, "curious about them")
                } else if first.starts_with("hostil") || first.starts_with("attack") || first.starts_with("enemy") {
                    (-0.4f32, "wary of strangers")
                } else {
                    (0.0f32, "watching the stranger")
                };
                println!("[think] {} first_contact → {} (att {:.1})", trigger.org_name, first, delta);
                ThinkResult {
                    org_id:         trigger.org_id,
                    target_lineage: trigger.target_lineage,
                    attitude_delta: Some(delta),
                    thought:        Some(thought.to_string()),
                    ..Default::default()
                }
            },
            "council" => {
                let strategy = if first.starts_with("settle") || first.starts_with("build") || first.starts_with("home") {
                    "settle"
                } else if first.starts_with("hunt") || first.starts_with("food") || first.starts_with("eat") {
                    "hunt"
                } else {
                    "explore"
                };
                println!("[think] tribe {} council → {}", &trigger.lineage_id[..6.min(trigger.lineage_id.len())], strategy);
                ThinkResult {
                    org_id:           trigger.org_id,
                    thought:          Some(format!("the tribe should {}", strategy)),
                    strategy_lineage: Some(trigger.lineage_id),
                    strategy:         Some(strategy.to_string()),
                    ..Default::default()
                }
            },
            "survival_crisis" => {
                let directive = if first.starts_with("food") || first.starts_with("eat") || first.starts_with("hunt") {
                    "seek_food"
                } else if first.starts_with("water") || first.starts_with("drink") {
                    "seek_water"
                } else {
                    "flee"
                };
                println!("[think] {} survival_crisis → {}", trigger.org_name, directive);
                ThinkResult {
                    org_id:          trigger.org_id,
                    thought:         Some(format!("desperate for {}", directive.replace("seek_", ""))),
                    directive:       Some(directive.to_string()),
                    directive_ticks: 300,
                    ..Default::default()
                }
            },
            "abundance" => {
                let directive = if first.starts_with("social") || first.starts_with("gather") || first.starts_with("togeth") || first.starts_with("celebrat") {
                    "socialize"
                } else if first.starts_with("explor") || first.starts_with("wander") || first.starts_with("roam") {
                    "explore"
                } else {
                    "socialize"
                };
                println!("[think] {} abundance → {}", trigger.org_name, directive);
                ThinkResult {
                    org_id:          trigger.org_id,
                    thought:         Some(format!("wants to {}", directive)),
                    directive:       Some(directive.to_string()),
                    directive_ticks: 400,
                    ..Default::default()
                }
            },
            "threat" => {
                let directive = if first.starts_with("fight") || first.starts_with("attack") || first.starts_with("defend") {
                    "fight"
                } else if first.starts_with("trade") || first.starts_with("gift") || first.starts_with("peace") {
                    "trade"
                } else {
                    "flee"
                };
                println!("[think] {} threat → {}", trigger.org_name, directive);
                ThinkResult {
                    org_id:          trigger.org_id,
                    thought:         Some(format!("decided to {}", directive)),
                    directive:       Some(directive.to_string()),
                    directive_ticks: 250,
                    ..Default::default()
                }
            },
            "lonely" => {
                let directive = if first.starts_with("family") || first.starts_with("kin") || first.starts_with("tribe") {
                    "socialize"
                } else if first.starts_with("stranger") || first.starts_with("other") || first.starts_with("new") {
                    "trade"
                } else {
                    "explore"
                };
                println!("[think] {} lonely → {}", trigger.org_name, directive);
                ThinkResult {
                    org_id:          trigger.org_id,
                    thought:         Some("longing for company".to_string()),
                    directive:       Some(directive.to_string()),
                    directive_ticks: 500,
                    ..Default::default()
                }
            },
            "restless" => {
                let directive = "explore";
                println!("[think] {} restless → {}", trigger.org_name, directive);
                ThinkResult {
                    org_id:          trigger.org_id,
                    thought:         Some(format!("driven to {}", directive)),
                    directive:       Some(directive.to_string()),
                    directive_ticks: 500,
                    ..Default::default()
                }
            },
            "invention" => {
                let candidates: Vec<&str> = trigger.context.split(", ").collect();
                let valid = ["cooking","stone_tools","masonry","spear","torch"];
                let discovery = valid.iter()
                    .find(|&&v| response.contains(v) && candidates.contains(&v))
                    .copied()
                    .unwrap_or(candidates[0]);
                println!("[think] {} invented {} (had: {})", trigger.org_name, discovery,
                    trigger.discoveries.join(", "));
                ThinkResult {
                    org_id:        trigger.org_id,
                    new_discovery: Some(discovery.to_string()),
                    thought:       Some(format!("eureka: {}", discovery.replace('_', " "))),
                    ..Default::default()
                }
            },
            "reflection" => {
                let (trait_name, delta): (&str, f32) = if first.contains("brave") || first.contains("courag") {
                    ("fear", -0.06)
                } else if first.contains("social") || first.contains("kind") || first.contains("friend") {
                    ("social_tendency", 0.05)
                } else if first.contains("aggress") || first.contains("angry") || first.contains("fierce") {
                    ("aggression", 0.05)
                } else if first.contains("curious") || first.contains("wonder") || first.contains("explor") {
                    ("curiosity", 0.05)
                } else {
                    ("resilience", 0.04)
                };
                println!("[think] {} reflected → {} {:+.2}", trigger.org_name, trait_name, delta);
                ThinkResult {
                    org_id:      trigger.org_id,
                    thought:     Some(format!("life has made me {}", first.split_whitespace().next().unwrap_or("wiser"))),
                    trait_delta: Some((trait_name.to_string(), delta)),
                    ..Default::default()
                }
            },
            "negotiation" => {
                let alliance = if first.contains("food") || first.contains("share") || first.contains("feast") {
                    "food_sharing"
                } else if first.contains("defense") || first.contains("defend") || first.contains("protect") || first.contains("pact") {
                    "defense_pact"
                } else if first.contains("knowledge") || first.contains("teach") || first.contains("learn") {
                    "knowledge_exchange"
                } else {
                    "territory"
                };
                println!("[think] {} negotiated {} with {:?}", trigger.org_name, alliance,
                    trigger.other_name.as_deref().unwrap_or("?"));
                ThinkResult {
                    org_id:        trigger.org_id,
                    target_lineage: trigger.target_lineage,
                    target_org_id:  trigger.target_org_id,
                    alliance_type:  Some(alliance.to_string()),
                    thought:        Some(format!("{} with {}", alliance.replace('_', " "),
                        trigger.other_name.as_deref().unwrap_or("them"))),
                    ..Default::default()
                }
            },
            "elder_teaching" => {
                let teaching = strip_thinking(&response);
                let teaching = if teaching.len() > 80 {
                    teaching.split_whitespace().take(12).collect::<Vec<_>>().join(" ")
                } else {
                    teaching
                };
                if teaching.is_empty() { continue; }
                println!("[think] elder {} teaching → {}", trigger.org_name, teaching);
                ThinkResult {
                    org_id:        trigger.org_id,
                    target_org_id: trigger.target_org_id,
                    teaching:      Some(teaching),
                    thought:       Some(format!("teaching {}", trigger.other_name.as_deref().unwrap_or("the child"))),
                    ..Default::default()
                }
            },
            "grief" => {
                let directive = if first.starts_with("mourn") { "mourn" }
                    else if first.starts_with("rage") || first.starts_with("fight") { "fight" }
                    else { "endure" };
                let thought = match directive {
                    "mourn"  => "lost someone close",
                    "rage"   => "grieving in anger",
                    _        => "enduring the loss",
                };
                println!("[think] {} grief → {}", trigger.org_name, directive);
                ThinkResult {
                    org_id:    trigger.org_id,
                    thought:   Some(thought.to_string()),
                    ..Default::default()
                }
            },
            "illness" => {
                let directive = if first.starts_with("rest") { "rest" }
                    else if first.starts_with("isolat") { "isolate" }
                    else { "seek_help" };
                let (dir_str, thought) = match directive {
                    "rest"     => ("rest",     "resting to recover"),
                    "isolate"  => ("isolate",  "isolating (sick)"),
                    _          => ("seek_help","seeking help (sick)"),
                };
                println!("[think] {} illness → {}", trigger.org_name, dir_str);
                ThinkResult {
                    org_id:          trigger.org_id,
                    directive:       Some(dir_str.to_string()),
                    directive_ticks: 200,
                    thought:         Some(thought.to_string()),
                    ..Default::default()
                }
            },
            "migration" => {
                let action = if first.starts_with("migrat") { "explore" }
                    else if first.starts_with("forage") { "seek_food" }
                    else { "endure" };
                let thought = match action {
                    "explore"   => "time to move on",
                    "seek_food" => "foraging for food",
                    _           => "waiting out scarcity",
                };
                println!("[think] {} migration → {}", trigger.org_name, action);
                ThinkResult {
                    org_id:          trigger.org_id,
                    directive:       Some(action.to_string()),
                    directive_ticks: 300,
                    thought:         Some(thought.to_string()),
                    ..Default::default()
                }
            },
            "discovery" => {
                let feeling = if first.starts_with("excit") { "excited" }
                    else if first.starts_with("gratef") { "grateful" }
                    else { "cautious" };
                let thought = format!("discovered {} - feeling {}", trigger.context, feeling);
                println!("[think] {} discovery({}) → {}", trigger.org_name, trigger.context, feeling);
                ThinkResult {
                    org_id:  trigger.org_id,
                    thought: Some(thought),
                    ..Default::default()
                }
            },
            _ => continue,
        };

        results.lock().await.push(result);
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
}
