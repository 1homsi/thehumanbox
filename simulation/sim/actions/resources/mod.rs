

pub mod mine;
pub mod chop_wood;
pub mod fish;
pub mod quarry;
pub mod plant_tree;
pub mod clear_land;
pub mod dig_roots;
pub mod collect_water;
pub mod forage_berries;
pub mod harvest;
pub mod compost;
pub mod irrigate;
pub mod plant_crops;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        26 => mine::apply(ctx),
        27 => chop_wood::apply(ctx),
        28 => fish::apply(ctx),
        29 => quarry::apply(ctx),
        30 => plant_tree::apply(ctx),
        31 => clear_land::apply(ctx),
        32 => dig_roots::apply(ctx),
        33 => collect_water::apply(ctx),
        34 => forage_berries::apply(ctx),
        35 => harvest::apply(ctx),
        36 => compost::apply(ctx),
        37 => irrigate::apply(ctx),
        38 => plant_crops::apply(ctx),
        _  => 0.0,
    }
}
