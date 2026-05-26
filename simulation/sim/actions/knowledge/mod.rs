pub mod carve_idol;
pub mod catalog_minerals;
pub mod catalog_plants;
pub mod celebrate;
pub mod dream_interpretation;
pub mod experiment;
pub mod feast;
pub mod forecast_weather;
pub mod listen_to_wind;
pub mod map_terrain;
pub mod name_place;
pub mod observe_clouds;
pub mod observe_stars;
pub mod observe_weather;
pub mod paint_symbol;
pub mod perform_ritual;
pub mod pray;
pub mod read_tracks;
pub mod recite_lineage;
pub mod recite_proverb;
pub mod record_event;
pub mod sing_anthem;
pub mod sketch_map;
pub mod study;
pub mod study_animal_behaviour;
pub mod study_stars_deep;
pub mod teach_word;
pub mod tell_creation_myth;
pub mod tell_story;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        66 => study::apply(ctx),
        67 => experiment::apply(ctx),
        68 => observe_stars::apply(ctx),
        69 => observe_weather::apply(ctx),
        70 => map_terrain::apply(ctx),
        71 => name_place::apply(ctx),
        72 => tell_story::apply(ctx),
        73 => paint_symbol::apply(ctx),
        74 => carve_idol::apply(ctx),
        75 => perform_ritual::apply(ctx),
        76 => pray::apply(ctx),
        77 => celebrate::apply(ctx),
        78 => feast::apply(ctx),
        79 => sing_anthem::apply(ctx),
        126 => recite_lineage::apply(ctx),
        127 => tell_creation_myth::apply(ctx),
        128 => sketch_map::apply(ctx),
        129 => study_stars_deep::apply(ctx),
        130 => listen_to_wind::apply(ctx),
        131 => read_tracks::apply(ctx),
        132 => catalog_plants::apply(ctx),
        133 => catalog_minerals::apply(ctx),
        134 => teach_word::apply(ctx),
        135 => recite_proverb::apply(ctx),
        136 => study_animal_behaviour::apply(ctx),
        137 => dream_interpretation::apply(ctx),
        138 => record_event::apply(ctx),
        139 => observe_clouds::apply(ctx),
        140 => forecast_weather::apply(ctx),
        _ => 0.0,
    }
}
