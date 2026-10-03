//! Process startup: logging, the live world on disk, and the memory watchdog.

use super::*;

pub(super) fn init_tracing() {
    // Tracing init. RUST_LOG drives the filter; default to `info` so
    // the server starts loud enough to debug but quiet enough to read.
    // The `simulation_rs=info` target prefix keeps third-party crates
    // (axum, hyper) at `warn` unless explicitly raised.
    use tracing_subscriber::{fmt, EnvFilter};
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,hyper=warn,h2=warn"));
    fmt()
        .with_env_filter(filter)
        .with_target(true)
        .with_level(true)
        .init();
}

pub(super) fn fresh_seed() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    t.as_nanos() as u64 ^ (t.subsec_nanos() as u64).wrapping_mul(0x9e3779b97f4a7c15)
}

/// The hash of the world to play: resume the live one, or migrate a legacy
/// save, or mint a new world.
pub(super) fn resolve_live_world(fresh_seed: u64) -> String {
    use crate::world_store as ws;
    if let Some(h) = ws::live_world_hash() {
        tracing::info!(target: "world", "resuming live world {}", h);
        h
    } else {
        let legacy = std::path::PathBuf::from(LEGACY_SAVE_PATH);
        let h = ws::mint_world_hash(fresh_seed, now_ms());
        if legacy.exists() {
            match ws::migrate_legacy_save(&legacy, &h) {
                Ok(true) => {
                    tracing::warn!(target: "world",
                            "migrated legacy {} -> worlds/{}/world.save", LEGACY_SAVE_PATH, h);
                }
                Ok(false) => {
                    let _ = ws::ensure_world_dir(&h);
                    let _ = ws::set_live_world_hash(&h);
                }
                Err(e) => {
                    tracing::warn!(target: "world",
                            "legacy save migration failed: {} - starting fresh", e);
                    let _ = ws::ensure_world_dir(&h);
                    let _ = ws::set_live_world_hash(&h);
                }
            }
        } else {
            let _ = ws::ensure_world_dir(&h);
            let _ = ws::set_live_world_hash(&h);
            tracing::info!(target: "world", "minted new live world {}", h);
        }
        h
    }
}

pub(super) fn build_memory_watch(low_memory_mode: bool) -> memory_watch::SharedMemoryWatch {
    // Box-wide memory floors. We watch /proc/meminfo MemAvailable and
    // throttle when the WHOLE box (us + everything else) runs low.
    // Defaults leave breathing room on a modest desktop.
    let mem_elev_mb: u64 = std::env::var("MEM_FLOOR_ELEVATED_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 320 } else { 400 });
    let mem_crit_mb: u64 = std::env::var("MEM_FLOOR_CRITICAL_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 160 } else { 200 });
    let rss_elev_mb: u64 = std::env::var("MEM_RSS_ELEVATED_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 180 } else { 320 });
    let rss_crit_mb: u64 = std::env::var("MEM_RSS_CRITICAL_MB")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(if low_memory_mode { 260 } else { 480 });
    let memory_watch = memory_watch::MemoryWatch::new(mem_elev_mb, mem_crit_mb, rss_elev_mb, rss_crit_mb);
    tracing::warn!(target: "mem",
        "watchdog: low_memory={} host_available={} / {} MB, process_rss={} / {} MB",
        low_memory_mode, mem_elev_mb, mem_crit_mb, rss_elev_mb, rss_crit_mb);
    memory_watch
}
