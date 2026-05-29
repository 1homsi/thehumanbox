use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

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

#[derive(Default)]
pub struct TransportStats {
    generated_frames: AtomicU64,
    sent_frames: AtomicU64,
    lagged_frames: AtomicU64,
    dropped_frames: AtomicU64,
    resync_frames: AtomicU64,
    overrun_cycles: AtomicU64,
    sim_overrun_ticks: AtomicU64,
    // Rolling 24h egress accounting (bytes actually pushed to clients,
    // i.e. frame_len * receiver_count). Drives the budget-aware adaptive
    // broadcast cadence so a traffic spike can't run up the AWS bill.
    day_sent_bytes: AtomicU64,
    day_start_ms: AtomicU64,
    payload_bytes: std::sync::Mutex<TransportWindow>,
    full_bytes: std::sync::Mutex<TransportWindow>,
    delta_bytes: std::sync::Mutex<TransportWindow>,
    frame_gen_ms: std::sync::Mutex<TransportWindow>,
    sim_tick_ms: std::sync::Mutex<TransportWindow>,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum FrameKind {
    Full,
    Delta,
}

#[derive(Serialize)]
pub struct TransportStatsSnapshot {
    pub generated_frames: u64,
    pub sent_frames: u64,
    pub lagged_frames: u64,
    pub dropped_frames: u64,
    pub resync_frames: u64,
    pub overrun_cycles: u64,
    pub sim_overrun_ticks: u64,
    pub avg_payload_bytes: u64,
    pub p95_payload_bytes: u64,
    pub avg_full_bytes: u64,
    pub p95_full_bytes: u64,
    pub avg_delta_bytes: u64,
    pub p95_delta_bytes: u64,
    pub avg_frame_generation_ms: u64,
    pub p95_frame_generation_ms: u64,
    pub avg_sim_tick_ms: u64,
    pub p95_sim_tick_ms: u64,
    pub day_sent_bytes: u64,
}

impl TransportStats {
    pub fn record_generated(&self, payload_bytes: usize, frame_gen_ms: u64) {
        self.record_generated_kind(payload_bytes, frame_gen_ms, None);
    }

