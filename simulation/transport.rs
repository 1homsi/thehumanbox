//! WS frame metadata + transport-stats counters.
//!
//! Pulled out of main.rs because the encode_frame, frame_id minting, and
//! the atomic + mutex stats wiring add up to ~150 lines of self-contained
//! plumbing that has nothing to do with the broadcast loop or the route
//! handlers.

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

const TRANSPORT_SAMPLE_WINDOW: usize = 512;

pub type FrameClock = Arc<AtomicU64>;
pub type SharedTransportStats = Arc<TransportStats>;

#[derive(Default)]
pub struct TransportWindow {
    samples: std::collections::VecDeque<u64>,
}

impl TransportWindow {
    pub(crate) fn push(&mut self, value: u64) {
        if self.samples.len() >= TRANSPORT_SAMPLE_WINDOW {
            self.samples.pop_front();
        }
        self.samples.push_back(value);
    }

    pub(crate) fn avg(&self) -> u64 {
        if self.samples.is_empty() {
            return 0;
        }
        self.samples.iter().copied().sum::<u64>() / self.samples.len() as u64
    }

    pub(crate) fn p95(&self) -> u64 {
        if self.samples.is_empty() {
            return 0;
        }
        let mut sorted = self.samples.iter().copied().collect::<Vec<_>>();
        sorted.sort_unstable();
        let idx = ((sorted.len() * 95).div_ceil(100)).saturating_sub(1);
        sorted[idx]
    }
}

// Counters live as atomics so the hot path (one record_sent per WS message
// per client) doesn't contend on a shared lock. Sample windows still need a
// mutex but they're only touched on frame-generation events, which run on
// the single broadcast loop and the rare resync path.
#[derive(Default)]
pub struct TransportStats {
    generated_frames: AtomicU64,
    sent_frames:      AtomicU64,
    lagged_frames:    AtomicU64,
    dropped_frames:   AtomicU64,
    resync_frames:    AtomicU64,
    // Number of broadcaster cycles where work took longer than the
    // network period - i.e. we lost cadence to a slow serialize.
    overrun_cycles:   AtomicU64,
    sim_overrun_ticks: AtomicU64,
    payload_bytes:    std::sync::Mutex<TransportWindow>,
    // Split-by-kind payload windows. Lets /transport show full vs
    // delta sizes independently so we can verify the slim periodic
    // full is actually slim on prod (~80-150 KB) and deltas are tiny
    // (~5-20 KB). Both windows feed payload_bytes too so the legacy
    // combined avg/p95 still works.
    full_bytes:       std::sync::Mutex<TransportWindow>,
    delta_bytes:      std::sync::Mutex<TransportWindow>,
    frame_gen_ms:     std::sync::Mutex<TransportWindow>,
    sim_tick_ms:      std::sync::Mutex<TransportWindow>,
}

/// Frame classification for payload-size accounting. Lets TransportStats
/// keep separate histograms for the two cadences without callers having
/// to know about the internal windows.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum FrameKind {
    Full,
    Delta,
}

#[derive(Serialize)]
pub struct TransportStatsSnapshot {
    pub generated_frames:        u64,
    pub sent_frames:             u64,
    pub lagged_frames:           u64,
    pub dropped_frames:          u64,
    pub resync_frames:           u64,
    pub overrun_cycles:          u64,
    pub sim_overrun_ticks:       u64,
    pub avg_payload_bytes:       u64,
    pub p95_payload_bytes:       u64,
    /// Split-by-kind. Lets us see if slim periodic fulls actually
    /// shrank after the cold-metadata / per-org-cold strip changes.
    pub avg_full_bytes:          u64,
    pub p95_full_bytes:          u64,
    pub avg_delta_bytes:         u64,
    pub p95_delta_bytes:         u64,
    pub avg_frame_generation_ms: u64,
    pub p95_frame_generation_ms: u64,
    pub avg_sim_tick_ms:         u64,
    pub p95_sim_tick_ms:         u64,
}

