use super::*;
use crate::organism::traits::Traits;
use rand::rngs::StdRng;
use rand::SeedableRng;

fn test_org(id: &str, name: &str, lineage: &str, x: f32, y: f32) -> Organism {
    Organism::new(
        id.to_string(),
        name.to_string(),
        x,
        y,
        0,
        String::new(),
        lineage.to_string(),
        5000,
        Traits::default(),
    )
}

#[test]
fn social_knowledge_share_spreads_memories_to_trusted_friend() {
    let mut rng = StdRng::seed_from_u64(0);
    let mut organisms = vec![
        test_org("teacher", "Teacher", "lineage-a", 10.0, 10.0),
        test_org("student", "Student", "lineage-b", 12.0, 10.0),
    ];
    organisms[0].org_trust.insert("student".into(), 0.65);
    organisms[0].lineage_attitudes.insert("lineage-b".into(), 0.25);
    organisms[0].food_memory.insert((40, 10), 0.9);
    organisms[0].water_memory.insert((12, 50), 0.8);
    organisms[0].danger_memory.insert((20, 20), 0.7);

    let spatial = SpatialIndex::build(&organisms, 10);
    social_knowledge_share(0, &mut organisms, &spatial, 42, &mut rng);

    assert!(organisms[1].food_memory.get(&(40, 10)).copied().unwrap_or(0.0) > 0.04);
    assert!(organisms[1].water_memory.get(&(12, 50)).copied().unwrap_or(0.0) > 0.03);
    assert!(organisms[1].danger_memory.get(&(20, 20)).copied().unwrap_or(0.0) > 0.04);
    assert_eq!(organisms[0].thought, "sharing what I know");
}

#[test]
fn social_knowledge_share_does_not_inform_hostile_stranger() {
    let mut rng = StdRng::seed_from_u64(0);
    let mut organisms = vec![
        test_org("speaker", "Speaker", "lineage-a", 10.0, 10.0),
        test_org("stranger", "Stranger", "lineage-b", 11.0, 10.0),
    ];
    organisms[0].lineage_attitudes.insert("lineage-b".into(), -0.50);
    organisms[0].food_memory.insert((40, 10), 0.9);
    organisms[0].danger_memory.insert((20, 20), 0.7);

    let spatial = SpatialIndex::build(&organisms, 10);
    social_knowledge_share(0, &mut organisms, &spatial, 42, &mut rng);

    assert!(organisms[1].food_memory.is_empty());
    assert!(organisms[1].danger_memory.is_empty());
}

#[test]
fn social_knowledge_share_discounts_distrusted_source_claims() {
    let mut rng = StdRng::seed_from_u64(0);
    let mut organisms = vec![
        test_org("speaker", "Speaker", "lineage-a", 10.0, 10.0),
        test_org("trusting", "Trusting", "lineage-b", 11.0, 10.0),
        test_org("skeptic", "Skeptic", "lineage-b", 12.0, 10.0),
    ];
    organisms[0].org_trust.insert("trusting".into(), 0.70);
    organisms[0].org_trust.insert("skeptic".into(), 0.70);
    organisms[0].lineage_attitudes.insert("lineage-b".into(), 0.45);
    organisms[0].food_memory.insert((40, 10), 0.9);
    organisms[0].danger_memory.insert((20, 20), 0.7);
    organisms[1].org_trust.insert("speaker".into(), 0.60);
    organisms[2].org_trust.insert("speaker".into(), -0.60);

    let spatial = SpatialIndex::build(&organisms, 10);
    social_knowledge_share(0, &mut organisms, &spatial, 42, &mut rng);

    let trusting_food = organisms[1].food_memory.get(&(40, 10)).copied().unwrap_or(0.0);
    let skeptic_food = organisms[2].food_memory.get(&(40, 10)).copied().unwrap_or(0.0);
    let trusting_danger = organisms[1].danger_memory.get(&(20, 20)).copied().unwrap_or(0.0);
    let skeptic_danger = organisms[2].danger_memory.get(&(20, 20)).copied().unwrap_or(0.0);

    assert!(trusting_food > skeptic_food);
    assert!(trusting_danger > skeptic_danger);
    assert!(skeptic_danger > skeptic_food);
}

#[test]
fn groom_cares_for_trusted_cross_lineage_friend() {
    let mut organisms = vec![
        test_org("caregiver", "Caregiver", "lineage-a", 10.0, 10.0),
        test_org("friend", "Friend", "lineage-b", 11.0, 10.0),
    ];
    organisms[0].add_friend("friend", "Friend", 1);
    organisms[0].org_trust.insert("friend".into(), 0.60);
    organisms[0].lineage_attitudes.insert("lineage-b".into(), 0.10);
    organisms[1].infection = 0.40;
    organisms[1].grief_ticks = 20;

    let mut events = std::collections::VecDeque::new();
    let spatial = SpatialIndex::build(&organisms, 10);
    let reward = groom(0, &mut organisms, &spatial, 120, &mut events);

    assert_eq!(reward, 0.018);
    assert!(organisms[1].infection < 0.40);
    assert_eq!(organisms[1].grief_ticks, 12);
    assert!(organisms[1].org_trust.get("caregiver").copied().unwrap_or(0.0) >= 0.06);
    assert!(organisms[0].attitude_toward("lineage-b") > 0.10);
    assert!(organisms[1].attitude_toward("lineage-a") > 0.0);
    assert!(events
        .iter()
        .any(|event| event.etype == "social" && event.detail.contains("trusted care")));
}

