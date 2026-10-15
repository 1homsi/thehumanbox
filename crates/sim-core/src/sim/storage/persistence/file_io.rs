use super::*;

fn read_save(path: &str) -> io::Result<Vec<u8>> {
    const MAX_RETRIES: u32 = 3;

    for attempt in 0..=MAX_RETRIES {
        match std::fs::read(path) {
            Err(error) if is_transient_read_error(&error) && attempt < MAX_RETRIES => {
                std::thread::sleep(std::time::Duration::from_millis(10 << attempt));
            }
            result => return result,
        }
    }

    unreachable!("save read loop always returns after the final attempt")
}

fn is_transient_read_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::PermissionDenied | io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
    ) || matches!(error.raw_os_error(), Some(16 | 32 | 33))
}

fn backup_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

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
        match read_save(path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                tracing::info!("No save at {} - starting fresh world", path);
                Self::new(seed)
            }
            Err(e) => {
                let backup = format!("{}.unreadable-{}", path, backup_timestamp());
                std::fs::rename(path, &backup).unwrap_or_else(|backup_error| {
                    panic!(
                        "Save at {} is unreadable ({}), and could not be preserved at {} ({}); refusing to start a fresh world",
                        path, e, backup, backup_error
                    )
                });
                tracing::warn!(
                    "Backed up unreadable save at {} to {} ({}) - starting fresh world",
                    path,
                    backup,
                    e
                );
                Self::new(seed)
            }
            Ok(data) => match serde_json::from_slice::<SaveState>(&data) {
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
                    let backup = format!("{}.corrupt-{}", path, backup_timestamp());
                    std::fs::rename(path, &backup).unwrap_or_else(|backup_error| {
                        panic!(
                            "Save at {} is corrupt ({}), and could not be preserved at {} ({}); refusing to start a fresh world",
                            path, e, backup, backup_error
                        )
                    });
                    tracing::warn!("Backed up corrupt save to {}", backup);
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
