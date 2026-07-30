#![allow(dead_code)]

// The sim core now lives in the `sim-core` crate. Re-export its modules at
// the crate root so every existing `crate::sim::…` / `crate::organism::…`
// path in this binary and in `server/*` keeps resolving unchanged.
pub use sim_core::{organism, physics, sim, world};

mod server;

#[cfg(feature = "webtransport")]
use crate::server::webtransport;
use crate::server::{
    conversation_worker, llm, llm_rate, llm_stats, memory_watch, narration_worker, routes, think_worker,
    transport,
};

use axum::http::HeaderValue;
use axum::{
    routing::{get, post},
    Router,
};
use std::future::IntoFuture;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, mpsc, watch, Mutex};
use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

use llm::{
    NARRATION_LLM_KEY, NARRATION_LLM_MODEL, NARRATION_LLM_URL, THINK_LLM_KEY, THINK_LLM_MODEL, THINK_LLM_URL,
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
const MIN_RUNTIME_TICK_MS: u64 = 16;
const MAX_RUNTIME_TICK_MS: u64 = 5_000;

fn bounded_interval_ms(value: Option<&str>, fallback: u64, min: u64, max: u64) -> u64 {
    value
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|interval| *interval > 0)
        .unwrap_or(fallback)
        .clamp(min, max)
}

fn tick_ms() -> u64 {
    bounded_interval_ms(
        std::env::var("TICK_MS").ok().as_deref(),
        100,
        MIN_RUNTIME_TICK_MS,
        MAX_RUNTIME_TICK_MS,
    )
}

fn network_ms() -> u64 {
    bounded_interval_ms(std::env::var("NETWORK_MS").ok().as_deref(), 500, 16, 60_000)
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

fn env_flag(name: &str) -> bool {
    std::env::var(name)
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

fn write_desktop_record_atomically(
    path: &std::path::Path,
    value: &serde_json::Value,
    token: &str,
    child_pid: u32,
) -> Result<(), String> {
    use std::io::Write;

    let parent = path
        .parent()
        .ok_or_else(|| format!("{} has no parent folder", path.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("{} has no valid file name", path.display()))?;
    let temp = parent.join(format!(".{file_name}.{token}.{child_pid}.tmp"));
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|error| format!("could not create {}: {error}", temp.display()))?;
    if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("could not persist {}: {error}", temp.display()));
    }
    drop(file);

    let target_matches = || {
        std::fs::read(path)
            .ok()
            .and_then(|raw| serde_json::from_slice::<serde_json::Value>(&raw).ok())
            .as_ref()
            == Some(value)
    };
    if path.exists() {
        if target_matches() {
            let _ = std::fs::remove_file(&temp);
            return Ok(());
        }
        let _ = std::fs::remove_file(&temp);
        return Err(format!("{} is owned by another process", path.display()));
    }
    if let Err(error) = std::fs::rename(&temp, path) {
        if target_matches() {
            let _ = std::fs::remove_file(&temp);
            return Ok(());
        }
        let _ = std::fs::remove_file(&temp);
        return Err(format!("could not activate {}: {error}", path.display()));
    }
    if let Ok(directory) = std::fs::File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}

fn claim_desktop_data_lock_at(
    root: &std::path::Path,
    token: &str,
    parent_pid: u32,
    child_pid: u32,
    port: u16,
) -> Result<(), String> {
    if token.is_empty()
        || token.len() > 128
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("desktop data-lock token is invalid".to_string());
    }
    let lock_dir = root.join(".thehumanbox-data.lock");
    let owner_path = lock_dir.join("owner.json");
    let owner: serde_json::Value = serde_json::from_slice(
        &std::fs::read(&owner_path)
            .map_err(|error| format!("could not read {}: {error}", owner_path.display()))?,
    )
    .map_err(|error| format!("could not decode {}: {error}", owner_path.display()))?;
    if owner.get("token").and_then(serde_json::Value::as_str) != Some(token)
        || owner.get("pid").and_then(serde_json::Value::as_u64) != Some(u64::from(parent_pid))
    {
        return Err("desktop data lock changed before the simulation child claimed it".to_string());
    }

    // The pid record is durable before child.json announces adoption. A new
    // desktop can therefore either wait for the short unclaimed-launch grace
    // period or find and terminate this exact orphan before opening the world.
    let pid_record = serde_json::json!({
        "pid": child_pid,
        "port": port,
        "token": token,
    });
    write_desktop_record_atomically(&root.join("sim.pid"), &pid_record, token, child_pid)?;
    let claimed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let child_record = serde_json::json!({
        "pid": child_pid,
        "token": token,
        "claimedAt": claimed_at,
    });
    write_desktop_record_atomically(&lock_dir.join("child.json"), &child_record, token, child_pid)
}

