use crate::sim::simulation::Simulation;
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Tile;

const GROUP: u32 = 50;
const STEP: usize = 24;

pub(crate) fn spawn_crowd(sim: &mut Simulation, count: u32) -> u32 {
    let before = sim.organisms.len();
    let mut left = count;
    let points: Vec<(usize, usize)> = (STEP / 2..HEIGHT)
        .step_by(STEP)
        .flat_map(|y| (STEP / 2..WIDTH).step_by(STEP).map(move |x| (x, y)))
        .collect();
    for (x, y) in points {
        if left == 0 {
            break;
        }
        if !matches!(
            sim.grid.get(x as i32, y as i32),
            Tile::Grass | Tile::Food | Tile::Sand
        ) {
            continue;
        }
        let batch = left.min(GROUP);
        let cmd = format!(r#"{{"cmd":"spawn","x":{x},"y":{y},"count":{batch}}}"#);
        if sim.apply_command_json(&cmd) {
            left -= batch;
        }
    }
    (sim.organisms.len() - before) as u32
}
