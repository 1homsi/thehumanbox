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

    pub conversation_calls:  AtomicU64,
    pub conversation_errors: AtomicU64,
    pub conversation_ms:     std::sync::Mutex<TransportWindow>,

    pub think_429:            AtomicU64,
    pub think_5xx:            AtomicU64,
    pub think_local_fallback: AtomicU64,
    pub narration_429:        AtomicU64,
    pub conversation_429:     AtomicU64,
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
    pub narration:    LlmLaneSnapshot,
    pub think:        LlmLaneSnapshot,
    pub conversation: LlmLaneSnapshot,
    pub think_429:            u64,
    pub think_5xx:            u64,
    pub think_local_fallback: u64,
    pub narration_429:        u64,
    pub conversation_429:     u64,
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

    pub fn record_conversation(&self, ms: u64, error: bool) {
        self.conversation_calls.fetch_add(1, Ordering::Relaxed);
        if error {
            self.conversation_errors.fetch_add(1, Ordering::Relaxed);
        }
        if let Ok(mut w) = self.conversation_ms.lock() {
            w.push(ms);
        }
    }

    pub fn note_think_429(&self)             { self.think_429.fetch_add(1, Ordering::Relaxed); }
    pub fn note_think_5xx(&self)             { self.think_5xx.fetch_add(1, Ordering::Relaxed); }
    pub fn note_think_local_fallback(&self)  { self.think_local_fallback.fetch_add(1, Ordering::Relaxed); }
    pub fn note_narration_429(&self)         { self.narration_429.fetch_add(1, Ordering::Relaxed); }
    pub fn note_conversation_429(&self)      { self.conversation_429.fetch_add(1, Ordering::Relaxed); }

    pub fn snapshot(&self) -> LlmStatsSnapshot {
        let (n_avg, n_p95) = self.narration_ms.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        let (t_avg, t_p95) = self.think_ms.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        let (c_avg, c_p95) = self.conversation_ms.lock()
            .map(|w| (w.avg(), w.p95())).unwrap_or((0, 0));
        LlmStatsSnapshot {
            narration: LlmLaneSnapshot {
                calls:  self.narration_calls.load(Ordering::Relaxed),
                errors: self.narration_errors.load(Ordering::Relaxed),
                avg_ms: n_avg, p95_ms: n_p95,
            },
            think: LlmLaneSnapshot {
                calls:  self.think_calls.load(Ordering::Relaxed),
                errors: self.think_errors.load(Ordering::Relaxed),
                avg_ms: t_avg, p95_ms: t_p95,
            },
            conversation: LlmLaneSnapshot {
                calls:  self.conversation_calls.load(Ordering::Relaxed),
                errors: self.conversation_errors.load(Ordering::Relaxed),
                avg_ms: c_avg, p95_ms: c_p95,
            },
            think_429:            self.think_429.load(Ordering::Relaxed),
            think_5xx:            self.think_5xx.load(Ordering::Relaxed),
            think_local_fallback: self.think_local_fallback.load(Ordering::Relaxed),
            narration_429:        self.narration_429.load(Ordering::Relaxed),
            conversation_429:     self.conversation_429.load(Ordering::Relaxed),
        }
    }
}
