mod world;
mod organism;
mod physics;
mod sim;
mod transport;
mod routes;
mod llm;
mod narration_worker;
mod think_worker;

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
use think_worker::{ThinkResult, think_worker};

pub type SharedSim = Arc<Mutex<Simulation>>;
// Broadcast channel carries pre-encoded MessagePack bytes. Wrapping in
// Arc keeps fan-out cheap for many subscribers (no per-receiver clone of
// the Vec<u8>).
pub type Tx = broadcast::Sender<Arc<Vec<u8>>>;

const SAVE_PATH:  &str = "world.save";
const DAY_LENGTH: u64  = 600;
// Broadcast queue depth. At 10 Hz network rate that's ~30 seconds of
// buffer per receiver - enough to absorb a backgrounded tab,
// Cloudflare Tunnel batch, or short network blip without forcing a
// Lagged + full-frame resync. Above this point the older messages get
// evicted, the client sees a frame gap, and we log a warning + push
// the cached `latest_full` so it can catch up.
const WS_BROADCAST_BUFFER: usize = 300;
pub const WS_RESYNC_LAG_THRESHOLD: u64 = 3;

fn tick_ms() -> u64 {
    std::env::var("TICK_MS").ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100)
}

fn network_ms() -> u64 {
    // 100ms = 10 Hz, matching the sim tick rate. Each sim tick gets its
    // own broadcast, so the client never sees a sim step happen between
    // two snapshots - interpolation always has exactly one tick of work
    // to spread over the interval. Was 200ms; bumping cut visible
    // latency from ~300ms to ~150ms after the msgpack + payload-slim
    // commits made the bandwidth headroom available.
    std::env::var("NETWORK_MS").ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100)
}

static TICK_MS:    std::sync::LazyLock<u64> = std::sync::LazyLock::new(tick_ms);
static NETWORK_MS: std::sync::LazyLock<u64> = std::sync::LazyLock::new(network_ms);

/// Cadence at which the broadcaster emits a "full" frame (with the static
/// metadata - history, lineage names, sex words, etc.). Counted in sim
/// ticks. At default 100ms sim tick that's every ~3 seconds.
const FULL_FRAME_EVERY_TICKS: u64 = 30;

/// Sim ticks per save flush. At default 100ms sim tick that's every minute.
const SAVE_EVERY_TICKS: u64 = 600;

/// Sleep just long enough that `(now - cycle_start) == period_ms`. If the
/// work already took longer than the period, returns immediately so the
/// next cycle starts ASAP - drift, but no double-stall. This keeps each
/// loop on a fixed cadence even when the sim or serialize hiccups.
async fn sleep_until_period_end(cycle_start: std::time::Instant, period_ms: u64) {
    let elapsed = cycle_start.elapsed().as_millis() as u64;
    if elapsed >= period_ms { return; }
    tokio::time::sleep(tokio::time::Duration::from_millis(period_ms - elapsed)).await;
}

pub type LatestFull = Arc<std::sync::RwLock<Option<Arc<Vec<u8>>>>>;

#[derive(Clone)]
pub struct AppState {
    pub sim:             SharedSim,
    pub tx:              Tx,
    pub latest_full:     LatestFull,
    pub transport_stats: SharedTransportStats,
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
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(WS_BROADCAST_BUFFER);
    let latest_full: LatestFull = Arc::new(std::sync::RwLock::new(None));
    let frame_clock: FrameClock = Arc::new(AtomicU64::new(0));
    let transport_stats: SharedTransportStats = Arc::new(TransportStats::default());

