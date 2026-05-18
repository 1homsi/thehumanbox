//! Relationship actions (indices 226..=245).

pub mod gift_food;
pub mod gift_tool;
pub mod express_gratitude;
pub mod ask_for_help;
pub mod share_burden;
pub mod comfort_grieving;
pub mod jealousy_outburst;
pub mod pledge_friendship;
pub mod reconcile;
pub mod defend_reputation;
pub mod share_secret;
pub mod express_admiration;
pub mod ask_forgiveness;
pub mod offer_protection;
pub mod bond_ritual;
pub mod silent_companionship;
pub mod challenge_friend;
pub mod mentor_moment;
pub mod express_love;
pub mod resolve_conflict;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        226 => gift_food::apply(ctx),
        227 => gift_tool::apply(ctx),
        228 => express_gratitude::apply(ctx),
        229 => ask_for_help::apply(ctx),
        230 => share_burden::apply(ctx),
        231 => comfort_grieving::apply(ctx),
        232 => jealousy_outburst::apply(ctx),
        233 => pledge_friendship::apply(ctx),
        234 => reconcile::apply(ctx),
        235 => defend_reputation::apply(ctx),
        236 => share_secret::apply(ctx),
        237 => express_admiration::apply(ctx),
        238 => ask_forgiveness::apply(ctx),
        239 => offer_protection::apply(ctx),
        240 => bond_ritual::apply(ctx),
        241 => silent_companionship::apply(ctx),
        242 => challenge_friend::apply(ctx),
        243 => mentor_moment::apply(ctx),
        244 => express_love::apply(ctx),
        245 => resolve_conflict::apply(ctx),
        _   => 0.0,
    }
}
