use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
use std::sync::Arc;
use std::time::Duration;

pub use crate::sim::memory_pressure::MemoryPressure;

fn pressure_from_u8(v: u8) -> MemoryPressure {
    match v {
        2 => MemoryPressure::Critical,
        1 => MemoryPressure::Elevated,
        _ => MemoryPressure::Normal,
    }
}

pub struct MemoryWatch {
    own_rss_kb: AtomicU64,
    box_available_kb: AtomicU64,
    box_total_kb: AtomicU64,
    pressure: AtomicU8,
    floor_mb_elevated: u64,
    floor_mb_critical: u64,
    rss_mb_elevated: u64,
    rss_mb_critical: u64,
}

pub type SharedMemoryWatch = Arc<MemoryWatch>;

impl MemoryWatch {
    pub fn new(
        floor_mb_elevated: u64,
        floor_mb_critical: u64,
        rss_mb_elevated: u64,
        rss_mb_critical: u64,
    ) -> SharedMemoryWatch {
        let me = Arc::new(MemoryWatch {
            own_rss_kb: AtomicU64::new(0),
            box_available_kb: AtomicU64::new(0),
            box_total_kb: AtomicU64::new(0),
            pressure: AtomicU8::new(MemoryPressure::Normal as u8),
            floor_mb_elevated,
            floor_mb_critical,
            rss_mb_elevated,
            rss_mb_critical,
        });
        let w = me.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(3));
            loop {
                ticker.tick().await;
                let own = read_own_rss_kb().unwrap_or(0);
                let (total, avail) = read_box_mem_kb().unwrap_or((0, 0));
                if own > 0 {
                    w.own_rss_kb.store(own, Ordering::Relaxed)
                }
                if total > 0 {
                    w.box_total_kb.store(total, Ordering::Relaxed);
                    w.box_available_kb.store(avail, Ordering::Relaxed);
                }
                let pressure = w.classify(avail, own);
                let prev = w.pressure.swap(pressure as u8, Ordering::Relaxed);
                if prev != pressure as u8 {
                    tracing::warn!(target: "mem", "pressure {:?} → {:?} (avail={:.0} MB, own_rss={:.0} MB)",
                        pressure_from_u8(prev), pressure,
                        avail as f64 / 1024.0, own as f64 / 1024.0);
                }
            }
        });
        me
    }

    fn classify(&self, avail_kb: u64, own_rss_kb: u64) -> MemoryPressure {
        let avail_mb = avail_kb / 1024;
        let own_mb = own_rss_kb / 1024;
        let host_critical = avail_mb > 0 && avail_mb <= self.floor_mb_critical;
        let host_elevated = avail_mb > 0 && avail_mb <= self.floor_mb_elevated;
        let rss_critical = self.rss_mb_critical > 0 && own_mb >= self.rss_mb_critical;
        let rss_elevated = self.rss_mb_elevated > 0 && own_mb >= self.rss_mb_elevated;
        if host_critical || rss_critical {
            MemoryPressure::Critical
        } else if host_elevated || rss_elevated {
            MemoryPressure::Elevated
        } else {
            MemoryPressure::Normal
        }
    }

    pub fn pressure(&self) -> MemoryPressure {
        pressure_from_u8(self.pressure.load(Ordering::Relaxed))
    }

    #[allow(dead_code)]
    pub fn rss_mb(&self) -> u64 {
        self.own_rss_kb.load(Ordering::Relaxed) / 1024
    }

    #[allow(dead_code)]
    pub fn box_available_mb(&self) -> u64 {
        self.box_available_kb.load(Ordering::Relaxed) / 1024
    }
}

