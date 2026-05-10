mod world;
mod organism;
mod physics;
mod sim;
mod transport;
mod routes;
mod llm;
mod narration_worker;

use std::sync::Arc;
use std::sync::atomic::AtomicU64;
use tokio::sync::{broadcast, Mutex, mpsc};
use axum::{
    Router,
    extract::{State, WebSocketUpgrade, Path},
    extract::ws::{Message, WebSocket},
    response::IntoResponse,
    routing::get,
    Json,
    http::StatusCode,
};
use serde::{Serialize, Deserialize};
use tower_http::cors::{CorsLayer, Any};
use tower_http::compression::CompressionLayer;

use sim::simulation::{Simulation, StoryEntry, ThinkTrigger};
use sim::local_think;
use transport::{
    FrameClock, SharedTransportStats, TransportStats, TransportStatsSnapshot,
    encode_frame, next_frame_id, now_ms,
};
use llm::{
    GroqMessage, GroqRequest, GroqResponse, LLM_KEY, LLM_MODEL, LLM_URL,
    llm_body, llm_extract, strip_thinking,
};
use narration_worker::{NarrationReq, narration_worker};

pub type SharedSim = Arc<Mutex<Simulation>>;
pub type Tx = broadcast::Sender<String>;

const SAVE_PATH:  &str = "world.save";
const DAY_LENGTH: u64  = 600;
const WS_BROADCAST_BUFFER: usize = 64;
pub const WS_RESYNC_LAG_THRESHOLD: u64 = 3;

fn tick_ms() -> u64 {
    std::env::var("TICK_MS").ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100)
}

static TICK_MS: std::sync::LazyLock<u64> = std::sync::LazyLock::new(tick_ms);

pub type LatestFull = Arc<std::sync::RwLock<Option<Arc<String>>>>;

#[derive(Clone)]
pub struct AppState {
    pub sim:             SharedSim,
    pub tx:              Tx,
    pub latest_full:     LatestFull,
    pub transport_stats: SharedTransportStats,
}



// Think result from think_worker back to sim loop
#[derive(Default)]
struct ThinkResult {
    org_id:           String,
    target_lineage:   Option<String>,
    attitude_delta:   Option<f32>,
    thought:          Option<String>,
    strategy_lineage: Option<String>,
    strategy:         Option<String>,
    directive:        Option<String>,
    directive_ticks:  u64,
    new_discovery:    Option<String>,
    trait_delta:      Option<(String, f32)>,
    alliance_type:    Option<String>,
    teaching:         Option<String>,
    target_org_id:    Option<String>,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    // Resolved once via LLM_KEY (preferred) → GROQ_API_KEY (legacy) → empty.
    let api_key = (*LLM_KEY).clone();
    if api_key.is_empty() && !LLM_URL.contains("localhost") && !LLM_URL.contains("127.0.0.1") {
        println!("[warn] no LLM_KEY / GROQ_API_KEY set - remote LLM calls will fail");
    }

