use super::*;

#[test]
fn everyone_ages_one_tick_per_tick_awake_or_dormant() {
    let mut sim = Simulation::new(11);
    sim.tick_n(300);
    let before: FxHashMap<String, u32> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| (o.id.to_string(), o.age))
        .collect();
    sim.tick_n(64);
    let mut checked = 0;
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if let Some(&age) = before.get(o.id.as_str()) {
            let aged = u64::from(o.age - age);
            // A calm region applies its age on the coarse step, so between
            // steps a body can sit up to one step behind the clock.
            let slack = town_lod::step_for(sim.tick_count);
            assert!(aged.abs_diff(64) < slack, "{} aged {aged} in 64 ticks", o.id);
            checked += 1;
        }
    }
    assert!(checked > 10, "only {checked} people lived through the ticks");
}

#[test]
fn a_dormant_body_tires_and_ages_in_the_upkeep_and_nobody_else_does() {
    let mut sim = Simulation::new(5);
    sim.tick_n(50);
    let idx = sim.organisms.iter().position(|o| o.alive).expect("someone alive");
    let (cx, cy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    flatten_test_area(&mut sim, cx, cy);
    sim.organisms[idx].hydration = 0.9;
    sim.organisms[idx].energy = 0.9;
    sim.organisms[idx].inv_water = 0;
    let age = sim.organisms[idx].age;
    let others: Vec<(u32, f32)> = sim.organisms.iter().map(|o| (o.age, o.energy)).collect();
    let mut dormant = vec![0u64; sim.organisms.len()];
    dormant[idx] = 1;
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);

    sim.dormant_upkeep(&dormant, &spatial, &animal_spatial);

    assert_eq!(sim.organisms[idx].age, age + 1);
    assert!(sim.organisms[idx].hydration < 0.9);
    for (i, o) in sim.organisms.iter().enumerate() {
        if i != idx {
            assert_eq!(
                (o.age, o.energy),
                others[i],
                "person {i} changed in someone else's upkeep"
            );
        }
    }
}

#[test]
fn a_coarse_step_ages_every_skipped_tick() {
    let mut sim = Simulation::new(5);
    sim.tick_n(50);
    let idx = sim.organisms.iter().position(|o| o.alive).expect("someone alive");
    let (cx, cy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    flatten_test_area(&mut sim, cx, cy);
    sim.organisms[idx].energy = 0.95;
    sim.organisms[idx].hydration = 0.95;
    sim.organisms[idx].health = 0.9;
    sim.organisms[idx].infection = 0.0;
    sim.organisms[idx].age = 2_000;
    sim.organisms[idx].max_age = 20_000;
    sim.organisms[idx].inv_water = 0;
    let age = sim.organisms[idx].age;
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    let mut dormant = vec![0u64; sim.organisms.len()];
    dormant[idx] = town_lod::COARSE_MAX;
    sim.dormant_upkeep(&dormant, &spatial, &animal_spatial);
    assert_eq!(sim.organisms[idx].age, age + town_lod::COARSE_MAX as u32);
    assert!(sim.organisms[idx].hydration < 0.95);
    assert!(sim.organisms[idx].hydration > 0.7);
}

#[test]
fn a_town_step_ages_and_tires_a_body_by_the_whole_step() {
    let mut sim = Simulation::new(5);
    sim.tick_n(50);
    let idx = sim.organisms.iter().position(|o| o.alive).expect("someone alive");
    let (cx, cy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
    flatten_test_area(&mut sim, cx, cy);
    sim.organisms[idx].hydration = 0.9;
    sim.organisms[idx].inv_water = 0;
    let age = sim.organisms[idx].age;
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    let mut dormant = vec![0u64; sim.organisms.len()];
    dormant[idx] = 1;
    sim.dormant_upkeep(&dormant, &spatial, &animal_spatial);
    let drop_one = 0.9 - sim.organisms[idx].hydration;
    sim.organisms[idx].hydration = 0.9;
    dormant[idx] = town_lod::TOWN_STEP;
    sim.dormant_upkeep(&dormant, &spatial, &animal_spatial);
    let drop_step = 0.9 - sim.organisms[idx].hydration;

    assert_eq!(sim.organisms[idx].age, age + 1 + town_lod::TOWN_STEP as u32);
    assert!(
        drop_step > drop_one * (town_lod::TOWN_STEP as f32 - 0.5),
        "{drop_step} vs {drop_one}"
    );
}

#[test]
fn a_tribe_that_knows_fire_works_out_medicine_while_dormant_and_spreads_it() {
    let mut sim = Simulation::new(5);
    sim.tick_n(10);
    let lineage = sim
        .organisms
        .iter()
        .find(|o| o.alive)
        .expect("someone alive")
        .lineage_id;
    for o in sim.organisms.iter_mut().filter(|o| o.alive) {
        o.lineage_id = lineage;
        o.discoveries.remove("medicine");
        o.discover("fire");
    }
    let awake = vec![false; sim.organisms.len()];
    sim.tick_count = 600;
    let knowers = |sim: &Simulation| {
        sim.organisms
            .iter()
            .filter(|o| o.alive && o.discoveries.contains("medicine"))
            .count()
    };
    let mut steps = 0;
    while knowers(&sim) == 0 && steps < 20_000 {
        sim.tick_count += 60;
        sim.lineage_lore(&awake);
        steps += 1;
    }
    assert!(knowers(&sim) > 0, "nobody worked out medicine");
    for _ in 0..40 {
        sim.tick_count += 60;
        sim.lineage_lore(&awake);
    }
    let alive = sim.organisms.iter().filter(|o| o.alive).count();
    assert!(
        knowers(&sim) * 2 > alive,
        "medicine reached {} of {alive}",
        knowers(&sim)
    );
}

#[test]
fn an_unsheltered_person_in_a_storm_wakes_on_their_storm_slot_only() {
    let mut sim = Simulation::new(5);
    sim.tick_n(50);
    sim.animals.clear();
    sim.battles.clear();
    sim.focus_points.clear();
    sim.weather.kind = 2;
    let idx = sim.organisms.iter().position(|o| o.alive).expect("someone alive");
    {
        let o = &mut sim.organisms[idx];
        o.routine = None;
        o.energy = 0.9;
        o.hydration = 0.9;
        o.health = 1.0;
        o.infection = 0.0;
        o.water_ticks = 0;
        o.mounted_vehicle = None;
        o.last_action = Some(17);
    }
    let animal_spatial = SpatialIndex::build_animals(&sim.animals, 10);
    let towns = vec![None; sim.organisms.len()];
    let start = sim.tick_count;
    let woken: Vec<u64> = (start..start + 16)
        .filter(|&tick| {
            sim.tick_count = tick;
            sim.lod_awake(&animal_spatial, &mut Vec::new(), &towns).0[idx]
        })
        .collect();
    assert_eq!(woken.len(), 4, "{woken:?}");
    assert!(
        woken.iter().all(|&t| (t + idx as u64).is_multiple_of(4)),
        "{woken:?}"
    );
}
