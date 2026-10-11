use crate::hashing::{FxHashMap as HashMap, FxHashSet as HashSet};
use rand::RngExt;
use rand_chacha::ChaCha8Rng;
use std::collections::VecDeque;

use super::tech_tree::all_tech;
use crate::organism::organism::Organism;
use crate::sim::civ::government::{Government, LawKind};
use crate::sim::simulation::Event;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::sim::world_events::push_event;

const TICK_INTERVAL: u64 = 40;
const BASE_RATE: f32 = 0.012;
/// Tiles between a tribe's dwellings and a farming tribe's dwellings for the farming to carry over.
const FARMING_NEIGHBOUR_REACH: i32 = 24;
/// How much faster a tribe with a farming neighbour makes the discovery of agriculture.
const FARMING_NEIGHBOUR_BOOST: f32 = 1.6;

pub fn tick_tech_progress(
    tick: u64,
    rng: &mut ChaCha8Rng,
    organisms: &mut [Organism],
    events: &mut VecDeque<Event>,
    lineage_names: &HashMap<String, String>,
    buildings: &[Building],
    governments: &HashMap<String, Government>,
) {
    if tick == 0 || !tick.is_multiple_of(TICK_INTERVAL) {
        return;
    }

    // One pass over the living, borrowing every name: a lineage id and its
    // discoveries are copied once per lineage, not once per person.
    struct Tribe<'a> {
        discoveries: HashSet<&'a str>,
        members: Vec<usize>,
    }
    let mut tribes: HashMap<&str, Tribe> = HashMap::default();
    for (i, org) in organisms.iter().enumerate() {
        if !org.alive {
            continue;
        }
        let tribe = tribes.entry(org.lineage_id.as_str()).or_insert_with(|| Tribe {
            discoveries: HashSet::default(),
            members: Vec::new(),
        });
        for d in org.discoveries.iter() {
            tribe.discoveries.insert(d.as_str());
        }
        tribe.members.push(i);
    }
    // The research loop below changes `organisms`, so the tribes it walks must
    // own their names.
    let mut tribes: Vec<(String, HashSet<String>, Vec<usize>)> = tribes
        .into_iter()
        .map(|(lineage, tribe)| {
            (
                lineage.to_string(),
                tribe.discoveries.into_iter().map(str::to_string).collect(),
                tribe.members,
            )
        })
        .collect();

    let tech = all_tech();

    // Iterate lineages in sorted order. This loop draws from `rng` for
    // every candidate node, so `HashMap` iteration order decided which
    // lineage consumed which slice of the shared stream — and therefore
    // which lineage got which invention on which tick. (The comparator
    // further down also drew from `rng`, so the number of draws depended
    // on `max_by`'s internal comparison pattern; that is hoisted out too.)
    tribes.sort_by(|a, b| a.0.cmp(&b.0));
    let neighbours_farm = farming_neighbours(&tribes, buildings);
    for (lid, disc, members) in &tribes {
        let pop = members.len();
        if pop == 0 {
            continue;
        }

        let pop_factor = (0.75 + pop as f32 / 6.0).clamp(0.75, 6.0);
        let profile = research_profile(tick, lid, members, organisms, buildings, governments.get(lid));

        for node in tech.iter() {
            if disc.contains(node.name) {
                continue;
            }
            if !node.prerequisites.iter().all(|p| disc.contains(*p)) {
                continue;
            }
            if !research_requirements_met(node.era, &profile) {
                continue;
            }

            let evidence = evidence_multiplier(node.name, &profile);
            let learned_from_neighbours =
                node.name == "agriculture" && neighbours_farm.contains(lid.as_str());
            let boost = if learned_from_neighbours {
                FARMING_NEIGHBOUR_BOOST
            } else {
                1.0
            };
            let p = (BASE_RATE * node.discovery_rate * pop_factor * profile.capacity * evidence * boost)
                .min(0.85);
            if rng.random::<f32>() >= p {
                continue;
            }

            // Discoveries come from the people best positioned to make them,
            // with a small random term so one permanent genius does not author
            // an entire civilization's history. The jitter is drawn once per
            // candidate up front: drawing it inside `max_by` made the number
            // of RNG draws depend on the comparator's internal call pattern
            // rather than on the roster.
            let jitter: Vec<f32> = members.iter().map(|_| rng.random::<f32>() * 0.15).collect();
            let pick = members
                .iter()
                .copied()
                .enumerate()
                .max_by(|(ai, a), (bi, b)| {
                    let a_score = researcher_score(&organisms[*a]) + jitter[*ai];
                    let b_score = researcher_score(&organisms[*b]) + jitter[*bi];
                    a_score.total_cmp(&b_score)
                })
                // `max_by` yields the *enumerated* item, so the winner has to
                // be looked up through the enumerate index, not the organism
                // index it carries.
                .map(|(member_slot, _)| members[member_slot])
                .unwrap_or(members[0]);
            organisms[pick].discoveries.insert(node.name.to_string());
            let name = organisms[pick].name.clone();
            let lname = lineage_names.get(lid).cloned().unwrap_or_else(|| lid.clone());
            let detail = if learned_from_neighbours {
                format!("{lname} learned farming from its neighbours")
            } else {
                format!("{} discovered {}", lname, node.name.replace('_', " "))
            };
            push_event(events, tick, "build", &name, &detail);
        }

        spread_tribal_knowledge(rng, organisms, members, disc, profile.literacy);
    }
}

