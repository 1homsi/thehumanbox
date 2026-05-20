use std::sync::Arc;
use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};
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
    own_rss_kb:       AtomicU64,
    box_available_kb: AtomicU64,
    box_total_kb:     AtomicU64,
    pressure:         AtomicU8,
    floor_mb_elevated: u64,
    floor_mb_critical: u64,
}

pub type SharedMemoryWatch = Arc<MemoryWatch>;

impl MemoryWatch {
    pub fn new(floor_mb_elevated: u64, floor_mb_critical: u64) -> SharedMemoryWatch {
        let me = Arc::new(MemoryWatch {
            own_rss_kb:       AtomicU64::new(0),
            box_available_kb: AtomicU64::new(0),
            box_total_kb:     AtomicU64::new(0),
            pressure:         AtomicU8::new(MemoryPressure::Normal as u8),
            floor_mb_elevated,
            floor_mb_critical,
        });
        let w = me.clone();
        tokio::spawn(async move {
            let mut ticker = tokio::time::interval(Duration::from_secs(3));
            loop {
                ticker.tick().await;
                let own = read_own_rss_kb().unwrap_or(0);
                let (total, avail) = read_box_mem_kb().unwrap_or((0, 0));
                if own > 0 { w.own_rss_kb.store(own, Ordering::Relaxed) }
                if total > 0 {
                    w.box_total_kb.store(total, Ordering::Relaxed);
                    w.box_available_kb.store(avail, Ordering::Relaxed);
                }
                let pressure = w.classify(avail);
                let prev = w.pressure.swap(pressure as u8, Ordering::Relaxed);
                if prev != pressure as u8 {
                    println!("[mem] pressure {:?} → {:?} (avail={:.0} MB, own_rss={:.0} MB)",
                        pressure_from_u8(prev), pressure,
                        avail as f64 / 1024.0, own as f64 / 1024.0);
                }
            }
        });
        me
    }

    fn classify(&self, avail_kb: u64) -> MemoryPressure {
        if avail_kb == 0 { return MemoryPressure::Normal }
        let avail_mb = avail_kb / 1024;
        if avail_mb <= self.floor_mb_critical { MemoryPressure::Critical }
        else if avail_mb <= self.floor_mb_elevated { MemoryPressure::Elevated }
        else { MemoryPressure::Normal }
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
            let kb: u64 = rest.trim().split_whitespace().next()?.parse().ok()?;
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
            if let Some(v) = rest.trim().split_whitespace().next().and_then(|s| s.parse().ok()) { total = v }
        } else if let Some(rest) = line.strip_prefix("MemAvailable:") {
            if let Some(v) = rest.trim().split_whitespace().next().and_then(|s| s.parse().ok()) { avail = v }
        }
    }
    if total == 0 { None } else { Some((total, avail)) }
}

#[cfg(target_os = "macos")]
fn read_own_rss_kb() -> Option<u64> {
    use std::process::Command;
    let out = Command::new("ps")
        .args(["-o", "rss=", "-p"])
        .arg(std::process::id().to_string())
        .output().ok()?;
    String::from_utf8(out.stdout).ok()?.trim().parse::<u64>().ok()
}

#[cfg(target_os = "macos")]
fn read_box_mem_kb() -> Option<(u64, u64)> { None }

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_own_rss_kb() -> Option<u64> { None }
#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn read_box_mem_kb() -> Option<(u64, u64)> { None }
