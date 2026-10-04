use super::*;

pub(super) fn lookahead_ticks_for_values(look_ms: Option<&str>, tick_ms: Option<&str>) -> f32 {
    let look_ms = look_ms
        .and_then(|value| value.trim().parse::<f32>().ok())
        .filter(|value| value.is_finite())
        .unwrap_or(150.0)
        .max(0.0);
    // Keep prediction cadence aligned with the server's bounded runtime
    // interval. Invalid or zero TICK_MS used to disable lookahead while the
    // server silently ran at its 100ms fallback, making movement stutter.
    let tick_ms = tick_ms
        .and_then(|value| value.trim().parse::<f32>().ok())
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(100.0)
        .clamp(16.0, 5_000.0);
    look_ms / tick_ms
}

pub(super) static LOOKAHEAD_TICKS: std::sync::LazyLock<f32> = std::sync::LazyLock::new(|| {
    // The browser build simulates in the same tab that renders, so there is
    // no network latency to hide. Predicting ahead there made delta frames
    // lead the true position while every full frame (true positions) pulled
    // people back, which read as jittering in place.
    if cfg!(target_arch = "wasm32") {
        return 0.0;
    }
    lookahead_ticks_for_values(
        std::env::var("LOOKAHEAD_MS").ok().as_deref(),
        std::env::var("TICK_MS").ok().as_deref(),
    )
});

pub(super) fn lineage_strategy_payload(sim: &Simulation) -> serde_json::Value {
    let active_strategies: HashMap<String, serde_json::Value> = sim
        .lineage_strategies
        .iter()
        .filter(|(_, (_, expires_tick))| *expires_tick > sim.tick_count)
        .map(|(lineage_id, (strategy, expires_tick))| {
            let objective = sim
                .lineage_strategy_objectives
                .get(lineage_id)
                .filter(|objective| objective.strategy == strategy.as_str());
            (
                lineage_id.clone(),
                json!({
                    "strategy": strategy,
                    "expires_tick": expires_tick,
                    "started_tick": objective.map(|objective| objective.started_tick).unwrap_or(sim.tick_count),
                    "progress": objective.map(|objective| objective.progress).unwrap_or(0),
                    "target": objective.map(|objective| objective.target).unwrap_or(0),
                    "completed": objective.and_then(|objective| objective.completed_tick).is_some(),
                    "completed_tick": objective.and_then(|objective| objective.completed_tick),
                    "status": if objective.and_then(|objective| objective.completed_tick).is_some() {
                        "completed"
                    } else {
                        "active"
                    },
                }),
            )
        })
        .collect();
    serde_json::to_value(active_strategies).unwrap()
}

pub(super) fn lineage_strategy_history_payload(sim: &Simulation) -> serde_json::Value {
    serde_json::to_value(
        sim.lineage_strategy_history
            .iter()
            .rev()
            .take(20)
            .collect::<Vec<_>>(),
    )
    .unwrap()
}
