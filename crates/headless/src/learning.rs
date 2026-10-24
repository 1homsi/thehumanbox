//! How much the people know: skills by generation, masters, and how much of
//! it was learned by watching someone else.

use crate::organism::skills::{Skill, HANDY, MASTER};
use crate::sim::simulation::Simulation;
use std::collections::BTreeMap;

pub(super) fn print_learning(sim: &Simulation) {
    let alive: Vec<_> = sim.organisms.iter().filter(|o| o.alive).collect();
    println!("\n=== LEARNING ===");
    println!(
        "Lessons learned by watching kin or friends work: {}",
        sim.lessons_watched
    );
    let remembering: Vec<String> = sim
        .lineage_winter_memory
        .iter()
        .filter(|(_, m)| m.strength >= crate::sim::civ::society::hard_winters::REMEMBERED)
        .map(|(l, m)| {
            format!(
                "{} (year {}, {:.2})",
                sim.lineage_names
                    .get(l)
                    .map_or(&l[..6.min(l.len())], |n| n.as_str()),
                m.year + 1,
                m.strength
            )
        })
        .collect();
    println!(
        "Tribes remembering a hungry winter: {} {:?}",
        remembering.len(),
        remembering
    );
    let weary: Vec<String> = sim
        .lineage_war_weariness
        .iter()
        .filter(|(_, w)| w.weariness >= crate::sim::civ::society::war_weariness::WEARY)
        .map(|(l, w)| {
            format!(
                "{} ({} fallen, {:.2})",
                sim.lineage_names
                    .get(l)
                    .map_or(&l[..6.min(l.len())], |n| n.as_str()),
                w.fallen,
                w.weariness
            )
        })
        .collect();
    println!("Tribes weary of war: {} {:?}", weary.len(), weary);
    if alive.is_empty() {
        println!("  nobody alive");
        return;
    }
    // What deaths they saw taught the living.
    let heeding: Vec<String> = crate::organism::lessons::Lesson::ALL
        .into_iter()
        .map(|l| {
            let n = alive.iter().filter(|o| o.lessons.heeds(l) > 0.0).count();
            format!("{} {}", l.name(), n)
        })
        .collect();
    println!("People heeding a lesson from a death: {}", heeding.join(", "));
    // Best skill by generation: later generations should start ahead.
    let mut by_generation: BTreeMap<u32, (f32, usize)> = BTreeMap::new();
    for o in &alive {
        let best = o.skills.best().map_or(0.0, |(_, level)| level);
        let entry = by_generation.entry(o.generation).or_default();
        entry.0 += best;
        entry.1 += 1;
    }
    print!("Best skill by generation:");
    for (generation, (sum, n)) in &by_generation {
        print!("  g{generation}={:.2} (n={n})", sum / *n as f32);
    }
    println!();
    for skill in Skill::ALL {
        let levels: Vec<f32> = alive
            .iter()
            .map(|o| o.skills.level(skill))
            .filter(|&l| l > 0.0)
            .collect();
        if levels.is_empty() {
            continue;
        }
        let handy = levels.iter().filter(|&&l| l >= HANDY).count();
        let masters = levels.iter().filter(|&&l| l >= MASTER).count();
        let mean = levels.iter().sum::<f32>() / levels.len() as f32;
        println!(
            "  {:<12} learners={:>4} mean={:.2} handy+={:>4} masters={:>3}",
            skill.name(),
            levels.len(),
            mean,
            handy,
            masters
        );
    }
}
