use rand::RngExt;
use rand_chacha::ChaCha8Rng;
use std::collections::{HashMap, HashSet, VecDeque};

use super::tech_tree::all_tech;
use crate::organism::organism::Organism;
use crate::sim::civ::government::{Government, LawKind};
use crate::sim::simulation::Event;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::sim::world_events::push_event;

const TICK_INTERVAL: u64 = 40;
const BASE_RATE: f32 = 0.012;

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

    let mut lineage_discoveries: HashMap<String, HashSet<String>> = HashMap::new();
    let mut lineage_pop: HashMap<String, usize> = HashMap::new();
    let mut lineage_members: HashMap<String, Vec<usize>> = HashMap::new();
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

    for (lid, disc) in lineage_discoveries.iter() {
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
            let p = (BASE_RATE * node.discovery_rate * pop_factor * profile.capacity * evidence).min(0.85);
            if rng.random::<f32>() >= p {
                continue;
            }

            // Discoveries come from the people best positioned to make them,
            // with a small random term so one permanent genius does not author
            // an entire civilization's history.
            let pick = members
                .iter()
                .copied()
                .max_by(|a, b| {
                    let a_score = researcher_score(&organisms[*a]) + rng.random::<f32>() * 0.15;
                    let b_score = researcher_score(&organisms[*b]) + rng.random::<f32>() * 0.15;
                    a_score.total_cmp(&b_score)
                })
                .unwrap_or(members[0]);
            organisms[pick].discoveries.insert(node.name.to_string());
            let name = organisms[pick].name.clone();
            let lname = lineage_names.get(lid).cloned().unwrap_or_else(|| lid.clone());
            let detail = format!("{} discovered {}", lname, node.name.replace('_', " "));
            push_event(events, tick, "build", &name, &detail);
        }
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
        profile.literacy >= 0.30
            && specialists > 0
            && profile.recent_experiments > 0
            && profile.laboratory_capacity > 0.0
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
        profile.food_workers as f32 * 0.06
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::government::{GovernmentKind, Law};
    use crate::sim::simulation::Simulation;

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

        let experimental_lab = ResearchProfile {
            recent_experiments: 1,
            laboratory_capacity: 0.2,
            ..formal
        };
        assert!(research_requirements_met(Era::Modern, &experimental_lab));
    }
}
