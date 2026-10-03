//! The save-folder lock a desktop launch claims before it starts a world.

pub(super) fn write_desktop_record_atomically(
    path: &std::path::Path,
    value: &serde_json::Value,
    token: &str,
    child_pid: u32,
) -> Result<(), String> {
    use std::io::Write;

    let parent = path
        .parent()
        .ok_or_else(|| format!("{} has no parent folder", path.display()))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("{} has no valid file name", path.display()))?;
    let temp = parent.join(format!(".{file_name}.{token}.{child_pid}.tmp"));
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|error| format!("could not create {}: {error}", temp.display()))?;
    if let Err(error) = file.write_all(&bytes).and_then(|_| file.sync_all()) {
        let _ = std::fs::remove_file(&temp);
        return Err(format!("could not persist {}: {error}", temp.display()));
    }
    drop(file);

    let target_matches = || {
        std::fs::read(path)
            .ok()
            .and_then(|raw| serde_json::from_slice::<serde_json::Value>(&raw).ok())
            .as_ref()
            == Some(value)
    };
    if path.exists() {
        if target_matches() {
            let _ = std::fs::remove_file(&temp);
            return Ok(());
        }
        let _ = std::fs::remove_file(&temp);
        return Err(format!("{} is owned by another process", path.display()));
    }
    if let Err(error) = std::fs::rename(&temp, path) {
        if target_matches() {
            let _ = std::fs::remove_file(&temp);
            return Ok(());
        }
        let _ = std::fs::remove_file(&temp);
        return Err(format!("could not activate {}: {error}", path.display()));
    }
    if let Ok(directory) = std::fs::File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}

pub(super) fn claim_desktop_data_lock_at(
    root: &std::path::Path,
    token: &str,
    parent_pid: u32,
    child_pid: u32,
    port: u16,
) -> Result<(), String> {
    if token.is_empty()
        || token.len() > 128
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err("desktop data-lock token is invalid".to_string());
    }
    let lock_dir = root.join(".thehumanbox-data.lock");
    let owner_path = lock_dir.join("owner.json");
    let owner: serde_json::Value = serde_json::from_slice(
        &std::fs::read(&owner_path)
            .map_err(|error| format!("could not read {}: {error}", owner_path.display()))?,
    )
    .map_err(|error| format!("could not decode {}: {error}", owner_path.display()))?;
    if owner.get("token").and_then(serde_json::Value::as_str) != Some(token)
        || owner.get("pid").and_then(serde_json::Value::as_u64) != Some(u64::from(parent_pid))
    {
        return Err("desktop data lock changed before the simulation child claimed it".to_string());
    }

    // The pid record is durable before child.json announces adoption. A new
    // desktop can therefore either wait for the short unclaimed-launch grace
    // period or find and terminate this exact orphan before opening the world.
    let pid_record = serde_json::json!({
        "pid": child_pid,
        "port": port,
        "token": token,
    });
    write_desktop_record_atomically(&root.join("sim.pid"), &pid_record, token, child_pid)?;
    let claimed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let child_record = serde_json::json!({
        "pid": child_pid,
        "token": token,
        "claimedAt": claimed_at,
    });
    write_desktop_record_atomically(&lock_dir.join("child.json"), &child_record, token, child_pid)
}

pub(super) fn claim_desktop_data_lock_from_env() -> Result<(), String> {
    let Ok(token) = std::env::var("THB_DATA_LOCK_TOKEN") else {
        return Ok(());
    };
    let parent_pid = std::env::var("THB_DESKTOP_PARENT_PID")
        .map_err(|_| "THB_DESKTOP_PARENT_PID is required with a data-lock token".to_string())?
        .parse::<u32>()
        .map_err(|_| "THB_DESKTOP_PARENT_PID is invalid".to_string())?;
    let port = std::env::var("PORT")
        .map_err(|_| "PORT is required with a data-lock token".to_string())?
        .parse::<u16>()
        .map_err(|_| "PORT is invalid".to_string())?;
    let root = std::env::current_dir().map_err(|error| error.to_string())?;
    claim_desktop_data_lock_at(&root, &token, parent_pid, std::process::id(), port)
}
