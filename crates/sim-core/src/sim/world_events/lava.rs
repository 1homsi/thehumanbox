use super::*;
use crate::organism::animal::Animal;

/// Lava moves, cools and sets fire to its neighbours once every this many ticks.
pub const LAVA_EVERY: u64 = 20;
/// Chance a lava tile pushes into a lower neighbour on a pass.
const FLOW_CHANCE: f32 = 0.2;
/// Chance a lava tile cools to rock on a pass: about one pass in fifty, so a flow lasts a few hundred ticks.
const COOL_CHANCE: f32 = 0.02;
/// Chance a flammable neighbour of lava catches fire on a pass.
const IGNITE_CHANCE: f32 = 0.3;

/// Ground lava can run onto: open land, not water, rock, buildings, fire or other lava.
fn lava_can_flow_onto(t: Tile) -> bool {
    !matches!(
        t,
        Tile::Void
            | Tile::Rock
            | Tile::Mineral
            | Tile::Water
            | Tile::Flooded
            | Tile::Hut
            | Tile::Campfire
            | Tile::Fire
            | Tile::Lava
    )
}

const NEIGHBOURS: [(i32, i32); 4] = [(1, 0), (-1, 0), (0, 1), (0, -1)];

/// Lava, once every `LAVA_EVERY` ticks. Each lava tile may cool to rock, push into the
/// lowest neighbour when that is downhill, and set fire to flammable neighbours. Anyone or
/// anything standing on lava dies. The RNG is only drawn while lava exists, so a world
/// without lava keeps its random sequence.
pub fn tick_lava(
    grid: &mut WorldGrid,
    physics: &mut PhysicsEngine,
    organisms: &mut [Organism],
    animals: &mut [Animal],
    tick: u64,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    rng: &mut impl Rng,
) {
    if !tick.is_multiple_of(LAVA_EVERY) || !grid.tiles.contains(&(Tile::Lava as i8)) {
        return;
    }
    let mut lava = Vec::new();
    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            if grid.get(x, y) == Tile::Lava {
                lava.push((x, y));
            }
        }
    }
    for (x, y) in lava {
        if rng.random::<f32>() < COOL_CHANCE {
            grid.set(x, y, Tile::Rock);
            *grid.fire_intensity_mut(x, y) = 0.0;
            continue;
        }
        for (dx, dy) in NEIGHBOURS {
            let (nx, ny) = (x + dx, y + dy);
            if grid.get(nx, ny).flammable() && rng.random::<f32>() < IGNITE_CHANCE {
                grid.set(nx, ny, Tile::Fire);
                *grid.fire_intensity_mut(nx, ny) = 1.0;
                physics.register_fire(nx, ny);
            }
        }
        if rng.random::<f32>() < FLOW_CHANCE {
            let here = grid.elevation[WorldGrid::idx(x, y)];
            let mut best: Option<(i32, i32, f32)> = None;
            for (dx, dy) in NEIGHBOURS {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || !lava_can_flow_onto(grid.get(nx, ny)) {
                    continue;
                }
                let e = grid.elevation[WorldGrid::idx(nx, ny)];
                if e < here && best.is_none_or(|(_, _, be)| e < be) {
                    best = Some((nx, ny, e));
                }
            }
            if let Some((nx, ny, _)) = best {
                grid.set(nx, ny, Tile::Lava);
                *grid.fire_intensity_mut(nx, ny) = 0.0;
            }
        }
    }

    let mut killed = 0;
    for o in organisms.iter_mut() {
        if o.alive && grid.get(o.x.floor() as i32, o.y.floor() as i32) == Tile::Lava {
            o.health = -1.0;
            o.mark_harm(crate::organism::organism::Harm::Disaster, tick);
            killed += 1;
        }
    }
    for a in animals.iter_mut() {
        if a.alive && grid.get(a.x.floor() as i32, a.y.floor() as i32) == Tile::Lava {
            a.alive = false;
            killed += 1;
        }
    }
    if killed > 0 {
        push_event(
            events,
            tick,
            "danger",
            "lava",
            &format!("molten rock caught {killed} living things"),
        );
    }
}

#[cfg(test)]
mod lava_tests {
    use super::*;

    #[test]
    fn lava_is_not_walkable_and_is_not_flammable() {
        assert!(!Tile::Lava.walkable());
        assert!(!Tile::Lava.flammable());
        assert_eq!(Tile::from_i8(14), Tile::Lava);
    }
}
