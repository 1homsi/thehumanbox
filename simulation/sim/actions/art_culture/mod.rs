//! Art & culture (indices 316..=335).

pub mod compose_song;
pub mod perform_music;
pub mod paint_mural;
pub mod write_poem;
pub mod recite_poem;
pub mod dance_performance;
pub mod theater_play;
pub mod create_mask;
pub mod weave_tapestry;
pub mod create_jewelry;
pub mod decorate_home;
pub mod carve_relief;
pub mod build_monument;
pub mod establish_tradition;
pub mod record_cultural_history;
pub mod create_calendar;
pub mod name_festival;
pub mod compose_anthem;
pub mod street_performance;
pub mod storytelling_circle;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        316 => compose_song::apply(ctx),
        317 => perform_music::apply(ctx),
        318 => paint_mural::apply(ctx),
        319 => write_poem::apply(ctx),
        320 => recite_poem::apply(ctx),
        321 => dance_performance::apply(ctx),
        322 => theater_play::apply(ctx),
        323 => create_mask::apply(ctx),
        324 => weave_tapestry::apply(ctx),
        325 => create_jewelry::apply(ctx),
        326 => decorate_home::apply(ctx),
        327 => carve_relief::apply(ctx),
        328 => build_monument::apply(ctx),
        329 => establish_tradition::apply(ctx),
        330 => record_cultural_history::apply(ctx),
        331 => create_calendar::apply(ctx),
        332 => name_festival::apply(ctx),
        333 => compose_anthem::apply(ctx),
        334 => street_performance::apply(ctx),
        335 => storytelling_circle::apply(ctx),
        _   => 0.0,
    }
}
