use rand::Rng;
use rand_chacha::ChaCha8Rng;
use std::collections::{HashMap, HashSet, VecDeque};

use super::tech_tree::all_tech;
use crate::organism::organism::Organism;
use crate::sim::simulation::Event;
use crate::sim::world_events::push_event;

const TICK_INTERVAL: u64 = 40;
const BASE_RATE: f32 = 0.012;

pub fn tick_tech_progress(
    tick: u64,
    rng: &mut ChaCha8Rng,
    organisms: &mut [Organism],
    events: &mut VecDeque<Event>,
    lineage_names: &HashMap<String, String>,
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

        for node in tech.iter() {
            if disc.contains(node.name) {
                continue;
            }
            if !node.prerequisites.iter().all(|p| disc.contains(*p)) {
                continue;
            }

            let p = BASE_RATE * node.discovery_rate * pop_factor;
            if rng.random::<f32>() >= p {
                continue;
            }

            let members = match lineage_members.get(lid) {
                Some(m) if !m.is_empty() => m,
                _ => continue,
            };
            let pick = members[rng.random_range(0..members.len())];
            organisms[pick].discoveries.insert(node.name.to_string());
            let name = organisms[pick].name.clone();
            let lname = lineage_names.get(lid).cloned().unwrap_or_else(|| lid.clone());
            let detail = format!("{} discovered {}", lname, node.name.replace('_', " "));
            push_event(events, tick, "build", &name, &detail);
        }
    }
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