#[cfg(target_os = "linux")]
fn read_own_rss_kb() -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    for line in status.lines() {
        if let Some(rest) = line.strip_prefix("VmRSS:") {
            let kb: u64 = rest.split_whitespace().next()?.parse().ok()?;
            return Some(kb);
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn read_box_mem_kb() -> Option<(u64, u64)> {
    let info = std::fs::read_to_string("/proc/meminfo").ok()?;
    let mut total: u64 = 0;
    let mut avail: u64 = 0;
    for line in info.lines() {
        if let Some(rest) = line.strip_prefix("MemTotal:") {
            if let Some(v) = rest.split_whitespace().next().and_then(|s| s.parse().ok()) {
                total = v
            }
        } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
            if let Some(v) = rest.split_whitespace().next().and_then(|s| s.parse().ok()) {
                avail = v
            }
        }
    }
    if total == 0 {
        None
    } else {
        Some((total, avail))
    }
}

#[cfg(target_os = "macos")]
fn read_own_rss_kb() -> Option<u64> {
    use std::process::Command;
    let out = Command::new("ps")
        .args(["-o", "rss=", "-p"])
        .arg(std::process::id().to_string())
        .output()
        .ok()?;
    String::from_utf8(out.stdout).ok()?.trim().parse::<u64>().ok()
}

#[cfg(target_os = "macos")]
fn read_box_mem_kb() -> Option<(u64, u64)> {
    None
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_own_rss_kb() -> Option<u64> {
    None
}
#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_box_mem_kb() -> Option<(u64, u64)> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// We can't easily test the spawn-blocking refill loop, but the
    /// classify() decision table is pure and worth pinning down.
    fn make_watch(floor_elevated: u64, floor_critical: u64) -> MemoryWatch {
        MemoryWatch {
            own_rss_kb: AtomicU64::new(0),
            box_available_kb: AtomicU64::new(0),
            box_total_kb: AtomicU64::new(0),
            pressure: AtomicU8::new(MemoryPressure::Normal as u8),
            floor_mb_elevated: floor_elevated,
            floor_mb_critical: floor_critical,
            rss_mb_elevated: 256,
            rss_mb_critical: 384,
        }
    }

    #[test]
    fn classify_zero_avail_returns_normal_not_critical() {
        // avail_kb == 0 means "unknown" (failed to read /proc/meminfo).
        // Treat that as Normal so a probe failure doesn't trigger
        // adaptive throttling unnecessarily.
        let w = make_watch(400, 200);
        assert!(matches!(w.classify(0, 0), MemoryPressure::Normal));
    }

    #[test]
    fn classify_above_elevated_floor_normal() {
        let w = make_watch(400, 200);
        // 500 MB available, elevated floor 400 — comfortably normal.
        assert!(matches!(
            w.classify(500 * 1024, 100 * 1024),
            MemoryPressure::Normal
        ));
    }

    #[test]
    fn classify_below_elevated_above_critical_elevated() {
        let w = make_watch(400, 200);
        // 350 MB available → below elevated floor, above critical.
        assert!(matches!(
            w.classify(350 * 1024, 100 * 1024),
            MemoryPressure::Elevated
        ));
    }

    #[test]
    fn classify_at_elevated_floor_is_elevated() {
        let w = make_watch(400, 200);
        // Boundary inclusive — at exactly the elevated floor we
        // already want the watchdog engaged.
        assert!(matches!(
            w.classify(400 * 1024, 100 * 1024),
            MemoryPressure::Elevated
        ));
    }

    #[test]
    fn classify_at_critical_floor_is_critical() {
        let w = make_watch(400, 200);
        assert!(matches!(
            w.classify(200 * 1024, 100 * 1024),
            MemoryPressure::Critical
        ));
    }

    #[test]
    fn classify_well_below_critical_is_critical() {
        let w = make_watch(400, 200);
        assert!(matches!(
            w.classify(50 * 1024, 100 * 1024),
            MemoryPressure::Critical
        ));
    }

    #[test]
    fn classify_uses_own_rss_when_host_memory_is_unknown() {
        let w = make_watch(400, 200);
        assert!(matches!(w.classify(0, 300 * 1024), MemoryPressure::Elevated));
        assert!(matches!(w.classify(0, 400 * 1024), MemoryPressure::Critical));
    }
}
