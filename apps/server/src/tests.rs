use super::{
    bounded_interval_ms, claim_desktop_data_lock_at, default_cors_origins, desktop_owned_environment,
    dev_dotenv_path, exit_on_tick_failure_for, monthly_rollover_enabled_for, population_limit_from_env_value,
    RuntimeControl, MIN_RUNTIME_TICK_MS,
};

fn temporary_lock_root(label: &str) -> std::path::PathBuf {
    let unique = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("thehumanbox-{label}-{}-{unique}", std::process::id()))
}

#[test]
fn desktop_child_claims_lock_and_pid_before_world_startup() {
    let root = temporary_lock_root("child-lock");
    let lock_dir = root.join(".thehumanbox-data.lock");
    std::fs::create_dir_all(&lock_dir).unwrap();
    std::fs::write(
        lock_dir.join("owner.json"),
        serde_json::json!({
            "pid": 41,
            "token": "test-token",
            "acquiredAt": 1,
        })
        .to_string(),
    )
    .unwrap();

    claim_desktop_data_lock_at(&root, "test-token", 41, 42, 4321).unwrap();

    let pid: serde_json::Value =
        serde_json::from_slice(&std::fs::read(root.join("sim.pid")).unwrap()).unwrap();
    let child: serde_json::Value =
        serde_json::from_slice(&std::fs::read(lock_dir.join("child.json")).unwrap()).unwrap();
    assert_eq!(pid["pid"], 42);
    assert_eq!(pid["port"], 4321);
    assert_eq!(pid["token"], "test-token");
    assert_eq!(child["pid"], 42);
    assert_eq!(child["token"], "test-token");
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn desktop_child_refuses_a_replaced_lock_token() {
    let root = temporary_lock_root("child-lock-mismatch");
    let lock_dir = root.join(".thehumanbox-data.lock");
    std::fs::create_dir_all(&lock_dir).unwrap();
    std::fs::write(
        lock_dir.join("owner.json"),
        serde_json::json!({
            "pid": 41,
            "token": "new-owner",
            "acquiredAt": 1,
        })
        .to_string(),
    )
    .unwrap();

    assert!(claim_desktop_data_lock_at(&root, "old-owner", 41, 42, 4321).is_err());
    assert!(!root.join("sim.pid").exists());
    assert!(!lock_dir.join("child.json").exists());
    std::fs::remove_dir_all(root).unwrap();
}

#[test]
fn local_profile_always_disables_monthly_rollover() {
    assert!(!monthly_rollover_enabled_for(Some("local"), None));
    assert!(!monthly_rollover_enabled_for(Some("LOCAL"), Some("1")));
}

#[test]
fn hosted_rollover_defaults_on_and_honors_explicit_off() {
    assert!(monthly_rollover_enabled_for(None, None));
    assert!(monthly_rollover_enabled_for(Some("hosted"), Some("yes")));
    assert!(!monthly_rollover_enabled_for(Some("hosted"), Some("0")));
}

#[test]
fn only_the_local_profile_exits_when_the_tick_loop_dies() {
    assert!(exit_on_tick_failure_for(Some("local")));
    assert!(exit_on_tick_failure_for(Some(" LOCAL ")));
    assert!(!exit_on_tick_failure_for(None));
    assert!(!exit_on_tick_failure_for(Some("hosted")));
}

#[test]
fn population_limit_parser_ignores_missing_or_invalid_values() {
    assert_eq!(population_limit_from_env_value(Some(" 1200 ")), Some(1200));
    assert_eq!(population_limit_from_env_value(Some("many")), None);
    assert_eq!(population_limit_from_env_value(None), None);
}

#[test]
fn runtime_intervals_reject_zero_and_stay_inside_safe_bounds() {
    assert_eq!(bounded_interval_ms(Some("0"), 100, 16, 5_000), 100);
    assert_eq!(bounded_interval_ms(Some(" 8 "), 100, 16, 5_000), 16);
    assert_eq!(bounded_interval_ms(Some("9000"), 100, 16, 5_000), 5_000);
    assert_eq!(bounded_interval_ms(Some("invalid"), 500, 16, 60_000), 500);

    let runtime = RuntimeControl::new(0);
    assert_eq!(runtime.tick_ms(), MIN_RUNTIME_TICK_MS);
    assert!(runtime.speed().is_finite());
}

#[test]
fn local_cors_supports_file_renderers_without_opening_hosted_servers() {
    let hosted = default_cors_origins(false);
    let local = default_cors_origins(true);
    assert!(hosted.contains(&"http://127.0.0.1:4173"));
    assert!(!hosted.contains(&"null"));
    assert!(local.contains(&"null"));
}

#[test]
fn runtime_control_pauses_and_scales_from_configured_speed() {
    let runtime = RuntimeControl::new(100);
    assert!(!runtime.paused());
    assert_eq!(runtime.tick_ms(), 100);

    runtime.set_paused(true);
    assert!(runtime.paused());
    assert_eq!(runtime.set_speed(2.0), Some(50));
    assert_eq!(runtime.tick_ms(), 50);
    assert_eq!(runtime.steps_per_period(), 1);
    assert!((runtime.speed() - 2.0).abs() < f64::EPSILON);

    assert_eq!(runtime.set_speed(10.0), Some(20));
    assert_eq!(runtime.tick_ms(), 20);
    assert_eq!(runtime.steps_per_period(), 2);
    assert!((runtime.speed() - 10.0).abs() < f64::EPSILON);

    assert_eq!(runtime.set_speed(50.0), Some(16));
    assert_eq!(runtime.tick_ms(), 16);
    assert_eq!(runtime.steps_per_period(), 8);
    assert!((runtime.speed() - 50.0).abs() < f64::EPSILON);

    runtime.set_paused(false);
    assert!(!runtime.paused());
}

#[test]
fn runtime_control_rejects_unbounded_speeds() {
    let runtime = RuntimeControl::new(100);
    assert_eq!(runtime.set_speed(0.0), None);
    assert_eq!(runtime.set_speed(5001.0), None);
    assert_eq!(runtime.set_speed(f64::NAN), None);
    assert_eq!(runtime.tick_ms(), 100);
}

#[test]
fn a_parent_dotenv_stays_out_of_a_desktop_owned_simulation() {
    use std::ffi::OsStr;

    // A `.env` above the working directory is exactly what dotenvy's walk-up
    // finds when the desktop runs the child in the save folder.
    let root = temporary_lock_root("dotenv");
    let cwd = root.join("child");
    std::fs::create_dir_all(&cwd).unwrap();
    std::fs::write(root.join(".env"), "THB_ADMIN_TOKEN=leaked\n").unwrap();

    // A standalone run still selects that ancestor file...
    assert_eq!(dev_dotenv_path(false, Some(&cwd)), Some(root.join(".env")));
    // ...while a desktop-owned child selects nothing at all.
    assert_eq!(dev_dotenv_path(true, Some(&cwd)), None);

    // Either desktop marker is enough (the lock token is the one
    // `claim_desktop_data_lock_from_env` keys off).
    assert!(desktop_owned_environment(Some(OsStr::new("lock-token")), None));
    assert!(desktop_owned_environment(None, Some(OsStr::new("4242"))));
    assert!(!desktop_owned_environment(None, None));
}
