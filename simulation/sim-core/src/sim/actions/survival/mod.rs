pub mod bow_drill_fire;
pub mod break_trail;
pub mod build_debris_shelter;
pub mod build_lean_to;
pub mod build_smoke_signal;
pub mod cache_food;
pub mod carry_ember_pot;
pub mod chew_pine_resin;
pub mod chew_willow;
pub mod drink_warm_root;
pub mod find_edible_berry;
pub mod find_edible_leaf;
pub mod find_edible_root;
pub mod find_water_signs;
pub mod flint_strike_fire;
pub mod follow_birds;
pub mod gather_clams;
pub mod gather_honeycomb;
pub mod gather_oysters;
pub mod gut_small_game;
pub mod keep_coal_alive;
pub mod make_snare_loop;
pub mod mend_net;
pub mod mend_torch;
pub mod navigate_by_sun;
pub mod purify_water_boil;
pub mod purify_water_filter;
pub mod purify_water_sun;
pub mod read_moss_growth;
pub mod read_tree_sway;
pub mod rub_two_sticks;
pub mod set_deadfall;
pub mod set_fishing_weir;
pub mod set_funnel_trap;
pub mod set_pit_trap;
pub mod skin_small_game;
pub mod sleep_in_pine_boughs;
pub mod smoke_jerky;
pub mod smoke_out_bees;
pub mod snowshoe_make;
pub mod spear_fish;
pub mod stash_water;
pub mod tap_birch;
pub mod tap_maple;
pub mod test_plant_edible;
pub mod trap_marten;
pub mod trap_rabbit;
pub mod trap_squirrel;
pub mod use_signal_mirror;
pub mod weave_fish_basket;
pub mod whistle_for_rescue;
pub mod winnow_pollen;
pub mod wrap_blister;

use super::ctx::ActionCtx;
use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;
use crate::sim::survival_resources::CachedSupply;
use crate::world::{grid::TrailKind, tiles::Tile};

const REAL_SURVIVAL_ACTIONS: &[usize] = &[
    2160, 2161, 2162, 2163, 2164, 2168, 2170, 2171, 2172, 2177, 2178, 2180, 2181, 2182, 2183, 2197, 2200,
    2203, 2204, 2205,
];

fn buildable(tile: Tile) -> bool {
    matches!(
        tile,
        Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash
    )
}

fn trap_is_open(sim: &Simulation, ix: i32, iy: i32) -> bool {
    sim.grid.trail_at(ix, iy, TrailKind::Food) < 0.45 && sim.grid.structure_at(ix, iy) < 0.015
}

fn trap_is_ready(sim: &Simulation, ix: i32, iy: i32) -> bool {
    (0.65..=2.20).contains(&sim.grid.trail_at(ix, iy, TrailKind::Food))
        && (0.015..=0.08).contains(&sim.grid.structure_at(ix, iy))
}

fn has_prey(sim: &Simulation, org_x: f32, org_y: f32, action: usize) -> bool {
    sim.animals.iter().any(|animal| {
        animal.alive
            && (animal.x - org_x).abs() + (animal.y - org_y).abs() <= 5.0
            && match action {
                2203 => animal.kind == crate::organism::animal::AnimalKind::Rabbit,
                2204 => animal.kind == crate::organism::animal::AnimalKind::Bird,
                // Martens do not have a dedicated world species yet. A small
                // opportunistic trap can catch either supported small prey.
                2205 => matches!(
                    animal.kind,
                    crate::organism::animal::AnimalKind::Rabbit | crate::organism::animal::AnimalKind::Bird
                ),
                _ => false,
            }
    })
}

fn nearest_water(sim: &Simulation, ix: i32, iy: i32, radius: i32) -> Option<(i32, i32)> {
    let mut best: Option<(i32, i32, i32)> = None;
    for dy in -radius..=radius {
        for dx in -radius..=radius {
            let distance = dx.abs() + dy.abs();
            if distance > radius || sim.grid.get(ix + dx, iy + dy) != Tile::Water {
                continue;
            }
            if best.is_none_or(|(_, _, best_distance)| distance < best_distance) {
                best = Some((ix + dx, iy + dy, distance));
            }
        }
    }
    best.map(|(x, y, _)| (x, y))
}

