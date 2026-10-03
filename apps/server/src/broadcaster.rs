//! The broadcaster: turns the world into frames and fans them out to every
//! connected client, widening its cadence as the daily egress budget fills.

use super::*;

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
            let mut last_broadcast_tick = 0_u64;
            let mut last_deep_full_tick = 0_u64;
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
                    let is_full_frame =
                        s.tick_count.saturating_sub(last_broadcast_tick) >= FULL_FRAME_EVERY_TICKS;
                    let is_deep_full = s.tick_count.saturating_sub(last_deep_full_tick) >= 300;
                    if is_full_frame {
                        last_broadcast_tick = s.tick_count;
                    }
                    if is_deep_full {
                        last_deep_full_tick = s.tick_count;
                    }
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
}