#[test]
fn groom_ignores_hostile_stranger_without_bond() {
    let mut organisms = vec![
        test_org("caregiver", "Caregiver", "lineage-a", 10.0, 10.0),
        test_org("stranger", "Stranger", "lineage-b", 11.0, 10.0),
    ];
    organisms[0].lineage_attitudes.insert("lineage-b".into(), -0.50);
    organisms[1].infection = 0.40;

    let mut events = std::collections::VecDeque::new();
    let spatial = SpatialIndex::build(&organisms, 10);
    let reward = groom(0, &mut organisms, &spatial, 120, &mut events);

    assert_eq!(reward, 0.0);
    assert_eq!(organisms[1].infection, 0.40);
    assert!(events.is_empty());
    assert_eq!(organisms[0].thought, "grooming (alone)");
}

/// A crowd of hungry and fed people with kin, friends, trust and orphans
/// scattered through it. Energies come from a short list so that exact
/// ties exercise the lowest-index rule.
fn crowd(seed: u64, n: usize) -> Vec<Organism> {
    let mut state = seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    let lineages = ["lineage-a", "lineage-b", "lineage-c"];
    let energies = [0.05f32, 0.10, 0.10, 0.20, 0.29, 0.30, 0.55, 0.90];
    let mut organisms: Vec<Organism> = (0..n)
        .map(|i| {
            let lineage = lineages[(next() % 3) as usize];
            let x = 20.0 + (next() % 160) as f32 / 10.0;
            let y = 20.0 + (next() % 160) as f32 / 10.0;
            let mut o = test_org(&format!("id-{i}"), &format!("Name{i}"), lineage, x, y);
            o.energy = energies[(next() % energies.len() as u64) as usize];
            o.alive = next() % 11 != 0;
            o.parent_id = format!("id-{}", next() % n as u64);
            if next() % 3 == 0 {
                o.father_id = Some(format!("id-{}", next() % n as u64));
            }
            if next() % 4 == 0 {
                o.orphaned_tick = 1000 + next() % 900;
            }
            o
        })
        .collect();
    for i in 0..n {
        for _ in 0..(next() % 4) {
            let other = format!("id-{}", next() % n as u64);
            match next() % 3 {
                0 => {
                    organisms[i].friends.insert(other, "friend".to_string());
                }
                1 => {
                    organisms[i]
                        .org_trust
                        .insert(other, 0.54 + (next() % 5) as f32 * 0.01);
                }
                _ => {
                    organisms[i].org_trust.insert(other, 0.2);
                }
            }
        }
    }
    organisms
}

#[test]
fn food_recipient_matches_the_original_selection() {
    let mut picked = 0;
    for seed in 1..=40u64 {
        let organisms = crowd(seed, 70);
        let spatial = SpatialIndex::build(&organisms, 10);
        let mut candidates = Vec::new();
        for tick in [1_000u64, 1_300, 1_599, 1_650, 2_500] {
            for giver in 0..organisms.len() {
                let fast = pick_food_recipient(giver, &organisms, &spatial, tick, &mut candidates);
                let reference = pick_food_recipient_reference(giver, &organisms, &spatial, tick);
                assert_eq!(fast, reference, "seed {seed} tick {tick} giver {giver}");
                picked += usize::from(fast.is_some());
            }
        }
    }
    assert!(picked > 1_000, "the crowds rarely had anyone to feed: {picked}");
}

#[test]
fn food_recipient_matches_the_original_in_a_lived_in_world() {
    use crate::sim::simulation::Simulation;
    let mut sim = Simulation::new(7);
    sim.tick_n(900);
    // Starve a share of the living so there is someone to feed. Half, not a third: the route search
    // changes where people are at tick 900, and a third of them left too few recipients for the check.
    for (i, o) in sim.organisms.iter_mut().enumerate() {
        if o.alive && i % 2 == 0 {
            o.energy = 0.12 + (i % 5) as f32 * 0.03;
        }
    }
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let mut candidates = Vec::new();
    let mut picked = 0;
    for giver in 0..sim.organisms.len() {
        if !sim.organisms[giver].alive {
            continue;
        }
        let fast = pick_food_recipient(giver, &sim.organisms, &spatial, sim.tick_count, &mut candidates);
        let reference = pick_food_recipient_reference(giver, &sim.organisms, &spatial, sim.tick_count);
        assert_eq!(fast, reference, "giver {giver}");
        picked += usize::from(fast.is_some());
    }
    assert!(picked > 5, "nobody had anyone to feed: {picked}");
}
