use super::*;

pub(super) fn print_growth_row(tick: u64, sim: &Simulation) {
    let alive = sim.organisms.iter().filter(|o| o.alive).count();
    let lineages: std::collections::HashSet<&str> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect();
    let religions = sim.religions.len();
    let adherents: u32 = sim.religions.iter().map(|r| r.adherents).sum();
    let governments = sim.governments.len();
    let buildings = sim.buildings.len();
    let books = sim.books.len();
    let artworks = sim.artworks.len();
    let trades = sim.trades.len();
    let era_max = sim.lineage_eras.values().map(|e| *e as u32).max().unwrap_or(0);
    let round9: u64 = sim.action_counts.values().sum();
    let r9_cats = sim.action_counts.iter().filter(|(_, n)| **n > 0).count();
    if tick == 0 {
        println!(
            "{:<7} {:>5} {:>4} {:>4} {:>4} {:>4} {:>5} {:>5} {:>4} {:>4} {:>4} {:>4} {:>6}",
            "tick", "alive", "lin", "rel", "ad", "gov", "bldgs", "trds", "bks", "art", "era", "r9c", "r9k"
        );
    }
    println!(
        "{:<7} {:>5} {:>4} {:>4} {:>4} {:>4} {:>5} {:>5} {:>4} {:>4} {:>4} {:>4} {:>6}",
        tick,
        alive,
        lineages.len(),
        religions,
        adherents,
        governments,
        buildings,
        trades,
        books,
        artworks,
        era_max,
        r9_cats,
        round9 / 1000,
    );
}

pub(super) fn print_coverage_row(tick: u64, sim: &Simulation) {
    use crate::world::grid::{HEIGHT, WIDTH};
    let alive: Vec<&_> = sim.organisms.iter().filter(|o| o.alive).collect();
    if alive.is_empty() {
        println!("coverage  tick={:<6} alive=0", tick);
        return;
    }
    let n = alive.len() as f32;
    let mx = alive.iter().map(|o| o.x).sum::<f32>() / n;
    let my = alive.iter().map(|o| o.y).sum::<f32>() / n;
    let varx = alive.iter().map(|o| (o.x - mx).powi(2)).sum::<f32>() / n;
    let vary = alive.iter().map(|o| (o.y - my).powi(2)).sum::<f32>() / n;
    let stdx = varx.sqrt();
    let stdy = vary.sqrt();

    const CELL: i32 = 50;
    let mut cells: std::collections::HashSet<(i32, i32)> = std::collections::HashSet::new();
    for o in &alive {
        cells.insert((o.x as i32 / CELL, o.y as i32 / CELL));
    }
    let cell_count = cells.len();

    let half_w = WIDTH as f32 / 2.0;
    let half_h = HEIGHT as f32 / 2.0;
    let mut q_tl = 0;
    let mut q_tr = 0;
    let mut q_bl = 0;
    let mut q_br = 0;
    for o in &alive {
        match (o.x < half_w, o.y < half_h) {
            (true, true) => q_tl += 1,
            (false, true) => q_tr += 1,
            (true, false) => q_bl += 1,
            (false, false) => q_br += 1,
        }
    }
    let pct = |x: usize| (x as f32 * 100.0 / n).round() as i32;

    let mut buckets: HashMap<(i32, i32), u32> = HashMap::new();
    for o in &alive {
        let k = (o.x as i32 / 30, o.y as i32 / 30);
        *buckets.entry(k).or_insert(0) += 1;
    }
    let dense = buckets.values().copied().max().unwrap_or(0);

    println!(
        "coverage  tick={:<6} alive={:<4} cx={:>5.0} cy={:>5.0} stdx={:>5.0} stdy={:>4.0} cells={:>3}/72 q_tl={:>3}% q_tr={:>3}% q_bl={:>3}% q_br={:>3}% dense={}",
        tick, alive.len(), mx, my, stdx, stdy, cell_count,
        pct(q_tl), pct(q_tr), pct(q_bl), pct(q_br), dense
    );
}