    // Fresh worlds get a truly random seed from system time + OS entropy.
    // Loaded worlds ignore this - the seed is only used for fresh world gen.
    let fresh_seed: u64 = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        t.as_nanos() as u64 ^ (t.subsec_nanos() as u64).wrapping_mul(0x9e3779b97f4a7c15)
    };
    let sim = Arc::new(Mutex::new(Simulation::load_or_new(fresh_seed, SAVE_PATH)));
    let (tx, _rx) = broadcast::channel::<String>(WS_BROADCAST_BUFFER);
    let latest_full: LatestFull = Arc::new(std::sync::RwLock::new(None));
    let frame_clock: FrameClock = Arc::new(AtomicU64::new(0));
    let transport_stats: SharedTransportStats = Arc::new(TransportStats::default());

    // Prime the cached full snapshot before any client connects so the first
    // websocket or /snapshot reader gets a sequence-aware full frame.
    {
        let mut s = sim.lock().await;
        let frame_started = std::time::Instant::now();
        let frame_id = next_frame_id(&frame_clock);
        let full = encode_frame(s.state_json(), frame_id, now_ms(), "full");
        if let Ok(mut slot) = latest_full.write() {
            *slot = Some(Arc::new(full.clone()));
        }
        transport_stats.record_generated(full.len(), frame_started.elapsed().as_millis() as u64);
    }

    // Channels
    let (narration_tx, narration_rx) = mpsc::channel::<NarrationReq>(4);
    let (think_tx, think_rx)         = mpsc::channel::<ThinkTrigger>(8);

    let stories: Arc<Mutex<std::collections::HashMap<String, String>>> =
        Arc::new(Mutex::new(std::collections::HashMap::new()));
    let think_results: Arc<Mutex<Vec<ThinkResult>>> =
        Arc::new(Mutex::new(Vec::new()));

    // ── Workers ───────────────────────────────────────────────────────────────
    {
        let stories_w = stories.clone();
        let key = api_key.clone();
        tokio::spawn(narration_worker(narration_rx, stories_w, key));
    }
    {
        let results_w = think_results.clone();
        let key = api_key.clone();
        tokio::spawn(think_worker(think_rx, results_w, key));
    }

    // ── Simulation loop ───────────────────────────────────────────────────────
    {
        let sim_clone        = sim.clone();
        let tx_clone         = tx.clone();
        let stories_clone    = stories.clone();
        let think_res_clone  = think_results.clone();
        let narration_tx2    = narration_tx.clone();
        let latest_full_w    = latest_full.clone();
        let frame_clock_w    = frame_clock.clone();
        let transport_stats_w = transport_stats.clone();
        tokio::spawn(async move {
            let mut step: u64 = 0;
            loop {
                let (json, pending_thinks, maybe_latest_full) = {
                    let mut s = sim_clone.lock().await;
                    s.tick(); // 1 tick per loop = 6s real → 600 ticks/day = 1 hr/day

                    // Apply completed think results
                    {
                        let mut results = think_res_clone.lock().await;
                        let tick = s.tick_count;
                        for r in results.drain(..) {
                            // Collect name for events before taking &mut borrow
                            let actor_name = s.organisms.iter().find(|o| o.id == r.org_id)
                                .map(|o| o.name.clone()).unwrap_or_default();
                            // Apply to actor organism
                            let mut invented: Option<String> = None;
                            if let Some(org) = s.organisms.iter_mut().find(|o| o.id == r.org_id) {
                                if let (Some(lid), Some(delta)) = (&r.target_lineage, r.attitude_delta) {
                                    org.update_attitude(lid, delta);
                                }
                                if let Some(t) = &r.thought {
                                    org.think(t, tick);
                                }
                                if let Some(d) = &r.directive {
                                    println!("[think] {} directive={} for {} ticks",
                                        org.name, d, r.directive_ticks);
                                    org.directive       = d.clone();
                                    org.directive_until = tick + r.directive_ticks;
                                }
                                // Invention: add discovery if not already known
                                if let Some(disc) = &r.new_discovery {
                                    if !org.discoveries.contains(disc) {
                                        org.discoveries.insert(disc.clone());
                                        org.log_event(format!("invented {}", disc.replace('_', " ")));
                                        invented = Some(disc.clone());
                                    }
                                }
                                // Reflection: nudge a trait
                                if let Some((trait_name, delta)) = &r.trait_delta {
                                    match trait_name.as_str() {
                                        "fear"            => org.traits.fear            = (org.traits.fear            + delta).clamp(0.0, 1.0),
                                        "social_tendency" => org.traits.social_tendency = (org.traits.social_tendency + delta).clamp(0.0, 1.0),
                                        "aggression"      => org.traits.aggression      = (org.traits.aggression      + delta).clamp(0.0, 1.0),
                                        "curiosity"       => org.traits.curiosity       = (org.traits.curiosity       + delta).clamp(0.0, 1.0),
                                        "resilience"      => org.traits.resilience      = (org.traits.resilience      + delta).clamp(0.0, 1.0),
                                        _ => {}
                                    }
                                }
                            }
                            // Invention event (after org borrow released)
                            if let Some(disc) = invented {
                                use crate::sim::world_events::push_event;
                                push_event(&mut s.events, tick, "build", &actor_name,
                                    &format!("invented {}", disc.replace('_', " ")));
                            }
                            // Tribe strategy
                            if let (Some(lid), Some(strategy)) = (r.strategy_lineage, r.strategy) {
                                let expiry = s.tick_count + 800;
                                println!("[think] tribe {} → {} (until t{})",
                                    &lid[..6.min(lid.len())], strategy, expiry);
                                s.lineage_strategies.insert(lid, (strategy, expiry));
                            }
                            // Alliance outcome - apply effects to both parties
                            if let (Some(alliance), Some(their_lid)) = (&r.alliance_type, &r.target_lineage) {
                                let their_oid = r.target_org_id.as_deref().unwrap_or("");
                                // Raise attitudes for both lineages
                                let actor_lid = s.organisms.iter().find(|o| o.id == r.org_id)
                                    .map(|o| o.lineage_id.clone()).unwrap_or_default();
                                for org in s.organisms.iter_mut() {
                                    if org.lineage_id == actor_lid {
                                        org.update_attitude(their_lid, 0.25);
                                    } else if &org.lineage_id == their_lid {
                                        org.update_attitude(&actor_lid, 0.25);
                                    }
                                }
                                // Type-specific effects
                                match alliance.as_str() {
                                    "food_sharing" => {
                                        // Merge food memories between actor and target
                                        let actor_food: Vec<_> = s.organisms.iter()
                                            .find(|o| o.id == r.org_id)
                                            .map(|o| o.food_memory.iter().map(|(&k,&v)|(k,v)).collect())
                                            .unwrap_or_default();
                                        let target_food: Vec<_> = s.organisms.iter()
                                            .find(|o| o.id == their_oid)
                                            .map(|o| o.food_memory.iter().map(|(&k,&v)|(k,v)).collect())
                                            .unwrap_or_default();
                                        use crate::organism::organism::Organism as Org;
                                        if let Some(actor) = s.organisms.iter_mut().find(|o| o.id == r.org_id) {
                                            let ms = actor.traits.memory_strength;
                                            for (k,v) in &target_food {
                                                Org::remember(&mut actor.food_memory, k.0, k.1, v * 0.5, ms);
                                            }
                                        }
                                        if let Some(target) = s.organisms.iter_mut().find(|o| o.id == their_oid) {
                                            let ms = target.traits.memory_strength;
                                            for (k,v) in &actor_food {
                                                Org::remember(&mut target.food_memory, k.0, k.1, v * 0.5, ms);
                                            }
                                        }
                                    },
                                    "defense_pact" => {
                                        let pact_disc = format!("pact:{}", &their_lid[..their_lid.len().min(8)]);
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == r.org_id) {
                                            if !org.discoveries.contains(&pact_disc) { org.discoveries.insert(pact_disc.clone()); }
                                        }
                                        let actor_disc = format!("pact:{}", &actor_lid[..actor_lid.len().min(8)]);
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == their_oid) {
                                            if !org.discoveries.contains(&actor_disc) { org.discoveries.insert(actor_disc.clone()); }
                                        }
                                    },
                                    "knowledge_exchange" => {
                                        let actor_disc: Vec<String> = s.organisms.iter().find(|o| o.id == r.org_id)
                                            .map(|o| o.discoveries.iter().cloned().collect()).unwrap_or_default();
                                        let their_disc: Vec<String> = s.organisms.iter().find(|o| o.id == their_oid)
                                            .map(|o| o.discoveries.iter().cloned().collect()).unwrap_or_default();
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == r.org_id) {
                                            for d in &their_disc { if !org.discoveries.contains(d) { org.discoveries.insert(d.clone()); } }
                                        }
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == their_oid) {
                                            for d in &actor_disc { if !org.discoveries.contains(d) { org.discoveries.insert(d.clone()); } }
                                        }
                                    },
                                    _ => {} // territory: attitude bump already done above
                                }
                                use crate::sim::world_events::push_event;
                                push_event(&mut s.events, tick, "treaty", &actor_name,
                                    &format!("{} pact: {} ↔ {}", alliance.replace('_'," "),
                                        &actor_lid[..actor_lid.len().min(6)],
                                        &their_lid[..their_lid.len().min(6)]));
                            }
                            // Elder teaching: apply to the specific child
                            if let (Some(teaching), Some(child_id)) = (&r.teaching, &r.target_org_id) {
                                if let Some(child) = s.organisms.iter_mut().find(|o| o.id == *child_id) {
                                    child.discoveries.insert(teaching.clone());
                                    child.log_event(format!("taught: {}", teaching));
                                }
                            }
                        }
                    }

                    // Apply completed narration stories → story_history
                    {
                        let cur_tick = s.tick_count;
                        let mut store = stories_clone.lock().await;
                        for (org_id, story) in store.drain() {
                            if let Some(org) = s.organisms.iter_mut().find(|o| o.id == org_id) {
                                org.daily_story = story.clone();
                                let name  = org.name.clone();
                                let lid   = org.lineage_id.clone();
                                s.story_history.push_back(StoryEntry {
                                    tick: cur_tick, org_name: name, lineage_id: lid, story,
                                });
                                if s.story_history.len() > 300 {
                                    s.story_history.pop_front();
                                }
                            }
                        }
                    }

                    // Queue 1 narration per in-world day (was /5 = 1.2s at 10ms/tick, causing overheating)
                    if step % DAY_LENGTH == 0 {
                        let candidate = s.organisms.iter()
                            .filter(|o| o.alive && !o.life_log.is_empty())
                            .min_by_key(|o| o.last_story_tick)
                            .map(|o| (o.id.clone(), o.name.clone(),
                                      o.life_log.iter().cloned().collect::<Vec<String>>(),
                                      o.vocabulary.words.clone()));
                        if let Some((oid, oname, life_log, vocab)) = candidate {
                            let cur_tick = s.tick_count;
                            if let Some(org) = s.organisms.iter_mut().find(|o| o.id == oid) {
                                org.last_story_tick = cur_tick;
                            }
                            let _ = narration_tx2.try_send(NarrationReq {
                                org_id: oid, org_name: oname, life_log, vocab,
                            });
                        }
                    }

                    let pending = std::mem::take(&mut s.pending_thinks);
                    let is_full_frame = step % 30 == 0;
                    let frame_started = std::time::Instant::now();
                    let frame_id = next_frame_id(&frame_clock_w);
                    let json = if is_full_frame {
                        encode_frame(s.state_json(), frame_id, now_ms(), "full")
                    } else {
                        encode_frame(s.state_json_incremental(), frame_id, now_ms(), "delta")
                    };
                    transport_stats_w.record_generated(json.len(), frame_started.elapsed().as_millis() as u64);
                    step += 1;
                    if step % 600 == 0 { s.save(SAVE_PATH); }
                    let latest_full = if is_full_frame { Some(json.clone()) } else { None };
                    (json, pending, latest_full)
                };

                // Send think triggers outside lock
                for t in pending_thinks {
                    let _ = think_tx.try_send(t);
                }
                if let Some(full) = maybe_latest_full {
                    if let Ok(mut slot) = latest_full_w.write() {
                        *slot = Some(Arc::new(full));
                    }
                }
                let _ = tx_clone.send(json);
                tokio::time::sleep(tokio::time::Duration::from_millis(*TICK_MS)).await;
            }
        });
    }

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let compression = CompressionLayer::new().gzip(true);

    let state = AppState { sim, tx, latest_full, transport_stats };

    let app = Router::new()
        .route("/ws", get(routes::ws_handler))
        .route("/org/:id", get(routes::org_detail_handler))
        .route("/version", get(routes::version_handler))
        .route("/snapshot", get(routes::snapshot_handler))
        .route("/transport", get(routes::transport_handler))
        .layer(compression)
        .layer(cors)
        .with_state(state);

    let addr = "0.0.0.0:8000";
    println!("simulation-rs listening on {}  tick={}ms  llm={} ({})",
        addr, *TICK_MS, *LLM_MODEL, *LLM_URL);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Local think result builder ────────────────────────────────────────────────

