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
    if alive.is_empty() {
        println!("  nobody alive");
        return;
    }
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