/// The tribes that have no farming of their own but live within `FARMING_NEIGHBOUR_REACH` tiles
/// of a tribe that farms. Farming crosses a border like a fence does not: a neighbour's fields
/// are seen, and their seed and their tools are traded over the hedge. Walks tribes in sorted
/// order and only asks whether a dwelling is near, so the same seed gives the same answer.
fn farming_neighbours(
    tribes: &[(String, HashSet<String>, Vec<usize>)],
    buildings: &[Building],
) -> HashSet<String> {
    let mut dwellings: std::collections::BTreeMap<&str, Vec<(i32, i32)>> = std::collections::BTreeMap::new();
    for b in buildings {
        if !b.is_operational() || !matches!(b.kind, BuildingKind::Hut | BuildingKind::House) {
            continue;
        }
        if let Some(owner) = b.owner_lineage.as_deref() {
            dwellings.entry(owner).or_default().push((b.x, b.y));
        }
    }
    let farmers: Vec<&str> = tribes
        .iter()
        .filter(|(_, known, _)| known.contains("agriculture"))
        .map(|(lid, _, _)| lid.as_str())
        .collect();
    let mut near = HashSet::default();
    for (lid, known, _) in tribes {
        if known.contains("agriculture") {
            continue;
        }
        let Some(mine) = dwellings.get(lid.as_str()) else {
            continue;
        };
        let touches = farmers.iter().filter(|&&f| f != lid.as_str()).any(|&f| {
            dwellings.get(f).is_some_and(|theirs| {
                theirs.iter().any(|&(tx, ty)| {
                    mine.iter()
                        .any(|&(mx, my)| (tx - mx).abs().max((ty - my).abs()) <= FARMING_NEIGHBOUR_REACH)
                })
            })
        });
        if touches {
            near.insert(lid.clone());
        }
    }
    near
}

