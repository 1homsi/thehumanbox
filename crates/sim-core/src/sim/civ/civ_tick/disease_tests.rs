use super::*;

/// One tribe living close together, every member sick with plague.
fn plague_camp(seed: u64) -> Simulation {
    let mut sim = Simulation::new(seed);
    let lineage = sim.organisms[0].lineage_id.clone();
    sim.organisms.retain(|o| o.lineage_id == lineage);
    sim.lineage_eras.insert(lineage, Era::Iron);
    for (k, o) in sim.organisms.iter_mut().enumerate() {
        o.x = 100.0 + (k % 4) as f32;
        o.y = 100.0 + (k / 4) as f32;
        o.health = 1.0;
        o.discoveries.remove("medicine");
        if k < 4 {
            o.diseases.push(("plague".into(), 0));
        }
    }
    sim
}

fn run_plague(sim: &mut Simulation, steps: u64) -> usize {
    for _ in 0..steps {
        sim.tick_count += DISEASE_STEP;
        tick_disease_spread(sim);
    }
    sim.organisms.iter().filter(|o| o.health < 0.0).count()
}

#[test]
fn untreated_plague_spreads_and_kills_but_a_cure_stops_it() {
    let mut untreated = plague_camp(9);
    let dead = run_plague(&mut untreated, 12);
    let sick = untreated
        .organisms
        .iter()
        .filter(|o| !o.diseases.is_empty())
        .count();
    assert!(dead > 0, "plague should kill without help");
    assert!(sick + dead > 4, "plague should spread");

    let mut cured = plague_camp(9);
    run_plague(&mut cured, 2);
    cured.apply_command_json(r#"{"cmd":"cure","x":101,"y":101,"radius":12}"#);
    assert_eq!(run_plague(&mut cured, 10), 0, "the gods' cure saves them");
}

#[test]
fn later_ages_treat_plague_better() {
    assert!(
        treatment_relief(Era::Industrial, DiseaseKind::Plague)
            > treatment_relief(Era::Iron, DiseaseKind::Plague)
    );
    assert!(treatment_relief(Era::Stone, DiseaseKind::Cold) > 0.0);
}

#[test]
fn the_curse_of_outbreak_is_real_plague() {
    let mut sim = Simulation::new(3);
    sim.apply_command_json(r#"{"cmd":"outbreak","count":3}"#);
    assert_eq!(
        sim.organisms
            .iter()
            .filter(|o| o.diseases.iter().any(|(d, _)| d == "plague"))
            .count(),
        3
    );
}
