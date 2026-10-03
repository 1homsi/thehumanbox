pub mod alliance_ceremony;
pub mod coming_of_age_expanded;
pub mod coronation;
pub mod farewell_ceremony;
pub mod founding_ceremony;
pub mod harvest_ceremony;
pub mod initiation_rite;
pub mod mourning_ceremony;
pub mod naming_ceremony;
pub mod new_moon_ceremony;
pub mod peace_ceremony;
pub mod reunion_ceremony;
pub mod solstice_ceremony;
pub mod victory_ceremony;
pub mod war_ceremony;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        521 => coronation::apply(ctx),
        522 => coming_of_age_expanded::apply(ctx),
        523 => harvest_ceremony::apply(ctx),
        524 => peace_ceremony::apply(ctx),
        525 => war_ceremony::apply(ctx),
        526 => naming_ceremony::apply(ctx),
        527 => reunion_ceremony::apply(ctx),
        528 => initiation_rite::apply(ctx),
        529 => mourning_ceremony::apply(ctx),
        530 => victory_ceremony::apply(ctx),
        531 => solstice_ceremony::apply(ctx),
        532 => new_moon_ceremony::apply(ctx),
        533 => founding_ceremony::apply(ctx),
        534 => alliance_ceremony::apply(ctx),
        535 => farewell_ceremony::apply(ctx),
        _ => 0.0,
    }
}
