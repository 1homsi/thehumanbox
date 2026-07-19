pub mod build_altar;
pub mod convert_follower;
pub mod debate_theology;
pub mod divine_prophecy;
pub mod excommunicate;
pub mod fast_for_vision;
pub mod found_priesthood;
pub mod found_religion;
pub mod inter_faith_ceremony;
pub mod interpret_omen;
pub mod perform_exorcism;
pub mod pilgrimage;
pub mod preach;
pub mod religious_schism;
pub mod sacred_dance;

use super::ctx::ActionCtx;
use crate::sim::culture::{pick_religion_name, Religion, ReligionKind};
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use std::collections::{HashMap, HashSet};

pub(super) const MIN_SCHISM_AGE_TICKS: u64 = 2_000;
pub(super) const MIN_SCHISM_MEMBERS: usize = 3;

fn is_nearby(sim: &Simulation, idx: usize, other_idx: usize) -> bool {
    if idx == other_idx {
        return false;
    }
    let (Some(actor), Some(other)) = (sim.organisms.get(idx), sim.organisms.get(other_idx)) else {
        return false;
    };
    other.alive && (other.x - actor.x).abs() + (other.y - actor.y).abs() <= 6.0
}

/// Dynamic religion requirements shared by action selection and execution.
/// Static era, profession, literacy, and workspace gates remain in
/// `actions::BASE_ACTION_BANDS`; this function owns requirements derived from
/// canonical religion membership and the current nearby population.
pub(crate) fn action_is_possible(
    sim: &Simulation,
    idx: usize,
    action: usize,
    nearby_indices: &[usize],
    tick: u64,
) -> bool {
    let Some(actor) = sim.organisms.get(idx) else {
        return false;
    };
    match action {
        456 => {
            actor.is_elder
                && nearby_indices
                    .iter()
                    .copied()
                    .filter(|&other_idx| {
                        is_nearby(sim, idx, other_idx)
                            && sim.organisms[other_idx].lineage_id == actor.lineage_id
                    })
                    .count()
                    >= 2
                && !sim
                    .religions
                    .iter()
                    .any(|religion| religion.founder_lineage == actor.lineage_id)
        }
        458 => {
            let Some(religion_id) = actor.religion_id.as_deref() else {
                return false;
            };
            sim.religions.iter().any(|religion| religion.id == religion_id)
                && nearby_indices.iter().copied().any(|other_idx| {
                    is_nearby(sim, idx, other_idx)
                        && sim.organisms[other_idx].lineage_id != actor.lineage_id
                        && sim.organisms[other_idx].religion_id.as_deref() != Some(religion_id)
                })
        }
        459 => {
            let Some(religion_id) = actor.religion_id.as_deref() else {
                return false;
            };
            sim.religions.iter().any(|religion| religion.id == religion_id)
                && nearby_indices.iter().copied().any(|other_idx| {
                    is_nearby(sim, idx, other_idx)
                        && sim.organisms[other_idx].lineage_id == actor.lineage_id
                        && sim.organisms[other_idx].religion_id.as_deref() == Some(religion_id)
                })
        }
        469 => {
            let Some(religion_id) = actor.religion_id.as_deref() else {
                return false;
            };
            let Some(parent) = sim.religions.iter().find(|religion| religion.id == religion_id) else {
                return false;
            };
            let nearby_coreligionists = nearby_indices
                .iter()
                .copied()
                .filter(|&other_idx| {
                    is_nearby(sim, idx, other_idx)
                        && sim.organisms[other_idx].lineage_id == actor.lineage_id
                        && sim.organisms[other_idx].religion_id.as_deref() == Some(religion_id)
                })
                .count();
            let total_followers = sim
                .organisms
                .iter()
                .filter(|organism| organism.alive && organism.religion_id.as_deref() == Some(religion_id))
                .count();
            tick.saturating_sub(parent.founded_tick) >= MIN_SCHISM_AGE_TICKS
                && nearby_coreligionists + 1 >= MIN_SCHISM_MEMBERS
                && total_followers > MIN_SCHISM_MEMBERS
        }
        _ => true,
    }
}

