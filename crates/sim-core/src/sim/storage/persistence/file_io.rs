use super::*;

/// Standalone IO so it can be called from a blocking task off the
/// main runtime. Atomic rename + parent-dir fsync mirror the
/// previous in-line behaviour.
pub fn write_save_to_disk(state: &SaveState, path: &str) -> io::Result<()> {
    let tmp_path = format!("{}.tmp", path);
    // Stream the JSON into the file instead of building the whole document
    // in memory first: a save is tens of MB, and the intermediate `String`
    // (grown by doubling) briefly cost about twice that again in RSS.
    let written = (|| -> io::Result<()> {
        let file = std::fs::File::create(&tmp_path)?;
        let mut out = io::BufWriter::with_capacity(1 << 20, file);
        serde_json::to_writer(&mut out, state).map_err(|e| {
            if e.is_io() {
                io::Error::from(e)
            } else {
                io::Error::new(io::ErrorKind::InvalidData, e)
            }
        })?;
        let file = out.into_inner().map_err(|e| e.into_error())?;
        file.sync_all()
    })();
    if let Err(error) = written {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(error);
    }
    std::fs::rename(&tmp_path, path)?;
    if let Some(parent) = std::path::Path::new(path).parent() {
        let dir = if parent.as_os_str().is_empty() {
            std::path::Path::new(".")
        } else {
            parent
        };
        if let Ok(d) = std::fs::File::open(dir) {
            let _ = d.sync_all();
        }
    }
    Ok(())
}

impl Simulation {
    pub fn load_or_new(seed: u64, path: &str) -> Self {
        match std::fs::read_to_string(path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                tracing::info!("No save at {} - starting fresh world", path);
                Self::new(seed)
            }
            Err(e) => {
                tracing::warn!("Save at {} unreadable ({}) - starting fresh world", path, e);
                Self::new(seed)
            }
            Ok(data) => match serde_json::from_str::<SaveState>(&data) {
                Ok(state) => {
                    if state.version != 0 && state.version > SAVE_SCHEMA_VERSION {
                        // Newer schema than this binary supports - back up and
                        // start fresh rather than silently filling with defaults.
                        let backup = format!("{}.future-v{}", path, state.version);
                        let _ = std::fs::rename(path, &backup);
                        tracing::warn!(
                            "Save at {} is schema v{} but this binary only supports v{}. \
                             Backed up to {} and starting fresh world.",
                            path,
                            state.version,
                            SAVE_SCHEMA_VERSION,
                            backup
                        );
                        return Self::new(seed);
                    }
                    if state.version != 0 && state.version < SAVE_SCHEMA_VERSION {
                        tracing::info!(
                            "Loaded world from {} (tick {}, migrating schema v{} → v{})",
                            path,
                            state.tick_count,
                            state.version,
                            SAVE_SCHEMA_VERSION
                        );
                    } else {
                        tracing::info!("Loaded world from {} (tick {})", path, state.tick_count);
                    }
                    let terrain_seed = if state.world_seed > 0 {
                        state.world_seed
                    } else {
                        seed
                    };
                    Self::from_save(terrain_seed, state)
                }
                Err(e) => {
                    // Don't overwrite a possibly-recoverable save on the next
                    // `save()`. Back it up with a timestamp so the operator
                    // can inspect it.
                    use std::time::{SystemTime, UNIX_EPOCH};
                    let ts = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let backup = format!("{}.corrupt-{}", path, ts);
                    if let Err(re) = std::fs::rename(path, &backup) {
                        tracing::warn!("Failed to back up corrupt save to {}: {}", backup, re);
                    } else {
                        tracing::warn!("Backed up corrupt save to {}", backup);
                    }
                    tracing::warn!(
                        "Save at {} could not be deserialized ({}) - starting fresh world.",
                        path,
                        e
                    );
                    Self::new(seed)
                }
            },
        }
    }
}