fn claim_desktop_data_lock_from_env() -> Result<(), String> {
    let Ok(token) = std::env::var("THB_DATA_LOCK_TOKEN") else {
        return Ok(());
    };
    let parent_pid = std::env::var("THB_DESKTOP_PARENT_PID")
        .map_err(|_| "THB_DESKTOP_PARENT_PID is required with a data-lock token".to_string())?
        .parse::<u32>()
        .map_err(|_| "THB_DESKTOP_PARENT_PID is invalid".to_string())?;
    let port = std::env::var("PORT")
        .map_err(|_| "PORT is required with a data-lock token".to_string())?
        .parse::<u16>()
        .map_err(|_| "PORT is invalid".to_string())?;
    let root = std::env::current_dir().map_err(|error| error.to_string())?;
    claim_desktop_data_lock_at(&root, &token, parent_pid, std::process::id(), port)
}

fn parse_env_switch(value: &str, default: bool) -> bool {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => default,
    }
}

fn monthly_rollover_enabled_for(profile: Option<&str>, rollover: Option<&str>) -> bool {
    if profile
        .map(|value| value.trim().eq_ignore_ascii_case("local"))
        .unwrap_or(false)
    {
        return false;
    }
    rollover
        .map(|value| parse_env_switch(value, true))
        .unwrap_or(true)
}

fn monthly_rollover_enabled() -> bool {
    monthly_rollover_enabled_for(
        std::env::var("THB_PROFILE").ok().as_deref(),
        std::env::var("THB_MONTHLY_ROLLOVER").ok().as_deref(),
    )
}

fn population_limit_from_env_value(value: Option<&str>) -> Option<usize> {
    value.and_then(|raw| raw.trim().parse::<usize>().ok())
}

fn configured_population_limit() -> Option<usize> {
    population_limit_from_env_value(std::env::var("MAX_POPULATION").ok().as_deref())
}

async fn sleep_until_period_end_or_shutdown(
    cycle_start: std::time::Instant,
    period_ms: u64,
    shutdown: &mut watch::Receiver<bool>,
) -> bool {
    if *shutdown.borrow() {
        return true;
    }
    let elapsed = cycle_start.elapsed().as_millis() as u64;
    if elapsed >= period_ms {
        return false;
    }
    tokio::select! {
        _ = tokio::time::sleep(tokio::time::Duration::from_millis(period_ms - elapsed)) => false,
        changed = shutdown.changed() => changed.is_err() || *shutdown.borrow(),
    }
}

async fn shutdown_signal() -> &'static str {
    #[cfg(unix)]
    {
        let mut terminate = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler");
        tokio::select! {
            result = tokio::signal::ctrl_c() => {
                if let Err(error) = result {
                    tracing::warn!("Ctrl-C handler failed: {}", error);
                }
                "Ctrl-C"
            }
            _ = terminate.recv() => "SIGTERM",
        }
    }
    #[cfg(not(unix))]
    {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::warn!("Ctrl-C handler failed: {}", error);
        }
        "Ctrl-C"
    }
}

pub type SaveGate = Arc<tokio::sync::Mutex<()>>;

pub struct RuntimeControl {
    paused: AtomicBool,
    tick_ms: AtomicU64,
    base_tick_ms: u64,
}

