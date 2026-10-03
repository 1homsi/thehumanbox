//! Shared handles and the application state passed to every route.

use super::*;

pub type SharedSim = Arc<Mutex<Simulation>>;
pub type Tx = broadcast::Sender<Arc<Vec<u8>>>;

pub type LatestFull = Arc<std::sync::RwLock<Option<Arc<Vec<u8>>>>>;

/// Cached OG image bytes + epoch_ms of the render time. Wrapped in an
/// async mutex so the route handler can do a brief await across the
/// PNG encode without blocking the world-broadcast tasks.
pub type OgCache = Arc<tokio::sync::Mutex<Option<(u64, Arc<Vec<u8>>)>>>;

pub type SharedWorldStore = Arc<crate::world_store::WorldStore>;

#[derive(Clone)]
pub struct AppState {
    pub sim: SharedSim,
    pub tx: Tx,
    pub latest_full: LatestFull,
    /// Timestamp of the last *deep full* frame. This is a 30 s cadence at
    /// the default `TICK_MS` and is NOT a liveness signal — use
    /// `last_tick_at` for that.
    pub latest_full_at: Arc<std::sync::atomic::AtomicU64>,
    /// Timestamp of the last simulation tick. Written from the tick loop on
    /// every tick, so `/health` reflects real progress rather than the
    /// frame-publication cadence.
    pub last_tick_at: Arc<std::sync::atomic::AtomicU64>,
    pub transport_stats: SharedTransportStats,
    pub memory_watch: crate::memory_watch::SharedMemoryWatch,
    pub og_cache: OgCache,
    pub start_ms: u64,
    pub world_store: Option<SharedWorldStore>,
    pub world_started_at: Arc<AtomicU64>,
    pub peak_pop: Arc<AtomicU64>,
    pub population_limit: Option<usize>,
    pub runtime_control: SharedRuntimeControl,
    pub save_gate: SaveGate,
}
