//! Shared handles and the application state passed to every route.

use super::*;

pub type SharedSim = Arc<Mutex<Simulation>>;
/// Encoded frames travel as `Bytes`: a subscriber's send is a refcount clone,
/// not a copy of a 90-224 KB frame.
pub type Tx = broadcast::Sender<Bytes>;

pub type LatestFull = Arc<std::sync::RwLock<Option<Bytes>>>;

/// Cached OG image bytes + epoch_ms of the render time. Wrapped in an
/// async mutex so the route handler can do a brief await across the
/// PNG encode without blocking the world-broadcast tasks.
pub type OgCache = Arc<tokio::sync::Mutex<Option<(u64, Arc<Vec<u8>>)>>>;

/// The live world's dead-organism memory DB. It is a cell because a world reset (`archive_and_reset`)
/// moves the live world to a new folder, and the store must follow it: the tick loop and the routes
/// read the current store through `get`, and the reset swaps it with `replace`.
#[derive(Clone, Default)]
pub struct SharedWorldStore(Arc<std::sync::RwLock<Option<Arc<crate::world_store::WorldStore>>>>);

impl SharedWorldStore {
    pub fn new(store: Option<crate::world_store::WorldStore>) -> Self {
        Self(Arc::new(std::sync::RwLock::new(store.map(Arc::new))))
    }

    pub fn get(&self) -> Option<Arc<crate::world_store::WorldStore>> {
        self.0
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn replace(&self, store: Option<crate::world_store::WorldStore>) {
        *self.0.write().unwrap_or_else(|poisoned| poisoned.into_inner()) = store.map(Arc::new);
    }
}

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
    pub world_store: SharedWorldStore,
    pub world_started_at: Arc<AtomicU64>,
    pub peak_pop: Arc<AtomicU64>,
    pub population_limit: Option<usize>,
    pub runtime_control: SharedRuntimeControl,
    pub save_gate: SaveGate,
}
