

pub mod found_religion;
pub mod preach;
pub mod convert_follower;
pub mod excommunicate;
pub mod build_altar;
pub mod perform_exorcism;
pub mod divine_prophecy;
pub mod interpret_omen;
pub mod fast_for_vision;
pub mod sacred_dance;
pub mod pilgrimage;
pub mod found_priesthood;
pub mod debate_theology;
pub mod religious_schism;
pub mod inter_faith_ceremony;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        456 => found_religion::apply(ctx),
        457 => preach::apply(ctx),
        458 => convert_follower::apply(ctx),
        459 => excommunicate::apply(ctx),
        460 => build_altar::apply(ctx),
        461 => perform_exorcism::apply(ctx),
        462 => divine_prophecy::apply(ctx),
        463 => interpret_omen::apply(ctx),
        464 => fast_for_vision::apply(ctx),
        465 => sacred_dance::apply(ctx),
        466 => pilgrimage::apply(ctx),
        467 => found_priesthood::apply(ctx),
        468 => debate_theology::apply(ctx),
        469 => religious_schism::apply(ctx),
        470 => inter_faith_ceremony::apply(ctx),
        _   => 0.0,
    }
}