    // Prime the cached full snapshot before any client connects so the first
    // websocket or /snapshot reader gets a sequence-aware full frame.
    {
        let mut s = sim.lock().await;
        let frame_started = std::time::Instant::now();
        let frame_id = next_frame_id(&frame_clock);
        let full = Arc::new(encode_frame(s.state_json(), frame_id, now_ms(), "full"));
        transport_stats.record_generated(full.len(), frame_started.elapsed().as_millis() as u64);
        if let Ok(mut slot) = latest_full.write() {
            *slot = Some(full);
        }
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
    //
    // Decoupled from the WS broadcaster. This task only advances world state,
    // applies completed think results, queues narration, drains pending think
    // triggers, and periodically saves. It does NOT serialize or send WS
    // frames - that's the broadcaster's job, on its own cadence.
    //
    // The two tasks share the sim mutex but each holds it only as long as it
    // takes to do its own job. Previously the lock was held across the
    // tick + serialize + send path, so a slow full-frame serialize would
    // stall the next sim tick by 50-100ms, causing the bursty WS pattern
    // users were seeing on the client.
    {
        let sim_clone        = sim.clone();
        let stories_clone    = stories.clone();
        let think_res_clone  = think_results.clone();
        let narration_tx2    = narration_tx.clone();
        let transport_stats_s = transport_stats.clone();
        tokio::spawn(async move {
            loop {
                let tick_started = std::time::Instant::now();
                let pending_thinks = {
                    let mut s = sim_clone.lock().await;
                    s.tick(); // 1 tick per loop = TICK_MS real

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

                    // Queue 1 narration per in-world day
                    if s.tick_count % DAY_LENGTH == 0 {
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

                    if s.tick_count % SAVE_EVERY_TICKS == 0 {
                        s.save(SAVE_PATH);
                    }

                    std::mem::take(&mut s.pending_thinks)
                };

                // Send think triggers outside the sim lock so the broadcaster
                // and the think worker can both make progress while this
                // task is waiting on its sleep deadline.
                for t in pending_thinks {
                    let _ = think_tx.try_send(t);
                }
                transport_stats_s.record_sim_tick(
                    tick_started.elapsed().as_millis() as u64,
                    *TICK_MS,
                );
                sleep_until_period_end(tick_started, *TICK_MS).await;
            }
        });
    }

    // ── WebSocket broadcaster ─────────────────────────────────────────────────
    //
    // Runs at NETWORK_MS cadence (default 200ms = 5Hz) independent of the
    // simulation tick rate. Each cycle: take the sim lock briefly, serialize
    // a snapshot of current state, drop the lock, broadcast over WS.
    //
    // Full frames (with cold metadata) every FULL_FRAME_EVERY_TICKS sim
    // ticks; everything else is a delta. Each frame also updates the cached
    // `latest_full` slot so the WS handler can prime new clients without
    // ever touching the sim lock.
    {
        let sim_clone        = sim.clone();
        let tx_clone         = tx.clone();
        let latest_full_w    = latest_full.clone();
        let frame_clock_w    = frame_clock.clone();
        let transport_stats_w = transport_stats.clone();
        tokio::spawn(async move {
            loop {
                let cycle_started = std::time::Instant::now();
                let (frame, full_payload) = {
                    let mut s = sim_clone.lock().await;
                    let is_full_frame = s.tick_count % FULL_FRAME_EVERY_TICKS == 0;
                    let serialize_started = std::time::Instant::now();
                    let frame_id = next_frame_id(&frame_clock_w);
                    let bytes = if is_full_frame {
                        encode_frame(s.state_json(), frame_id, now_ms(), "full")
                    } else {
                        encode_frame(s.state_json_incremental(), frame_id, now_ms(), "delta")
                    };
                    transport_stats_w.record_generated(
                        bytes.len(),
                        serialize_started.elapsed().as_millis() as u64,
                    );
                    let frame = Arc::new(bytes);
                    let full = if is_full_frame { Some(frame.clone()) } else { None };
                    (frame, full)
                };

                if let Some(full) = full_payload {
                    if let Ok(mut slot) = latest_full_w.write() {
                        *slot = Some(full);
                    }
                }
                let _ = tx_clone.send(frame);
                if cycle_started.elapsed().as_millis() as u64 > *NETWORK_MS {
                    transport_stats_w.record_broadcaster_overrun();
                }
                sleep_until_period_end(cycle_started, *NETWORK_MS).await;
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



