pub mod blaze_trail;
pub mod bless_kin;
pub mod build_cairn;
pub mod chart_coast;
pub mod check_trap;
pub mod climb_peak;
pub mod climb_tree;
pub mod descend_canyon;
pub mod explore_cave;
pub mod follow_river;
pub mod ford_river;
pub mod herd_animals;
pub mod hunt_small_game;
pub mod map_landmark;
pub mod mourn_together;
pub mod retrace_steps;
pub mod set_trap;
pub mod swim_across;
pub mod tame_animal;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        117 => explore_cave::apply(ctx),
        118 => climb_peak::apply(ctx),
        119 => tame_animal::apply(ctx),
        120 => herd_animals::apply(ctx),
        121 => hunt_small_game::apply(ctx),
        122 => set_trap::apply(ctx),
        123 => check_trap::apply(ctx),
        124 => bless_kin::apply(ctx),
        125 => mourn_together::apply(ctx),
        211 => swim_across::apply(ctx),
        212 => ford_river::apply(ctx),
        213 => climb_tree::apply(ctx),
        214 => follow_river::apply(ctx),
        215 => blaze_trail::apply(ctx),
        216 => build_cairn::apply(ctx),
        217 => chart_coast::apply(ctx),
        218 => retrace_steps::apply(ctx),
        219 => descend_canyon::apply(ctx),
        220 => map_landmark::apply(ctx),
        _ => 0.0,
    }
}