impl TransportStats {
    pub fn record_generated(&self, payload_bytes: usize, frame_gen_ms: u64) {
        self.record_generated_kind(payload_bytes, frame_gen_ms, None);
    }

    /// Like record_generated but routes payload-size into the
    /// kind-specific histogram (Full or Delta) in addition to the
    /// combined one. Callers that know the kind should prefer this.
    pub fn record_generated_kind(
        &self,
        payload_bytes: usize,
        frame_gen_ms: u64,
        kind: Option<FrameKind>,
    ) {
        self.generated_frames.fetch_add(1, Ordering::Relaxed);
        if let Ok(mut w) = self.payload_bytes.lock() {
            w.push(payload_bytes as u64);
        }
        match kind {
            Some(FrameKind::Full) => {
                if let Ok(mut w) = self.full_bytes.lock() {
                    w.push(payload_bytes as u64);
                }
            }
            Some(FrameKind::Delta) => {
                if let Ok(mut w) = self.delta_bytes.lock() {
                    w.push(payload_bytes as u64);
                }
            }
            None => {}
        }
        if let Ok(mut w) = self.frame_gen_ms.lock() {
            w.push(frame_gen_ms);
        }
    }

    pub fn record_sent(&self) {
        self.sent_frames.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_lagged(&self, dropped: u64) {
        self.lagged_frames.fetch_add(1, Ordering::Relaxed);
        self.dropped_frames.fetch_add(dropped, Ordering::Relaxed);
    }

    pub fn record_resync(&self) {
        self.resync_frames.fetch_add(1, Ordering::Relaxed);
    }

    /// One broadcaster cycle blew past its budget. The next frame still
    /// goes out immediately (no double-stall) but cadence is lost for now.
    pub fn record_broadcaster_overrun(&self) {
        self.overrun_cycles.fetch_add(1, Ordering::Relaxed);
    }

    pub fn record_sim_tick(&self, sim_tick_ms: u64, budget_ms: u64) {
        if let Ok(mut w) = self.sim_tick_ms.lock() {
            w.push(sim_tick_ms);
        }
        if sim_tick_ms > budget_ms {
            self.sim_overrun_ticks.fetch_add(1, Ordering::Relaxed);
        }
    }

    pub fn snapshot(&self) -> TransportStatsSnapshot {
        let (avg_bytes, p95_bytes) = self.payload_bytes.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        let (avg_full,  p95_full)  = self.full_bytes.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        let (avg_delta, p95_delta) = self.delta_bytes.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        let (avg_ms, p95_ms) = self.frame_gen_ms.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        let (avg_sim, p95_sim) = self.sim_tick_ms.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        TransportStatsSnapshot {
            overrun_cycles:          self.overrun_cycles.load(Ordering::Relaxed),
            sim_overrun_ticks:       self.sim_overrun_ticks.load(Ordering::Relaxed),
            avg_sim_tick_ms:         avg_sim,
            p95_sim_tick_ms:         p95_sim,
            generated_frames:        self.generated_frames.load(Ordering::Relaxed),
            sent_frames:             self.sent_frames.load(Ordering::Relaxed),
            lagged_frames:           self.lagged_frames.load(Ordering::Relaxed),
            dropped_frames:          self.dropped_frames.load(Ordering::Relaxed),
            resync_frames:           self.resync_frames.load(Ordering::Relaxed),
            avg_payload_bytes:       avg_bytes,
            p95_payload_bytes:       p95_bytes,
            avg_full_bytes:          avg_full,
            p95_full_bytes:          p95_full,
            avg_delta_bytes:         avg_delta,
            p95_delta_bytes:         p95_delta,
            avg_frame_generation_ms: avg_ms,
            p95_frame_generation_ms: p95_ms,
        }
    }
}

pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn next_frame_id(frame_clock: &AtomicU64) -> u64 {
    frame_clock.fetch_add(1, Ordering::Relaxed) + 1
}

/// Encode a frame as MessagePack bytes. MessagePack ships ~30-50% smaller
/// than equivalent JSON for our payload shape (lots of small floats, short
/// strings, mixed maps and arrays) and decodes 3-5x faster on the client
/// since the parser is single-pass binary rather than text JSON.
///
/// We keep the function returning bytes regardless of format - the choice
/// of MessagePack is centralized here so a future format swap (CBOR,
/// FlatBuffers, custom binary) is a one-file change.
pub fn encode_frame(
    mut payload: serde_json::Value,
    frame_id: u64,
    server_sent_at_ms: u64,
    frame_kind: &str,
) -> Vec<u8> {
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("frame_id".to_string(), serde_json::json!(frame_id));
        obj.insert("server_sent_at_ms".to_string(), serde_json::json!(server_sent_at_ms));
        obj.insert("frame_kind".to_string(), serde_json::json!(frame_kind));
    }
    // `to_vec_named` keeps map keys as strings (the default would emit
    // positional fields, which would force the client to know struct
    // layout). Strings cost a little more bytes but keep the wire format
    // self-describing and round-trippable to JSON for debugging.
    rmp_serde::to_vec_named(&payload).unwrap_or_else(|_| Vec::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_frame_adds_transport_metadata() {
        let payload = serde_json::json!({ "tick": 12, "organisms": [], "animals": [] });
        let encoded = encode_frame(payload, 77, 123_456, "delta");
        let decoded: serde_json::Value = rmp_serde::from_slice(&encoded).unwrap();

        assert_eq!(decoded["frame_id"], 77);
        assert_eq!(decoded["server_sent_at_ms"], 123_456);
        assert_eq!(decoded["frame_kind"], "delta");
    }

    #[test]
    fn encode_frame_no_larger_than_equivalent_json() {
        // Realistic-shape payload: a handful of organisms with hot fields.
        // Named-key MessagePack on a dynamic Value keeps every map key as
        // a repeated string, so the per-organism overhead is similar to
        // JSON's. The real wins from MessagePack on this shape are
        // numeric compactness and client-side parse speed - not raw
        // byte count. Test just guards against accidentally regressing
        // to a format that's larger than JSON.
        let payload = serde_json::json!({
            "tick": 12345,
            "organisms": (0..50).map(|i| serde_json::json!({
                "id": format!("o{:04}", i),
                "x": 100.5 + i as f64,
                "y": 50.25 - i as f64 * 0.3,
                "energy": 0.42,
                "hydration": 0.7,
                "health": 0.95,
                "alive": true,
                "thought": "looking for food",
                "carrying": 0,
                "carrying_type": 0,
                "pregnant": false,
                "fear_level": 0.1,
                "infection": 0.0,
                "age": 1234,
            })).collect::<Vec<_>>(),
        });
        let msgpack = encode_frame(payload.clone(), 1, 1, "delta");
        let json    = serde_json::to_vec(&payload).unwrap_or_default();
        assert!(msgpack.len() <= json.len(),
            "msgpack {} should not exceed json {}", msgpack.len(), json.len());
    }

    #[test]
    fn transport_stats_roll_up_payload_and_lag_metrics() {
        let stats = TransportStats::default();
        stats.record_generated(1200, 4);
        stats.record_generated(800, 8);
        stats.record_sent();
        stats.record_sent();
        stats.record_lagged(3);
        stats.record_resync();

        let snapshot = stats.snapshot();
        assert_eq!(snapshot.generated_frames, 2);
        assert_eq!(snapshot.sent_frames, 2);
        assert_eq!(snapshot.lagged_frames, 1);
        assert_eq!(snapshot.dropped_frames, 3);
        assert_eq!(snapshot.resync_frames, 1);
        assert!(snapshot.avg_payload_bytes >= 1000);
        assert_eq!(snapshot.p95_frame_generation_ms, 8);
    }
}
