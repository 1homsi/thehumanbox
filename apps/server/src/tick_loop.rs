//! The simulation tick loop: steps the world, applies memory pressure,
//! flushes dead organisms' memories and takes periodic checkpoints.

use super::*;

pub(super) type PendingSave = Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>;

pub(super) struct TickLoop {
    pub(super) sim: SharedSim,
    pub(super) memory_watch: crate::memory_watch::SharedMemoryWatch,
    pub(super) transport_stats: SharedTransportStats,
    pub(super) last_tick_at: Arc<std::sync::atomic::AtomicU64>,
    pub(super) world_store: SharedWorldStore,
    pub(super) pending_save_task: PendingSave,
    pub(super) runtime_control: SharedRuntimeControl,
    pub(super) save_gate: SaveGate,
    pub(super) shutdown_rx: watch::Receiver<bool>,
}

impl TickLoop {
    pub(super) fn spawn(self) -> tokio::task::JoinHandle<()> {
        let TickLoop {
            sim,
            memory_watch,
            transport_stats,
            last_tick_at,
            world_store,
            pending_save_task,
            runtime_control,
            save_gate,
            shutdown_rx,
        } = self;
        let sim_clone = sim.clone();
        let memory_watch_cl = memory_watch.clone();
        let transport_stats_s = transport_stats.clone();
        let last_tick_at_w = last_tick_at.clone();
        let world_store = world_store.clone();
        let save_in_progress = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let pending_save_task = pending_save_task.clone();
        let runtime_control = runtime_control.clone();
        let save_gate = save_gate.clone();
        let mut shutdown = shutdown_rx.clone();
        let tick_task = tokio::spawn(async move {
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
                let (pending_save, pending_flushes, flush_store) = step_period(
                    &sim_clone,
                    &memory_watch_cl,
                    &save_in_progress,
                    &world_store,
                    runtime_control.steps_per_period(),
                )
                .await;
                if !pending_flushes.is_empty() {
                    if let Some(ws) = flush_store {
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
                            let hash = crate::world_store::live_world_hash()
                                .unwrap_or_else(|| "_unknown".to_string());
                            let path = crate::world_store::world_save_path(&hash);
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
                let runtime_tick_ms = runtime_control.tick_ms();
                last_tick_at_w.store(transport::now_ms(), std::sync::atomic::Ordering::Relaxed);
                transport_stats_s.record_sim_tick(tick_started.elapsed().as_millis() as u64, runtime_tick_ms);
                if sleep_until_period_end_or_shutdown(tick_started, runtime_tick_ms, &mut shutdown).await {
                    break;
                }
            }
            tracing::info!(target: "shutdown", "simulation tick loop stopped");
        });
        // A panic inside `tick_n` only ends the tick task: HTTP, the socket and
        // `/save` would keep serving a frozen world. Supervise it so the failure
        // is logged, and on the desktop profile end the process so the app sees
        // the exit instead of a silently dead simulation.
        tokio::spawn(async move {
            if let Err(error) = tick_task.await {
                tracing::error!(target: "tick", "tick loop terminated: {}", error);
                if error.is_panic() && exit_on_tick_failure() {
                    std::process::exit(101);
                }
            }
        })
    }
}

/// One tick-loop period: the world's ticks, the memory-pressure check on each
/// 30-tick boundary and at most one reserved checkpoint.
///
/// The sim lock is taken and released **per tick**, so a frame build or a
/// command handler runs between the ticks of a fast-forward batch instead of
/// waiting for the whole batch (a batch is up to 64 ticks, and a mature tick is
/// 5-10 ms with tails over 100 ms).
///
/// Returns whether a checkpoint was reserved, the dead organisms' memories to
/// flush, and the world store read under the same lock as those flushes: a
/// world reset swaps both under that lock, so the memories reach the world they
/// came from.
async fn step_period(
    sim: &SharedSim,
    memory_watch: &crate::memory_watch::SharedMemoryWatch,
    save_in_progress: &std::sync::atomic::AtomicBool,
    world_store: &SharedWorldStore,
    steps: u32,
) -> (
    bool,
    Vec<sim::simulation::PendingMemoryFlush>,
    Option<Arc<crate::world_store::WorldStore>>,
) {
    let steps = steps.max(1);
    let mut pending_save = false;
    let mut flushes = Vec::new();
    let mut store = None;
    for step in 0..steps {
        let mut s: tokio::sync::MutexGuard<'_, _> = sim.lock().await;
        let tick_count_before = s.tick_count;
        // The sim tick is a heavy CPU-bound chunk (movement decisions, action
        // evaluation, world-event ticks, spatial-index rebuilds - 10-100ms at
        // this pop). Without `block_in_place` it occupies a tokio worker
        // synchronously and starves async tasks like the HTTP handlers (we saw
        // /version taking 4-37s under load, and /snapshot trickling at ~8KB/s
        // through Cloudflare). block_in_place tells the multi-thread runtime to
        // spin up a replacement worker so siblings keep getting scheduled while
        // this one churns.
        tokio::task::block_in_place(|| s.tick());

        if s.tick_count / 30 > tick_count_before / 30 {
            let p = memory_watch.pressure();
            if !matches!(p, memory_watch::MemoryPressure::Normal) {
                s.apply_memory_pressure(p);
            }
        }

        // Reserve one periodic checkpoint. The snapshot itself is taken after
        // acquiring the shared save gate below, so an older queued save can
        // never overwrite a newer manual one.
        if s.tick_count / SAVE_EVERY_TICKS > tick_count_before / SAVE_EVERY_TICKS
            && save_in_progress
                .compare_exchange(
                    false,
                    true,
                    std::sync::atomic::Ordering::AcqRel,
                    std::sync::atomic::Ordering::Relaxed,
                )
                .is_ok()
        {
            pending_save = true;
        }

        if step + 1 == steps {
            // Take the store with the flushes, under the sim lock: a world
            // reset swaps both under that lock, so these memories reach the
            // world they came from.
            flushes = std::mem::take(&mut s.pending_memory_flushes);
            store = world_store.get();
        }
    }
    (pending_save, flushes, store)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fast-forward batch must hand the sim lock back between ticks, so a
    /// frame build or a command handler waits for one tick, not the whole
    /// batch. The mutex is fair, so a task parked on it is served before the
    /// next tick can take it again: the parked task must acquire it at least
    /// once during a batch that would otherwise hold it end to end.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn a_tick_batch_gives_the_sim_lock_back_between_ticks() {
        let sim: SharedSim = Arc::new(tokio::sync::Mutex::new(Simulation::new(42)));
        {
            let mut s = sim.lock().await;
            tokio::task::block_in_place(|| s.tick_n(600));
        }
        // rss thresholds far above any real process: the pressure path is idle.
        let memory_watch = crate::memory_watch::MemoryWatch::new(0, 0, u64::MAX, u64::MAX);
        let save_in_progress = std::sync::atomic::AtomicBool::new(false);
        let world_store = SharedWorldStore::default();

        let prober_sim = sim.clone();
        let acquisitions = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let prober_count = acquisitions.clone();
        let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let prober_stop = stop.clone();
        let prober = tokio::spawn(async move {
            while !prober_stop.load(std::sync::atomic::Ordering::Relaxed) {
                let _guard = prober_sim.lock().await;
                prober_count.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                drop(_guard);
                tokio::task::yield_now().await;
            }
        });
        // Let the prober park on the lock before the batch starts.
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let before = acquisitions.load(std::sync::atomic::Ordering::Relaxed);
        let (pending_save, flushes, store) =
            step_period(&sim, &memory_watch, &save_in_progress, &world_store, 200).await;
        let during = acquisitions.load(std::sync::atomic::Ordering::Relaxed) - before;

        stop.store(true, std::sync::atomic::Ordering::Relaxed);
        prober.await.ok();

        assert!(!pending_save, "600 + 200 ticks is not a checkpoint boundary");
        assert!(flushes.is_empty() && store.is_none());
        assert!(
            during > 0,
            "the sim lock was held for the whole batch (the prober never got it)"
        );
    }
}
