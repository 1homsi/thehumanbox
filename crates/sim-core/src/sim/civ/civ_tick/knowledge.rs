use super::*;

pub(super) fn tick_cross_lineage_knowledge(sim: &mut Simulation, spatial: &SpatialIndex) {
    let mut nearby = Vec::with_capacity(32);
    let mut to_grant: Vec<(usize, usize, String)> = Vec::new();

    for learner_idx in 0..sim.organisms.len() {
        let learner = &sim.organisms[learner_idx];
        if !learner.alive {
            continue;
        }
        let (x, y) = (learner.x, learner.y);
        let learner_lineage = &learner.lineage_id;
        let curiosity = learner.traits.curiosity;
        let sociability = learner.traits.social_tendency;

        spatial.query_into(x as i32, y as i32, 4, &mut nearby);
        let mut best_teacher: Option<(usize, f32)> = None;
        for &teacher_idx in &nearby {
            if teacher_idx == learner_idx {
                continue;
            }
            let teacher = &sim.organisms[teacher_idx];
            if !teacher.alive || teacher.lineage_id == *learner_lineage {
                continue;
            }
            let distance = (teacher.x - x).abs() + (teacher.y - y).abs();
            if distance > 4.0 || teacher.discoveries.is_empty() {
                continue;
            }
            if !teacher
                .discoveries
                .iter()
                .any(|d| !learner.discoveries.contains(d))
            {
                continue;
            }
            if best_teacher.is_none_or(|(_, best_distance)| distance < best_distance) {
                best_teacher = Some((teacher_idx, distance));
            }
        }

        let Some((teacher_idx, distance)) = best_teacher else {
            continue;
        };
        let teacher = &sim.organisms[teacher_idx];
        let attitude = learner.attitude_toward(&teacher.lineage_id);
        let trust = learner.org_trust.get(&teacher.id).copied().unwrap_or(0.0);
        // Curious, social organisms learn more readily, especially from a
        // trusted nearby teacher. Hostility makes accidental cultural transfer
        // rare without making it impossible at a shared border.
        let chance =
            (0.025 + curiosity * 0.050 + sociability * 0.025 + trust * 0.040 + attitude.max(0.0) * 0.030)
                * (1.0 - distance / 8.0)
                * if attitude < -0.35 { 0.18 } else { 1.0 };
        if sim.rng.random::<f32>() >= chance {
            continue;
        }

        // Reservoir sample a discovery without materialising a set-difference.
        let mut selected: Option<&String> = None;
        let mut choices = 0u32;
        for discovery in &teacher.discoveries {
            if learner.discoveries.contains(discovery) {
                continue;
            }
            choices += 1;
            if sim.rng.random_range(0..choices) == 0 {
                selected = Some(discovery);
            }
        }
        if let Some(discovery) = selected {
            to_grant.push((learner_idx, teacher_idx, discovery.clone()));
        }
    }

    let tick_now = sim.tick_count;
    let mut events: Vec<(String, String)> = Vec::new();
    for (learner_idx, teacher_idx, discovery) in to_grant {
        if learner_idx == teacher_idx || !sim.organisms[learner_idx].alive {
            continue;
        }
        let teacher_id = sim.organisms[teacher_idx].id.clone();
        let teacher_name = sim.organisms[teacher_idx].name.clone();
        let teacher_lineage = sim.organisms[teacher_idx].lineage_id.clone();
        let learner = &mut sim.organisms[learner_idx];
        if !learner.discoveries.insert(discovery.clone()) {
            continue;
        }
        *learner.org_trust.entry(teacher_id).or_insert(0.0) += 0.015;
        learner.think(
            &format!("{} showed me {}", teacher_name, discovery.replace('_', " ")),
            tick_now,
        );
        learner.update_attitude(&teacher_lineage, 0.004);
        events.push((learner.name.clone(), discovery));
    }
    for (name, disc) in events {
        push_event(
            &mut sim.events,
            tick_now,
            "build",
            &name,
            &format!("learned {} through a nearby encounter", disc.replace('_', " ")),
        );
    }
}
