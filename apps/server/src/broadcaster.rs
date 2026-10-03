//! The broadcaster: turns the world into frames and fans them out to every
//! connected client, widening its cadence as the daily egress budget fills.

use super::*;
use crate::sim::serialize::FramePayload;

pub(super) struct Broadcaster {
    pub(super) sim: SharedSim,
    pub(super) tx: Tx,
    pub(super) latest_full: LatestFull,
    pub(super) latest_full_at: Arc<std::sync::atomic::AtomicU64>,
    pub(super) frame_clock: FrameClock,
    pub(super) transport_stats: SharedTransportStats,
}

impl Broadcaster {
    pub(super) fn spawn(self) {
        let Broadcaster {
            sim,
            tx,
            latest_full,
            latest_full_at,
            frame_clock,
            transport_stats,
        } = self;
        let sim_clone = sim.clone();
        let tx_clone = tx.clone();
        let latest_full_w = latest_full.clone();
        let latest_full_at_w = latest_full_at.clone();
        let frame_clock_w = frame_clock.clone();
        let transport_stats_w = transport_stats.clone();
        tokio::spawn(async move {
            let mut cadence = FrameCadence::default();
            loop {
                let cycle_started = std::time::Instant::now();
                if tx_clone.receiver_count() == 0 {
                    let age_ms =
                        now_ms().saturating_sub(latest_full_at_w.load(std::sync::atomic::Ordering::Relaxed));
                    if age_ms > 60_000 {
                        let (frame_id, snapshot) = {
                            let mut s = sim_clone.lock().await;
                            let frame_id = next_frame_id(&frame_clock_w);
                            (frame_id, tokio::task::block_in_place(|| s.state_frame()))
                        };
                        let full = Arc::new(tokio::task::block_in_place(|| {
                            encode_frame(snapshot, frame_id, now_ms(), "full")
                        }));
                        if let Ok(mut slot) = latest_full_w.write() {
                            *slot = Some(full);
                        }
                        latest_full_at_w.store(now_ms(), std::sync::atomic::Ordering::Relaxed);
                    }
                    sleep_until_period_end(cycle_started, *NETWORK_MS).await;
                    continue;
                }
                // Only the building of the frame values needs the world; the
                // msgpack + gzip encoding (about half the cost of a frame, and
                // most of it for a delta) runs after the lock is released so
                // the tick loop and the command handlers are not held up by it.
                let values = {
                    let mut s = sim_clone.lock().await;
                    let frame_id = next_frame_id(&frame_clock_w);
                    tokio::task::block_in_place(|| cadence.build(&mut s, frame_id))
                };
                let (frame, full_payload) =
                    tokio::task::block_in_place(|| encode_cycle(values, &transport_stats_w, now_ms));

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
}

/// Which ticks last produced a periodic full frame and a deep full frame.
#[derive(Default)]
pub(super) struct FrameCadence {
    last_broadcast_tick: u64,
    last_deep_full_tick: u64,
}

/// The JSON values one broadcast cycle builds while it holds the sim lock.
pub(super) struct CycleValues {
    frame_id: u64,
    main: FramePayload,
    kind: FrameKind,
    /// How long building `main` took, so the recorded generation time still
    /// covers just this frame and not the deep full built after it.
    main_build: std::time::Duration,
    deep_full: Option<FramePayload>,
}

impl FrameCadence {
    /// Decide this cycle's frame kinds and build their values, in the order
    /// the world's change tracking expects (the periodic or delta frame
    /// first, then the deep full snapshot).
    pub(super) fn build(&mut self, s: &mut Simulation, frame_id: u64) -> CycleValues {
        let is_full_frame = s.tick_count.saturating_sub(self.last_broadcast_tick) >= FULL_FRAME_EVERY_TICKS;
        let is_deep_full = s.tick_count.saturating_sub(self.last_deep_full_tick) >= 300;
        if is_full_frame {
            self.last_broadcast_tick = s.tick_count;
        }
        if is_deep_full {
            self.last_deep_full_tick = s.tick_count;
        }
        let started = std::time::Instant::now();
        let (main, kind) = if is_full_frame {
            (s.state_frame_periodic_full(), FrameKind::Full)
        } else {
            (s.state_frame_incremental(), FrameKind::Delta)
        };
        let main_build = started.elapsed();
        let deep_full = is_deep_full.then(|| s.state_frame());
        CycleValues {
            frame_id,
            main,
            kind,
            main_build,
            deep_full,
        }
    }
}

/// Encode a cycle's values into wire frames and record the main frame's
/// generation stats. Runs without the sim lock.
pub(super) fn encode_cycle(
    values: CycleValues,
    stats: &SharedTransportStats,
    mut now: impl FnMut() -> u64,
) -> (Arc<Vec<u8>>, Option<Arc<Vec<u8>>>) {
    let CycleValues {
        frame_id,
        main,
        kind,
        main_build,
        deep_full,
    } = values;
    let encode_started = std::time::Instant::now();
    let label = match kind {
        FrameKind::Full => "full",
        FrameKind::Delta => "delta",
    };
    let bytes = encode_frame(main, frame_id, now(), label);
    stats.record_generated_kind(
        bytes.len(),
        (main_build + encode_started.elapsed()).as_millis() as u64,
        Some(kind),
    );
    let heavy = deep_full.map(|v| Arc::new(encode_frame(v, frame_id, now(), "full")));
    (Arc::new(bytes), heavy)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The cycle as it was written before the encode moved off the sim lock:
    /// build and encode under one `&mut Simulation`.
    fn reference_cycle(
        s: &mut Simulation,
        last_broadcast_tick: &mut u64,
        last_deep_full_tick: &mut u64,
        frame_id: u64,
        now: u64,
    ) -> (Vec<u8>, FrameKind, Option<Vec<u8>>) {
        let is_full_frame = s.tick_count.saturating_sub(*last_broadcast_tick) >= FULL_FRAME_EVERY_TICKS;
        let is_deep_full = s.tick_count.saturating_sub(*last_deep_full_tick) >= 300;
        if is_full_frame {
            *last_broadcast_tick = s.tick_count;
        }
        if is_deep_full {
            *last_deep_full_tick = s.tick_count;
        }
        let (bytes, kind) = if is_full_frame {
            (
                encode_frame(s.state_json_periodic_full(), frame_id, now, "full"),
                FrameKind::Full,
            )
        } else {
            (
                encode_frame(s.state_json_incremental(), frame_id, now, "delta"),
                FrameKind::Delta,
            )
        };
        let heavy = if is_deep_full {
            Some(encode_frame(s.state_json(), frame_id, now, "full"))
        } else {
            None
        };
        (bytes, kind, heavy)
    }

    /// Two identical worlds, one driven by the old inline cycle and one by
    /// `FrameCadence::build` + `encode_cycle`, must put identical bytes on the
    /// wire for every cycle: delta, periodic full and deep full alike.
    #[test]
    fn cycle_split_across_the_lock_emits_the_same_frames() {
        let mut old_world = Simulation::new(42);
        let mut new_world = Simulation::new(42);
        for _ in 0..290 {
            old_world.tick();
            new_world.tick();
        }
        let (mut last_broadcast, mut last_deep) = (0u64, 0u64);
        let mut cadence = FrameCadence::default();
        let stats: SharedTransportStats = Arc::new(TransportStats::default());
        let (mut fulls, mut deltas, mut deeps) = (0, 0, 0);

        for cycle in 1..=90u64 {
            for _ in 0..5 {
                old_world.tick();
                new_world.tick();
            }
            let (want, want_kind, want_deep) =
                reference_cycle(&mut old_world, &mut last_broadcast, &mut last_deep, cycle, 777);
            let values = cadence.build(&mut new_world, cycle);
            let (got, got_deep) = encode_cycle(values, &stats, || 777);

            assert_eq!(*got, want, "cycle {cycle}: main frame differs");
            assert_eq!(
                got_deep.as_deref().map(Vec::as_slice),
                want_deep.as_deref(),
                "cycle {cycle}: deep full frame differs"
            );
            match want_kind {
                FrameKind::Full => fulls += 1,
                FrameKind::Delta => deltas += 1,
            }
            deeps += usize::from(want_deep.is_some());
        }
        assert!(
            fulls > 0 && deltas > 0 && deeps > 0,
            "the run must exercise every frame kind"
        );
        assert_eq!(stats.snapshot().generated_frames, 90);
    }
}
