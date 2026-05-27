use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::organism::memory::{MemoryEntry, MemoryKind};

const WORLDS_DIR: &str = "worlds";
const LIVE_MARKER: &str = "_live";
const SQLITE_FILE: &str = "world.sqlite";

pub fn worlds_root() -> PathBuf {
    PathBuf::from(WORLDS_DIR)
}

pub fn world_dir(hash: &str) -> PathBuf {
    worlds_root().join(hash)
}

pub fn world_save_path(hash: &str) -> PathBuf {
    world_dir(hash).join("world.save")
}

pub fn world_meta_path(hash: &str) -> PathBuf {
    world_dir(hash).join("meta.json")
}

pub fn world_sqlite_path(hash: &str) -> PathBuf {
    world_dir(hash).join(SQLITE_FILE)
}

pub fn ensure_world_dir(hash: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(world_dir(hash))
}

pub fn live_world_hash() -> Option<String> {
    let p = worlds_root().join(LIVE_MARKER);
    std::fs::read_to_string(&p)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn set_live_world_hash(hash: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(worlds_root())?;
    let p = worlds_root().join(LIVE_MARKER);
    let tmp = p.with_extension("tmp");
    std::fs::write(&tmp, hash.as_bytes())?;
    std::fs::rename(&tmp, &p)
}

pub fn mint_world_hash(seed: u64, born_at_ms: u64) -> String {
    let mut h: u64 = 1469598103934665603;
    for b in seed.to_le_bytes().iter().chain(born_at_ms.to_le_bytes().iter()) {
        h ^= *b as u64;
        h = h.wrapping_mul(1099511628211);
    }
    format!("{:016x}", h)
}

pub fn list_world_hashes() -> Vec<String> {
    let mut out = Vec::new();
    let Ok(read) = std::fs::read_dir(worlds_root()) else {
        return out;
    };
    for entry in read.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if name.starts_with('_') || name.starts_with('.') {
            continue;
        }
        out.push(name.to_string());
    }
    out
}

pub struct WorldStore {
    conn: Mutex<Connection>,
}

impl WorldStore {
    pub fn open(hash: &str) -> rusqlite::Result<Self> {
        ensure_world_dir(hash).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let path = world_sqlite_path(hash);
        let conn = Connection::open(&path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS memories (
                org_id        TEXT NOT NULL,
                org_name      TEXT NOT NULL,
                lineage_id    TEXT NOT NULL,
                tick          INTEGER NOT NULL,
                kind          TEXT NOT NULL,
                text          TEXT NOT NULL,
                salience      REAL NOT NULL,
                emotion       INTEGER NOT NULL,
                related_id    TEXT,
                recall_count  INTEGER NOT NULL DEFAULT 0,
                flushed_tick  INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mem_org ON memories(org_id);
            CREATE INDEX IF NOT EXISTS idx_mem_lineage ON memories(lineage_id);
            CREATE INDEX IF NOT EXISTS idx_mem_flushed ON memories(flushed_tick);
            ",
        )?;
        Ok(WorldStore {
            conn: Mutex::new(conn),
        })
    }

    pub fn flush_dead_org_memories(
        &self,
        org_id: &str,
        org_name: &str,
        lineage_id: &str,
        flushed_tick: u64,
        entries: &[&MemoryEntry],
    ) -> rusqlite::Result<usize> {
        if entries.is_empty() {
            return Ok(0);
        }
        let mut conn = self.conn.lock().expect("world_store conn poisoned");
        let tx = conn.transaction()?;
        let mut inserted = 0usize;
        {
            let mut stmt = tx.prepare(
                "INSERT INTO memories
                  (org_id, org_name, lineage_id, tick, kind, text,
                   salience, emotion, related_id, recall_count, flushed_tick)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            )?;
            for e in entries {
                stmt.execute(params![
                    org_id,
                    org_name,
                    lineage_id,
                    e.tick_formed as i64,
                    e.kind.label(),
                    e.text,
                    e.salience as f64,
                    e.emotion as i64,
                    e.related_id,
                    e.recall_count as i64,
                    flushed_tick as i64,
                ])?;
                inserted += 1;
            }
        }
        tx.commit()?;
        Ok(inserted)
    }

    pub fn load_memories_for(&self, org_id: &str, limit: usize) -> rusqlite::Result<Vec<MemoryEntry>> {
        let conn = self.conn.lock().expect("world_store conn poisoned");
        let mut stmt = conn.prepare(
            "SELECT kind, text, salience, emotion, tick, related_id, recall_count
               FROM memories
              WHERE org_id = ?
              ORDER BY salience DESC
              LIMIT ?",
        )?;
        let rows = stmt.query_map(params![org_id, limit as i64], |r| {
            let kind: String = r.get(0)?;
            let text: String = r.get(1)?;
            let salience: f64 = r.get(2)?;
            let emotion: i64 = r.get(3)?;
            let tick: i64 = r.get(4)?;
            let related_id: Option<String> = r.get(5)?;
            let recall_count: i64 = r.get(6)?;
            Ok(MemoryEntry {
                kind: MemoryKind::from_label(&kind),
                text,
                salience: salience as f32,
                emotion: emotion as i8,
                tick_formed: tick as u64,
                related_id,
                recall_count: recall_count.max(0) as u32,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    pub fn prune_older_than(&self, before_tick: u64) -> rusqlite::Result<usize> {
        let conn = self.conn.lock().expect("world_store conn poisoned");
        let n = conn.execute(
            "DELETE FROM memories WHERE flushed_tick < ?",
            params![before_tick as i64],
        )?;
        Ok(n)
    }

    pub fn memory_count(&self) -> rusqlite::Result<u64> {
        let conn = self.conn.lock().expect("world_store conn poisoned");
        let n: i64 = conn.query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))?;
        Ok(n.max(0) as u64)
    }
}

pub fn migrate_legacy_save(legacy_path: &Path, hash: &str) -> std::io::Result<bool> {
    if !legacy_path.exists() {
        return Ok(false);
    }
    ensure_world_dir(hash)?;
    let dest = world_save_path(hash);
    if dest.exists() {
        return Ok(false);
    }
    std::fs::rename(legacy_path, &dest)?;
    set_live_world_hash(hash)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_root() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("thb_ws_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&p);
        std::fs::create_dir_all(&p).unwrap();
        p
    }

    #[test]
    fn mint_world_hash_deterministic_per_seed_and_time() {
        assert_eq!(mint_world_hash(42, 1000), mint_world_hash(42, 1000));
        assert_ne!(mint_world_hash(42, 1000), mint_world_hash(43, 1000));
        assert_ne!(mint_world_hash(42, 1000), mint_world_hash(42, 1001));
    }

    #[test]
    fn store_round_trip_flush_and_load() {
        let root = tmp_root();
        let prev_cwd = std::env::current_dir().unwrap();
        std::env::set_current_dir(&root).unwrap();
        let hash = "abc123def456";
        let store = WorldStore::open(hash).unwrap();
        let m1 = MemoryEntry::new(MemoryKind::Bond, "I lost Movahe", 5000).with_emotion(-3);
        let m2 = MemoryEntry::new(MemoryKind::Episode, "saw a wolf", 4500).with_emotion(-1);
        store
            .flush_dead_org_memories("org-1", "Vela", "lineage-x", 6000, &[&m1, &m2])
            .unwrap();
        assert_eq!(store.memory_count().unwrap(), 2);
        let loaded = store.load_memories_for("org-1", 10).unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].text, "I lost Movahe");
        std::env::set_current_dir(prev_cwd).unwrap();
    }
}