/// Only surface survival actions backed by a real resource, terrain, animal,
/// or persistent world consequence. The remaining generated survival verbs
/// stay hidden until they have mechanics instead of handing out free comfort.
pub(crate) fn action_is_possible(sim: &Simulation, idx: usize, action: usize, ix: i32, iy: i32) -> bool {
    if !REAL_SURVIVAL_ACTIONS.contains(&action) {
        return !(2160..=2212).contains(&action);
    }
    let Some(org) = sim.organisms.get(idx).filter(|org| org.alive) else {
        return false;
    };
    let tile = sim.grid.get(ix, iy);
    let fire_near = (-2i32..=2).any(|dx| {
        (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Fire | Tile::Campfire))
    });
    let shelter_here = sim.grid.structure_at(ix, iy) >= 0.10
        || sim.buildings.iter().any(|building| building.contains(ix, iy));

    match action {
        2160 => org.inv_wood > 0 && buildable(tile) && !fire_near,
        2161 => org.inv_wood > 0 && org.has_tool("rope") && buildable(tile) && !fire_near,
        2162 => org.inv_wood > 0 && org.has_tool("stone_tools") && buildable(tile) && !fire_near,
        2163 => org.inv_wood >= 2 && buildable(tile) && !shelter_here,
        2164 => org.inv_wood >= 1 && buildable(tile) && !shelter_here,
        2168 => org.hydration < 0.75 && nearest_water(sim, ix, iy, 12).is_some(),
        2170..=2172 => tile == Tile::Food && org.carry_room() > 0,
        2177 => sim.can_deposit_cached_supply(idx, ix, iy, CachedSupply::Food),
        2178 => sim.can_deposit_cached_supply(idx, ix, iy, CachedSupply::Water),
        2180..=2182 => {
            org.inv_wood > 0 && matches!(tile, Tile::Grass | Tile::Food) && trap_is_open(sim, ix, iy)
        }
        2183 => sim.can_build_fishing_weir(idx, ix, iy),
        2197 => org.near_shelter(&sim.grid, &sim.buildings) && (org.energy < 0.82 || org.sleep_debt > 0.15),
        2200 => !sim.is_night() && (org.x - org.home_x).abs() + (org.y - org.home_y).abs() > 12.0,
        2203..=2205 => {
            org.carry_room() > 0 && trap_is_ready(sim, ix, iy) && has_prey(sim, org.x, org.y, action)
        }
        _ => false,
    }
}

fn light_fire(ctx: &mut ActionCtx, thought: &'static str, success_chance: f32) -> f32 {
    if !action_is_possible(
        ctx.sim,
        ctx.idx,
        match thought {
            "working a bow drill" => 2161,
            "striking flint" => 2162,
            _ => 2160,
        },
        ctx.ix,
        ctx.iy,
    ) {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= 1;
    ctx.org_mut().energy = (ctx.org().energy - 0.025).max(0.0);
    if !ctx.chance(success_chance) {
        ctx.think("failed to coax a flame");
        return -0.003;
    }
    ctx.sim.grid.set(ctx.ix, ctx.iy, Tile::Campfire);
    *ctx.sim.grid.fire_intensity_mut(ctx.ix, ctx.iy) = 1.0;
    ctx.sim.physics.register_fire(ctx.ix, ctx.iy);
    ctx.think(thought);
    ctx.discover("fire", "made fire with wilderness craft");
    ctx.event("build", "lit a wilderness campfire");
    0.035
}

fn build_shelter(ctx: &mut ActionCtx, wood: u8, strength: f32, thought: &'static str) -> f32 {
    let action = if wood >= 2 { 2163 } else { 2164 };
    if !action_is_possible(ctx.sim, ctx.idx, action, ctx.ix, ctx.iy) {
        return 0.0;
    }
    ctx.org_mut().inv_wood -= wood;
    ctx.org_mut().energy = (ctx.org().energy - 0.06).max(0.0);
    ctx.sim.grid.add_structure(ctx.ix, ctx.iy, strength);
    ctx.sim.active_structure_tiles.insert((ctx.ix, ctx.iy));
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Path, 2.5);
    ctx.think(thought);
    ctx.discover("shelter", "built a shelter from gathered materials");
    ctx.event("build", thought);
    0.025 + strength * 0.02
}

fn find_water(ctx: &mut ActionCtx) -> f32 {
    let Some((water_x, water_y)) = nearest_water(ctx.sim, ctx.ix, ctx.iy, 12) else {
        return 0.0;
    };
    let memory_strength = ctx.org().traits.memory_strength;
    Organism::remember(
        &mut ctx.org_mut().water_memory,
        water_x,
        water_y,
        1.0,
        memory_strength,
    );
    ctx.org_mut().wander_target = Some((water_x, water_y));
    ctx.think("tracking signs toward water");
    0.018
}

