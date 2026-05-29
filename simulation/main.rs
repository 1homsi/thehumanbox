#![allow(dead_code)]

// The sim core now lives in the `sim-core` crate. Re-export its modules at
// the crate root so every existing `crate::sim::…` / `crate::organism::…`
// path in this binary and in `server/*` keeps resolving unchanged.
pub use sim_core::{organism, physics, sim, world};

mod server;

#[cfg(feature = "webtransport")]
use crate::server::webtransport;
use crate::server::{
    conversation_worker, llm, llm_rate, llm_stats, memory_watch, narration_worker, routes,
    think_worker, transport,
};

use axum::http::HeaderValue;
use axum::{
    routing::get, Router,
};
use std::sync::atomic::AtomicU64;
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, Mutex};
use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

use llm::{
    NARRATION_LLM_KEY,
    NARRATION_LLM_MODEL, NARRATION_LLM_URL, THINK_LLM_KEY, THINK_LLM_MODEL, THINK_LLM_URL,
};
use narration_worker::{narration_worker, NarrationReq};
use sim::simulation::{Simulation, StoryEntry, ThinkTrigger};
use think_worker::{think_worker, ThinkResult};
use transport::{
    encode_frame, next_frame_id, now_ms, FrameClock, FrameKind, SharedTransportStats, TransportStats,
};

pub type SharedSim = Arc<Mutex<Simulation>>;
pub type Tx = broadcast::Sender<Arc<Vec<u8>>>;

const LEGACY_SAVE_PATH: &str = "world.save";
const DAY_LENGTH: u64 = 600;
const WS_BROADCAST_BUFFER: usize = 40;
pub const WS_RESYNC_LAG_THRESHOLD: u64 = 3;

