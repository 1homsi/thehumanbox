//! Runtime control: pause and speed, shutdown, periodic sleeps, final save.

use super::*;

pub(super) async fn sleep_until_period_end_or_shutdown(
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

pub(super) async fn shutdown_signal() -> &'static str {
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
    pub(super) paused: AtomicBool,
    pub(super) tick_ms: AtomicU64,
    pub(super) steps_per_period: AtomicU64,
    pub(super) base_tick_ms: u64,
}

impl RuntimeControl {
    pub(super) fn new(base_tick_ms: u64) -> Self {
        let base_tick_ms = base_tick_ms.clamp(MIN_RUNTIME_TICK_MS, MAX_RUNTIME_TICK_MS);
        Self {
            paused: AtomicBool::new(false),
            tick_ms: AtomicU64::new(base_tick_ms),
            steps_per_period: AtomicU64::new(1),
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
        self.base_tick_ms as f64 * self.steps_per_period() as f64 / self.tick_ms() as f64
    }

    pub fn steps_per_period(&self) -> u32 {
        self.steps_per_period.load(Ordering::Relaxed).min(u32::MAX as u64) as u32
    }

    pub fn set_speed(&self, multiplier: f64) -> Option<u64> {
        if !multiplier.is_finite() || !(MIN_RUNTIME_SPEED..=MAX_RUNTIME_SPEED).contains(&multiplier) {
            return None;
        }
        let (tick_ms, steps_per_period) = runtime_speed_config(self.base_tick_ms, multiplier);
        self.tick_ms.store(tick_ms, Ordering::Relaxed);
        self.steps_per_period.store(steps_per_period, Ordering::Relaxed);
        Some(tick_ms)
    }
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
        let hash = crate::world_store::live_world_hash().unwrap_or_else(|| "_unknown".to_string());
        (
            s.to_save_state(),
            s.tick_count,
            crate::world_store::world_save_path(&hash),
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

pub(super) async fn sleep_until_period_end(cycle_start: std::time::Instant, period_ms: u64) {
    let elapsed = cycle_start.elapsed().as_millis() as u64;
    if elapsed >= period_ms {
        return;
    }
    tokio::time::sleep(tokio::time::Duration::from_millis(period_ms - elapsed)).await;
}
