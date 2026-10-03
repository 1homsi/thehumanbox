use super::*;

/// Broadcast significant events to nearby kin via per-org life_log
/// entries. When something memorable happens — a birth, a partnership,
/// a discovery, a death — kin within range write it into their own
/// chronicle. Makes the world feel socially connected.
///
/// Reads sim.events for the last interval and projects events with a
/// recent tick onto kin in range. Tracks last broadcast tick on
/// Simulation so we don't double-broadcast.
pub(in crate::sim::civ) fn tick_witnessed_events(sim: &mut Simulation) {
    let now = sim.tick_count;
    let last = sim.last_witness_tick;
    sim.last_witness_tick = now;
    if last == 0 {
        return;
    }

    let n = sim.organisms.len();
    let mut by_name: HashMap<String, usize> = HashMap::with_capacity_and_hasher(n, Default::default());
    let mut by_lineage: HashMap<String, Vec<usize>> =
        HashMap::with_capacity_and_hasher(sim.lineage_names.len().max(8), Default::default());
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        by_name.insert(o.name.clone(), i);
        by_lineage.entry(o.lineage_id.clone()).or_default().push(i);
    }

    // Pull recent broadcast-worthy events.
    let events_snapshot: Vec<(u64, String, String, String)> = sim
        .events
        .iter()
        .filter(|e| e.tick >= last)
        .filter(|e| {
            matches!(
                e.etype.as_str(),
                "born"
                    | "death"
                    | "religion_founded"
                    | "religion"
                    | "war_declared"
                    | "battle_began"
                    | "treaty"
                    | "build"
                    | "gift"
                    | "teach"
                    | "milestone"
                    | "specialty"
                    | "graduated"
                    | "government_changed"
                    | "aspiration"
            )
        })
        .map(|e| (e.tick, e.etype.clone(), e.actor.clone(), e.detail.clone()))
        .collect();

    if events_snapshot.is_empty() {
        return;
    }

    // For each event with an actor we can resolve to a living org,
    // broadcast a short witnessed entry to lineage-mates within radius.
    const WITNESS_RADIUS: f32 = 24.0;
    for (tick, etype, actor_name, detail) in events_snapshot {
        let Some(&actor_idx) = by_name.get(&actor_name) else {
            continue;
        };
        let (ax, ay) = (sim.organisms[actor_idx].x, sim.organisms[actor_idx].y);
        let lineage = sim.organisms[actor_idx].lineage_id.clone();
        let actor_id = sim.organisms[actor_idx].id.clone();
        let Some(kin) = by_lineage.get(&lineage) else {
            continue;
        };

        let phrase = match etype.as_str() {
            "born" => format!("saw {} take their first breath", actor_name),
            "death" => format!("watched {} pass", actor_name),
            "religion_founded" | "religion" => format!("learned of {}: {}", actor_name, detail),
            "war_declared" => format!("heard war drums from {}", actor_name),
            "battle_began" => format!("heard of battle: {}", detail),
            "treaty" => format!("heard of a treaty signed by {}", actor_name),
            "build" | "gift" | "teach" => format!("heard that {} {}", actor_name, detail),
            "milestone" => format!("witnessed an age turn: {}", detail),
            "specialty" => format!("saw {} take up a trade: {}", actor_name, detail),
            "graduated" => format!("heard {} earned a degree: {}", actor_name, detail),
            "government_changed" => format!("saw the people choose: {}", detail),
            "aspiration" => format!("noticed {} {}", actor_name, detail),
            _ => continue,
        };

        for &ki in kin {
            if ki == actor_idx {
                continue;
            }
            let (kx, ky) = (sim.organisms[ki].x, sim.organisms[ki].y);
            let d = (kx - ax).abs() + (ky - ay).abs();
            if d > WITNESS_RADIUS {
                continue;
            }
            sim.organisms[ki].log_life_rel(
                tick,
                "witnessed",
                phrase.clone(),
                Some(actor_id.clone()),
                Some(actor_name.clone()),
            );
            // Witnessing big moments stirs mood.
            match etype.as_str() {
                "born" | "religion_founded" | "build" | "gift" | "teach" | "specialty" | "graduated"
                | "milestone" => {
                    sim.organisms[ki].joy_ticks = (sim.organisms[ki].joy_ticks + 40).min(1200);
                }
                "death" => {
                    sim.organisms[ki].grief_ticks = (sim.organisms[ki].grief_ticks + 25).min(400);
                    sim.organisms[ki].comfort = (sim.organisms[ki].comfort - 0.04).max(0.0);
                }
                "war_declared" | "battle_began" => {
                    sim.organisms[ki].fear_level = (sim.organisms[ki].fear_level + 0.06).min(1.0);
                    sim.organisms[ki].comfort = (sim.organisms[ki].comfort - 0.03).max(0.0);
                }
                "treaty" => {
                    sim.organisms[ki].joy_ticks = (sim.organisms[ki].joy_ticks + 25).min(1200);
                    sim.organisms[ki].fear_level = (sim.organisms[ki].fear_level - 0.02).max(0.0);
                }
                _ => {}
            }
        }
    }
}
