use super::*;

pub(super) fn apply_repairs(sim: &mut Simulation, exposed: &HashSet<usize>) {
    let mut assigned_workers = HashSet::default();
    let mut restored_events = Vec::new();
    let living_lineages: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();

    for building_index in 0..sim.buildings.len() {
        if exposed.contains(&building_index) {
            continue;
        }
        let building = &sim.buildings[building_index];
        if !building.is_complete()
            || building.decorative
            || !building.is_damaged()
            || !supports_damage(building.kind)
        {
            continue;
        }
        // Do not spend whole material units on imperceptible daily wear.
        if building.damage_fraction() < 0.08 && !building.is_ruined() {
            continue;
        }
        let reclaimable = building.is_ruined()
            && building
                .owner_lineage
                .as_ref()
                .is_none_or(|owner| !living_lineages.contains(owner));
        let (x, y, kind) = (building.x, building.y, building.kind);
        let Some(worker_index) = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(index, _)| !assigned_workers.contains(index))
            .filter(|(_, org)| {
                can_repair(org)
                    && (reclaimable || building.owner_lineage.as_deref() == Some(org.lineage_id.as_str()))
            })
            .filter_map(|(index, org)| {
                let distance = (org.x - x as f32).abs() + (org.y - y as f32).abs();
                (distance <= REPAIR_REACH).then_some((distance, index))
            })
            .min_by(|(distance_a, index_a), (distance_b, index_b)| {
                distance_a
                    .total_cmp(distance_b)
                    .then_with(|| index_a.cmp(index_b))
            })
            .map(|(_, index)| index)
        else {
            continue;
        };
        let lineage = sim.organisms[worker_index].lineage_id.clone();
        let plan = repair_plan(kind);
        let Some(unit) = plan.next_unit(building.damage_fraction()) else {
            continue;
        };
        if !pooled_resource_available(sim, &lineage, unit) {
            continue;
        }
        // Recruiting reach is not working reach. Repairs should create real
        // journeys just like new construction, rather than happen remotely.
        let (width, height) = building.footprint();
        let worker = &sim.organisms[worker_index];
        let distance = (worker.x - worker.x.clamp(x as f32, x as f32 + f32::from(width) - 1.0)).abs()
            + (worker.y - worker.y.clamp(y as f32, y as f32 + f32::from(height) - 1.0)).abs();
        if distance > 3.0 {
            let target = [
                (x - 1, y),
                (x, y - 1),
                (x + i32::from(width), y),
                (x, y + i32::from(height)),
            ]
            .into_iter()
            .filter(|&(tx, ty)| sim.grid.get(tx, ty).walkable())
            .min_by_key(|&(tx, ty)| ((worker.x - tx as f32).abs() + (worker.y - ty as f32).abs()) as i32);
            if let Some(target) = target {
                assigned_workers.insert(worker_index);
                let worker = &mut sim.organisms[worker_index];
                if worker
                    .journey
                    .as_ref()
                    .is_none_or(|journey| journey.target != target)
                {
                    worker.begin_journey(
                        target,
                        &format!("going to repair a {}", kind.name()),
                        sim.tick_count,
                    );
                }
            }
            continue;
        }
        let repair_amount = 1.0 / plan.total_units() as f32;

        consume_pooled_resource(sim, &lineage, unit);
        assigned_workers.insert(worker_index);
        sim.organisms[worker_index].energy = (sim.organisms[worker_index].energy - 0.008).max(0.0);

        sim.organisms[worker_index].thought = if reclaimable {
            format!("reclaiming an abandoned {}", kind.name())
        } else {
            format!("repairing our {}", kind.name())
        };
        let building = &mut sim.buildings[building_index];
        if reclaimable {
            building.owner_lineage = Some(lineage.clone());
        }
        let was_ruined = building.is_ruined();
        if was_ruined && building.ruined_at_tick.is_none() {
            // Damage at 100% is independently recognized as a ruin. Latch
            // that state before the first repair so one paid unit cannot make
            // an imported or command-authored ruin operational immediately.
            building.ruined_at_tick = Some(building.last_damage_tick.unwrap_or(sim.tick_count));
        }
        building.damage = (building.damage_fraction() - repair_amount).max(0.0);
        building.last_repair_tick = Some(sim.tick_count);
        if was_ruined && building.damage_fraction() <= RUIN_REOPEN_DAMAGE {
            building.ruined_at_tick = None;
            restored_events.push((lineage, kind, x, y));
        }
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }

    for (lineage, kind, x, y) in restored_events {
        push_event(
            &mut sim.events,
            sim.tick_count,
            "building_restored",
            &lineage,
            &format!("rebuilt the {} ruins at ({},{})", kind.name(), x, y),
        );
        let lineage_name = sim.lineage_names.get(&lineage).cloned().unwrap_or(lineage);
        sim.headlines.push_back((
            sim.tick_count,
            format!(
                "\u{1F6E0}\u{FE0F} The {} rebuilt their {} from the ruins.",
                lineage_name,
                kind.name()
            ),
        ));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}