/// What one member of a tribe knows slowly becomes common knowledge: each
/// research tick every known discovery may pass to one more member, faster in
/// a literate tribe. Without this the discoveries that unlock new eras sat
/// with a handful of people and were lost when they died.
fn spread_tribal_knowledge(
    rng: &mut ChaCha8Rng,
    organisms: &mut [Organism],
    members: &[usize],
    known: &HashSet<String>,
    literacy: f32,
) {
    let chance = 0.02 + literacy.clamp(0.0, 1.0) * 0.10;
    // Sorted so the RNG draws don't depend on hash-set iteration order.
    let mut discoveries: Vec<&String> = known.iter().collect();
    discoveries.sort_unstable();
    let mut learners: Vec<usize> = Vec::new();
    for discovery in discoveries {
        if rng.random::<f32>() >= chance {
            continue;
        }
        learners.clear();
        learners.extend(members.iter().copied().filter(|&m| {
            let o = &organisms[m];
            o.alive && o.age >= 300 && !o.discoveries.contains(discovery.as_str())
        }));
        if learners.is_empty() {
            continue;
        }
        let pick = learners[rng.random_range(0..learners.len())];
        organisms[pick].discoveries.insert(discovery.clone());
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct ResearchProfile {
    capacity: f32,
    literacy: f32,
    scholars: usize,
    makers: usize,
    healers: usize,
    food_workers: usize,
    research_sites: f32,
    laboratory_capacity: f32,
    recent_experiments: usize,
    /// Operational dwellings the tribe owns per member, capped at one. A tribe
    /// that lives in houses has ground to sow near them, so farming discoveries
    /// come easier to settled tribes than to camps that only forage.
    settled: f32,
}

fn research_profile(
    tick: u64,
    lineage_id: &str,
    members: &[usize],
    organisms: &[Organism],
    buildings: &[Building],
    government: Option<&Government>,
) -> ResearchProfile {
    let mut literacy = 0.0;
    let mut curiosity = 0.0;
    let mut wealth = 0u64;
    let mut scholars = 0usize;
    let mut makers = 0usize;
    let mut healers = 0usize;
    let mut food_workers = 0usize;
    let mut recent_experiments = 0usize;
    for &index in members {
        let org = &organisms[index];
        literacy += org.literacy;
        curiosity += org.traits.curiosity;
        wealth = wealth.saturating_add(u64::from(org.wealth));
        match org.specialty.as_deref() {
            Some("scholar" | "teacher" | "scribe") => scholars += 1,
            Some("engineer" | "programmer" | "smith" | "builder") => makers += 1,
            Some("healer" | "doctor") => healers += 1,
            Some("farmer" | "hunter") => food_workers += 1,
            _ => {}
        }
        if org.last_experiment_tick > 0 && tick.saturating_sub(org.last_experiment_tick) <= 6_000 {
            recent_experiments += 1;
        }
    }
    let count = members.len().max(1) as f32;
    let literacy_avg = literacy / count;
    let curiosity_avg = curiosity / count;
    let specialist_ratio = (scholars + makers) as f32 / count;
    let research_sites = buildings
        .iter()
        .filter(|building| building.owner_lineage.as_deref() == Some(lineage_id) && building.is_operational())
        .map(|building| research_site_weight(building.kind))
        .sum::<f32>();
    let laboratory_capacity = buildings
        .iter()
        .filter(|building| building.owner_lineage.as_deref() == Some(lineage_id) && building.is_operational())
        .map(|building| laboratory_weight(building.kind))
        .sum::<f32>();
    let dwellings = buildings
        .iter()
        .filter(|building| {
            building.owner_lineage.as_deref() == Some(lineage_id)
                && building.is_operational()
                && matches!(building.kind, BuildingKind::Hut | BuildingKind::House)
        })
        .count() as f32;
    let settled = (dwellings / count).min(1.0);
    let treasury_factor = government
        .map(|government| (government.treasury as f32 / (count * 30.0)).min(0.35))
        .unwrap_or(0.0);
    let law_factor = government
        .map(|government| {
            (if government.has_law(LawKind::Education) {
                0.20
            } else {
                0.0
            }) + (if government.has_law(LawKind::FreedomOfSpeech) {
                0.10
            } else {
                0.0
            }) + (if government.has_law(LawKind::DigitalRights) {
                0.08
            } else {
                0.0
            })
        })
        .unwrap_or(0.0);
    let wealth_factor = (wealth as f32 / (count * 20.0)).min(0.25);
    let experimentation_factor = (recent_experiments as f32 / count).min(0.35);
    let capacity = (0.08
        + literacy_avg * 0.70
        + curiosity_avg * 0.35
        + specialist_ratio * 1.8
        + research_sites.min(1.4)
        + laboratory_capacity.min(0.8)
        + experimentation_factor
        + treasury_factor
        + law_factor
        + wealth_factor)
        .clamp(0.05, 3.5);
    ResearchProfile {
        capacity,
        literacy: literacy_avg,
        scholars,
        makers,
        healers,
        food_workers,
        research_sites,
        laboratory_capacity,
        recent_experiments,
        settled,
    }
}

fn research_site_weight(kind: BuildingKind) -> f32 {
    match kind {
        BuildingKind::School => 0.12,
        BuildingKind::Library => 0.20,
        BuildingKind::University => 0.32,
        BuildingKind::Observatory => 0.30,
        BuildingKind::ResearchLab => 0.48,
        BuildingKind::Datacenter => 0.24,
        BuildingKind::NeuralHub => 0.40,
        BuildingKind::AiCore => 0.55,
        _ => 0.0,
    }
}

fn laboratory_weight(kind: BuildingKind) -> f32 {
    match kind {
        BuildingKind::University => 0.18,
        BuildingKind::Observatory => 0.20,
        BuildingKind::ResearchLab => 0.55,
        BuildingKind::Datacenter => 0.22,
        BuildingKind::NeuralHub => 0.40,
        BuildingKind::AiCore => 0.50,
        _ => 0.0,
    }
}

/// Primitive discoveries can emerge from direct practice. Formal knowledge
/// increasingly requires literate specialists, institutions, and recent
/// experimental work; modern science additionally needs an operational lab.
/// A working lab is where its experiments happen, so it is the lab that is
/// required: hands-on experiments are rare in a village, and demanding them
/// as well left tribes stuck at the Space age for good.
fn research_requirements_met(era: crate::sim::civ::era::Era, profile: &ResearchProfile) -> bool {
    use crate::sim::civ::era::Era;

    let specialists = profile.scholars + profile.makers + profile.healers;
    let practitioners = specialists + profile.food_workers;
    if era <= Era::Stone {
        true
    } else if era <= Era::Bronze {
        practitioners > 0 || profile.recent_experiments > 0
    } else if era <= Era::Medieval {
        profile.literacy >= 0.05 && (specialists > 0 || profile.recent_experiments > 0)
    } else if era <= Era::Industrial {
        profile.literacy >= 0.15
            && specialists > 0
            && (profile.recent_experiments > 0 || profile.research_sites > 0.0)
    } else {
        profile.literacy >= 0.30 && specialists > 0 && profile.laboratory_capacity > 0.0
    }
}

fn evidence_multiplier(discovery: &str, profile: &ResearchProfile) -> f32 {
    let lower = discovery.to_ascii_lowercase();
    let practice = if lower.contains("medicine")
        || lower.contains("health")
        || lower.contains("surgery")
        || lower.contains("vaccine")
    {
        profile.healers as f32 * 0.08 + profile.research_sites * 0.20
    } else if lower.contains("farm")
        || lower.contains("crop")
        || lower.contains("food")
        || lower.contains("agri")
    {
        // Settled tribes (a house for most of the people) learn to sow.
        profile.food_workers as f32 * 0.06 + profile.settled * 0.6
    } else if lower.contains("engine")
        || lower.contains("machine")
        || lower.contains("space")
        || lower.contains("orbit")
        || lower.contains("quantum")
        || lower.contains("computer")
    {
        profile.makers as f32 * 0.07 + profile.research_sites * 0.22
    } else {
        (profile.scholars + profile.makers) as f32 * 0.025
    };
    let experimentation = (profile.recent_experiments as f32 * 0.05).min(0.30);
    (0.20 + profile.literacy * 0.35 + practice + experimentation).clamp(0.10, 1.8)
}

fn researcher_score(org: &Organism) -> f32 {
    let specialty = match org.specialty.as_deref() {
        Some("scholar" | "teacher" | "scribe") => 0.35,
        Some("engineer" | "programmer" | "doctor") => 0.25,
        _ => 0.0,
    };
    org.literacy * 0.45 + org.traits.curiosity * 0.35 + specialty
}

pub fn seed_baseline_discoveries(organisms: &mut [Organism], tick: u64) {
    for org in organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        if !org.discoveries.contains("foraging") {
            org.discoveries.insert("foraging".to_string());
        }
        if tick >= 1200 && org.age > 200 && !org.discoveries.contains("fire") {
            org.discoveries.insert("fire".to_string());
        }
        if tick >= 2400 && org.age > 400 && !org.discoveries.contains("shelter") {
            org.discoveries.insert("shelter".to_string());
        }
        if tick >= 3600
            && org.age > 600
            && !org.discoveries.contains("stone_tools")
            && org.discoveries.contains("fire")
        {
            org.discoveries.insert("stone_tools".to_string());
        }
    }
}

/// The aggregation as it was before borrowing, kept to check the new one against.
#[cfg(test)]
fn tick_tech_progress_reference(
    tick: u64,
    rng: &mut ChaCha8Rng,
    organisms: &mut [Organism],
    events: &mut VecDeque<Event>,
    lineage_names: &HashMap<String, String>,
    buildings: &[Building],
    governments: &HashMap<String, Government>,
) {
    if tick == 0 || !tick.is_multiple_of(TICK_INTERVAL) {
        return;
    }

    let mut lineage_discoveries: HashMap<String, HashSet<String>> = HashMap::default();
    let mut lineage_pop: HashMap<String, usize> = HashMap::default();
    let mut lineage_members: HashMap<String, Vec<usize>> = HashMap::default();
    for (i, org) in organisms.iter().enumerate() {
        if !org.alive {
            continue;
        }
        let entry = lineage_discoveries.entry(org.lineage_id.clone()).or_default();
        for d in org.discoveries.iter() {
            entry.insert(d.clone());
        }
        *lineage_pop.entry(org.lineage_id.clone()).or_insert(0) += 1;
        lineage_members.entry(org.lineage_id.clone()).or_default().push(i);
    }

    let tech = all_tech();

    // Iterate lineages in sorted order. This loop draws from `rng` for
    // every candidate node, so `HashMap` iteration order decided which
    // lineage consumed which slice of the shared stream — and therefore
    // which lineage got which invention on which tick. (The comparator
    // further down also drew from `rng`, so the number of draws depended
    // on `max_by`'s internal comparison pattern; that is hoisted out too.)
    let mut lineage_ids: Vec<&String> = lineage_discoveries.keys().collect();
    lineage_ids.sort();
    let neighbours_farm = {
        let mut all: Vec<(String, HashSet<String>, Vec<usize>)> = lineage_discoveries
            .iter()
            .map(|(l, d)| {
                (
                    l.clone(),
                    d.clone(),
                    lineage_members.get(l).cloned().unwrap_or_default(),
                )
            })
            .collect();
        all.sort_by(|a, b| a.0.cmp(&b.0));
        farming_neighbours(&all, buildings)
    };
    for lid in lineage_ids {
        let Some(disc) = lineage_discoveries.get(lid) else {
            continue;
        };
        let pop = *lineage_pop.get(lid).unwrap_or(&0);
        if pop == 0 {
            continue;
        }

        let pop_factor = (0.75 + pop as f32 / 6.0).clamp(0.75, 6.0);
        let members = match lineage_members.get(lid) {
            Some(members) if !members.is_empty() => members,
            _ => continue,
        };
        let profile = research_profile(tick, lid, members, organisms, buildings, governments.get(lid));

        for node in tech.iter() {
            if disc.contains(node.name) {
                continue;
            }
            if !node.prerequisites.iter().all(|p| disc.contains(*p)) {
                continue;
            }
            if !research_requirements_met(node.era, &profile) {
                continue;
            }

            let evidence = evidence_multiplier(node.name, &profile);
            let learned_from_neighbours =
                node.name == "agriculture" && neighbours_farm.contains(lid.as_str());
            let boost = if learned_from_neighbours {
                FARMING_NEIGHBOUR_BOOST
            } else {
                1.0
            };
            let p = (BASE_RATE * node.discovery_rate * pop_factor * profile.capacity * evidence * boost)
                .min(0.85);
            if rng.random::<f32>() >= p {
                continue;
            }

            // Discoveries come from the people best positioned to make them,
            // with a small random term so one permanent genius does not author
            // an entire civilization's history. The jitter is drawn once per
            // candidate up front: drawing it inside `max_by` made the number
            // of RNG draws depend on the comparator's internal call pattern
            // rather than on the roster.
            let jitter: Vec<f32> = members.iter().map(|_| rng.random::<f32>() * 0.15).collect();
            let pick = members
                .iter()
                .copied()
                .enumerate()
                .max_by(|(ai, a), (bi, b)| {
                    let a_score = researcher_score(&organisms[*a]) + jitter[*ai];
                    let b_score = researcher_score(&organisms[*b]) + jitter[*bi];
                    a_score.total_cmp(&b_score)
                })
                // `max_by` yields the *enumerated* item, so the winner has to
                // be looked up through the enumerate index, not the organism
                // index it carries.
                .map(|(member_slot, _)| members[member_slot])
                .unwrap_or(members[0]);
            organisms[pick].discoveries.insert(node.name.to_string());
            let name = organisms[pick].name.clone();
            let lname = lineage_names.get(lid).cloned().unwrap_or_else(|| lid.clone());
            let detail = if learned_from_neighbours {
                format!("{lname} learned farming from its neighbours")
            } else {
                format!("{} discovered {}", lname, node.name.replace('_', " "))
            };
            push_event(events, tick, "build", &name, &detail);
        }

        spread_tribal_knowledge(rng, organisms, members, disc, profile.literacy);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::government::{GovernmentKind, Law};
    use crate::sim::simulation::Simulation;

    #[test]
    fn tribal_knowledge_spreads_to_members_who_lack_it() {
        let mut sim = Simulation::new(1);
        let lineage = sim.organisms[0].lineage_id.clone();
        let members: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lineage)
            .map(|(i, _)| i)
            .collect();
        assert!(members.len() >= 2);
        for &m in &members {
            sim.organisms[m].age = 1000;
            sim.organisms[m].discoveries.remove("printing");
        }
        sim.organisms[members[0]]
            .discoveries
            .insert("printing".to_string());
        let known: HashSet<String> = ["printing".to_string()].into_iter().collect();

        let mut rng = <ChaCha8Rng as rand::SeedableRng>::seed_from_u64(9);
        for _ in 0..200 {
            spread_tribal_knowledge(&mut rng, &mut sim.organisms, &members, &known, 1.0);
        }
        let knowers = members
            .iter()
            .filter(|&&m| sim.organisms[m].discoveries.contains("printing"))
            .count();
        assert!(knowers >= 2, "the discovery reached another member");
    }

    #[test]
    fn scholars_literacy_and_institutions_raise_research_capacity() {
        let mut sim = Simulation::new(91);
        let indices: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter_map(|(index, org)| org.alive.then_some(index))
            .collect();
        let lineage = sim.organisms[indices[0]].lineage_id.clone();
        let baseline = research_profile(10_000, &lineage, &indices, &sim.organisms, &[], None).capacity;

        for &index in &indices {
            sim.organisms[index].literacy = 0.85;
            sim.organisms[index].specialty = Some("scholar".into());
        }
        let mut library = Building::new(1, BuildingKind::Library, 5, 5, Some(lineage.clone()), 1);
        library.condition = 1.0;
        let mut government = Government::new(lineage.clone(), GovernmentKind::Republic, 1);
        government.treasury = 100;
        government.laws.push(Law {
            kind: LawKind::Education,
            enacted_tick: 2,
        });
        sim.organisms[indices[0]].last_experiment_tick = 9_900;
        let developed = research_profile(
            10_000,
            &lineage,
            &indices,
            &sim.organisms,
            &[library],
            Some(&government),
        )
        .capacity;
        assert!(developed > baseline + 0.5);
    }

    #[test]
    fn evidence_connects_specialists_to_their_fields() {
        let base = ResearchProfile {
            capacity: 1.0,
            literacy: 0.5,
            ..ResearchProfile::default()
        };
        let mut medical = base;
        medical.healers = 4;
        assert!(
            evidence_multiplier("vaccine_research", &medical)
                > evidence_multiplier("vaccine_research", &base)
        );

        let mut engineering = base;
        engineering.makers = 4;
        engineering.research_sites = 1.0;
        assert!(
            evidence_multiplier("orbital_engineering", &engineering)
                > evidence_multiplier("orbital_engineering", &base)
        );
    }

    #[test]
    fn formal_and_modern_research_have_real_readiness_gates() {
        use crate::sim::civ::era::Era;

        let empty = ResearchProfile::default();
        assert!(research_requirements_met(Era::Stone, &empty));
        assert!(!research_requirements_met(Era::Iron, &empty));
        assert!(!research_requirements_met(Era::Modern, &empty));

        let formal = ResearchProfile {
            literacy: 0.45,
            scholars: 1,
            research_sites: 0.2,
            ..ResearchProfile::default()
        };
        assert!(research_requirements_met(Era::Renaissance, &formal));
        assert!(!research_requirements_met(Era::Modern, &formal));

        let with_lab = ResearchProfile {
            laboratory_capacity: 0.2,
            ..formal
        };
        assert!(research_requirements_met(Era::Modern, &with_lab));
        assert!(research_requirements_met(Era::Eldritch, &with_lab));
        let unlettered = ResearchProfile {
            literacy: 0.1,
            ..with_lab
        };
        assert!(!research_requirements_met(Era::Eldritch, &unlettered));
    }

    /// Builds a mature tribe (lettered, specialised, with a lab and fresh
    /// experiments) and returns the tick each era's secrets were all known.
    fn era_timeline(
        seed: u64,
        members: usize,
        horizon: u64,
        literacy: f32,
        scholar_every: usize,
        experiment_every: usize,
    ) -> Vec<(crate::sim::civ::era::Era, u64)> {
        use crate::sim::civ::era::{determine_era_for_lineage, Era, LADDER};
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(members);
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.lineage_id = "L".into();
            o.alive = true;
            o.literacy = literacy;
            o.specialty = (i % scholar_every == 0).then(|| "scholar".to_string());
        }
        for o in sim.organisms.iter_mut() {
            for d in ["foraging", "fire", "shelter", "stone_tools"] {
                o.discoveries.insert(d.to_string());
            }
        }
        let lineage_names: HashMap<String, String> = HashMap::default();
        let mut lab = Building::new(1, BuildingKind::ResearchLab, 5, 5, Some("L".into()), 1);
        lab.condition = 1.0;
        let mut library = Building::new(2, BuildingKind::Library, 6, 6, Some("L".into()), 1);
        library.condition = 1.0;
        let buildings = [lab, library];
        let governments: HashMap<String, Government> = HashMap::default();
        let mut events = VecDeque::new();
        let mut rng = <ChaCha8Rng as rand::SeedableRng>::seed_from_u64(seed);
        let mut reached: Vec<(Era, u64)> = Vec::new();
        let mut best = Era::PreStone;
        let mut tick = 0;
        while tick < horizon && best < *LADDER.last().unwrap() {
            tick += TICK_INTERVAL;
            for (i, o) in sim.organisms.iter_mut().enumerate() {
                if i % experiment_every == 0 {
                    o.last_experiment_tick = tick;
                }
                o.age = 2_000;
            }
            tick_tech_progress(
                tick,
                &mut rng,
                &mut sim.organisms,
                &mut events,
                &lineage_names,
                &buildings,
                &governments,
            );
            events.clear();
            let known: HashSet<String> = sim
                .organisms
                .iter()
                .flat_map(|o| o.discoveries.iter().cloned())
                .collect();
            let era = determine_era_for_lineage(&known, 10_000, 10_000);
            if era > best {
                best = era;
                reached.push((era, tick));
            }
        }
        reached
    }

    #[test]
    fn a_modest_tribe_with_a_lab_climbs_every_age_to_the_last() {
        use crate::sim::civ::era::{Era, LADDER};
        let last = *LADDER.last().unwrap();
        assert_eq!(last, Era::Rebirth);
        // Fifteen people, a tenth of them readers, a few scholars and the odd
        // experiment: nothing like an ideal tribe, and still it must get there.
        for seed in [5, 6] {
            let reached = era_timeline(seed, 15, 400_000, 0.35, 8, 4);
            let (era, tick) = *reached.last().expect("it climbed at all");
            assert_eq!(
                era,
                last,
                "seed {seed} stalled at {} after {tick} ticks",
                era.name()
            );
            // The later ages are worth waiting for, not skipped in a blink.
            let space = reached.iter().find(|(e, _)| *e >= Era::Space).unwrap().1;
            assert!(tick > space + 5_000, "the far future arrived too cheaply");
        }
    }

    #[test]
    fn nobody_without_a_laboratory_learns_past_the_industrial_age() {
        use crate::sim::civ::era::Era;
        let lettered = ResearchProfile {
            literacy: 0.6,
            scholars: 3,
            research_sites: 0.5,
            ..ResearchProfile::default()
        };
        assert!(!research_requirements_met(Era::Space, &lettered));
        assert!(!research_requirements_met(Era::Digital, &lettered));
    }

    /// Two identical worlds, one run through the borrowing aggregation and one
    /// through the original, must end every research round with the same
    /// discoveries, the same events and the same position in the random stream.
    #[test]
    fn borrowed_aggregation_matches_the_original() {
        let mut inventions = 0usize;
        for seed in [7u64, 42] {
            let mut fast = Simulation::new(seed);
            let mut original = Simulation::new(seed);
            fast.tick_n(1_200);
            original.tick_n(1_200);
            for world in [&mut fast, &mut original] {
                for (i, o) in world.organisms.iter_mut().enumerate() {
                    if o.alive {
                        o.literacy = 0.45;
                        o.last_experiment_tick = world.tick_count.saturating_sub(100);
                        o.specialty = (i % 5 == 0).then(|| "scholar".to_string());
                    }
                }
            }
            let mut rng_fast = fast.rng.clone();
            let mut rng_original = original.rng.clone();
            let mut events_fast = VecDeque::new();
            let mut events_original = VecDeque::new();
            for round in 1..=300u64 {
                let tick = round * TICK_INTERVAL;
                tick_tech_progress(
                    tick,
                    &mut rng_fast,
                    &mut fast.organisms,
                    &mut events_fast,
                    &fast.lineage_names,
                    &fast.buildings,
                    &fast.governments,
                );
                tick_tech_progress_reference(
                    tick,
                    &mut rng_original,
                    &mut original.organisms,
                    &mut events_original,
                    &original.lineage_names,
                    &original.buildings,
                    &original.governments,
                );
                let summary = |events: &VecDeque<Event>| {
                    events
                        .iter()
                        .map(|e| (e.tick, e.etype.clone(), e.actor.clone(), e.detail.clone()))
                        .collect::<Vec<_>>()
                };
                assert_eq!(
                    summary(&events_fast),
                    summary(&events_original),
                    "seed {seed} round {round}"
                );
                for (a, b) in fast.organisms.iter().zip(&original.organisms) {
                    let known = |o: &Organism| o.discoveries.iter().cloned().collect::<Vec<_>>();
                    assert_eq!(known(a), known(b), "seed {seed} round {round}: {}", a.id);
                }
                assert_eq!(
                    rng_fast.random::<u64>(),
                    rng_original.random::<u64>(),
                    "seed {seed} round {round}: the random streams diverged"
                );
                inventions += events_fast.len();
                events_fast.clear();
                events_original.clear();
            }
        }
        assert!(
            inventions > 20,
            "too few inventions to mean anything: {inventions}"
        );
    }
}

#[cfg(test)]
mod farming_neighbour_tests {
    use super::*;

    fn hut(id: u32, x: i32, y: i32, owner: &str) -> Building {
        let mut b = Building::new(id, BuildingKind::Hut, x, y, Some(owner.to_string()), 0);
        b.condition = 1.0;
        b
    }

    fn tribe(lineage: &str, farms: bool) -> (String, HashSet<String>, Vec<usize>) {
        let mut known = HashSet::default();
        if farms {
            known.insert("agriculture".to_string());
        }
        (lineage.to_string(), known, Vec::new())
    }

    #[test]
    fn a_tribe_within_reach_of_a_farming_tribe_is_near_farming_and_a_far_one_is_not() {
        let tribes = vec![tribe("a", true), tribe("b", false), tribe("c", false)];
        let buildings = vec![
            hut(1, 100, 100, "a"),
            hut(2, 110, 100, "b"),
            hut(3, 300, 300, "c"),
        ];
        let near = farming_neighbours(&tribes, &buildings);
        assert!(near.contains("b"), "ten tiles from a farming tribe");
        assert!(!near.contains("c"), "far beyond the reach");
        assert!(!near.contains("a"), "a farming tribe does not learn from itself");
    }
}
