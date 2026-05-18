

pub mod prepare_for_winter;
pub mod migrate_south;
pub mod plant_spring;
pub mod harvest_autumn;
pub mod mark_solstice;
pub mod mark_equinox;
pub mod stock_winter_provisions;
pub mod light_winter_fire;
pub mod spring_cleaning;
pub mod summer_hunt;
pub mod autumn_gathering;
pub mod winter_storytelling;
pub mod new_year_ritual;
pub mod count_seasons;
pub mod mark_decade;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        471 => prepare_for_winter::apply(ctx),
        472 => migrate_south::apply(ctx),
        473 => plant_spring::apply(ctx),
        474 => harvest_autumn::apply(ctx),
        475 => mark_solstice::apply(ctx),
        476 => mark_equinox::apply(ctx),
        477 => stock_winter_provisions::apply(ctx),
        478 => light_winter_fire::apply(ctx),
        479 => spring_cleaning::apply(ctx),
        480 => summer_hunt::apply(ctx),
        481 => autumn_gathering::apply(ctx),
        482 => winter_storytelling::apply(ctx),
        483 => new_year_ritual::apply(ctx),
        484 => count_seasons::apply(ctx),
        485 => mark_decade::apply(ctx),
        _   => 0.0,
    }
}
