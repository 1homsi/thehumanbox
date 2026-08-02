pub mod axe;
pub mod basket;
pub mod bow;
pub mod carved_bone;
pub mod clothing;
pub mod cook_food;
pub mod craft_canoe;
pub mod craft_medicine;
pub mod drum;
pub mod fishing_hook;
pub mod fishing_line;
pub mod flute;
pub mod knife;
pub mod lantern;
pub mod leatherwork;
pub mod light_torch;
pub mod loom;
pub mod mortar;
pub mod net;
pub mod paddle;
pub mod pottery;
pub mod raft;
pub mod rope;
pub mod sharpen_blade;
pub mod sled;
pub mod smoke_meat;
pub mod spear;
pub mod toolmaking;
pub mod torch_pitch;
pub mod wheel;

use super::ctx::ActionCtx;
use crate::sim::simulation::Simulation;
use crate::world::tiles::Tile;

pub const CRAFTED_GOOD_CAP: u8 = 8;

#[derive(Clone, Copy, Debug)]
struct CraftRecipe {
    output: &'static str,
    discovery: &'static str,
    wood: u8,
    stone: u8,
    input_good: Option<&'static str>,
    need_water: bool,
    need_fire: bool,
    thought: &'static str,
    reward: f32,
}

const fn recipe(
    output: &'static str,
    discovery: &'static str,
    wood: u8,
    stone: u8,
    input_good: Option<&'static str>,
    need_water: bool,
    need_fire: bool,
    thought: &'static str,
    reward: f32,
) -> CraftRecipe {
    CraftRecipe {
        output,
        discovery,
        wood,
        stone,
        input_good,
        need_water,
        need_fire,
        thought,
        reward,
    }
}

fn recipe_for(action: usize) -> Option<CraftRecipe> {
    Some(match action {
        51 => recipe(
            "spear",
            "spear",
            1,
            1,
            None,
            false,
            false,
            "knapping a spear",
            0.014,
        ),
        52 => recipe(
            "basket",
            "basket",
            1,
            0,
            None,
            false,
            false,
            "weaving a basket",
            0.010,
        ),
        53 => recipe("net", "net", 1, 0, None, false, false, "knotting a net", 0.012),
        54 => recipe("raft", "raft", 2, 0, None, true, false, "lashing a raft", 0.016),
        55 => recipe(
            "stone_tools",
            "toolmaking",
            0,
            1,
            None,
            false,
            false,
            "knapping stone tools",
            0.014,
        ),
        56 => recipe(
            "clothing",
            "clothing",
            0,
            0,
            Some("leather"),
            false,
            false,
            "stitching hides",
            0.012,
        ),
        57 => recipe(
            "leather",
            "leatherwork",
            0,
            0,
            Some("skin"),
            false,
            false,
            "tanning a hide",
            0.010,
        ),
        58 => recipe("drum", "drum", 1, 0, None, false, false, "building a drum", 0.008),
        62 => recipe(
            "torch",
            "torch",
            1,
            0,
            None,
            false,
            true,
            "lighting a torch",
            0.006,
        ),
        63 => recipe(
            "pottery",
            "pottery",
            0,
            1,
            None,
            false,
            true,
            "firing pottery",
            0.010,
        ),
        64 => recipe("rope", "rope", 1, 0, None, false, false, "twisting rope", 0.008),
        65 => recipe("bow", "bow", 1, 0, None, false, false, "carving a bow", 0.016),
        151 => recipe(
            "flute",
            "flute",
            1,
            0,
            None,
            false,
            false,
            "carving a flute",
            0.008,
        ),
        152 => recipe(
            "carved_bone",
            "carved-bone",
            0,
            0,
            Some("carcass"),
            false,
            false,
            "carving bone",
            0.008,
        ),
        153 => recipe(
            "fishing_hook",
            "fishing-hook",
            0,
            1,
            None,
            false,
            false,
            "knapping a fishhook",
            0.010,
        ),
        154 => recipe(
            "fishing_line",
            "fishing-line",
            1,
            0,
            None,
            false,
            false,
            "twisting a fishing line",
            0.008,
        ),
        155 => recipe(
            "knife",
            "knife",
            0,
            1,
            None,
            false,
            false,
            "knapping a knife",
            0.012,
        ),
        156 => recipe("axe", "axe", 1, 1, None, false, false, "hafting an axe", 0.014),
        158 => recipe(
            "torch_pitch",
            "torch-pitch",
            1,
            0,
            None,
            false,
            true,
            "dipping a torch in pitch",
            0.006,
        ),
        159 => recipe(
            "lantern",
            "lantern",
            1,
            1,
            None,
            false,
            true,
            "crafting a lantern",
            0.010,
        ),
        160 => recipe(
            "canoe",
            "canoe",
            2,
            0,
            None,
            true,
            false,
            "hollowing a canoe",
            0.018,
        ),
        161 => recipe(
            "paddle",
            "paddle",
            1,
            0,
            None,
            false,
            false,
            "carving a paddle",
            0.006,
        ),
        162 => recipe("sled", "sled", 2, 0, None, false, false, "lashing a sled", 0.010),
        163 => recipe(
            "wheel",
            "wheel",
            1,
            0,
            None,
            false,
            false,
            "rounding a wheel",
            0.020,
        ),
        164 => recipe(
            "loom",
            "loom",
            2,
            0,
            None,
            false,
            false,
            "setting up a loom",
            0.014,
        ),
        165 => recipe(
            "mortar",
            "mortar",
            0,
            2,
            None,
            false,
            false,
            "shaping a mortar",
            0.008,
        ),
        _ => return None,
    })
}

