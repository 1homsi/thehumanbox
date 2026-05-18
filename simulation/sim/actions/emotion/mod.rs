//! Emotion actions (indices 386..=405).

pub mod express_grief;
pub mod express_joy;
pub mod anger_outburst;
pub mod calming_down;
pub mod overcome_fear;
pub mod accept_loss;
pub mod celebrate_victory;
pub mod regret_action;
pub mod forgive_enemy;
pub mod seek_revenge;
pub mod find_purpose;
pub mod lose_faith;
pub mod renew_faith;
pub mod confront_bully;
pub mod stand_ground;
pub mod back_down;
pub mod find_inner_peace;
pub mod succumb_to_despair;
pub mod recover_from_trauma;
pub mod make_peace_with_past;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        386 => express_grief::apply(ctx),
        387 => express_joy::apply(ctx),
        388 => anger_outburst::apply(ctx),
        389 => calming_down::apply(ctx),
        390 => overcome_fear::apply(ctx),
        391 => accept_loss::apply(ctx),
        392 => celebrate_victory::apply(ctx),
        393 => regret_action::apply(ctx),
        394 => forgive_enemy::apply(ctx),
        395 => seek_revenge::apply(ctx),
        396 => find_purpose::apply(ctx),
        397 => lose_faith::apply(ctx),
        398 => renew_faith::apply(ctx),
        399 => confront_bully::apply(ctx),
        400 => stand_ground::apply(ctx),
        401 => back_down::apply(ctx),
        402 => find_inner_peace::apply(ctx),
        403 => succumb_to_despair::apply(ctx),
        404 => recover_from_trauma::apply(ctx),
        405 => make_peace_with_past::apply(ctx),
        _   => 0.0,
    }
}
