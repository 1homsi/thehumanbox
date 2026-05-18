

pub mod test_hypothesis;
pub mod document_finding;
pub mod build_measuring_tool;
pub mod map_stars_precise;
pub mod predict_eclipse;
pub mod develop_mathematics;
pub mod test_material_strength;
pub mod improve_tool;
pub mod share_scientific_discovery;
pub mod refute_theory;
pub mod conduct_experiment;
pub mod establish_methodology;
pub mod create_classification;
pub mod observe_eclipse;
pub mod calculate_seasons;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        421 => test_hypothesis::apply(ctx),
        422 => document_finding::apply(ctx),
        423 => build_measuring_tool::apply(ctx),
        424 => map_stars_precise::apply(ctx),
        425 => predict_eclipse::apply(ctx),
        426 => develop_mathematics::apply(ctx),
        427 => test_material_strength::apply(ctx),
        428 => improve_tool::apply(ctx),
        429 => share_scientific_discovery::apply(ctx),
        430 => refute_theory::apply(ctx),
        431 => conduct_experiment::apply(ctx),
        432 => establish_methodology::apply(ctx),
        433 => create_classification::apply(ctx),
        434 => observe_eclipse::apply(ctx),
        435 => calculate_seasons::apply(ctx),
        _   => 0.0,
    }
}