fn recipe_is_possible(
    sim: &Simulation,
    idx: usize,
    recipe: CraftRecipe,
    water_near: bool,
    fire_near: bool,
) -> bool {
    let Some(org) = sim.organisms.get(idx) else {
        return false;
    };
    org.alive
        && org.energy > 0.30
        && org.inv_wood >= recipe.wood
        && org.inv_stone >= recipe.stone
        && (!recipe.need_water || water_near)
        && (!recipe.need_fire || fire_near)
        && recipe
            .input_good
            .is_none_or(|good| org.tools.get(good).copied().unwrap_or(0) > 0)
        && org.tools.get(recipe.output).copied().unwrap_or(0) < CRAFTED_GOOD_CAP
}

pub(crate) fn can_apply(
    sim: &Simulation,
    idx: usize,
    action: usize,
    tile: Tile,
    water_near: bool,
    fire_near: bool,
) -> bool {
    if let Some(recipe) = recipe_for(action) {
        return recipe_is_possible(sim, idx, recipe, water_near, fire_near);
    }
    let Some(org) = sim.organisms.get(idx) else {
        return false;
    };
    if !org.alive || org.energy <= 0.30 {
        return false;
    }
    match action {
        59 => fire_near || org.discoveries.contains("fire"),
        60 => fire_near && tile == Tile::Food,
        61 => {
            fire_near
                && org.inv_food > 0
                && org.tools.get("preserved_meat").copied().unwrap_or(0) < CRAFTED_GOOD_CAP
        }
        157 => ["knife", "axe", "spear"].iter().any(|tool| org.has_tool(tool)),
        _ => false,
    }
}

