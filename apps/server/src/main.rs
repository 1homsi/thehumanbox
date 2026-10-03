// The sim core now lives in the `sim-core` crate. Re-export its modules at
// the crate root so every existing `crate::sim::…` / `crate::organism::…`
// path in this binary keeps resolving unchanged.
pub use sim_core::{organism, physics, sim, world};

mod broadcaster;
mod config;
mod desktop_lock;
mod rollover;
mod router;
mod runtime;
mod startup;
mod state;
#[cfg(test)]
mod tests;
mod tick_loop;

use config::*;
use desktop_lock::*;
use runtime::*;
pub use state::*;

mod memory_watch;
mod og_image;
mod routes;
mod transport;
#[cfg(feature = "webtransport")]
mod webtransport;
mod world_archive;
mod world_store;

use axum::http::HeaderValue;
use axum::{
    routing::{get, post},
    Router,
};
use std::future::IntoFuture;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::{broadcast, watch, Mutex};
use tower_http::compression::CompressionLayer;
use tower_http::cors::{AllowOrigin, Any, CorsLayer};

use sim::simulation::Simulation;
use transport::{
    encode_frame, next_frame_id, now_ms, FrameClock, FrameKind, SharedTransportStats, TransportStats,
};

#[tokio::main]
async fn main() {
    if let Err(error) = claim_desktop_data_lock_from_env() {
        eprintln!("simulation-rs refused desktop data ownership: {error}");
        std::process::exit(1);
    }
    dotenvy::dotenv().ok();

    startup::init_tracing();

    let fresh_seed = startup::fresh_seed();

    let live_hash = startup::resolve_live_world(fresh_seed);
    let live_save_path = crate::world_store::world_save_path(&live_hash);
    let save_path_str = live_save_path.to_string_lossy().to_string();
    let mut loaded_sim = Simulation::load_or_new(fresh_seed, &save_path_str);
    let population_limit = configured_population_limit().map(|requested| {
        let applied = loaded_sim.set_population_limit(requested);
        tracing::info!(target: "world", "population limit: {} (requested {})", applied, requested);
        applied
    });
    let sim = Arc::new(Mutex::new(loaded_sim));
    let world_store: Option<SharedWorldStore> = match crate::world_store::WorldStore::open(&live_hash) {
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
    let last_tick_at: Arc<std::sync::atomic::AtomicU64> = Arc::new(std::sync::atomic::AtomicU64::new(0));
    let frame_clock: FrameClock = Arc::new(AtomicU64::new(0));
    let transport_stats: SharedTransportStats = Arc::new(TransportStats::default());
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

    let memory_watch = startup::build_memory_watch(low_memory_mode);

    let tick_task = tick_loop::TickLoop {
        sim: sim.clone(),
        memory_watch: memory_watch.clone(),
        transport_stats: transport_stats.clone(),
        last_tick_at: last_tick_at.clone(),
        world_store: world_store.clone(),
        pending_save_task: pending_save_task.clone(),
        runtime_control: runtime_control.clone(),
        save_gate: save_gate.clone(),
        shutdown_rx: shutdown_rx.clone(),
    }
    .spawn();

    broadcaster::Broadcaster {
        sim: sim.clone(),
        tx: tx.clone(),
        latest_full: latest_full.clone(),
        latest_full_at: latest_full_at.clone(),
        frame_clock: frame_clock.clone(),
        transport_stats: transport_stats.clone(),
    }
    .spawn();

    latest_full_at.store(transport::now_ms(), std::sync::atomic::Ordering::Relaxed);
    last_tick_at.store(transport::now_ms(), std::sync::atomic::Ordering::Relaxed);
    let start_ms = transport::now_ms();
    let og_cache: OgCache = Arc::new(tokio::sync::Mutex::new(None));

    world_archive::ensure_worlds_dir();
    let world_started_at = Arc::new(std::sync::atomic::AtomicU64::new(start_ms));
    let peak_pop = Arc::new(std::sync::atomic::AtomicU64::new(0));
    rollover::spawn_monthly_rollover(
        sim.clone(),
        world_started_at.clone(),
        peak_pop.clone(),
        population_limit,
        save_gate.clone(),
    );

    let state = AppState {
        sim: sim.clone(),
        tx,
        latest_full,
        latest_full_at: latest_full_at.clone(),
        last_tick_at: last_tick_at.clone(),
        transport_stats,
        memory_watch,
        og_cache,
        start_ms,
        world_store: world_store.clone(),
        world_started_at: world_started_at.clone(),
        peak_pop: peak_pop.clone(),
        population_limit,
        runtime_control,
        save_gate: save_gate.clone(),
    };

    let app = router::build_app(state);

    let bind_host = std::env::var("BIND_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let bind_port = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(8000);
    let addr_owned = format!("{}:{}", bind_host, bind_port);
    let addr: &str = &addr_owned;
    tracing::info!("simulation-rs listening on {}  tick={}ms", addr, *TICK_MS);
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
