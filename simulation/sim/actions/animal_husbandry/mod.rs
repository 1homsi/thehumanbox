//! Animal husbandry (indices 356..=370).

pub mod pen_animal;
pub mod breed_animals;
pub mod milk_animal;
pub mod shear_wool;
pub mod slaughter_animal;
pub mod train_animal;
pub mod ride_animal;
pub mod build_stable;
pub mod feed_livestock;
pub mod guard_flock;
pub mod brand_livestock;
pub mod transport_herd;
pub mod release_animal;
pub mod observe_animal_patterns;
pub mod build_corral;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        356 => pen_animal::apply(ctx),
        357 => breed_animals::apply(ctx),
        358 => milk_animal::apply(ctx),
        359 => shear_wool::apply(ctx),
        360 => slaughter_animal::apply(ctx),
        361 => train_animal::apply(ctx),
        362 => ride_animal::apply(ctx),
        363 => build_stable::apply(ctx),
        364 => feed_livestock::apply(ctx),
        365 => guard_flock::apply(ctx),
        366 => brand_livestock::apply(ctx),
        367 => transport_herd::apply(ctx),
        368 => release_animal::apply(ctx),
        369 => observe_animal_patterns::apply(ctx),
        370 => build_corral::apply(ctx),
        _   => 0.0,
    }
}
