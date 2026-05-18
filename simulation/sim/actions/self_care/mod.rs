

pub mod bathe;
pub mod rest_deeply;
pub mod stretch;
pub mod sunbathe;
pub mod groom_self;
pub mod meditate_deep;
pub mod play_game;
pub mod teach_skill;
pub mod learn_skill;
pub mod practice;
pub mod nap;
pub mod daydream;
pub mod howl_at_moon;
pub mod play_with_kids;
pub mod sit_by_water;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        107 => bathe::apply(ctx),
        108 => rest_deeply::apply(ctx),
        109 => stretch::apply(ctx),
        110 => sunbathe::apply(ctx),
        111 => groom_self::apply(ctx),
        112 => meditate_deep::apply(ctx),
        113 => play_game::apply(ctx),
        114 => teach_skill::apply(ctx),
        115 => learn_skill::apply(ctx),
        116 => practice::apply(ctx),
        221 => nap::apply(ctx),
        222 => daydream::apply(ctx),
        223 => howl_at_moon::apply(ctx),
        224 => play_with_kids::apply(ctx),
        225 => sit_by_water::apply(ctx),
        _   => 0.0,
    }
}