fn forage(ctx: &mut ActionCtx, thought: &'static str) -> f32 {
    if ctx.tile != Tile::Food || ctx.org().carry_room() == 0 {
        return 0.0;
    }
    ctx.sim.grid.set(ctx.ix, ctx.iy, Tile::Grass);
    ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
    ctx.org_mut().energy = (ctx.org().energy - 0.012).max(0.0);
    ctx.think(thought);
    ctx.event("life", thought);
    0.014
}

fn cache_supply(ctx: &mut ActionCtx, supply: CachedSupply) -> f32 {
    let Some(result) = ctx.sim.deposit_cached_supply(ctx.idx, ctx.ix, ctx.iy, supply) else {
        return 0.0;
    };
    let (thought, discovery, event) = match supply {
        CachedSupply::Food => (
            "burying a food cache",
            "food_cache",
            "stored food in a wilderness cache",
        ),
        CachedSupply::Water => (
            "stashing water",
            "water_cache",
            "stored water in a wilderness cache",
        ),
    };
    ctx.think(thought);
    if result.created {
        ctx.org_mut().discover(discovery);
        ctx.event("build", event);
    }
    0.012 + result.amount as f32 * 0.001
}

fn build_fishing_weir(ctx: &mut ActionCtx) -> f32 {
    if !ctx.sim.build_fishing_weir(ctx.idx, ctx.ix, ctx.iy) {
        return 0.0;
    }
    ctx.org_mut().energy = (ctx.org().energy - 0.07).max(0.0);
    ctx.org_mut().discover("fishing_weir");
    ctx.think("setting a woven fishing weir");
    ctx.event("build", "built a fishing weir beside the water");
    0.032
}

fn sleep_under_shelter(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().near_shelter(&ctx.sim.grid, &ctx.sim.buildings) {
        return 0.0;
    }
    let org = ctx.org_mut();
    org.energy = (org.energy + 0.10).min(1.0);
    org.comfort = (org.comfort + 0.08).min(1.0);
    org.sleep_debt = (org.sleep_debt - 0.18).max(0.0);
    org.fear_level = (org.fear_level - 0.05).max(0.0);
    ctx.think("sleeping beneath pine boughs");
    0.018
}