fn apply_recipe(ctx: &mut ActionCtx, recipe: CraftRecipe) -> f32 {
    if !recipe_is_possible(ctx.sim, ctx.idx, recipe, ctx.water_near, ctx.fire_near) {
        return 0.0;
    }

    // Validate the entire recipe before mutating anything. This keeps a forced
    // action or stale UI selection from consuming half a recipe.
    {
        let org = ctx.org_mut();
        org.inv_wood -= recipe.wood;
        org.inv_stone -= recipe.stone;
        if let Some(input) = recipe.input_good {
            let count = org
                .tools
                .get_mut(input)
                .expect("validated crafting ingredient disappeared before commit");
            *count -= 1;
            if *count == 0 {
                org.tools.remove(input);
            }
        }
        org.give_tool(recipe.output);
    }

    ctx.think(recipe.thought);
    let first = ctx.org_mut().discover(recipe.discovery);
    if first {
        ctx.event(
            "build",
            &format!("crafted {} for the first time", recipe.output.replace('_', " ")),
        );
        recipe.reward
    } else {
        recipe.reward * 0.3
    }
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    if let Some(recipe) = recipe_for(action) {
        return apply_recipe(ctx, recipe);
    }
    match action {
        59 => craft_medicine::apply(ctx),
        60 => cook_food::apply(ctx),
        61 => smoke_meat::apply(ctx),
        157 => sharpen_blade::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::spatial::SpatialIndex;

    fn prepared_sim(seed: u64) -> Simulation {
        let mut sim = Simulation::new(seed);
        sim.organisms.truncate(1);
        let org = &mut sim.organisms[0];
        org.alive = true;
        org.age = org.max_age / 2;
        org.energy = 1.0;
        org.inv_wood = 4;
        org.inv_stone = 4;
        sim
    }

    fn apply_at_org(sim: &mut Simulation, action: usize) -> Option<f32> {
        let idx = 0;
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        super::super::try_apply(sim, idx, action, x, y, &spatial)
    }

    #[test]
    fn spear_recipe_atomically_consumes_materials_and_creates_equipment() {
        let mut sim = prepared_sim(0xC4AF_7001);

        let reward = apply_at_org(&mut sim, 51).expect("funded spear recipe should be applicable");

        assert!(reward > 0.0);
        assert_eq!(sim.organisms[0].inv_wood, 3);
        assert_eq!(sim.organisms[0].inv_stone, 3);
        assert_eq!(sim.organisms[0].tools.get("spear"), Some(&1));
        assert!(sim.organisms[0].discoveries.contains("spear"));
    }

    #[test]
    fn impossible_and_saturated_recipes_are_hidden_and_never_charge_materials() {
        let mut sim = prepared_sim(0xC4AF_7002);
        sim.organisms[0].inv_stone = 0;
        let wood_before = sim.organisms[0].inv_wood;
        assert!(apply_at_org(&mut sim, 51).is_none());
        assert_eq!(sim.organisms[0].inv_wood, wood_before);
        assert!(!sim.organisms[0].tools.contains_key("spear"));

        sim.organisms[0].inv_stone = 4;
        sim.organisms[0]
            .tools
            .insert("spear".to_string(), CRAFTED_GOOD_CAP);
        let wood_before = sim.organisms[0].inv_wood;
        let stone_before = sim.organisms[0].inv_stone;
        assert!(apply_at_org(&mut sim, 51).is_none());
        assert_eq!(sim.organisms[0].inv_wood, wood_before);
        assert_eq!(sim.organisms[0].inv_stone, stone_before);
    }

    #[test]
    fn leather_recipe_transforms_one_good_without_duplication() {
        let mut sim = prepared_sim(0xC4AF_7003);
        sim.organisms[0].tools.insert("skin".to_string(), 1);

        assert!(apply_at_org(&mut sim, 57).is_some());
        assert!(!sim.organisms[0].tools.contains_key("skin"));
        assert_eq!(sim.organisms[0].tools.get("leather"), Some(&1));
        assert!(apply_at_org(&mut sim, 57).is_none());
        assert_eq!(sim.organisms[0].tools.get("leather"), Some(&1));
    }

    #[test]
    fn crafted_equipment_changes_capability_and_survives_save_reload() {
        let mut sim = prepared_sim(0xC4AF_7004);
        let base_capacity = sim.organisms[0].carry_max();
        let base_combat = sim.organisms[0].combat_tool_bonus();

        assert!(apply_at_org(&mut sim, 52).is_some());
        assert!(apply_at_org(&mut sim, 51).is_some());
        assert_eq!(sim.organisms[0].carry_max(), base_capacity + 4);
        assert!(sim.organisms[0].combat_tool_bonus() > base_combat);

        let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
        assert_eq!(loaded.organisms[0].tools.get("basket"), Some(&1));
        assert_eq!(loaded.organisms[0].tools.get("spear"), Some(&1));
        assert_eq!(loaded.organisms[0].carry_max(), base_capacity + 4);
        assert!(loaded.organisms[0].combat_tool_bonus() > base_combat);
    }

    #[test]
    fn smoking_meat_converts_food_into_a_tradeable_preserved_good() {
        let mut sim = prepared_sim(0xC4AF_7005);
        let (x, y) = (sim.organisms[0].x as i32, sim.organisms[0].y as i32);
        sim.grid.set(x + 1, y, Tile::Campfire);
        sim.organisms[0].inv_food = 2;

        assert!(apply_at_org(&mut sim, 61).is_some());
        assert_eq!(sim.organisms[0].inv_food, 1);
        assert_eq!(sim.organisms[0].tools.get("preserved_meat"), Some(&1));

        sim.organisms[0]
            .tools
            .insert("preserved_meat".to_string(), CRAFTED_GOOD_CAP);
        assert!(apply_at_org(&mut sim, 61).is_none());
        assert_eq!(sim.organisms[0].inv_food, 1);
    }
}