impl RuntimeControl {
    fn new(base_tick_ms: u64) -> Self {
        let base_tick_ms = base_tick_ms.clamp(MIN_RUNTIME_TICK_MS, MAX_RUNTIME_TICK_MS);
        Self {
            paused: AtomicBool::new(false),
            tick_ms: AtomicU64::new(base_tick_ms),
            base_tick_ms,
        }
    }

    pub fn paused(&self) -> bool {
        self.paused.load(Ordering::Relaxed)
    }

    pub fn set_paused(&self, paused: bool) {
        self.paused.store(paused, Ordering::Relaxed);
    }

    pub fn tick_ms(&self) -> u64 {
        self.tick_ms.load(Ordering::Relaxed)
    }

    pub fn speed(&self) -> f64 {
        self.base_tick_ms as f64 / self.tick_ms() as f64
    }

    pub fn set_speed(&self, multiplier: f64) -> Option<u64> {
        if !multiplier.is_finite() || !(0.25..=8.0).contains(&multiplier) {
            return None;
        }
        let tick_ms = ((self.base_tick_ms as f64 / multiplier).round() as u64)
            .clamp(MIN_RUNTIME_TICK_MS, MAX_RUNTIME_TICK_MS);
        self.tick_ms.store(tick_ms, Ordering::Relaxed);
        Some(tick_ms)
    }
}

fn default_cors_origins(local_profile: bool) -> Vec<&'static str> {
    let mut origins = vec![
        "https://thehumanbox.com",
        "https://www.thehumanbox.com",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ];
    // Electron's loadFile renderer has an opaque origin and Chromium sends
    // `Origin: null` for its API requests. Only the loopback-bound local
    // profile needs that origin; hosted servers must continue rejecting it.
    if local_profile {
        origins.push("null");
    }
    origins
}

pub type SharedRuntimeControl = Arc<RuntimeControl>;