fn tick_ms() -> u64 {
    std::env::var("TICK_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(100)
}

fn network_ms() -> u64 {
    std::env::var("NETWORK_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(500)
}

fn lookahead_ms() -> u64 {
    std::env::var("LOOKAHEAD_MS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(150)
}

fn daily_egress_mb() -> u64 {
    std::env::var("DAILY_EGRESS_MB")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5000)
}

static TICK_MS: std::sync::LazyLock<u64> = std::sync::LazyLock::new(tick_ms);
static NETWORK_MS: std::sync::LazyLock<u64> = std::sync::LazyLock::new(network_ms);
// Soft daily egress ceiling. As the rolling-24h byte total approaches it,
// the broadcaster widens its cadence (sends frames less often) so the AWS
// data-transfer bill is bounded no matter how many tabs stream — without
// ever disconnecting an active viewer. 0 disables the governor.
static DAILY_EGRESS_BYTES: std::sync::LazyLock<u64> =
    std::sync::LazyLock::new(|| daily_egress_mb().saturating_mul(1024 * 1024));
pub static LOOKAHEAD_MS: std::sync::LazyLock<u64> = std::sync::LazyLock::new(lookahead_ms);

const FULL_FRAME_EVERY_TICKS: u64 = 30;

const SAVE_EVERY_TICKS: u64 = 600;

async fn sleep_until_period_end(cycle_start: std::time::Instant, period_ms: u64) {
    let elapsed = cycle_start.elapsed().as_millis() as u64;
    if elapsed >= period_ms {
        return;
    }
    tokio::time::sleep(tokio::time::Duration::from_millis(period_ms - elapsed)).await;
}

pub type LatestFull = Arc<std::sync::RwLock<Option<Arc<Vec<u8>>>>>;

/// Cached OG image bytes + epoch_ms of the render time. Wrapped in an
/// async mutex so the route handler can do a brief await across the
/// PNG encode without blocking the world-broadcast tasks.
pub type OgCache = Arc<tokio::sync::Mutex<Option<(u64, Arc<Vec<u8>>)>>>;

pub type SharedWorldStore = Arc<crate::server::world_store::WorldStore>;

#[derive(Clone)]
pub struct AppState {
    pub sim: SharedSim,
    pub tx: Tx,
    pub latest_full: LatestFull,
    pub latest_full_at: Arc<std::sync::atomic::AtomicU64>,
    pub transport_stats: SharedTransportStats,
    pub llm_stats: crate::server::llm_stats::SharedLlmStats,
    pub memory_watch: crate::server::memory_watch::SharedMemoryWatch,
    pub groq_limiter: crate::server::llm_rate::SharedGroqLimiter,
    pub og_cache: OgCache,
    pub start_ms: u64,
    pub world_store: Option<SharedWorldStore>,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    // Tracing init. RUST_LOG drives the filter; default to `info` so
    // the server starts loud enough to debug but quiet enough to read.
    // The `simulation_rs=info` target prefix keeps third-party crates
    // (reqwest, axum, hyper) at `warn` unless explicitly raised.
    use tracing_subscriber::{fmt, EnvFilter};
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info,reqwest=warn,hyper=warn,h2=warn"));
    fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_level(true)
        .init();

    let narration_key = (*NARRATION_LLM_KEY).clone();
    let think_key = (*THINK_LLM_KEY).clone();
    let is_local = |u: &str| u.contains("localhost") || u.contains("127.0.0.1");
    if narration_key.is_empty() && !is_local(&NARRATION_LLM_URL) {
        tracing::warn!(
            "no NARRATION_LLM_KEY / LLM_KEY / GROQ_API_KEY set - \
                        remote narration calls will fail"
        );
    }
    if think_key.is_empty() && !is_local(&THINK_LLM_URL) {
        tracing::warn!(
            "no THINK_LLM_KEY / LLM_KEY / GROQ_API_KEY set - \
                        remote think calls will fail"
        );
    }

    let fresh_seed: u64 = {
        use std::time::{SystemTime, UNIX_EPOCH};
        let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        t.as_nanos() as u64 ^ (t.subsec_nanos() as u64).wrapping_mul(0x9e3779b97f4a7c15)
    };

    let live_hash: String = {
        use crate::server::world_store as ws;
        if let Some(h) = ws::live_world_hash() {
            tracing::info!(target: "world", "resuming live world {}", h);
            h
        } else {
            let legacy = std::path::PathBuf::from(LEGACY_SAVE_PATH);
            let h = ws::mint_world_hash(fresh_seed, now_ms());
            if legacy.exists() {
                match ws::migrate_legacy_save(&legacy, &h) {
                    Ok(true) => {
                        tracing::warn!(target: "world",
                            "migrated legacy {} -> worlds/{}/world.save", LEGACY_SAVE_PATH, h);
                    }
                    Ok(false) => {
                        let _ = ws::ensure_world_dir(&h);
                        let _ = ws::set_live_world_hash(&h);
                    }
                    Err(e) => {
                        tracing::warn!(target: "world",
                            "legacy save migration failed: {} - starting fresh", e);
                        let _ = ws::ensure_world_dir(&h);
                        let _ = ws::set_live_world_hash(&h);
                    }
                }
            } else {
                let _ = ws::ensure_world_dir(&h);
                let _ = ws::set_live_world_hash(&h);
                tracing::info!(target: "world", "minted new live world {}", h);
            }
            h
        }
    };
    let live_save_path = crate::server::world_store::world_save_path(&live_hash);
    let save_path_str = live_save_path.to_string_lossy().to_string();
    let sim = Arc::new(Mutex::new(Simulation::load_or_new(fresh_seed, &save_path_str)));
    let world_store: Option<SharedWorldStore> = match crate::server::world_store::WorldStore::open(&live_hash)
    {
        Ok(s) => Some(Arc::new(s)),
        Err(e) => {
            tracing::warn!(target: "world",
                "could not open worlds/{}/world.sqlite: {} — dead-org memory archive disabled",
                live_hash, e);
            None
        }
    };
    let (tx, _rx) = broadcast::channel::<Arc<Vec<u8>>>(WS_BROADCAST_BUFFER);
    let latest_full: LatestFull = Arc::new(std::sync::RwLock::new(None));
    let latest_full_at: Arc<std::sync::atomic::AtomicU64> = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let frame_clock: FrameClock = Arc::new(AtomicU64::new(0));
    let transport_stats: SharedTransportStats = Arc::new(TransportStats::default());
    let llm_stats: llm_stats::SharedLlmStats = Arc::new(llm_stats::LlmStats::default());

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

    let (narration_tx, narration_rx) = mpsc::channel::<NarrationReq>(4);
    let (think_tx, think_rx) = mpsc::channel::<ThinkTrigger>(8);
    let (convo_tx, convo_rx) = mpsc::channel::<sim::convo_req::ConversationReq>(16);

    let stories: Arc<Mutex<std::collections::HashMap<String, String>>> =
        Arc::new(Mutex::new(std::collections::HashMap::new()));
    let think_results: Arc<Mutex<Vec<ThinkResult>>> = Arc::new(Mutex::new(Vec::new()));
    let convo_store: conversation_worker::ConvoStore = Arc::new(Mutex::new(std::collections::HashMap::new()));
    let groq_limit_per_min: usize = std::env::var("GROQ_RPM")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(28);
    let groq_limiter = llm_rate::GroqRateLimiter::new(groq_limit_per_min);
    tracing::info!(target: "groq", "rate limit: {}/min", groq_limit_per_min);

    // Box-wide memory floors. We watch /proc/meminfo MemAvailable and
    // throttle when the WHOLE box (us + llama.cpp + everything) runs low.
    // EC2 c7g.medium has 2 GB RAM; defaults leave generous breathing room.
    let mem_elev_mb: u64 = std::env::var("MEM_FLOOR_ELEVATED_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(400);
    let mem_crit_mb: u64 = std::env::var("MEM_FLOOR_CRITICAL_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(200);
    let memory_watch = memory_watch::MemoryWatch::new(mem_elev_mb, mem_crit_mb);
    tracing::warn!(target: "mem", "watchdog: elevated below {} MB available, critical below {} MB available",
        mem_elev_mb, mem_crit_mb);

    // Local think lane (llama.cpp) needs its own throttle. Without one,
    // bursts of 14 think scenarios per tick flood llama.cpp's per-slot KV
    // cache and drive the box toward OOM. Default: 240 req/min (4/s),
    // generous enough for steady play but capped so we never queue
    // hundreds of concurrent decodes.
    let local_think_per_min: usize = std::env::var("LOCAL_THINK_RPM")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(240);
    let local_think_limiter = llm_rate::GroqRateLimiter::new(local_think_per_min);
    tracing::info!(target: "think", "local rate limit: {}/min", local_think_per_min);

    {
        let stories_w = stories.clone();
        let key = narration_key.clone();
        let stats = llm_stats.clone();
        let limiter = groq_limiter.clone();
        tokio::spawn(narration_worker(narration_rx, stories_w, key, stats, limiter));
    }
    {
        let results_w = think_results.clone();
        let key = think_key.clone();
        let stats = llm_stats.clone();
        let think_limiter = if llm_rate::url_needs_groq_quota(&THINK_LLM_URL) {
            tracing::info!(target: "groq", "think lane points at Groq - applying shared rate limit");
            Some(groq_limiter.clone())
        } else {
            Some(local_think_limiter.clone())
        };
        tokio::spawn(think_worker(think_rx, results_w, key, stats, think_limiter));
    }
    {
        let store_w = convo_store.clone();
        let key = narration_key.clone();
        let stats = llm_stats.clone();
        let limiter = groq_limiter.clone();
        tokio::spawn(conversation_worker::conversation_worker(
            convo_rx, store_w, key, stats, limiter,
        ));
    }

    {
        let sim_clone = sim.clone();
        let stories_clone = stories.clone();
        let think_res_clone = think_results.clone();
        let convo_store_cl = convo_store.clone();
        let narration_tx2 = narration_tx.clone();
        let convo_tx2 = convo_tx.clone();
        let memory_watch_cl = memory_watch.clone();
        let transport_stats_s = transport_stats.clone();
        let world_store = world_store.clone();
        tokio::spawn(async move {
            loop {
                let tick_started = std::time::Instant::now();
                let tick_outputs = {
                    let mut s: tokio::sync::MutexGuard<'_, _> = sim_clone.lock().await;
                    // The sim tick is a heavy CPU-bound chunk (movement
                    // decisions, action evaluation, world-event ticks,
                    // spatial-index rebuilds - 10-100ms at this pop).
                    // Without `block_in_place` it occupies a tokio worker
                    // synchronously and starves async tasks like the
                    // HTTP handlers (we saw /version taking 4-37s under
                    // load, and /snapshot trickling at ~8KB/s through
                    // Cloudflare). block_in_place tells the multi-thread
                    // runtime to spin up a replacement worker so siblings
                    // keep getting scheduled while this one churns.
                    tokio::task::block_in_place(|| s.tick());

                    if s.tick_count % 30 == 0 {
                        let p = memory_watch_cl.pressure();
                        if !matches!(p, memory_watch::MemoryPressure::Normal) {
                            s.apply_memory_pressure(p);
                        }
                    }

                    {
                        let mut results = think_res_clone.lock().await;
                        let tick = s.tick_count;
                        for r in results.drain(..) {
                            let actor_name = s
                                .organisms
                                .iter()
                                .find(|o| o.id == r.org_id)
                                .map(|o| o.name.clone())
                                .unwrap_or_default();
                            let mut invented: Option<String> = None;
                            if let Some(org) = s.organisms.iter_mut().find(|o| o.id == r.org_id) {
                                if let (Some(lid), Some(delta)) = (&r.target_lineage, r.attitude_delta) {
                                    org.update_attitude(lid, delta);
                                }
                                if let Some(t) = &r.thought {
                                    org.think(t, tick);
                                }
                                if let Some(d) = &r.directive {
                                    tracing::info!(target: "think", "{} directive={} for {} ticks",
                                        org.name, d, r.directive_ticks);
                                    org.directive = d.clone();
                                    org.directive_until = tick + r.directive_ticks;
                                }
                                if let Some(disc) = &r.new_discovery {
                                    if !org.discoveries.contains(disc) {
                                        org.discoveries.insert(disc.clone());
                                        org.log_life(
                                            tick,
                                            "discovery",
                                            format!("invented {}", disc.replace('_', " ")),
                                        );
                                        invented = Some(disc.clone());
                                    }
                                }
                                if let Some((trait_name, delta)) = &r.trait_delta {
                                    match trait_name.as_str() {
                                        "fear" => org.traits.fear = (org.traits.fear + delta).clamp(0.0, 1.0),
                                        "social_tendency" => {
                                            org.traits.social_tendency =
                                                (org.traits.social_tendency + delta).clamp(0.0, 1.0)
                                        }
                                        "aggression" => {
                                            org.traits.aggression =
                                                (org.traits.aggression + delta).clamp(0.0, 1.0)
                                        }
                                        "curiosity" => {
                                            org.traits.curiosity =
                                                (org.traits.curiosity + delta).clamp(0.0, 1.0)
                                        }
                                        "resilience" => {
                                            org.traits.resilience =
                                                (org.traits.resilience + delta).clamp(0.0, 1.0)
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            if let Some(disc) = invented {
                                use crate::sim::world_events::push_event;
                                push_event(
                                    &mut s.events,
                                    tick,
                                    "build",
                                    &actor_name,
                                    &format!("invented {}", disc.replace('_', " ")),
                                );
                            }
                            if let (Some(lid), Some(strategy)) = (r.strategy_lineage, r.strategy) {
                                let expiry = s.tick_count + 800;
                                tracing::info!(target: "think", "tribe {} → {} (until t{})",
                                    &lid[..6.min(lid.len())], strategy, expiry);
                                s.lineage_strategies.insert(lid, (strategy, expiry));
                            }
                            if let (Some(alliance), Some(their_lid)) = (&r.alliance_type, &r.target_lineage) {
                                let their_oid = r.target_org_id.as_deref().unwrap_or("");
                                let actor_lid = s
                                    .organisms
                                    .iter()
                                    .find(|o| o.id == r.org_id)
                                    .map(|o| o.lineage_id.clone())
                                    .unwrap_or_default();
                                for org in s.organisms.iter_mut() {
                                    if org.lineage_id == actor_lid {
                                        org.update_attitude(their_lid, 0.25);
                                    } else if &org.lineage_id == their_lid {
                                        org.update_attitude(&actor_lid, 0.25);
                                    }
                                }
                                match alliance.as_str() {
                                    "food_sharing" => {
                                        let actor_food: Vec<_> = s
                                            .organisms
                                            .iter()
                                            .find(|o| o.id == r.org_id)
                                            .map(|o| o.food_memory.iter().map(|(&k, &v)| (k, v)).collect())
                                            .unwrap_or_default();
                                        let target_food: Vec<_> = s
                                            .organisms
                                            .iter()
                                            .find(|o| o.id == their_oid)
                                            .map(|o| o.food_memory.iter().map(|(&k, &v)| (k, v)).collect())
                                            .unwrap_or_default();
                                        use crate::organism::organism::Organism as Org;
                                        if let Some(actor) = s.organisms.iter_mut().find(|o| o.id == r.org_id)
                                        {
                                            let ms = actor.traits.memory_strength;
                                            for (k, v) in &target_food {
                                                Org::remember(&mut actor.food_memory, k.0, k.1, v * 0.5, ms);
                                            }
                                        }
                                        if let Some(target) =
                                            s.organisms.iter_mut().find(|o| o.id == their_oid)
                                        {
                                            let ms = target.traits.memory_strength;
                                            for (k, v) in &actor_food {
                                                Org::remember(&mut target.food_memory, k.0, k.1, v * 0.5, ms);
                                            }
                                        }
                                    }
                                    "defense_pact" => {
                                        let pact_disc =
                                            format!("pact:{}", &their_lid[..their_lid.len().min(8)]);
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == r.org_id) {
                                            if !org.discoveries.contains(&pact_disc) {
                                                org.discoveries.insert(pact_disc.clone());
                                            }
                                        }
                                        let actor_disc =
                                            format!("pact:{}", &actor_lid[..actor_lid.len().min(8)]);
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == their_oid)
                                        {
                                            if !org.discoveries.contains(&actor_disc) {
                                                org.discoveries.insert(actor_disc.clone());
                                            }
                                        }
                                    }
                                    "knowledge_exchange" => {
                                        let actor_disc: Vec<String> = s
                                            .organisms
                                            .iter()
                                            .find(|o| o.id == r.org_id)
                                            .map(|o| o.discoveries.iter().cloned().collect())
                                            .unwrap_or_default();
                                        let their_disc: Vec<String> = s
                                            .organisms
                                            .iter()
                                            .find(|o| o.id == their_oid)
                                            .map(|o| o.discoveries.iter().cloned().collect())
                                            .unwrap_or_default();
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == r.org_id) {
                                            for d in &their_disc {
                                                if !org.discoveries.contains(d) {
                                                    org.discoveries.insert(d.clone());
                                                }
                                            }
                                        }
                                        if let Some(org) = s.organisms.iter_mut().find(|o| o.id == their_oid)
                                        {
                                            for d in &actor_disc {
                                                if !org.discoveries.contains(d) {
                                                    org.discoveries.insert(d.clone());
                                                }
                                            }
                                        }
                                    }
                                    _ => {}
                                }
                                use crate::sim::world_events::push_event;
                                push_event(
                                    &mut s.events,
                                    tick,
                                    "treaty",
                                    &actor_name,
                                    &format!(
                                        "{} pact: {} ↔ {}",
                                        alliance.replace('_', " "),
                                        &actor_lid[..actor_lid.len().min(6)],
                                        &their_lid[..their_lid.len().min(6)]
                                    ),
                                );
                            }
                            if let (Some(teaching), Some(child_id)) = (&r.teaching, &r.target_org_id) {
                                if let Some(child) = s.organisms.iter_mut().find(|o| o.id == *child_id) {
                                    child.discoveries.insert(teaching.clone());
                                    child.log_event(format!("taught: {}", teaching));
                                }
                            }
                        }
                    }

                    {
                        let cur_tick = s.tick_count;
                        let mut store = stories_clone.lock().await;
                        for (org_id, story) in store.drain() {
                            if let Some(org) = s.organisms.iter_mut().find(|o| o.id == org_id) {
                                org.daily_story = story.clone();
                                let name = org.name.clone();
                                let lid = org.lineage_id.clone();
                                s.story_history.push_back(StoryEntry {
                                    tick: cur_tick,
                                    org_name: name,
                                    lineage_id: lid,
                                    story,
                                });
                                if s.story_history.len() > 300 {
                                    s.story_history.pop_front();
                                }
                            }
                        }
                    }

                    {
                        let mut store = convo_store_cl.lock().await;
                        if !store.is_empty() {
                            let ready: Vec<(String, Vec<[String; 2]>)> = store.drain().collect();
                            drop(store);
                            for (entry_id, lines) in ready {
                                for org in s.organisms.iter_mut() {
                                    if let Some(c) = org.conversations.iter_mut().find(|c| c.id == entry_id) {
                                        c.lines = lines.clone();
                                        c.meanings.clear();
                                    }
                                }
                            }
                        }
                    }

                    if s.tick_count % DAY_LENGTH == 0
                        && !matches!(memory_watch_cl.pressure(), memory_watch::MemoryPressure::Critical)
                    {
                        let cur_tick = s.tick_count;
                        let era = s.current_era.clone();
                        let lineage_names = s.lineage_names.clone();
                        let name_for = |id: &str| -> Option<String> {
                            s.organisms.iter().find(|o| o.id == id).map(|o| o.name.clone())
                        };

                        let mut candidates: Vec<NarrationReq> = Vec::new();
                        for o in s.organisms.iter().filter(|o| o.alive && !o.life_log.is_empty()) {
                            let mood = if o.infection > 0.20 {
                                "sick"
                            } else if o.energy < 0.30 {
                                "hungry"
                            } else if o.hydration < 0.30 {
                                "thirsty"
                            } else if o.fear_level > 0.40 {
                                "afraid"
                            } else if o.grief_ticks > 0 {
                                "mourning"
                            } else if o.joy_ticks > 0 {
                                "joyful"
                            } else if o.loneliness > 0.60 {
                                "lonely"
                            } else if o.is_elder {
                                "weary"
                            } else {
                                "content"
                            };
                            let age_days = (o.age / DAY_LENGTH as u32).max(0);
                            let tribe_name = lineage_names.get(&o.lineage_id).cloned();
                            let partner_name = o.partner_id.as_ref().and_then(|pid| name_for(pid));
                            candidates.push(NarrationReq {
                                org_id: o.id.clone(),
                                org_name: o.name.clone(),
                                sex: format!("{:?}", o.sex).to_lowercase(),
                                age_days,
                                tribe_name,
                                life_log: o.life_log.iter().map(|e| e.text.clone()).collect(),
                                vocab: o.vocabulary.as_hashmap(),
                                partner_name,
                                children: o.children_count,
                                era: era.clone(),
                                mood: mood.to_string(),
                                aspiration: o.aspiration.clone(),
                                memories: o
                                    .memories
                                    .top(5)
                                    .into_iter()
                                    .filter(|m| m.tick_formed < cur_tick.saturating_sub(1200))
                                    .map(|m| m.text.clone())
                                    .collect(),
                                zodiac: o.zodiac.clone(),
                                moon_phase: sim::cosmos::moon_phase_at(cur_tick).label().to_string(),
                            });
                        }
                        candidates.sort_by_key(|c| {
                            s.organisms
                                .iter()
                                .find(|o| o.id == c.org_id)
                                .map(|o| o.last_story_tick)
                                .unwrap_or(0)
                        });
                        for req in candidates {
                            let oid = req.org_id.clone();
                            match narration_tx2.try_send(req) {
                                Ok(()) => {
                                    if let Some(org) = s.organisms.iter_mut().find(|o| o.id == oid) {
                                        org.last_story_tick = cur_tick;
                                    }
                                }
                                Err(_) => break,
                            }
                        }
                    }

                    // Snapshot the save state while the lock is held
                    // (cheap-ish clones); the heavy lifting (serde_json
                    // + fs::write + fsync) happens on a blocking task so
                    // the next tick can run during it. Previously this
                    // blocked the lock for 100-300ms every 600 ticks,
                    // causing visible tick-rate hitches and freezing
                    // HTTP routes that share the same mutex.
                    let pending_save = if s.tick_count % SAVE_EVERY_TICKS == 0 {
                        Some(s.to_save_state())
                    } else {
                        None
                    };

                    let pending_thinks = std::mem::take(&mut s.pending_thinks);
                    let pending_convos = std::mem::take(&mut s.pending_convos);
                    let pending_flushes = std::mem::take(&mut s.pending_memory_flushes);
                    (pending_thinks, pending_convos, pending_save, pending_flushes)
                };

                let (pending_thinks, pending_convos, pending_save, pending_flushes) = tick_outputs;
                if !pending_flushes.is_empty() {
                    if let Some(ws) = world_store.clone() {
                        tokio::task::spawn_blocking(move || {
                            for f in pending_flushes {
                                let refs: Vec<&crate::organism::memory::MemoryEntry> =
                                    f.memories.iter().collect();
                                if let Err(e) = ws.flush_dead_org_memories(
                                    &f.org_id,
                                    &f.org_name,
                                    &f.lineage_id,
                                    f.flushed_tick,
                                    &refs,
                                ) {
                                    tracing::warn!(target: "memory",
                                        "flush_dead_org_memories({}): {}", f.org_id, e);
                                }
                            }
                        });
                    }
                }
                if let Some(state) = pending_save {
                    tokio::task::spawn_blocking(move || {
                        let hash = crate::server::world_store::live_world_hash()
                            .unwrap_or_else(|| "_unknown".to_string());
                        let path = crate::server::world_store::world_save_path(&hash);
                        if let Some(parent) = path.parent() {
                            let _ = std::fs::create_dir_all(parent);
                        }
                        let path_str = path.to_string_lossy().to_string();
                        if let Err(e) = sim::persistence::write_save_to_disk(&state, &path_str) {
                            tracing::warn!(target: "save", "failed: {}", e);
                        }
                    });
                }
                let pressure = memory_watch_cl.pressure();
                let think_budget = match pressure {
                    memory_watch::MemoryPressure::Normal => usize::MAX,
                    memory_watch::MemoryPressure::Elevated => 2,
                    memory_watch::MemoryPressure::Critical => 0,
                };
                for (i, t) in pending_thinks.into_iter().enumerate() {
                    if i >= think_budget {
                        break;
                    }
                    let _ = think_tx.try_send(t);
                }
                let convos_to_send = if matches!(pressure, memory_watch::MemoryPressure::Critical) {
                    Vec::new()
                } else {
                    pending_convos
                };
                for c in convos_to_send {
                    let _ = convo_tx2.try_send(c);
                }
                transport_stats_s.record_sim_tick(tick_started.elapsed().as_millis() as u64, *TICK_MS);
                sleep_until_period_end(tick_started, *TICK_MS).await;
            }
        });
    }

    {
        let sim_clone = sim.clone();
        let tx_clone = tx.clone();
        let latest_full_w = latest_full.clone();
        let latest_full_at_w = latest_full_at.clone();
        let frame_clock_w = frame_clock.clone();
        let transport_stats_w = transport_stats.clone();
        tokio::spawn(async move {
            loop {
                let cycle_started = std::time::Instant::now();
                if tx_clone.receiver_count() == 0 {
                    sleep_until_period_end(cycle_started, *NETWORK_MS).await;
                    continue;
                }
                let (frame, full_payload) = {
                    let mut s = sim_clone.lock().await;
                    let is_full_frame = s.tick_count % FULL_FRAME_EVERY_TICKS == 0;
                    let is_deep_full = is_full_frame && (s.tick_count % 300 == 0);
                    let serialize_started = std::time::Instant::now();
                    let frame_id = next_frame_id(&frame_clock_w);
                    let (bytes, kind) = if is_full_frame {
                        (
                            encode_frame(s.state_json_periodic_full(), frame_id, now_ms(), "full"),
                            FrameKind::Full,
                        )
                    } else {
                        (
                            encode_frame(s.state_json_incremental(), frame_id, now_ms(), "delta"),
                            FrameKind::Delta,
                        )
                    };
                    transport_stats_w.record_generated_kind(
                        bytes.len(),
                        serialize_started.elapsed().as_millis() as u64,
                        Some(kind),
                    );
                    let heavy = if is_deep_full {
                        Some(Arc::new(encode_frame(s.state_json(), frame_id, now_ms(), "full")))
                    } else {
                        None
                    };
                    let frame = Arc::new(bytes);
                    (frame, heavy)
                };

                if let Some(full) = full_payload {
                    if let Ok(mut slot) = latest_full_w.write() {
                        *slot = Some(full);
                    }
                    latest_full_at_w.store(transport::now_ms(), std::sync::atomic::Ordering::Relaxed);
                }
                let receivers = tx_clone.receiver_count() as u64;
                let frame_len = frame.len() as u64;
                let _ = tx_clone.send(frame);

                // Egress this cycle is the frame size times every subscriber
                // it fans out to. Accumulate it into the rolling-24h window
                // and widen the cadence as we approach the daily budget — a
                // graceful, non-disconnecting cap on the data-transfer bill.
                transport_stats_w.record_egress(frame_len.saturating_mul(receivers), now_ms());
                let budget = *DAILY_EGRESS_BYTES;
                let cadence_mult = if budget == 0 {
                    1
                } else {
                    let frac = transport_stats_w.day_sent_bytes() as f64 / budget as f64;
                    if frac >= 1.0 {
                        6
                    } else if frac >= 0.9 {
                        4
                    } else if frac >= 0.7 {
                        2
                    } else {
                        1
                    }
                };
                let effective_ms = (*NETWORK_MS).saturating_mul(cadence_mult);
                if cycle_started.elapsed().as_millis() as u64 > effective_ms {
                    transport_stats_w.record_broadcaster_overrun();
                }
                sleep_until_period_end(cycle_started, effective_ms).await;
            }
        });
    }

    // CORS: restrict origins to the production frontend + common dev
    // hosts. Set `THB_EXTRA_CORS_ORIGINS` (comma-separated) to allow
    // additional origins for staging environments. Wide-open `Any`
    // origin lets any site embed our endpoints (cost amplification +
    // scraping risk), so we lock it down by default.
    let mut allowed: Vec<HeaderValue> = vec![
        "https://thehumanbox.com",
        "https://www.thehumanbox.com",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
    ]
    .into_iter()
    .filter_map(|s| HeaderValue::from_str(s).ok())
    .collect();
    if let Ok(extra) = std::env::var("THB_EXTRA_CORS_ORIGINS") {
        for origin in extra.split(',') {
            let trimmed = origin.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(hv) = HeaderValue::from_str(trimmed) {
                allowed.push(hv);
            }
        }
    }
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed))
        .allow_methods(Any)
        .allow_headers(Any);

    let compression = CompressionLayer::new().gzip(true);

    latest_full_at.store(transport::now_ms(), std::sync::atomic::Ordering::Relaxed);
    let start_ms = transport::now_ms();
    let og_cache: OgCache = Arc::new(tokio::sync::Mutex::new(None));

    server::world_archive::ensure_worlds_dir();
    let world_started_at = Arc::new(std::sync::atomic::AtomicU64::new(start_ms));
    let peak_pop = Arc::new(std::sync::atomic::AtomicU64::new(0));
    {
        let sim_arch = sim.clone();
        let started_at_arch = world_started_at.clone();
        let peak_arch = peak_pop.clone();
        tokio::spawn(async move {
            let (mut cur_y, mut cur_m) = server::world_archive::current_year_month_utc();
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(600)).await;
                {
                    let s = sim_arch.lock().await;
                    let pop = s.organisms.iter().filter(|o| o.alive).count() as u64;
                    let prev = peak_arch.load(std::sync::atomic::Ordering::Relaxed);
                    if pop > prev {
                        peak_arch.store(pop, std::sync::atomic::Ordering::Relaxed);
                    }
                }
                let (y, m) = server::world_archive::current_year_month_utc();
                if (y, m) != (cur_y, cur_m) {
                    let started = started_at_arch.load(std::sync::atomic::Ordering::Relaxed);
                    let peak = peak_arch.load(std::sync::atomic::Ordering::Relaxed);
                    let active_hash = crate::server::world_store::live_world_hash()
                        .unwrap_or_else(|| "_unknown".to_string());
                    let active_save = crate::server::world_store::world_save_path(&active_hash);
                    let active_save_str = active_save.to_string_lossy().to_string();
                    if let Some(hash) = server::world_archive::archive_and_reset(
                        sim_arch.clone(),
                        started,
                        peak,
                        &active_save_str,
                    )
                    .await
                    {
                        tracing::warn!(target: "archive", "month rollover -> archived as {}", hash);
                    }
                    started_at_arch.store(transport::now_ms(), std::sync::atomic::Ordering::Relaxed);
                    peak_arch.store(0, std::sync::atomic::Ordering::Relaxed);
                    cur_y = y;
                    cur_m = m;
                }
            }
        });
    }

    let state = AppState {
        sim,
        tx,
        latest_full,
        latest_full_at: latest_full_at.clone(),
        transport_stats,
        llm_stats,
        memory_watch,
        groq_limiter,
        og_cache,
        start_ms,
        world_store: world_store.clone(),
    };

    let app = Router::new()
        .route("/ws", get(routes::ws_handler))
        .route("/org/{id}", get(routes::org_detail_handler))
        .route("/org/{id}/life", get(routes::org_life_handler))
        .route("/org/{id}/conversations", get(routes::org_conversations_handler))
        .route("/version", get(routes::version_handler))
        .route("/snapshot", get(routes::snapshot_handler))
        .route("/transport", get(routes::transport_handler))
        .route("/llm", get(routes::llm_handler))
        .route("/memory", get(routes::memory_handler))
        .route("/health", get(routes::health_handler))
        .route("/metrics", get(routes::metrics_handler))
        .route("/og.png", get(routes::og_handler))
        .route("/worlds", get(routes::list_worlds_handler))
        .route("/worlds/{hash}/meta", get(routes::world_meta_handler))
        .route("/worlds/{hash}/snapshot", get(routes::world_snapshot_handler))
        .route("/worlds/{hash}/save", get(routes::world_save_handler))
        .layer(compression)
        .layer(cors)
        .with_state(state);

    let bind_host = std::env::var("BIND_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let bind_port = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(8000);
    let addr_owned = format!("{}:{}", bind_host, bind_port);
    let addr: &str = &addr_owned;
    if *NARRATION_LLM_URL == *THINK_LLM_URL && *NARRATION_LLM_MODEL == *THINK_LLM_MODEL {
        tracing::info!(
            "simulation-rs listening on {}  tick={}ms  llm={} ({})",
            addr,
            *TICK_MS,
            *NARRATION_LLM_MODEL,
            *NARRATION_LLM_URL
        );
    } else {
        tracing::info!("simulation-rs listening on {}  tick={}ms", addr, *TICK_MS);
        tracing::info!("    narration: {} ({})", *NARRATION_LLM_MODEL, *NARRATION_LLM_URL);
        tracing::info!("    think:     {} ({})", *THINK_LLM_MODEL, *THINK_LLM_URL);
    }
    if *DAILY_EGRESS_BYTES == 0 {
        tracing::warn!(target: "egress", "daily egress governor DISABLED (DAILY_EGRESS_MB=0) - no bill ceiling");
    } else {
        tracing::info!(target: "egress",
            "egress governor: broadcast cadence widens past {} MB/24h (base {}ms; ×2 @70%, ×4 @90%, ×6 @100%)",
            *DAILY_EGRESS_BYTES / (1024 * 1024), *NETWORK_MS);
    }
    // Bind / serve with clear error messages instead of `.unwrap()`
    // panics - the most common failure here is "port already in use"
    // during a deploy bounce, and the bare-bones panic message left
    // operators chasing red herrings.
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            tracing::error!(
                "failed to bind {}: {} - is another simulation-rs process holding the port?",
                addr,
                e
            );
            std::process::exit(1);
        }
    };
    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("axum::serve exited: {}", e);
        std::process::exit(1);
    }
}
