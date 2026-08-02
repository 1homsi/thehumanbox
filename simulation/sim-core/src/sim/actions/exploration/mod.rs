pub mod blaze_trail;
pub mod bless_kin;
pub mod build_cairn;
pub mod chart_coast;
pub mod check_trap;
pub mod climb_peak;
pub mod climb_tree;
pub mod descend_canyon;
pub mod explore_cave;
pub mod follow_river;
pub mod ford_river;
pub mod herd_animals;
pub mod hunt_small_game;
pub mod map_landmark;
pub mod mourn_together;
pub mod retrace_steps;
pub mod set_trap;
pub mod swim_across;
pub mod tame_animal;

use super::ctx::ActionCtx;
use crate::organism::animal::AnimalKind;
use crate::sim::simulation::Simulation;
use crate::world::{grid::TrailKind, tiles::Tile};

pub(crate) fn action_is_possible(
    sim: &Simulation,
    idx: usize,
    action: usize,
    ix: i32,
    iy: i32,
    water_near: bool,
    rock_near: bool,
) -> bool {
    let Some(org) = sim.organisms.get(idx) else {
        return false;
    };
    if !org.alive {
        return false;
    }
    let nearby_tamable_wolf = sim.animals.iter().any(|animal| {
        animal.alive
            && animal.kind == AnimalKind::Wolf
            && animal.bonded_org.is_none()
            && (animal.x - org.x).abs() + (animal.y - org.y).abs() <= 4.0
    });
    let nearby_herd_animal = sim.animals.iter().any(|animal| {
        animal.alive
            && matches!(animal.kind, AnimalKind::Deer | AnimalKind::Boar)
            && (animal.x - org.x).abs() + (animal.y - org.y).abs() <= 6.0
    });
    let trap_strength = sim.grid.trail_at(ix, iy, TrailKind::Food);
    let trap_marker = sim.grid.structure_at(ix, iy);
    let trap_ready = (0.65..=2.20).contains(&trap_strength) && (0.015..=0.08).contains(&trap_marker);
    let trap_site_open = trap_strength < 0.45 && trap_marker < 0.015;
    let elevation = sim
        .grid
        .elevation
        .get(crate::world::grid::WorldGrid::idx(ix, iy))
        .copied()
        .unwrap_or(0.0);
    match action {
        117 => rock_near,
        118 => elevation > 0.60,
        119 => nearby_tamable_wolf && org.inv_food > 0,
        120 => nearby_herd_animal,
        121 => org.carry_room() > 0,
        122 => org.inv_wood > 0 && trap_site_open && matches!(sim.grid.get(ix, iy), Tile::Grass | Tile::Food),
        123 => org.carry_room() > 0 && trap_ready,
        211..=212 | 214 | 217 => water_near,
        213 => sim.grid.get(ix, iy) == Tile::Grass,
        215 => matches!(
            sim.grid.get(ix, iy),
            Tile::Grass | Tile::Sand | Tile::Snow | Tile::Ash
        ),
        216 => org.inv_stone > 0 && trap_marker < 0.10 && sim.grid.get(ix, iy) != Tile::Water,
        218 => {
            (org.x - org.home_x).abs() + (org.y - org.home_y).abs() > 12.0
                && sim.grid.detect_trail(ix, iy, TrailKind::Path, 2) > 0.10
        }
        219 => elevation < 0.30,
        220 => map_landmark::has_survey_subject(sim, ix, iy),
        _ => true,
    }
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        117 => explore_cave::apply(ctx),
        118 => climb_peak::apply(ctx),
        119 => tame_animal::apply(ctx),
        120 => herd_animals::apply(ctx),
        121 => hunt_small_game::apply(ctx),
        122 => set_trap::apply(ctx),
        123 => check_trap::apply(ctx),
        124 => bless_kin::apply(ctx),
        125 => mourn_together::apply(ctx),
        211 => swim_across::apply(ctx),
        212 => ford_river::apply(ctx),
        213 => climb_tree::apply(ctx),
        214 => follow_river::apply(ctx),
        215 => blaze_trail::apply(ctx),
        216 => build_cairn::apply(ctx),
        217 => chart_coast::apply(ctx),
        218 => retrace_steps::apply(ctx),
        219 => descend_canyon::apply(ctx),
        220 => map_landmark::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::animal::Animal;
    use crate::sim::spatial::SpatialIndex;
    use crate::world::grid::WorldGrid;

    fn prepared_explorer(seed: u64, x: i32, y: i32) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(1);
        let org = &mut sim.organisms[0];
        org.alive = true;
        org.age = org.max_age / 2;
        org.energy = 1.0;
        org.x = x as f32;
        org.y = y as f32;
        for tile_y in y - 12..=y + 12 {
            for tile_x in x - 12..=x + 12 {
                sim.grid.set(tile_x, tile_y, Tile::Grass);
            }
        }
        sim
    }

    fn try_action(sim: &mut Simulation, action: usize, x: i32, y: i32) -> Option<f32> {
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        super::super::try_apply(sim, 0, action, x, y, &spatial)
    }

    #[test]
    fn paid_trap_matures_persists_and_can_only_be_checked_once() {
        let (x, y) = (120, 120);
        let mut sim = prepared_explorer(0x7A4A_0001, x, y);
        sim.organisms[0].inv_wood = 1;

        assert!(try_action(&mut sim, 122, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert!(sim.grid.structure_at(x, y) > 0.0);
        assert!(
            try_action(&mut sim, 123, x, y).is_none(),
            "fresh trap must mature first"
        );

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert!(loaded.grid.structure_at(x, y) > 0.0);
        loaded.grid.food_trail[WorldGrid::idx(x, y)] = 1.50;
        let food_before = loaded.organisms[0].inv_food;
        assert!(try_action(&mut loaded, 123, x, y).is_some());
        assert_eq!(
            loaded.organisms[0].inv_food, food_before,
            "empty trap cannot conjure prey"
        );
        assert_eq!(loaded.grid.structure_at(x, y), 0.0);
        assert!(try_action(&mut loaded, 123, x, y).is_none());
    }

    #[test]
    fn cairn_is_a_durable_saved_waypoint_and_duplicate_never_charges() {
        let (x, y) = (130, 130);
        let mut sim = prepared_explorer(0xCA17_0002, x, y);
        sim.organisms[0].inv_stone = 2;
        sim.organisms[0].danger_memory.insert((x, y), 0.9);

        assert!(try_action(&mut sim, 216, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_stone, 1);
        assert!(sim.grid.structure_at(x, y) >= 0.20);
        assert!(sim.grid.trail_at(x, y, TrailKind::Path) >= 4.0);
        assert!(!sim.organisms[0].danger_memory.contains_key(&(x, y)));
        assert!(try_action(&mut sim, 216, x, y).is_none());
        assert_eq!(sim.organisms[0].inv_stone, 1);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert!(loaded.grid.structure_at(x, y) >= 0.20);
        assert!(loaded.grid.trail_at(x, y, TrailKind::Path) >= 4.0);
    }

    #[test]
    fn mapping_records_real_resources_without_inventing_food_memory() {
        let (x, y) = (140, 140);
        let mut sim = prepared_explorer(0xA4A0_0003, x, y);
        sim.grid.set(x + 2, y, Tile::Rock);

        assert!(try_action(&mut sim, 220, x, y).is_some());
        assert!(!sim.organisms[0].food_memory.contains_key(&(x, y)));
        assert!(sim.grid.structure_at(x, y) >= 0.10);
        assert!(sim.grid.trail_at(x, y, TrailKind::Path) >= 2.0);

        let mut survey = prepared_explorer(0xA4A0_0004, x, y);
        survey.grid.set(x + 3, y, Tile::Food);
        survey.grid.set(x, y + 3, Tile::Water);
        assert!(try_action(&mut survey, 220, x, y).is_some());
        assert!(survey.organisms[0].food_memory.contains_key(&(x + 3, y)));
        assert!(survey.organisms[0].water_memory.contains_key(&(x, y + 3)));
    }

    #[test]
    fn retracing_a_marked_route_sets_a_real_homeward_target() {
        let (x, y) = (150, 150);
        let mut sim = prepared_explorer(0xA0AE_0005, x, y);
        sim.organisms[0].home_x = 80.0;
        sim.organisms[0].home_y = 90.0;
        sim.organisms[0].fear_level = 0.5;
        sim.grid.leave_trail(x, y, TrailKind::Path, 1.0);

        assert!(try_action(&mut sim, 218, x, y).is_some());
        assert_eq!(sim.organisms[0].wander_target, Some((80, 90)));
        assert!(sim.organisms[0].fear_level < 0.5);
    }

    #[test]
    fn taming_bonds_a_real_wolf_and_the_dog_survives_reload() {
        let (x, y) = (160, 160);
        let mut sim = prepared_explorer(0xD06A_0006, x, y);
        sim.animals.clear();
        let mut wolf = Animal::new(9_001, (x + 1) as f32, y as f32, AnimalKind::Wolf);
        wolf.energy = 0.20;
        sim.animals.push(wolf);
        sim.organisms[0].inv_food = 1;
        let owner_id = sim.organisms[0].id.clone();

        assert!(try_action(&mut sim, 119, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_food, 0);
        assert_eq!(sim.animals[0].kind, AnimalKind::Dog);
        assert_eq!(sim.animals[0].bonded_org.as_deref(), Some(owner_id.as_str()));
        assert!(sim.animals[0].name.is_some());

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert_eq!(loaded.animals[0].kind, AnimalKind::Dog);
        assert_eq!(loaded.animals[0].bonded_org.as_deref(), Some(owner_id.as_str()));
        assert!(loaded.animals[0].name.is_some());
    }

    #[test]
    fn matured_trap_removes_real_prey_and_herding_moves_an_animal_homeward() {
        let (x, y) = (170, 170);
        let mut sim = prepared_explorer(0xFA0A_0007, x, y);
        sim.animals.clear();
        sim.organisms[0].inv_wood = 1;
        assert!(try_action(&mut sim, 122, x, y).is_some());
        sim.grid.food_trail[WorldGrid::idx(x, y)] = 1.50;
        let mut rabbit = Animal::new(9_002, (x + 1) as f32, y as f32, AnimalKind::Rabbit);
        rabbit.energy = 0.20;
        sim.animals.push(rabbit);
        let food_before = sim.organisms[0].inv_food;

        assert!(try_action(&mut sim, 123, x, y).is_some());
        assert!(!sim.animals[0].alive);
        assert_eq!(sim.organisms[0].inv_food, food_before + 1);

        sim.animals.clear();
        sim.animals.push(Animal::new(
            9_003,
            (x + 2) as f32,
            (y + 1) as f32,
            AnimalKind::Deer,
        ));
        sim.organisms[0].home_x = 100.0;
        sim.organisms[0].home_y = 100.0;
        let before = (sim.animals[0].x, sim.animals[0].y);
        let energy_before = sim.organisms[0].energy;

        assert!(try_action(&mut sim, 120, x, y).is_some());
        assert!(sim.animals[0].x < before.0 && sim.animals[0].y < before.1);
        assert!(sim.organisms[0].energy < energy_before);
    }
}
