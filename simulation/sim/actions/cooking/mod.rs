pub mod bake_bread;
pub mod boil_water;
pub mod brew_tea;
pub mod dry_herbs;
pub mod ferment_drink;
pub mod grind_grain;
pub mod salt_meat;
pub mod share_meal;
pub mod stockpile_food;
pub mod taste_test;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        141 => boil_water::apply(ctx),
        142 => bake_bread::apply(ctx),
        143 => ferment_drink::apply(ctx),
        144 => dry_herbs::apply(ctx),
        145 => salt_meat::apply(ctx),
        146 => stockpile_food::apply(ctx),
        147 => share_meal::apply(ctx),
        148 => brew_tea::apply(ctx),
        149 => grind_grain::apply(ctx),
        150 => taste_test::apply(ctx),
        _ => 0.0,
    }
}
