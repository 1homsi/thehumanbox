pub mod brew_beer;
pub mod build_barn;
pub mod build_greenhouse;
pub mod compost_heap;
pub mod dry_fruit;
pub mod ferment_grain;
pub mod graft_tree;
pub mod harvest_grain;
pub mod mill_grain;
pub mod plant_herb_garden;
pub mod plow_field;
pub mod press_oil;
pub mod rotate_crops;
pub mod seed_saving;
pub mod sow_seeds;
pub mod store_grain;
pub mod tend_orchard;
pub mod thresh_grain;
pub mod water_crops;
pub mod weed_crops;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        336 => plow_field::apply(ctx),
        337 => sow_seeds::apply(ctx),
        338 => weed_crops::apply(ctx),
        339 => water_crops::apply(ctx),
        340 => harvest_grain::apply(ctx),
        341 => thresh_grain::apply(ctx),
        342 => mill_grain::apply(ctx),
        343 => store_grain::apply(ctx),
        344 => rotate_crops::apply(ctx),
        345 => build_barn::apply(ctx),
        346 => tend_orchard::apply(ctx),
        347 => graft_tree::apply(ctx),
        348 => dry_fruit::apply(ctx),
        349 => press_oil::apply(ctx),
        350 => ferment_grain::apply(ctx),
        351 => brew_beer::apply(ctx),
        352 => plant_herb_garden::apply(ctx),
        353 => build_greenhouse::apply(ctx),
        354 => compost_heap::apply(ctx),
        355 => seed_saving::apply(ctx),
        _ => 0.0,
    }
}