    pub fn record_generated_kind(&self, payload_bytes: usize, frame_gen_ms: u64, kind: Option<FrameKind>) {
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

    /// Accumulate bytes pushed to clients this broadcast cycle into a
    /// rolling 24h window. Only the broadcaster task calls this, so the
    /// load/store sequence has no contention. Returns nothing; read the
    /// running total with `day_sent_bytes`.
    pub fn record_egress(&self, bytes: u64, now_ms: u64) {
        const DAY_MS: u64 = 24 * 60 * 60 * 1000;
        let start = self.day_start_ms.load(Ordering::Relaxed);
        if start == 0 || now_ms.saturating_sub(start) >= DAY_MS {
            self.day_start_ms.store(now_ms, Ordering::Relaxed);
            self.day_sent_bytes.store(bytes, Ordering::Relaxed);
        } else {
            self.day_sent_bytes.fetch_add(bytes, Ordering::Relaxed);
        }
    }

    pub fn day_sent_bytes(&self) -> u64 {
        self.day_sent_bytes.load(Ordering::Relaxed)
    }

    pub fn record_lagged(&self, dropped: u64) {
        self.lagged_frames.fetch_add(1, Ordering::Relaxed);
        self.dropped_frames.fetch_add(dropped, Ordering::Relaxed);
    }

    pub fn record_resync(&self) {
        self.resync_frames.fetch_add(1, Ordering::Relaxed);
    }

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
        let (avg_bytes, p95_bytes) = self
            .payload_bytes
            .lock()
            .map(|w| (w.avg(), w.p95()))
            .unwrap_or((0, 0));
        let (avg_full, p95_full) = self
            .full_bytes
            .lock()
            .map(|w| (w.avg(), w.p95()))
            .unwrap_or((0, 0));
        let (avg_delta, p95_delta) = self
            .delta_bytes
            .lock()
            .map(|w| (w.avg(), w.p95()))
            .unwrap_or((0, 0));
        let (avg_ms, p95_ms) = self
            .frame_gen_ms
            .lock()
            .map(|w| (w.avg(), w.p95()))
            .unwrap_or((0, 0));
        let (avg_sim, p95_sim) = self
            .sim_tick_ms
            .lock()
            .map(|w| (w.avg(), w.p95()))
            .unwrap_or((0, 0));
        TransportStatsSnapshot {
            overrun_cycles: self.overrun_cycles.load(Ordering::Relaxed),
            sim_overrun_ticks: self.sim_overrun_ticks.load(Ordering::Relaxed),
            avg_sim_tick_ms: avg_sim,
            p95_sim_tick_ms: p95_sim,
            generated_frames: self.generated_frames.load(Ordering::Relaxed),
            sent_frames: self.sent_frames.load(Ordering::Relaxed),
            lagged_frames: self.lagged_frames.load(Ordering::Relaxed),
            dropped_frames: self.dropped_frames.load(Ordering::Relaxed),
            resync_frames: self.resync_frames.load(Ordering::Relaxed),
            avg_payload_bytes: avg_bytes,
            p95_payload_bytes: p95_bytes,
            avg_full_bytes: avg_full,
            p95_full_bytes: p95_full,
            avg_delta_bytes: avg_delta,
            p95_delta_bytes: p95_delta,
            avg_frame_generation_ms: avg_ms,
            p95_frame_generation_ms: p95_ms,
            day_sent_bytes: self.day_sent_bytes.load(Ordering::Relaxed),
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

pub fn encode_frame(
    mut payload: serde_json::Value,
    frame_id: u64,
    server_sent_at_ms: u64,
    frame_kind: &str,
) -> Vec<u8> {
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("frame_id".to_string(), serde_json::json!(frame_id));
        obj.insert(
            "server_sent_at_ms".to_string(),
            serde_json::json!(server_sent_at_ms),
        );
        obj.insert("frame_kind".to_string(), serde_json::json!(frame_kind));
    }
    let raw = match rmp_serde::to_vec_named(&payload) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    if raw.len() < 2048 {
        let mut out = Vec::with_capacity(raw.len() + 1);
        out.push(0u8);
        out.extend_from_slice(&raw);
        return out;
    }
    use flate2::write::GzEncoder;
    use std::io::Write;
    let mut encoder = GzEncoder::new(Vec::with_capacity(raw.len() / 2), flate2::Compression::fast());
    if encoder.write_all(&raw).is_err() {
        let mut out = Vec::with_capacity(raw.len() + 1);
        out.push(0u8);
        out.extend_from_slice(&raw);
        return out;
    }
    let gz = match encoder.finish() {
        Ok(v) => v,
        Err(_) => {
            let mut out = Vec::with_capacity(raw.len() + 1);
            out.push(0u8);
            out.extend_from_slice(&raw);
            return out;
        }
    };
    if gz.len() + 1 >= raw.len() {
        let mut out = Vec::with_capacity(raw.len() + 1);
        out.push(0u8);
        out.extend_from_slice(&raw);
        return out;
    }
    let mut out = Vec::with_capacity(gz.len() + 1);
    out.push(1u8);
    out.extend_from_slice(&gz);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decode_for_test(encoded: &[u8]) -> serde_json::Value {
        assert!(!encoded.is_empty(), "encoded payload was empty");
        match encoded[0] {
            0 => rmp_serde::from_slice(&encoded[1..]).expect("msgpack decode"),
            1 => {
                use flate2::read::GzDecoder;
                use std::io::Read;
                let mut decoder = GzDecoder::new(&encoded[1..]);
                let mut buf = Vec::new();
                decoder.read_to_end(&mut buf).expect("gunzip decode");
                rmp_serde::from_slice(&buf).expect("msgpack after gunzip")
            }
            other => panic!("unknown wire codec tag {}", other),
        }
    }

    #[test]
    fn encode_frame_adds_transport_metadata() {
        let payload = serde_json::json!({ "tick": 12, "organisms": [], "animals": [] });
        let encoded = encode_frame(payload, 77, 123_456, "delta");
        let decoded = decode_for_test(&encoded);

        assert_eq!(decoded["frame_id"], 77);
        assert_eq!(decoded["server_sent_at_ms"], 123_456);
        assert_eq!(decoded["frame_kind"], "delta");
    }

    #[test]
    fn encode_frame_no_larger_than_equivalent_json() {
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
        let encoded = encode_frame(payload.clone(), 1, 1, "delta");
        let json = serde_json::to_vec(&payload).unwrap_or_default();
        assert!(
            encoded.len() <= json.len(),
            "encoded {} should not exceed json {}",
            encoded.len(),
            json.len()
        );
        let _ = decode_for_test(&encoded);
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
