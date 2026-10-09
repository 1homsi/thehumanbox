//! Era advancement and the technological era boundary.

use super::*;

#[test]
fn lineage_era_does_not_regress_when_population_dips() {
    use crate::organism::organism::Organism;
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xaea);
    sim.organisms.clear();
    let mut survivor = Organism::new(
        "survivor".to_string(),
        "Survivor".to_string(),
        50.0,
        50.0,
        0,
        String::new(),
        "lineage-a".to_string(),
        20_000,
        crate::organism::traits::Traits::default(),
    );
    survivor.alive = true;
    survivor.discoveries.insert("fire".to_string());
    survivor.discoveries.insert("stone_tools".to_string());
    survivor.discoveries.insert("shelter".to_string());
    sim.organisms.push(survivor);
    sim.lineage_eras.insert("lineage-a".to_string(), Era::Classical);
    sim.current_era = "classical".to_string();

    sim.update_lineage_eras();

    assert_eq!(sim.lineage_eras.get("lineage-a"), Some(&Era::Classical));
    assert_eq!(sim.current_era, "classical");
}

fn prepare_atomic_population_gate_world(
    sim: &mut Simulation,
    desired_world_population: usize,
) -> (String, usize) {
    use crate::sim::era::Era;

    let lineage_id = sim
        .organisms
        .iter()
        .find(|org| org.alive)
        .expect("founder exists")
        .lineage_id
        .clone();
    let lineage_population = sim
        .organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage_id)
        .count();
    assert!(lineage_population < Era::Atomic.pop_threshold());
    assert!(lineage_population <= desired_world_population);

    for org in sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id == lineage_id)
    {
        for discovery in Era::Atomic.required_discoveries() {
            org.discoveries.insert((*discovery).to_string());
        }
    }

    let mut living = lineage_population;
    for org in sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id != lineage_id)
    {
        if living < desired_world_population {
            living += 1;
        } else {
            org.alive = false;
        }
    }
    assert_eq!(living, desired_world_population);

    sim.lineage_eras.clear();
    sim.lineage_eras.insert(lineage_id.clone(), Era::Information);
    sim.current_era = Era::Information.name().to_string();
    (lineage_id, lineage_population)
}

#[test]
fn small_lineage_advances_when_living_world_meets_population_gate() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xa70a);
    let atomic_gate = Era::Atomic.pop_threshold();
    let (lineage_id, lineage_population) = prepare_atomic_population_gate_world(&mut sim, atomic_gate);

    sim.update_lineage_eras();

    assert!(lineage_population < atomic_gate);
    assert_eq!(sim.lineage_eras.get(&lineage_id), Some(&Era::Atomic));
    assert_eq!(sim.current_era, Era::Atomic.name());
    assert!(sim
        .lineage_eras
        .iter()
        .filter(|(other_id, _)| *other_id != &lineage_id)
        .all(|(_, era)| *era < Era::Atomic));
}

#[test]
fn small_lineage_cannot_advance_before_living_world_meets_population_gate() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xa709);
    let below_atomic_gate = Era::Atomic.pop_threshold() - 1;
    let (lineage_id, _) = prepare_atomic_population_gate_world(&mut sim, below_atomic_gate);

    sim.update_lineage_eras();

    assert_eq!(
        sim.organisms.iter().filter(|org| org.alive).count(),
        below_atomic_gate
    );
    assert_eq!(sim.lineage_eras.get(&lineage_id), Some(&Era::Information));
    assert_eq!(sim.current_era, Era::Information.name());
}

fn prepare_technological_era_boundary(sim: &mut Simulation, era: crate::sim::era::Era) {
    let alive_lineages: rustc_hash::FxHashSet<String> = sim
        .organisms
        .iter()
        .filter(|org| org.alive)
        .map(|org| org.lineage_id.clone())
        .collect();

    sim.tick_count = 1199;
    sim.current_era = era.name().to_string();
    sim.lineage_eras.clear();
    for lineage_id in alive_lineages {
        sim.lineage_eras.insert(lineage_id, era);
    }
    sim.events.clear();
    sim.headlines.clear();
    sim.history.era_history.clear();
}

const ECOLOGICAL_CONDITION_LABELS: [&str; 10] = [
    "extinction",
    "collapse",
    "drought",
    "abundance",
    "growth",
    "expansion",
    "decline",
    "equilibrium",
    "scarcity",
    "recovery",
];

fn is_ecological_condition(label: &str) -> bool {
    ECOLOGICAL_CONDITION_LABELS.contains(&label)
}

fn announces_ecological_era(text: &str) -> bool {
    let text = text.to_ascii_lowercase();
    ECOLOGICAL_CONDITION_LABELS
        .iter()
        .any(|label| text.contains(&format!("the {label} era begins")))
}

#[test]
fn twelve_hundred_tick_boundary_keeps_current_era_technological() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0xe12a);
    prepare_technological_era_boundary(&mut sim, Era::Classical);

    sim.tick();

    assert_eq!(sim.tick_count, 1200);
    assert_eq!(sim.current_era, "classical");
    assert!(sim.history.era_history.is_empty());
    assert!(!sim.events.iter().any(|event| event.etype == "era"));
    assert!(!sim
        .headlines
        .iter()
        .any(|(_, headline)| announces_ecological_era(headline)));
}

#[test]
fn twelve_hundred_tick_boundary_emits_only_real_technological_era_advances() {
    use crate::sim::era::Era;

    let mut sim = Simulation::new(0x7ec4);
    for org in sim.organisms.iter_mut().filter(|org| org.alive) {
        org.discoveries.insert("fire".to_string());
        org.discoveries.insert("stone_tools".to_string());
        org.discoveries.insert("shelter".to_string());
    }
    prepare_technological_era_boundary(&mut sim, Era::PreStone);

    sim.tick();

    assert_eq!(sim.current_era, "stone");
    assert_eq!(
        sim.history
            .era_history
            .iter()
            .map(|entry| entry.era.as_str())
            .collect::<Vec<_>>(),
        vec!["stone"]
    );
    assert!(!sim
        .history
        .era_history
        .iter()
        .any(|entry| is_ecological_condition(&entry.era)));
    assert_eq!(
        sim.events
            .iter()
            .filter(|event| event.etype == "era")
            .map(|event| event.detail.as_str())
            .collect::<Vec<_>>(),
        vec![format!("the stone era begins: {}", Era::Stone.flavour())]
    );
    assert!(!sim
        .headlines
        .iter()
        .any(|(_, headline)| announces_ecological_era(headline)));
}
