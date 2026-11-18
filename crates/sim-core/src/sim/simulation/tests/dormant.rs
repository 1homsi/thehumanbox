use super::*;

#[test]
fn everyone_ages_one_tick_per_tick_awake_or_dormant() {
    let mut sim = Simulation::new(11);
    sim.tick_n(300);
    let before: FxHashMap<String, u32> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| (o.id.clone(), o.age))
        .collect();
    sim.tick_n(64);
    let mut checked = 0;
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if let Some(&age) = before.get(&o.id) {
            assert_eq!(o.age, age + 64, "{} aged {} in 64 ticks", o.id, o.age - age);
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
    let mut dormant = vec![false; sim.organisms.len()];
    dormant[idx] = true;
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