pub(super) fn religion_kind_for_era(era: Era) -> ReligionKind {
    if era >= Era::Industrial {
        ReligionKind::Secular
    } else if era >= Era::Classical {
        ReligionKind::Philosophical
    } else if era >= Era::Iron {
        ReligionKind::Monotheism
    } else if era >= Era::Bronze {
        ReligionKind::Polytheism
    } else {
        ReligionKind::Animism
    }
}

fn allocate_religion_id(sim: &mut Simulation) -> String {
    let mut sequence = sim.next_religion_id.max(1);
    loop {
        let id = format!("rel{sequence}");
        sequence = sequence.wrapping_add(1).max(1);
        if sim.religions.iter().all(|religion| religion.id != id) {
            sim.next_religion_id = sequence;
            return id;
        }
    }
}

pub(crate) fn create_religion(
    sim: &mut Simulation,
    kind: ReligionKind,
    founder_lineage: &str,
    founded_tick: u64,
    name_seed: u64,
) -> String {
    let id = allocate_religion_id(sim);
    let base_name = pick_religion_name(name_seed).to_string();
    let mut name = if sim.religions.iter().any(|religion| religion.name == base_name) {
        format!("{base_name} {id}")
    } else {
        base_name.clone()
    };
    let mut suffix = 2_u32;
    while sim.religions.iter().any(|religion| religion.name == name) {
        name = format!("{base_name} {id}-{suffix}");
        suffix = suffix.saturating_add(1);
    }
    sim.religions.push(Religion {
        id: id.clone(),
        kind,
        name,
        founded_tick,
        founder_lineage: founder_lineage.to_string(),
        adherents: 0,
        last_milestone: None,
    });
    id
}

pub(crate) fn recount_religion_adherents(sim: &mut Simulation) {
    let mut counts: HashMap<&str, u32> = HashMap::new();
    for religion_id in sim
        .organisms
        .iter()
        .filter(|organism| organism.alive)
        .filter_map(|organism| organism.religion_id.as_deref())
    {
        *counts.entry(religion_id).or_insert(0) += 1;
    }
    for religion in &mut sim.religions {
        religion.adherents = counts.get(religion.id.as_str()).copied().unwrap_or(0);
    }
}

