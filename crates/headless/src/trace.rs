use super::*;

pub(super) fn infer_event_type(org: &organism::organism::Organism) -> &'static str {
    let thought = org.thought.to_lowercase();
    let last_log = org
        .life_log
        .back()
        .map(|e| e.text.to_lowercase())
        .unwrap_or_default();
    let text = if !last_log.is_empty() {
        last_log.as_str()
    } else {
        thought.as_str()
    };

    if text.contains("danger") || text.contains("fire") || text.contains("struggling") {
        "danger"
    } else if text.contains("migrat") || text.contains("distant land") || text.contains("wandering") {
        "migration"
    } else if text.contains("teach") || text.contains("bond") || text.contains("fed by kin") {
        "social"
    } else if text.contains("remember") || text.contains("mourn") {
        "memory"
    } else if text.contains("drink") || text.contains("water") {
        "water"
    } else if text.contains("eat") || text.contains("food") || text.contains("hunt") {
        "food"
    } else {
        "thought"
    }
}

pub(super) fn write_trace_rows(sim: &Simulation, writer: &mut BufWriter<File>, trace_limit: usize) {
    let season = sim.season().to_string();
    let weather = sim.weather.kind;
    let mut written = 0usize;

    for org in sim.organisms.iter().filter(|o| o.alive) {
        if trace_limit > 0 && written >= trace_limit {
            break;
        }
        let row = json!({
            "tick": sim.tick_count,
            "organism_id": org.id,
            "organism_name": org.name,
            "lineage_id": org.lineage_id,
            "generation": org.generation,
            "event_type": infer_event_type(org),
            "text": org.thought,
            "context_text": org.life_log.back().map(|e| e.text.clone()).unwrap_or_default(),
            "position": {
                "x": org.x,
                "y": org.y,
            },
            "state": {
                "energy": org.energy,
                "hydration": org.hydration,
                "health": org.health,
                "fear": org.fear_level,
                "curiosity": org.traits.curiosity,
                "comfort": org.comfort,
                "loneliness": org.loneliness,
            },
            "world": {
                "season": season,
                "weather": weather,
                "era": sim.current_era,
            },
            "discoveries": org.discoveries.iter().cloned().collect::<Vec<_>>(),
        });
        serde_json::to_writer(&mut *writer, &row).expect("failed to write trace row");
        writer.write_all(b"\n").expect("failed to write trace newline");
        written += 1;
    }
}
