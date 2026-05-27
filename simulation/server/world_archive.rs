use std::collections::HashMap;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::SystemTime;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::server::transport::{encode_frame, now_ms};
use crate::sim::simulation::Simulation;

const WORLDS_DIR: &str = "worlds";

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct WorldMeta {
    pub hash: String,
    pub started_at_ms: u64,
    pub ended_at_ms: u64,
    pub final_tick: u64,
    pub final_population: usize,
    pub peak_population: u64,
    pub top_era: String,
    pub lineage_count: usize,
    pub top_lineage: Option<String>,
    pub top_lineage_pop: usize,
}

pub fn worlds_dir() -> PathBuf {
    PathBuf::from(WORLDS_DIR)
}

pub fn ensure_worlds_dir() {
    let p = worlds_dir();
    if !p.exists() {
        if let Err(e) = std::fs::create_dir_all(&p) {
            tracing::warn!(target: "archive", "could not create worlds/: {}", e);
        }
    }
}

pub fn current_year_month_utc() -> (i32, u32) {
    let secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    ymd_from_unix(secs)
}

fn ymd_from_unix(secs: i64) -> (i32, u32) {
    let days = secs.div_euclid(86400);
    let mut year: i32 = 1970;
    let mut remaining = days;
    loop {
        let yd = year_days(year) as i64;
        if remaining < yd {
            break;
        }
        remaining -= yd;
        year += 1;
    }
    let mut month: u32 = 1;
    loop {
        let md = month_days(year, month) as i64;
        if remaining < md {
            break;
        }
        remaining -= md;
        month += 1;
    }
    (year, month)
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
fn year_days(y: i32) -> u32 {
    if is_leap(y) {
        366
    } else {
        365
    }
}
fn month_days(y: i32, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap(y) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

fn short_hash(input: &str) -> String {
    let mut h: u128 = 0xcbf29ce484222325;
    for b in input.bytes() {
        h ^= b as u128;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:012x}", (h & 0xffff_ffff_ffff) as u64)
}

pub fn list_archived_worlds() -> Vec<WorldMeta> {
    let dir = worlds_dir();
    let mut out: Vec<WorldMeta> = Vec::new();
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return out,
    };
    let live = crate::server::world_store::live_world_hash();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if name.starts_with('_') || name.starts_with('.') {
                continue;
            }
            if live.as_deref() == Some(name) {
                continue;
            }
            let meta_path = path.join("meta.json");
            if let Ok(bytes) = std::fs::read(&meta_path) {
                if let Ok(meta) = serde_json::from_slice::<WorldMeta>(&bytes) {
                    out.push(meta);
                }
            }
            continue;
        }
        if path.extension().and_then(|s| s.to_str()) == Some("json")
            && path
                .file_name()
                .and_then(|s| s.to_str())
                .map(|n| n.ends_with(".meta.json"))
                .unwrap_or(false)
        {
            if let Ok(bytes) = std::fs::read(&path) {
                if let Ok(meta) = serde_json::from_slice::<WorldMeta>(&bytes) {
                    out.push(meta);
                }
            }
        }
    }
    out.sort_by(|a, b| b.ended_at_ms.cmp(&a.ended_at_ms));
    out
}