/// Repair imported religion catalogues before the simulation resumes. IDs are
/// canonical identity, so malformed empty rows are removed and duplicate IDs
/// deterministically keep the earliest-founded record. Organism membership
/// and cached adherent totals are then reconciled against that catalogue.
pub(crate) fn repair_persisted_religions(
    organisms: &mut [crate::organism::organism::Organism],
    religions: &mut Vec<Religion>,
) {
    religions.retain(|religion| !religion.id.trim().is_empty());
    religions.sort_by(|left, right| {
        left.id
            .cmp(&right.id)
            .then_with(|| left.founded_tick.cmp(&right.founded_tick))
            .then_with(|| left.name.cmp(&right.name))
            .then_with(|| left.founder_lineage.cmp(&right.founder_lineage))
            .then_with(|| left.kind.name().cmp(right.kind.name()))
    });
    religions.dedup_by(|left, right| left.id == right.id);

    let valid_ids: HashSet<&str> = religions.iter().map(|religion| religion.id.as_str()).collect();
    let mut live_adherents = HashMap::<String, u32>::new();
    for organism in organisms {
        let Some(religion_id) = organism.religion_id.clone() else {
            continue;
        };
        if !valid_ids.contains(religion_id.as_str()) {
            organism.religion_id = None;
            organism.piety = 0.0;
        } else if organism.alive {
            *live_adherents.entry(religion_id).or_default() += 1;
        }
    }
    for religion in religions {
        religion.adherents = live_adherents.get(&religion.id).copied().unwrap_or(0);
    }
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        456 => found_religion::apply(ctx),
        457 => preach::apply(ctx),
        458 => convert_follower::apply(ctx),
        459 => excommunicate::apply(ctx),
        460 => build_altar::apply(ctx),
        461 => perform_exorcism::apply(ctx),
        462 => divine_prophecy::apply(ctx),
        463 => interpret_omen::apply(ctx),
        464 => fast_for_vision::apply(ctx),
        465 => sacred_dance::apply(ctx),
        466 => pilgrimage::apply(ctx),
        467 => found_priesthood::apply(ctx),
        468 => debate_theology::apply(ctx),
        469 => religious_schism::apply(ctx),
        470 => inter_faith_ceremony::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::spatial::SpatialIndex;
    use crate::world::tiles::Tile;

    const LINEAGE: &str = "faith-test-lineage";
    const FOREIGN_LINEAGE: &str = "foreign-faith-lineage";

    fn prepare_lineage(seed: u64) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(5);
        assert_eq!(sim.organisms.len(), 5, "simulation should seed five founders");
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            organism.alive = true;
            organism.lineage_id = LINEAGE.into();
            organism.x = 100.0 + index as f32;
            organism.y = 100.0;
            organism.age = organism.max_age / 2;
            organism.is_elder = false;
            organism.health = 1.0;
            organism.religion_id = None;
            organism.piety = 0.0;
        }
        sim.grid.set(100, 100, Tile::Grass);
        sim.religions.clear();
        sim.next_religion_id = 1;
        sim
    }

    fn prepare_neighboring_lineages(seed: u64) -> Simulation {
        let mut sim = prepare_lineage(seed);
        for organism in sim.organisms.iter_mut().skip(3) {
            organism.lineage_id = FOREIGN_LINEAGE.into();
        }
        sim
    }

    fn run_action(sim: &mut Simulation, action: usize) -> f32 {
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(sim, 0, 100, 100, &spatial);
        apply(action, &mut ctx)
    }

    fn nearby_indices(sim: &Simulation) -> Vec<usize> {
        SpatialIndex::build(&sim.organisms, 10).query(100, 100, 6)
    }

    fn religion<'a>(sim: &'a Simulation, id: &str) -> &'a Religion {
        sim.religions
            .iter()
            .find(|religion| religion.id == id)
            .expect("religion should exist")
    }

    fn add_religion(
        sim: &mut Simulation,
        id: &str,
        name: &str,
        kind: ReligionKind,
        founder_lineage: &str,
        founded_tick: u64,
    ) {
        sim.religions.push(Religion {
            id: id.into(),
            kind,
            name: name.into(),
            founded_tick,
            founder_lineage: founder_lineage.into(),
            adherents: 0,
            last_milestone: None,
        });
    }

    #[test]
    fn founding_creates_one_real_religion_without_reusing_an_existing_id() {
        let mut sim = prepare_lineage(0xFA_0001);
        sim.tick_count = 77;
        sim.organisms[0].is_elder = true;
        sim.lineage_eras.insert(LINEAGE.into(), Era::Bronze);
        add_religion(
            &mut sim,
            "rel1",
            "Distant Faith",
            ReligionKind::Animism,
            FOREIGN_LINEAGE,
            1,
        );
        sim.next_religion_id = 1;

        assert!(run_action(&mut sim, 456) > 0.0);

        let founded = sim
            .religions
            .iter()
            .find(|religion| religion.founder_lineage == LINEAGE)
            .expect("founding should add a canonical religion");
        assert_eq!(founded.id, "rel2");
        assert_eq!(founded.kind, ReligionKind::Polytheism);
        assert_eq!(founded.founded_tick, 77);
        assert_eq!(founded.adherents, 5);
        assert_eq!(sim.next_religion_id, 3);
        assert!(sim
            .organisms
            .iter()
            .all(|organism| organism.religion_id.as_deref() == Some("rel2")));

        assert_eq!(run_action(&mut sim, 456), 0.0);
        assert_eq!(
            sim.religions
                .iter()
                .filter(|religion| religion.founder_lineage == LINEAGE)
                .count(),
            1,
            "one lineage must not create duplicate organised religions"
        );
    }

    #[test]
    fn conversion_reassigns_a_follower_and_refreshes_both_counts() {
        let mut sim = prepare_neighboring_lineages(0xFA_0002);
        add_religion(
            &mut sim,
            "rel1",
            "Hearth Faith",
            ReligionKind::Animism,
            LINEAGE,
            1,
        );
        add_religion(
            &mut sim,
            "rel2",
            "River Way",
            ReligionKind::Polytheism,
            FOREIGN_LINEAGE,
            2,
        );
        for organism in sim.organisms.iter_mut().take(3) {
            organism.religion_id = Some("rel1".into());
        }
        for organism in sim.organisms.iter_mut().skip(3) {
            organism.religion_id = Some("rel2".into());
        }
        recount_religion_adherents(&mut sim);

        assert!(run_action(&mut sim, 458) > 0.0);

        assert_eq!(religion(&sim, "rel1").adherents, 4);
        assert_eq!(religion(&sim, "rel2").adherents, 1);
        let converted: Vec<_> = sim
            .organisms
            .iter()
            .filter(|organism| organism.lineage_id == FOREIGN_LINEAGE)
            .filter(|organism| organism.religion_id.as_deref() == Some("rel1"))
            .collect();
        assert_eq!(converted.len(), 1);
        assert!(converted[0].piety >= 0.20);
    }

    #[test]
    fn excommunication_clears_membership_and_piety() {
        let mut sim = prepare_lineage(0xFA_0003);
        add_religion(&mut sim, "rel1", "Old Song", ReligionKind::Animism, LINEAGE, 1);
        for organism in &mut sim.organisms {
            organism.religion_id = Some("rel1".into());
            organism.piety = 0.7;
        }
        recount_religion_adherents(&mut sim);

        assert!(run_action(&mut sim, 459) > 0.0);

        assert_eq!(religion(&sim, "rel1").adherents, 4);
        assert_eq!(sim.organisms[0].religion_id.as_deref(), Some("rel1"));
        let excommunicated: Vec<_> = sim
            .organisms
            .iter()
            .skip(1)
            .filter(|organism| organism.religion_id.is_none())
            .collect();
        assert_eq!(excommunicated.len(), 1);
        assert_eq!(excommunicated[0].piety, 0.0);
    }

    #[test]
    fn dynamic_availability_matches_founding_conversion_and_excommunication_state() {
        let mut sim = prepare_lineage(0xFA_0010);
        let nearby = nearby_indices(&sim);
        assert!(!action_is_possible(&sim, 0, 456, &nearby, sim.tick_count));

        sim.organisms[0].is_elder = true;
        for organism in sim.organisms.iter_mut().skip(2) {
            organism.x = 300.0;
            organism.y = 300.0;
        }
        let nearby = nearby_indices(&sim);
        assert!(!action_is_possible(&sim, 0, 456, &nearby, sim.tick_count));

        sim.organisms[2].x = 102.0;
        sim.organisms[2].y = 100.0;
        let nearby = nearby_indices(&sim);
        assert!(action_is_possible(&sim, 0, 456, &nearby, sim.tick_count));

        add_religion(
            &mut sim,
            "rel1",
            "Hearth Faith",
            ReligionKind::Animism,
            LINEAGE,
            1,
        );
        assert!(!action_is_possible(&sim, 0, 456, &nearby, sim.tick_count));
        assert!(!action_is_possible(&sim, 0, 458, &nearby, sim.tick_count));
        assert!(!action_is_possible(&sim, 0, 459, &nearby, sim.tick_count));

        sim.organisms[0].religion_id = Some("rel1".into());
        sim.organisms[1].religion_id = Some("rel1".into());
        assert!(action_is_possible(&sim, 0, 459, &nearby, sim.tick_count));
        assert!(!action_is_possible(&sim, 0, 458, &nearby, sim.tick_count));

        sim.organisms[2].lineage_id = FOREIGN_LINEAGE.into();
        let nearby = nearby_indices(&sim);
        assert!(action_is_possible(&sim, 0, 458, &nearby, sim.tick_count));
        sim.organisms[2].religion_id = Some("rel1".into());
        assert!(!action_is_possible(&sim, 0, 458, &nearby, sim.tick_count));
    }

    #[test]
    fn schism_requires_a_fourth_follower_to_leave_with_the_parent() {
        let mut sim = prepare_lineage(0xFA_0011);
        sim.tick_count = 3_000;
        add_religion(&mut sim, "rel1", "Old Path", ReligionKind::Monotheism, LINEAGE, 1);
        for organism in sim.organisms.iter_mut().take(3) {
            organism.religion_id = Some("rel1".into());
        }
        recount_religion_adherents(&mut sim);

        let nearby = nearby_indices(&sim);
        assert!(!action_is_possible(&sim, 0, 469, &nearby, sim.tick_count));
        assert_eq!(run_action(&mut sim, 469), 0.0);
        assert_eq!(sim.religions.len(), 1);

        sim.organisms[3].religion_id = Some("rel1".into());
        recount_religion_adherents(&mut sim);
        let nearby = nearby_indices(&sim);
        assert!(action_is_possible(&sim, 0, 469, &nearby, sim.tick_count));
        assert!(run_action(&mut sim, 469) > 0.0);
        assert_eq!(religion(&sim, "rel1").adherents, 1);
        assert_eq!(
            sim.religions
                .iter()
                .map(|religion| religion.adherents)
                .sum::<u32>(),
            4
        );
    }

    #[test]
    fn schism_creates_a_distinct_sect_and_moves_three_adherents() {
        let mut sim = prepare_lineage(0xFA_0004);
        sim.tick_count = 3_000;
        add_religion(
            &mut sim,
            "rel1",
            "Ancestor Flame",
            ReligionKind::Monotheism,
            LINEAGE,
            10,
        );
        sim.next_religion_id = 2;
        for organism in &mut sim.organisms {
            organism.religion_id = Some("rel1".into());
            organism.piety = 0.1;
        }
        recount_religion_adherents(&mut sim);

        assert!(run_action(&mut sim, 469) > 0.0);

        assert_eq!(sim.religions.len(), 2);
        let sect = sim
            .religions
            .iter()
            .find(|religion| religion.id != "rel1")
            .expect("schism should add a sect");
        assert_ne!(sect.id, "rel1");
        assert_ne!(sect.name, "Ancestor Flame");
        assert_eq!(sect.kind, ReligionKind::Monotheism);
        assert_eq!(sect.founded_tick, 3_000);
        assert_eq!(sect.adherents, 3);
        assert_eq!(religion(&sim, "rel1").adherents, 2);
        assert_eq!(sim.organisms[0].religion_id.as_deref(), Some(sect.id.as_str()));

        assert_eq!(run_action(&mut sim, 469), 0.0);
        assert_eq!(
            sim.religions.len(),
            2,
            "a new sect cannot immediately split again"
        );
    }

    #[test]
    fn founded_religion_survives_save_and_load() {
        let mut sim = prepare_lineage(0xFA_0005);
        sim.tick_count = 99;
        sim.organisms[0].is_elder = true;
        assert!(run_action(&mut sim, 456) > 0.0);
        let founded_id = sim.organisms[0]
            .religion_id
            .clone()
            .expect("founder should join the religion");
        let expected = religion(&sim, &founded_id).clone();

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());

        let loaded_religion = religion(&loaded, &founded_id);
        assert_eq!(loaded_religion.id, expected.id);
        assert_eq!(loaded_religion.name, expected.name);
        assert_eq!(loaded_religion.kind, expected.kind);
        assert_eq!(loaded_religion.founded_tick, expected.founded_tick);
        assert_eq!(loaded_religion.founder_lineage, expected.founder_lineage);
        assert_eq!(loaded_religion.adherents, expected.adherents);
        assert_eq!(
            loaded.organisms[0].religion_id.as_deref(),
            Some(founded_id.as_str())
        );
        assert!(loaded.next_religion_id > 1);
    }
}
