

pub mod form_army;
pub mod train_soldiers;
pub mod build_siege_weapon;
pub mod lay_ambush_trap;
pub mod establish_garrison;
pub mod supply_army;
pub mod execute_flanking;
pub mod build_war_camp;
pub mod draft_conscripts;
pub mod train_cavalry;
pub mod blockade_route;
pub mod fortify_walls;
pub mod coordinate_attack;
pub mod establish_lookout;
pub mod plan_retreat_route;
pub mod build_catapult;
pub mod naval_formation;
pub mod siege_breaker;
pub mod intelligence_gathering;
pub mod victory_parade;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        436 => form_army::apply(ctx),
        437 => train_soldiers::apply(ctx),
        438 => build_siege_weapon::apply(ctx),
        439 => lay_ambush_trap::apply(ctx),
        440 => establish_garrison::apply(ctx),
        441 => supply_army::apply(ctx),
        442 => execute_flanking::apply(ctx),
        443 => build_war_camp::apply(ctx),
        444 => draft_conscripts::apply(ctx),
        445 => train_cavalry::apply(ctx),
        446 => blockade_route::apply(ctx),
        447 => fortify_walls::apply(ctx),
        448 => coordinate_attack::apply(ctx),
        449 => establish_lookout::apply(ctx),
        450 => plan_retreat_route::apply(ctx),
        451 => build_catapult::apply(ctx),
        452 => naval_formation::apply(ctx),
        453 => siege_breaker::apply(ctx),
        454 => intelligence_gathering::apply(ctx),
        455 => victory_parade::apply(ctx),
        _   => 0.0,
    }
}
