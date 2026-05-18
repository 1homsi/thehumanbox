//! Medicine actions (indices 246..=260).

pub mod tend_wound;
pub mod apply_poultice;
pub mod brew_remedy;
pub mod harvest_medicinal_herbs;
pub mod quarantine_sick;
pub mod set_bone;
pub mod nurse_back;
pub mod diagnose_illness;
pub mod fast_for_healing;
pub mod smoke_purification;
pub mod test_remedy;
pub mod mix_antidote;
pub mod herb_garden_knowledge;
pub mod blood_ritual_healing;
pub mod preventive_care;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        246 => tend_wound::apply(ctx),
        247 => apply_poultice::apply(ctx),
        248 => brew_remedy::apply(ctx),
        249 => harvest_medicinal_herbs::apply(ctx),
        250 => quarantine_sick::apply(ctx),
        251 => set_bone::apply(ctx),
        252 => nurse_back::apply(ctx),
        253 => diagnose_illness::apply(ctx),
        254 => fast_for_healing::apply(ctx),
        255 => smoke_purification::apply(ctx),
        256 => test_remedy::apply(ctx),
        257 => mix_antidote::apply(ctx),
        258 => herb_garden_knowledge::apply(ctx),
        259 => blood_ritual_healing::apply(ctx),
        260 => preventive_care::apply(ctx),
        _   => 0.0,
    }
}
