//! Family actions (indices 261..=275).

pub mod name_child;
pub mod birth_ceremony;
pub mod teach_child_to_hunt;
pub mod tell_bedtime_story;
pub mod family_meal;
pub mod discipline_child;
pub mod praise_child;
pub mod arrange_adoption;
pub mod bequeath_tools;
pub mod mourn_child;
pub mod reconcile_family;
pub mod family_council;
pub mod pass_down_tradition;
pub mod care_for_elder;
pub mod protect_family;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        261 => name_child::apply(ctx),
        262 => birth_ceremony::apply(ctx),
        263 => teach_child_to_hunt::apply(ctx),
        264 => tell_bedtime_story::apply(ctx),
        265 => family_meal::apply(ctx),
        266 => discipline_child::apply(ctx),
        267 => praise_child::apply(ctx),
        268 => arrange_adoption::apply(ctx),
        269 => bequeath_tools::apply(ctx),
        270 => mourn_child::apply(ctx),
        271 => reconcile_family::apply(ctx),
        272 => family_council::apply(ctx),
        273 => pass_down_tradition::apply(ctx),
        274 => care_for_elder::apply(ctx),
        275 => protect_family::apply(ctx),
        _   => 0.0,
    }
}