fn navigate_home(ctx: &mut ActionCtx) -> f32 {
    if ctx.is_night() {
        return 0.0;
    }
    let target = (ctx.org().home_x as i32, ctx.org().home_y as i32);
    ctx.org_mut().wander_target = Some(target);
    ctx.sim.grid.leave_trail(ctx.ix, ctx.iy, TrailKind::Path, 1.8);
    ctx.think("using the sun to turn homeward");
    0.012
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        2160 => light_fire(ctx, "rubbing sticks into flame", 0.45),
        2161 => light_fire(ctx, "working a bow drill", 0.82),
        2162 => light_fire(ctx, "striking flint", 1.0),
        2163 => build_shelter(ctx, 2, 0.62, "built a sturdy lean-to"),
        2164 => build_shelter(ctx, 1, 0.38, "built a debris shelter"),
        2165 => purify_water_boil::apply(ctx),
        2166 => purify_water_filter::apply(ctx),
        2167 => purify_water_sun::apply(ctx),
        2168 => find_water(ctx),
        2169 => follow_birds::apply(ctx),
        2170 => forage(ctx, "dug up an edible root"),
        2171 => forage(ctx, "gathered edible berries"),
        2172 => forage(ctx, "gathered edible leaves"),
        2173 => test_plant_edible::apply(ctx),
        2174 => build_smoke_signal::apply(ctx),
        2175 => use_signal_mirror::apply(ctx),
        2176 => whistle_for_rescue::apply(ctx),
        2177 => cache_supply(ctx, CachedSupply::Food),
        2178 => cache_supply(ctx, CachedSupply::Water),
        2179 => make_snare_loop::apply(ctx),
        2180..=2182 => super::exploration::set_trap::apply(ctx),
        2183 => build_fishing_weir(ctx),
        2184 => spear_fish::apply(ctx),
        2185 => gather_clams::apply(ctx),
        2186 => gather_oysters::apply(ctx),
        2187 => skin_small_game::apply(ctx),
        2188 => gut_small_game::apply(ctx),
        2189 => smoke_jerky::apply(ctx),
        2190 => carry_ember_pot::apply(ctx),
        2191 => keep_coal_alive::apply(ctx),
        2192 => mend_torch::apply(ctx),
        2193 => wrap_blister::apply(ctx),
        2194 => chew_pine_resin::apply(ctx),
        2195 => chew_willow::apply(ctx),
        2196 => drink_warm_root::apply(ctx),
        2197 => sleep_under_shelter(ctx),
        2198 => break_trail::apply(ctx),
        2199 => snowshoe_make::apply(ctx),
        2200 => navigate_home(ctx),
        2201 => read_moss_growth::apply(ctx),
        2202 => read_tree_sway::apply(ctx),
        2203..=2205 => super::exploration::check_trap::apply(ctx),
        2206 => weave_fish_basket::apply(ctx),
        2207 => mend_net::apply(ctx),
        2208 => smoke_out_bees::apply(ctx),
        2209 => winnow_pollen::apply(ctx),
        2210 => gather_honeycomb::apply(ctx),
        2211 => tap_birch::apply(ctx),
        2212 => tap_maple::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::animal::{Animal, AnimalKind};
    use crate::sim::spatial::SpatialIndex;
    use crate::world::grid::WorldGrid;

    fn survivor(seed: u64, x: i32, y: i32) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(1);
        let org = &mut sim.organisms[0];
        org.alive = true;
        org.age = org.max_age / 2;
        org.energy = 0.5;
        org.hydration = 0.5;
        org.x = x as f32;
        org.y = y as f32;
        org.home_x = (x - 20) as f32;
        org.home_y = y as f32;
        for tile_y in y - 14..=y + 14 {
            for tile_x in x - 14..=x + 14 {
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
    fn generated_survival_stubs_stay_hidden_until_they_have_mechanics() {
        let mut sim = survivor(0x5A71_0001, 100, 100);
        assert!(!action_is_possible(&sim, 0, 2176, 100, 100));
        assert!(!action_is_possible(&sim, 0, 2189, 100, 100));
        assert!(!action_is_possible(&sim, 0, 2212, 100, 100));
        assert!(try_action(&mut sim, 2176, 100, 100).is_none());
        assert!(try_action(&mut sim, 2189, 100, 100).is_none());
        assert!(try_action(&mut sim, 2212, 100, 100).is_none());
    }

    #[test]
    fn paid_shelter_persists_protects_and_cannot_be_stacked_for_free() {
        let (x, y) = (110, 110);
        let mut sim = survivor(0x5A71_0002, x, y);
        sim.organisms[0].inv_wood = 3;

        assert!(try_action(&mut sim, 2163, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 1);
        assert!(sim.grid.structure_at(x, y) >= 0.62);
        assert!(sim.organisms[0].near_shelter(&sim.grid, &sim.buildings));
        assert!(try_action(&mut sim, 2164, x, y).is_none());
        assert_eq!(sim.organisms[0].inv_wood, 1);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert!(loaded.grid.structure_at(x, y) >= 0.62);
        assert!(loaded.organisms[0].near_shelter(&loaded.grid, &loaded.buildings));
    }

    #[test]
    fn skilled_firemaking_consumes_fuel_and_creates_a_saved_campfire() {
        let (x, y) = (115, 115);
        let mut sim = survivor(0x5A71_0006, x, y);
        sim.organisms[0].inv_wood = 1;
        sim.organisms[0].tools.insert("stone_tools".into(), 1);

        assert!(try_action(&mut sim, 2162, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.grid.get(x, y), Tile::Campfire);
        assert!(sim.grid.fire_intensity(x, y) > 0.0);
        assert!(try_action(&mut sim, 2162, x, y).is_none());

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert_eq!(loaded.grid.get(x, y), Tile::Campfire);
        assert!(loaded.grid.fire_intensity(x, y) > 0.0);
    }

    #[test]
    fn foraging_moves_real_food_from_world_to_inventory_once() {
        let (x, y) = (120, 120);
        let mut sim = survivor(0x5A71_0003, x, y);
        sim.grid.set(x, y, Tile::Food);
        let before = sim.organisms[0].inv_food;

        assert!(try_action(&mut sim, 2171, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_food, before + 1);
        assert_eq!(sim.grid.get(x, y), Tile::Grass);
        assert!(try_action(&mut sim, 2171, x, y).is_none());
    }

    #[test]
    fn supply_cache_is_paid_refillable_persistent_and_feeds_real_need() {
        let (x, y) = (125, 125);
        let mut sim = survivor(0x5A71_0007, x, y);
        sim.organisms[0].inv_wood = 1;
        sim.organisms[0].inv_food = 2;
        sim.organisms[0].inv_water = 1;

        assert!(try_action(&mut sim, 2177, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.organisms[0].inv_food, 1);
        assert_eq!(sim.supply_caches.len(), 1);
        assert_eq!(sim.supply_caches[0].food, 1);
        assert!(try_action(&mut sim, 2177, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_food, 0);
        assert_eq!(sim.supply_caches[0].food, 2);
        assert!((sim.grid.structure_at(x, y) - 0.16).abs() < f32::EPSILON);

        assert!(try_action(&mut sim, 2178, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_water, 0);
        assert_eq!(sim.supply_caches[0].water, 1);

        let mut loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert_eq!(loaded.supply_caches, sim.supply_caches);
        loaded.organisms[0].inv_food = 0;
        loaded.organisms[0].inv_water = 0;
        loaded.organisms[0].energy = 0.2;
        loaded.organisms[0].hydration = 0.2;

        assert_eq!(loaded.take_needed_cached_supplies(0), (true, true));
        assert_eq!(loaded.organisms[0].inv_food, 1);
        assert_eq!(loaded.organisms[0].inv_water, 1);
        assert_eq!(loaded.supply_caches[0].food, 1);
        assert_eq!(loaded.supply_caches[0].water, 0);
    }

    #[test]
    fn fishing_weir_is_paid_persistent_and_produces_only_beside_water() {
        let (x, y) = (128, 128);
        let mut sim = survivor(0x5A71_0008, x, y);
        sim.organisms[0].inv_wood = 2;
        sim.organisms[0].energy = 1.0;
        sim.organisms[0].hydration = 1.0;
        sim.grid.set(x + 1, y, Tile::Water);

        assert!(try_action(&mut sim, 2183, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.supply_caches.len(), 1);
        assert!(sim.supply_caches[0].fishing_weir);
        assert_eq!(sim.supply_caches[0].food, 0);
        assert!(try_action(&mut sim, 2183, x, y).is_none());

        sim.tick_count = 599;
        sim.tick();
        assert_eq!(sim.supply_caches[0].food, 1);

        for dy in -2..=2 {
            for dx in -2..=2 {
                sim.grid.set(x + dx, y + dy, Tile::Grass);
            }
        }
        sim.tick_count = 1199;
        sim.tick();
        assert_eq!(sim.supply_caches[0].food, 1);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert!(loaded.supply_caches[0].fishing_weir);
        assert_eq!(loaded.supply_caches[0].food, 1);
    }

    #[test]
    fn water_signs_record_a_real_source_and_navigation_turns_home() {
        let (x, y) = (130, 130);
        let mut sim = survivor(0x5A71_0004, x, y);
        sim.grid.set(x + 7, y, Tile::Water);

        assert!(try_action(&mut sim, 2168, x, y).is_some());
        assert!(sim.organisms[0]
            .water_memory
            .iter()
            .any(|(&(memory_x, memory_y), _)| memory_x == x + 7 && memory_y == y));
        assert_eq!(sim.organisms[0].wander_target, Some((x + 7, y)));

        assert!(try_action(&mut sim, 2200, x, y).is_some());
        assert_eq!(
            sim.organisms[0].wander_target,
            Some((sim.organisms[0].home_x as i32, sim.organisms[0].home_y as i32))
        );
    }

    #[test]
    fn survival_traps_use_the_same_paid_real_prey_world_loop() {
        let (x, y) = (140, 140);
        let mut sim = survivor(0x5A71_0005, x, y);
        sim.organisms[0].inv_wood = 1;
        assert!(try_action(&mut sim, 2180, x, y).is_some());
        assert_eq!(sim.organisms[0].inv_wood, 0);
        sim.grid.food_trail[WorldGrid::idx(x, y)] = 1.5;

        let mut rabbit = Animal::new(991, x as f32 + 1.0, y as f32, AnimalKind::Rabbit);
        rabbit.energy = 0.1;
        sim.animals.push(rabbit);
        assert!(try_action(&mut sim, 2203, x, y).is_some());
        assert!(!sim.animals.last().expect("rabbit remains in vector").alive);
        assert_eq!(sim.organisms[0].inv_food, 1);
        assert!(try_action(&mut sim, 2203, x, y).is_none());
    }
}
