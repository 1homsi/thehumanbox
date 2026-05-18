

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use serde::Serialize;

use crate::transport::TransportWindow;

pub type SharedLlmStats = Arc<LlmStats>;

#[derive(Default)]
pub struct LlmStats {
    pub narration_calls:  AtomicU64,
    pub narration_errors: AtomicU64,
    pub narration_ms:     std::sync::Mutex<TransportWindow>,

    pub think_calls:  AtomicU64,
    pub think_errors: AtomicU64,
    pub think_ms:     std::sync::Mutex<TransportWindow>,
}

#[derive(Serialize)]
pub struct LlmLaneSnapshot {
    pub calls:    u64,
    pub errors:   u64,
    pub avg_ms:   u64,
    pub p95_ms:   u64,
}

#[derive(Serialize)]
pub struct LlmStatsSnapshot {
    pub narration: LlmLaneSnapshot,
    pub think:     LlmLaneSnapshot,
}

impl LlmStats {
    pub fn record_narration(&self, ms: u64, error: bool) {
        self.narration_calls.fetch_add(1, Ordering::Relaxed);
        if error {
            self.narration_errors.fetch_add(1, Ordering::Relaxed);
        }
        if let Ok(mut w) = self.narration_ms.lock() {
            w.push(ms);
        }
    }

    pub fn record_think(&self, ms: u64, error: bool) {
        self.think_calls.fetch_add(1, Ordering::Relaxed);
        if error {
            self.think_errors.fetch_add(1, Ordering::Relaxed);
        }
        if let Ok(mut w) = self.think_ms.lock() {
            w.push(ms);
        }
    }

    pub fn snapshot(&self) -> LlmStatsSnapshot {
        let (n_avg, n_p95) = self.narration_ms.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        let (t_avg, t_p95) = self.think_ms.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        LlmStatsSnapshot {
            narration: LlmLaneSnapshot {
                calls:  self.narration_calls.load(Ordering::Relaxed),
                errors: self.narration_errors.load(Ordering::Relaxed),
                avg_ms: n_avg,
                p95_ms: n_p95,
            },
            think: LlmLaneSnapshot {
                calls:  self.think_calls.load(Ordering::Relaxed),
                errors: self.think_errors.load(Ordering::Relaxed),
                avg_ms: t_avg,
                p95_ms: t_p95,
            },
        }
    }
}
