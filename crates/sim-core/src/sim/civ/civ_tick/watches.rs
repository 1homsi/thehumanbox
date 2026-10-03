use super::*;

pub(super) fn tick_plague_watch(sim: &mut Simulation) {
    let mut alive = 0u32;
    let mut sick = 0u32;
    for o in sim.organisms.iter().filter(|o| o.alive) {
        alive += 1;
        if o.infection > 0.3 {
            sick += 1;
        }
    }
    if alive >= 20 && (sick as f32) / (alive as f32) > 0.15 {
        let tick = sim.tick_count;
        let line = format!(
            "\u{1F912} A plague spreads — {} of {} are gravely ill.",
            sick, alive
        );
        push_event(&mut sim.events, tick, "outbreak", "world", &line);
        sim.headlines.push_back((tick, line));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}

pub(super) fn tick_deforestation(sim: &mut Simulation) {
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Biome;
    use rand::RngExt;
    // Sorted: this loop draws from `sim.rng` and carries a 2-tile budget,
    // so hash order decided which lineage lost forest and shifted the
    // shared RNG stream.
    let mut alive_lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    alive_lineages.sort();
    alive_lineages.dedup();
    for lid in alive_lineages {
        if lineage_pop(sim, &lid) < 5 {
            continue;
        }
        let (cx, cy) = lineage_center(sim, &lid);
        if cx == 0 && cy == 0 {
            continue;
        }
        let mut cleared = 0;
        'scan: for dy in -6..=6 {
            for dx in -6..=6 {
                if cleared >= 2 {
                    break 'scan;
                }
                let (x, y) = (cx + dx, cy + dy);
                if sim.grid.biome_at(x, y).wooded() && sim.rng.random::<f32>() < 0.05 {
                    let i = WorldGrid::idx(x, y);
                    sim.grid.biome[i] = Biome::Grassland as u8;
                    cleared += 1;
                }
            }
        }
    }
}
