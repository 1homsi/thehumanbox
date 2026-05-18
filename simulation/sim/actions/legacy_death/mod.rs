

pub mod write_will;
pub mod prepare_tomb;
pub mod memorialize;
pub mod build_grave_marker;
pub mod pass_down_knowledge;
pub mod carry_on_tradition;
pub mod avenge_death;
pub mod honor_ancestors;
pub mod erect_memorial;
pub mod compose_eulogy;
pub mod divide_estate;
pub mod continue_unfinished_work;
pub mod rename_in_honor;
pub mod establish_dynasty;
pub mod break_family_curse;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        486 => write_will::apply(ctx),
        487 => prepare_tomb::apply(ctx),
        488 => memorialize::apply(ctx),
        489 => build_grave_marker::apply(ctx),
        490 => pass_down_knowledge::apply(ctx),
        491 => carry_on_tradition::apply(ctx),
        492 => avenge_death::apply(ctx),
        493 => honor_ancestors::apply(ctx),
        494 => erect_memorial::apply(ctx),
        495 => compose_eulogy::apply(ctx),
        496 => divide_estate::apply(ctx),
        497 => continue_unfinished_work::apply(ctx),
        498 => rename_in_honor::apply(ctx),
        499 => establish_dynasty::apply(ctx),
        500 => break_family_curse::apply(ctx),
        _   => 0.0,
    }
}
