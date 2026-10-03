//! The simulation tick loop: steps the world, applies memory pressure,
//! flushes dead organisms' memories and takes periodic checkpoints.

use super::*;

pub(super) type PendingSave = Arc<std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>>;

pub(super) struct TickLoop {
    pub(super) sim: SharedSim,
    pub(super) memory_watch: crate::memory_watch::SharedMemoryWatch,
    pub(super) transport_stats: SharedTransportStats,
    pub(super) last_tick_at: Arc<std::sync::atomic::AtomicU64>,
    pub(super) world_store: Option<SharedWorldStore>,
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
                    let tick_count_before = s.tick_count;
                    let steps_per_period = runtime_control.steps_per_period();
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
                    tokio::task::block_in_place(|| s.tick_n(steps_per_period));

                    if s.tick_count / 30 > tick_count_before / 30 {
                        let p = memory_watch_cl.pressure();
                        if !matches!(p, memory_watch::MemoryPressure::Normal) {
                            s.apply_memory_pressure(p);
                        }
                    }

                    // Reserve one periodic checkpoint. The snapshot itself is
                    // taken after acquiring the shared save gate below, so an
                    // older queued save can never overwrite a newer manual one.
                    let pending_save = s.tick_count / SAVE_EVERY_TICKS > tick_count_before / SAVE_EVERY_TICKS
                        && save_in_progress
                            .compare_exchange(
                                false,
                                true,
                                std::sync::atomic::Ordering::AcqRel,
                                std::sync::atomic::Ordering::Relaxed,
                            )
                            .is_ok();

                    let pending_flushes = std::mem::take(&mut s.pending_memory_flushes);
                    (pending_save, pending_flushes)
                };

                let (pending_save, pending_flushes) = tick_outputs;
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
        })
    }
}