pub fn read_world_meta(hash: &str) -> Option<WorldMeta> {
    let folder_path = worlds_dir().join(hash).join("meta.json");
    if let Ok(bytes) = std::fs::read(&folder_path) {
        if let Ok(meta) = serde_json::from_slice(&bytes) {
            return Some(meta);
        }
    }
    let flat_path = worlds_dir().join(format!("{}.meta.json", hash));
    let bytes = std::fs::read(&flat_path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn read_world_snapshot(hash: &str) -> Option<Vec<u8>> {
    let folder_path = worlds_dir().join(hash).join("snapshot");
    if let Ok(b) = std::fs::read(&folder_path) {
        return Some(b);
    }
    let flat_path = worlds_dir().join(format!("{}.snap", hash));
    std::fs::read(&flat_path).ok()
}

fn compute_summary(
    sim: &mut Simulation,
    peak_pop: u64,
) -> (String, usize, String, Option<String>, usize, u64) {
    let final_tick = sim.tick_count;
    let final_pop: usize = sim.organisms.iter().filter(|o| o.alive).count();
    let top_era = sim.current_era.clone();
    let mut lineage_counts: HashMap<String, usize> = HashMap::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        *lineage_counts.entry(o.lineage_id.clone()).or_insert(0) += 1;
    }
    let lineage_count = lineage_counts.len();
    let (top_lid, top_pop) = lineage_counts
        .iter()
        .max_by_key(|(_, c)| *c)
        .map(|(k, v)| (Some(k.clone()), *v))
        .unwrap_or((None, 0));
    let top_lineage_name = top_lid.and_then(|id| sim.lineage_names.get(&id).cloned());
    (
        top_era,
        lineage_count,
        format!("{}", final_pop),
        top_lineage_name,
        top_pop,
        final_tick,
    )
}

pub async fn archive_and_reset(
    shared_sim: Arc<Mutex<Simulation>>,
    process_started_at_ms: u64,
    peak_pop: u64,
    save_path: &str,
) -> Option<String> {
    ensure_worlds_dir();
    let ended_at_ms = now_ms();
    let new_seed: u64 = {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default();
        t.as_nanos() as u64 ^ (t.subsec_nanos() as u64).wrapping_mul(0x9e3779b97f4a7c15)
    };

    let (hash, snapshot_bytes, meta) = {
        let mut sim = shared_sim.lock().await;
        let final_tick = sim.tick_count;
        if final_tick < 600 {
            tracing::warn!(target: "archive",
                "skipping archive: world only ran {} ticks since boot - not worth saving",
                final_tick);
            return None;
        }
        let tick_ms_total: u64 = final_tick.saturating_mul(100);
        let derived_start = ended_at_ms.saturating_sub(tick_ms_total);
        let started_at_ms = if derived_start > 0 && derived_start < process_started_at_ms {
            derived_start
        } else {
            process_started_at_ms
        };
        let payload = sim.state_json();
        let frame = encode_frame(payload, 0, ended_at_ms, "full");
        let hash_input = format!("{}|{}|{}", started_at_ms, ended_at_ms, final_tick);
        let hash = short_hash(&hash_input);
        let (top_era, lineage_count, _, top_lineage, top_pop, _) = compute_summary(&mut sim, peak_pop);
        let final_pop: usize = sim.organisms.iter().filter(|o| o.alive).count();
        let meta = WorldMeta {
            hash: hash.clone(),
            started_at_ms,
            ended_at_ms,
            final_tick,
            final_population: final_pop,
            peak_population: peak_pop,
            top_era,
            lineage_count,
            top_lineage,
            top_lineage_pop: top_pop,
        };
        (hash, frame, meta)
    };

    let world_folder = crate::server::world_store::world_dir(&hash);
    if let Err(e) = std::fs::create_dir_all(&world_folder) {
        tracing::error!(target: "archive", "failed to create world folder {}: {}",
            world_folder.display(), e);
        return None;
    }
    let snap_path = world_folder.join("snapshot");
    let meta_path = world_folder.join("meta.json");
    if let Err(e) = write_file_atomic(&snap_path, &snapshot_bytes) {
        tracing::error!(target: "archive", "failed to write snapshot: {}", e);
        return None;
    }
    let meta_bytes = match serde_json::to_vec_pretty(&meta) {
        Ok(b) => b,
        Err(e) => {
            tracing::error!(target: "archive", "meta encode: {}", e);
            let _ = std::fs::remove_file(&snap_path);
            return None;
        }
    };
    if let Err(e) = write_file_atomic(&meta_path, &meta_bytes) {
        tracing::error!(target: "archive", "failed to write meta: {}", e);
        let _ = std::fs::remove_file(&snap_path);
        return None;
    }

    {
        let mut sim = shared_sim.lock().await;
        *sim = Simulation::new(new_seed);
    }
    let _ = std::fs::remove_file(save_path);

    let new_hash = crate::server::world_store::mint_world_hash(new_seed, crate::server::transport::now_ms());
    let _ = crate::server::world_store::ensure_world_dir(&new_hash);
    if let Err(e) = crate::server::world_store::set_live_world_hash(&new_hash) {
        tracing::error!(target: "archive", "failed to write _live marker: {}", e);
    } else {
        tracing::warn!(target: "archive",
            "rolled live world -> {} (previous {} archived)", new_hash, hash);
    }

    tracing::warn!(target: "archive",
        "archived world {} (ended tick={}, pop={}, era={}) and reset",
        hash, meta.final_tick, meta.final_population, meta.top_era);
    Some(hash)
}

fn write_file_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    {
        let mut f = std::fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    std::fs::rename(tmp, path)
}