fn build_result_from_local(trigger: &ThinkTrigger, local: local_think::LocalResult) -> Option<ThinkResult> {
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

fn deterministic_think_seed(trigger: &ThinkTrigger, attempt: u8) -> u64 {
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

// ── Think worker ─────────────────────────────────────────────────────────────

async fn think_worker(
    mut rx: mpsc::Receiver<ThinkTrigger>,
    results: Arc<Mutex<Vec<ThinkResult>>>,
    api_key: String,
) {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .unwrap_or_default();

    // (trigger, attempt_number)  - attempt 0 = first try, max 3 retries
    let mut retry_queue: std::collections::VecDeque<(ThinkTrigger, u8)> =
        std::collections::VecDeque::new();

    loop {
        // Drain retries before pulling new work; apply backoff proportional to attempt
        let (trigger, attempt) = if let Some(item) = retry_queue.pop_front() {
            let delay_secs = 5u64 * (item.1 as u64);   // 5s, 10s, 15s
            tokio::time::sleep(tokio::time::Duration::from_secs(delay_secs)).await;
            item
        } else {
            match rx.recv().await {
                Some(t) => (t, 0u8),
                None    => break,
            }
        };

        // ── Local resolver: classification scenarios need no LLM ─────────────
        // Only elder_teaching actually generates text - everything else is a
        // weighted decision that we resolve instantly from organism traits.
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

        // Rate-limit: Groq cap ~30 req/min; narration uses some - throttle think worker.
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

        let response = match client.post(&**LLM_URL)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&llm_body(prompt, 60, &LLM_MODEL))
            .send().await
        {
            Ok(resp) => {
                let status = resp.status();
                if status == 429 || status.is_server_error() {
                    // Rate-limited or upstream error - queue for retry
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
                resp.json::<GroqResponse>().await
                    .map(|r| strip_thinking(&llm_extract(r)).to_lowercase())
                    .unwrap_or_default()
            }
            Err(e) => {
                // Network / timeout error - queue for retry
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
                // context field holds the candidate list, e.g. "cooking, stone_tools"
                let candidates: Vec<&str> = trigger.context.split(", ").collect();
                let valid = ["cooking","stone_tools","masonry","spear","torch"];
                // Pick the first candidate the model mentions, or first candidate if no match
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
                // Response is a free-form teaching sentence - keep it as-is (model was asked for <10 words)
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
