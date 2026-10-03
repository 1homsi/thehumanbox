//! Environment-driven configuration: tick rate, speed, limits, CORS.

pub(super) const LEGACY_SAVE_PATH: &str = "world.save";
pub(super) const WS_BROADCAST_BUFFER: usize = 40;
pub const WS_RESYNC_LAG_THRESHOLD: u64 = 3;
pub(super) const MIN_RUNTIME_TICK_MS: u64 = 16;
pub(super) const MAX_RUNTIME_TICK_MS: u64 = 5_000;
pub(super) const MIN_RUNTIME_SPEED: f64 = 0.25;
// Past ~30x most machines run flat out; the cap only bounds the request.
pub(super) const MAX_RUNTIME_SPEED: f64 = 5000.0;

pub(super) fn bounded_interval_ms(value: Option<&str>, fallback: u64, min: u64, max: u64) -> u64 {
    value
        .and_then(|raw| raw.trim().parse::<u64>().ok())
        .filter(|interval| *interval > 0)
        .unwrap_or(fallback)
        .clamp(min, max)
}

pub(super) fn tick_ms() -> u64 {
    bounded_interval_ms(
        std::env::var("TICK_MS").ok().as_deref(),
        100,
        MIN_RUNTIME_TICK_MS,
        MAX_RUNTIME_TICK_MS,
    )
}

pub(super) fn runtime_speed_config(base_tick_ms: u64, multiplier: f64) -> (u64, u64) {
    let minimum_steps = ((multiplier * MIN_RUNTIME_TICK_MS as f64) / base_tick_ms as f64)
        .ceil()
        .max(1.0) as u64;
    // Each batch runs while holding the world lock, so keep one to ~64
    // ticks: past that, commands and frames would stall for over a second
    // and the machine is CPU-bound anyway.
    let max_steps = minimum_steps
        .saturating_mul(4)
        .max(minimum_steps.saturating_add(8))
        .min(64);
    let mut best_tick_ms = base_tick_ms;
    let mut best_steps = 1;
    let mut best_error = f64::INFINITY;

    for steps in 1..=max_steps {
        let tick_ms = ((base_tick_ms as f64 * steps as f64) / multiplier)
            .round()
            .clamp(MIN_RUNTIME_TICK_MS as f64, MAX_RUNTIME_TICK_MS as f64) as u64;
        let speed = base_tick_ms as f64 * steps as f64 / tick_ms as f64;
        let error = (speed - multiplier).abs();
        if error < best_error || (error == best_error && steps < best_steps) {
            best_tick_ms = tick_ms;
            best_steps = steps;
            best_error = error;
        }
    }

    (best_tick_ms, best_steps)
}

pub(super) fn network_ms() -> u64 {
    bounded_interval_ms(std::env::var("NETWORK_MS").ok().as_deref(), 500, 16, 60_000)
}

pub(super) fn daily_egress_mb() -> u64 {
    std::env::var("DAILY_EGRESS_MB")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5000)
}

pub(super) fn env_flag(name: &str) -> bool {
    std::env::var(name)
        .map(|value| matches!(value.to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

pub(super) fn parse_env_switch(value: &str, default: bool) -> bool {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => default,
    }
}

pub(super) fn monthly_rollover_enabled_for(profile: Option<&str>, rollover: Option<&str>) -> bool {
    if profile
        .map(|value| value.trim().eq_ignore_ascii_case("local"))
        .unwrap_or(false)
    {
        return false;
    }
    rollover
        .map(|value| parse_env_switch(value, true))
        .unwrap_or(true)
}

pub(super) fn monthly_rollover_enabled() -> bool {
    monthly_rollover_enabled_for(
        std::env::var("THB_PROFILE").ok().as_deref(),
        std::env::var("THB_MONTHLY_ROLLOVER").ok().as_deref(),
    )
}

pub(super) fn population_limit_from_env_value(value: Option<&str>) -> Option<usize> {
    value.and_then(|raw| raw.trim().parse::<usize>().ok())
}

pub(super) fn configured_population_limit() -> Option<usize> {
    population_limit_from_env_value(std::env::var("MAX_POPULATION").ok().as_deref())
}

pub(super) fn default_cors_origins(local_profile: bool) -> Vec<&'static str> {
    let mut origins = vec![
        "https://thehumanbox.com",
        "https://www.thehumanbox.com",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ];
    // Electron's loadFile renderer has an opaque origin and Chromium sends
    // `Origin: null` for its API requests. Only the loopback-bound local
    // profile needs that origin; hosted servers must continue rejecting it.
    if local_profile {
        origins.push("null");
    }
    origins
}

pub(super) static TICK_MS: std::sync::LazyLock<u64> = std::sync::LazyLock::new(tick_ms);
pub(super) static NETWORK_MS: std::sync::LazyLock<u64> = std::sync::LazyLock::new(network_ms);
// Soft daily egress ceiling. As the rolling-24h byte total approaches it,
// the broadcaster widens its cadence (sends frames less often) so the AWS
// data-transfer bill is bounded no matter how many tabs stream — without
// ever disconnecting an active viewer. 0 disables the governor.
pub(super) static DAILY_EGRESS_BYTES: std::sync::LazyLock<u64> =
    std::sync::LazyLock::new(|| daily_egress_mb().saturating_mul(1024 * 1024));

pub(super) const FULL_FRAME_EVERY_TICKS: u64 = 30;

pub(super) const SAVE_EVERY_TICKS: u64 = 600;