pub(crate) async fn write_final_world_save(
    sim: SharedSim,
    save_gate: SaveGate,
) -> Result<(u64, std::path::PathBuf), String> {
    // Serialize the snapshot and write as one ordered checkpoint. Taking the
    // gate first guarantees an older periodic snapshot can never land after a
    // newer manual or shutdown save.
    let _save_guard = save_gate.lock().await;
    let (state, tick, path) = {
        let s = sim.lock().await;
        let hash = crate::server::world_store::live_world_hash().unwrap_or_else(|| "_unknown".to_string());
        (
            s.to_save_state(),
            s.tick_count,
            crate::server::world_store::world_save_path(&hash),
        )
    };
    let path_for_write = path.clone();
    tokio::task::spawn_blocking(move || {
        if let Some(parent) = path_for_write.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let path_str = path_for_write.to_string_lossy().to_string();
        sim::persistence::write_save_to_disk(&state, &path_str).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| format!("final save task failed: {error}"))??;
    Ok((tick, path))
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
    pub world_started_at: Arc<AtomicU64>,
    pub peak_pop: Arc<AtomicU64>,
    pub population_limit: Option<usize>,
    pub runtime_control: SharedRuntimeControl,
    pub save_gate: SaveGate,
}

#[tokio::main]
async fn main() {
    if let Err(error) = claim_desktop_data_lock_from_env() {
        eprintln!("simulation-rs refused desktop data ownership: {error}");
        std::process::exit(1);
    }
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

    let llm_disabled = env_flag("THB_LLM_DISABLED");
    let narration_key = if llm_disabled {
        String::new()
    } else {
        (*NARRATION_LLM_KEY).clone()
    };
    let think_key = if llm_disabled {
        String::new()
    } else {
        (*THINK_LLM_KEY).clone()
    };
    let is_local = |u: &str| u.contains("localhost") || u.contains("127.0.0.1");
    if !llm_disabled && narration_key.is_empty() && !is_local(&NARRATION_LLM_URL) {
        tracing::warn!(
            "no NARRATION_LLM_KEY / LLM_KEY / GROQ_API_KEY set - \
                        remote narration calls will fail"
        );
    }
    if !llm_disabled && think_key.is_empty() && !is_local(&THINK_LLM_URL) {
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
    let mut loaded_sim = Simulation::load_or_new(fresh_seed, &save_path_str);
    let population_limit = configured_population_limit().map(|requested| {
        let applied = loaded_sim.set_population_limit(requested);
        tracing::info!(target: "world", "population limit: {} (requested {})", applied, requested);
        applied
    });
    let sim = Arc::new(Mutex::new(loaded_sim));
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
    let low_memory_mode = env_flag("THB_LOW_MEMORY");
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    let runtime_control = Arc::new(RuntimeControl::new(*TICK_MS));
    let save_gate: SaveGate = Arc::new(tokio::sync::Mutex::new(()));
    let pending_save_task: Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>> =
        Arc::new(std::sync::Mutex::new(None));

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
    // Defaults leave breathing room on a modest desktop.
    let mem_elev_mb: u64 = std::env::var("MEM_FLOOR_ELEVATED_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 320 } else { 400 });
    let mem_crit_mb: u64 = std::env::var("MEM_FLOOR_CRITICAL_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 160 } else { 200 });
    let rss_elev_mb: u64 = std::env::var("MEM_RSS_ELEVATED_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 180 } else { 320 });
    let rss_crit_mb: u64 = std::env::var("MEM_RSS_CRITICAL_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 260 } else { 480 });
    let memory_watch = memory_watch::MemoryWatch::new(mem_elev_mb, mem_crit_mb, rss_elev_mb, rss_crit_mb);
    tracing::warn!(target: "mem",
        "watchdog: low_memory={} host_available={} / {} MB, process_rss={} / {} MB",
        low_memory_mode, mem_elev_mb, mem_crit_mb, rss_elev_mb, rss_crit_mb);

    // Local think lane (llama.cpp) needs its own throttle. Without one,
    // bursts of 14 think scenarios per tick flood llama.cpp's per-slot KV
    // cache and drive the box toward OOM. Default: 240 req/min (4/s),
    // generous enough for steady play but capped so we never queue
    // hundreds of concurrent decodes.
    let local_think_per_min: usize = std::env::var("LOCAL_THINK_RPM")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 60 } else { 240 });
    let local_think_limiter = llm_rate::GroqRateLimiter::new(local_think_per_min);
    tracing::info!(target: "think", "local rate limit: {}/min", local_think_per_min);

    if llm_disabled {
        drop(narration_rx);
        drop(think_rx);
        drop(convo_rx);
        tracing::info!(target: "llm", "LLM workers disabled; simulation will not make AI network calls");
    } else {
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
    }

    let tick_task = {
        let sim_clone = sim.clone();
        let stories_clone = stories.clone();
        let think_res_clone = think_results.clone();
        let convo_store_cl = convo_store.clone();
        let narration_tx2 = narration_tx.clone();
        let convo_tx2 = convo_tx.clone();
        let memory_watch_cl = memory_watch.clone();
        let transport_stats_s = transport_stats.clone();
        let world_store = world_store.clone();
        let save_in_progress = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let pending_save_task = pending_save_task.clone();
        let runtime_control = runtime_control.clone();
        let save_gate = save_gate.clone();
        let mut shutdown = shutdown_rx.clone();
        let narration_batch_max: usize = std::env::var("NARRATION_BATCH_MAX")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(if low_memory_mode { 2 } else { 4 });
        tokio::spawn(async move {
            loop {
                if *shutdown.borrow() {
                    break;
                }
                if runtime_control.paused() {
                    if sleep_until_period_end_or_shutdown(std::time::Instant::now(), 50, &mut shutdown).await
                    {
                        break;
                    }
                    continue;
                }
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
                                        org.last_invention_tick = tick;
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
                        let mut candidate_indices: Vec<usize> = s
                            .organisms
                            .iter()
                            .enumerate()
                            .filter_map(|(index, org)| {
                                (org.alive && !org.life_log.is_empty()).then_some(index)
                            })
                            .collect();
                        candidate_indices.sort_unstable_by_key(|&index| s.organisms[index].last_story_tick);
                        candidate_indices.truncate(narration_batch_max);

                        for index in candidate_indices {
                            let req = {
                                let o = &s.organisms[index];
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
                                let age_days = o.age / DAY_LENGTH as u32;
                                let tribe_name = lineage_names.get(&o.lineage_id).cloned();
                                let partner_name = o.partner_id.as_ref().and_then(|pid| {
                                    s.organisms
                                        .iter()
                                        .find(|candidate| candidate.id == *pid)
                                        .map(|p| p.name.clone())
                                });
                                NarrationReq {
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
                                }
                            };
                            match narration_tx2.try_send(req) {
                                Ok(()) => {
                                    s.organisms[index].last_story_tick = cur_tick;
                                }
                                Err(_) => break,
                            }
                        }
                    }

                    // Reserve one periodic checkpoint. The snapshot itself is
                    // taken after acquiring the shared save gate below, so an
                    // older queued save can never overwrite a newer manual one.
                    let pending_save = s.tick_count % SAVE_EVERY_TICKS == 0
                        && save_in_progress
                            .compare_exchange(
                                false,
                                true,
                                std::sync::atomic::Ordering::AcqRel,
                                std::sync::atomic::Ordering::Relaxed,
                            )
                            .is_ok();

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
                if pending_save {
                    let save_in_progress = save_in_progress.clone();
                    let save_gate = save_gate.clone();
                    let sim_for_save = sim_clone.clone();
                    let save_task = tokio::spawn(async move {
                        let _save_guard = save_gate.lock().await;
                        let state = {
                            let sim = sim_for_save.lock().await;
                            sim.to_save_state()
                        };
                        let result = tokio::task::spawn_blocking(move || {
                            let hash = crate::server::world_store::live_world_hash()
                                .unwrap_or_else(|| "_unknown".to_string());
                            let path = crate::server::world_store::world_save_path(&hash);
                            if let Some(parent) = path.parent() {
                                let _ = std::fs::create_dir_all(parent);
                            }
                            let path_str = path.to_string_lossy().to_string();
                            sim::persistence::write_save_to_disk(&state, &path_str)
                        })
                        .await;
                        match result {
                            Ok(Ok(())) => {}
                            Ok(Err(error)) => tracing::warn!(target: "save", "failed: {}", error),
                            Err(error) => tracing::warn!(target: "save", "task failed: {}", error),
                        }
                        save_in_progress.store(false, std::sync::atomic::Ordering::Release);
                    });
                    let mut slot = pending_save_task
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    *slot = Some(save_task);
                }
                let pressure = memory_watch_cl.pressure();
                let think_budget = match pressure {
                    memory_watch::MemoryPressure::Normal if low_memory_mode => 2,
                    memory_watch::MemoryPressure::Normal => usize::MAX,
                    memory_watch::MemoryPressure::Elevated => 1,
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
                let runtime_tick_ms = runtime_control.tick_ms();
                transport_stats_s.record_sim_tick(tick_started.elapsed().as_millis() as u64, runtime_tick_ms);
                if sleep_until_period_end_or_shutdown(tick_started, runtime_tick_ms, &mut shutdown).await {
                    break;
                }
            }
            tracing::info!(target: "shutdown", "simulation tick loop stopped");
        })
    };

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
                    let age_ms =
                        now_ms().saturating_sub(latest_full_at_w.load(std::sync::atomic::Ordering::Relaxed));
                    if age_ms > 60_000 {
                        let full = {
                            let mut s = sim_clone.lock().await;
                            let frame_id = next_frame_id(&frame_clock_w);
                            Arc::new(encode_frame(s.state_json(), frame_id, now_ms(), "full"))
                        };
                        if let Ok(mut slot) = latest_full_w.write() {
                            *slot = Some(full);
                        }
                        latest_full_at_w.store(now_ms(), std::sync::atomic::Ordering::Relaxed);
                    }
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
    let local_profile = std::env::var("THB_PROFILE")
        .map(|profile| profile.trim().eq_ignore_ascii_case("local"))
        .unwrap_or(false);
    let mut allowed: Vec<HeaderValue> = default_cors_origins(local_profile)
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
    if monthly_rollover_enabled() {
        let sim_arch = sim.clone();
        let started_at_arch = world_started_at.clone();
        let peak_arch = peak_pop.clone();
        let population_limit_arch = population_limit;
        let save_gate_arch = save_gate.clone();
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
                        population_limit_arch,
                        save_gate_arch.clone(),
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
        tracing::info!(target: "archive", "monthly world rollover enabled");
    } else {
        tracing::info!(target: "archive", "monthly world rollover disabled for this profile");
    }

    let state = AppState {
        sim: sim.clone(),
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
        world_started_at: world_started_at.clone(),
        peak_pop: peak_pop.clone(),
        population_limit,
        runtime_control,
        save_gate: save_gate.clone(),
    };

    let mut app = Router::new()
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
        .route("/worlds/{hash}/save", get(routes::world_save_handler));

    if std::env::var("THB_SANDBOX").ok().as_deref() == Some("1") {
        app = app
            .route("/command", post(routes::command_handler))
            .route(
                "/runtime",
                get(routes::runtime_status_handler).post(routes::runtime_handler),
            )
            .route("/save", post(routes::save_handler));
        tracing::info!(
            "sandbox enabled: local game controls expose POST /command, GET/POST /runtime, and POST /save"
        );
    }

    if std::env::var("THB_ADMIN_TOKEN")
        .map(|t| !t.trim().is_empty())
        .unwrap_or(false)
    {
        app = app.route("/admin/reset-world", post(routes::admin_reset_world_handler));
        tracing::info!("admin enabled: POST /admin/reset-world (x-admin-token gated)");
    }

    let app = app.layer(compression).layer(cors).with_state(state);

    let bind_host = std::env::var("BIND_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let bind_port = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(8000);
    let addr_owned = format!("{}:{}", bind_host, bind_port);
    let addr: &str = &addr_owned;
    if llm_disabled {
        tracing::info!(
            "simulation-rs listening on {}  tick={}ms  llm=disabled",
            addr,
            *TICK_MS
        );
    } else if *NARRATION_LLM_URL == *THINK_LLM_URL && *NARRATION_LLM_MODEL == *THINK_LLM_MODEL {
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
    let server_result = {
        let server = axum::serve(listener, app).into_future();
        tokio::pin!(server);
        tokio::select! {
            result = &mut server => Some(result),
            reason = shutdown_signal() => {
                tracing::info!(target: "shutdown", "{} received; stopping simulation", reason);
                None
            }
        }
    };

    let _ = shutdown_tx.send(true);
    if let Err(error) = tick_task.await {
        tracing::warn!(target: "shutdown", "tick task did not stop cleanly: {}", error);
    }

    let pending_save = {
        let mut slot = pending_save_task
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        slot.take()
    };
    if let Some(task) = pending_save {
        if let Err(error) = task.await {
            tracing::warn!(target: "save", "periodic save task failed during shutdown: {}", error);
        }
    }

    match write_final_world_save(sim.clone(), save_gate).await {
        Ok((tick, path)) => {
            tracing::info!(target: "save", "final world save at tick {} -> {}", tick, path.display());
        }
        Err(error) => {
            tracing::error!(target: "save", "final world save failed: {}", error);
        }
    }

    if let Some(Err(error)) = server_result {
        tracing::error!("axum::serve exited: {}", error);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        bounded_interval_ms, claim_desktop_data_lock_at, default_cors_origins, monthly_rollover_enabled_for,
        population_limit_from_env_value, RuntimeControl, MIN_RUNTIME_TICK_MS,
    };

    fn temporary_lock_root(label: &str) -> std::path::PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("thehumanbox-{label}-{}-{unique}", std::process::id()))
    }

    #[test]
    fn desktop_child_claims_lock_and_pid_before_world_startup() {
        let root = temporary_lock_root("child-lock");
        let lock_dir = root.join(".thehumanbox-data.lock");
        std::fs::create_dir_all(&lock_dir).unwrap();
        std::fs::write(
            lock_dir.join("owner.json"),
            serde_json::json!({
                "pid": 41,
                "token": "test-token",
                "acquiredAt": 1,
            })
            .to_string(),
        )
        .unwrap();

        claim_desktop_data_lock_at(&root, "test-token", 41, 42, 4321).unwrap();

        let pid: serde_json::Value =
            serde_json::from_slice(&std::fs::read(root.join("sim.pid")).unwrap()).unwrap();
        let child: serde_json::Value =
            serde_json::from_slice(&std::fs::read(lock_dir.join("child.json")).unwrap()).unwrap();
        assert_eq!(pid["pid"], 42);
        assert_eq!(pid["port"], 4321);
        assert_eq!(pid["token"], "test-token");
        assert_eq!(child["pid"], 42);
        assert_eq!(child["token"], "test-token");
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn desktop_child_refuses_a_replaced_lock_token() {
        let root = temporary_lock_root("child-lock-mismatch");
        let lock_dir = root.join(".thehumanbox-data.lock");
        std::fs::create_dir_all(&lock_dir).unwrap();
        std::fs::write(
            lock_dir.join("owner.json"),
            serde_json::json!({
                "pid": 41,
                "token": "new-owner",
                "acquiredAt": 1,
            })
            .to_string(),
        )
        .unwrap();

        assert!(claim_desktop_data_lock_at(&root, "old-owner", 41, 42, 4321).is_err());
        assert!(!root.join("sim.pid").exists());
        assert!(!lock_dir.join("child.json").exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn local_profile_always_disables_monthly_rollover() {
        assert!(!monthly_rollover_enabled_for(Some("local"), None));
        assert!(!monthly_rollover_enabled_for(Some("LOCAL"), Some("1")));
    }

    #[test]
    fn hosted_rollover_defaults_on_and_honors_explicit_off() {
        assert!(monthly_rollover_enabled_for(None, None));
        assert!(monthly_rollover_enabled_for(Some("hosted"), Some("yes")));
        assert!(!monthly_rollover_enabled_for(Some("hosted"), Some("0")));
    }

    #[test]
    fn population_limit_parser_ignores_missing_or_invalid_values() {
        assert_eq!(population_limit_from_env_value(Some(" 1200 ")), Some(1200));
        assert_eq!(population_limit_from_env_value(Some("many")), None);
        assert_eq!(population_limit_from_env_value(None), None);
    }

    #[test]
    fn runtime_intervals_reject_zero_and_stay_inside_safe_bounds() {
        assert_eq!(bounded_interval_ms(Some("0"), 100, 16, 5_000), 100);
        assert_eq!(bounded_interval_ms(Some(" 8 "), 100, 16, 5_000), 16);
        assert_eq!(bounded_interval_ms(Some("9000"), 100, 16, 5_000), 5_000);
        assert_eq!(bounded_interval_ms(Some("invalid"), 500, 16, 60_000), 500);

        let runtime = RuntimeControl::new(0);
        assert_eq!(runtime.tick_ms(), MIN_RUNTIME_TICK_MS);
        assert!(runtime.speed().is_finite());
    }

    #[test]
    fn local_cors_supports_file_renderers_without_opening_hosted_servers() {
        let hosted = default_cors_origins(false);
        let local = default_cors_origins(true);
        assert!(hosted.contains(&"http://127.0.0.1:4173"));
        assert!(!hosted.contains(&"null"));
        assert!(local.contains(&"null"));
    }

    #[test]
    fn runtime_control_pauses_and_scales_from_configured_speed() {
        let runtime = RuntimeControl::new(100);
        assert!(!runtime.paused());
        assert_eq!(runtime.tick_ms(), 100);

        runtime.set_paused(true);
        assert!(runtime.paused());
        assert_eq!(runtime.set_speed(2.0), Some(50));
        assert_eq!(runtime.tick_ms(), 50);
        assert!((runtime.speed() - 2.0).abs() < f64::EPSILON);

        runtime.set_paused(false);
        assert!(!runtime.paused());
    }

    #[test]
    fn runtime_control_rejects_unbounded_speeds() {
        let runtime = RuntimeControl::new(100);
        assert_eq!(runtime.set_speed(0.0), None);
        assert_eq!(runtime.set_speed(9.0), None);
        assert_eq!(runtime.set_speed(f64::NAN), None);
        assert_eq!(runtime.tick_ms(), 100);
    }
}
