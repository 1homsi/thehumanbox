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

/// Each living tribe's own history, oldest first: `{lineage: [{tick, kind, other, word, x, y}]}`. A tribe
/// that has died out is left out, since no card can show it.
pub(super) fn tribe_chronicle_payload(sim: &Simulation) -> serde_json::Value {
    let living: crate::hashing::FxHashSet<&str> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect();
    let mut out = serde_json::Map::new();
    for (lid, entries) in sim.tribe_chronicle.tribes() {
        if !living.contains(lid) {
            continue;
        }
        let rows: Vec<serde_json::Value> = entries
            .iter()
            .map(|e| {
                json!({
                    "tick": e.tick,
                    "kind": e.kind,
                    "other": e.other,
                    "word": e.word,
                    "x": e.place.map(|p| p.0),
                    "y": e.place.map(|p| p.1),
                })
            })
            .collect();
        out.insert(lid.to_string(), serde_json::Value::Array(rows));
    }
    serde_json::Value::Object(out)
}

/// What each tribe's people are at work on right now, counted by trade: `{lineage: {skill: people}}`.
/// The tribe card reads it to say what a tribe is doing. Read only; a stint that has run out is not counted.
pub(super) fn lineage_work_payload(sim: &Simulation) -> serde_json::Value {
    let mut work: std::collections::BTreeMap<&str, std::collections::BTreeMap<&str, u32>> =
        std::collections::BTreeMap::new();
    for org in sim.organisms.iter().filter(|o| o.alive) {
        let Some(plan) = org.work else {
            continue;
        };
        if plan.until <= sim.tick_count {
            continue;
        }
        let trades = work.entry(org.lineage_id.as_str()).or_default();
        *trades.entry(plan.skill.name()).or_insert(0) += 1;
    }
    serde_json::to_value(work).unwrap_or_default()
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
