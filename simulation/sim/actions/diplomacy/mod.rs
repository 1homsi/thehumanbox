

pub mod form_alliance;
pub mod declare_rivalry;
pub mod negotiate_peace;
pub mod surrender;
pub mod trade_goods;
pub mod recruit;
pub mod propose_truce;
pub mod swear_oath;
pub mod send_envoy;
pub mod host_summit;
pub mod arrange_marriage;
pub mod hold_council;
pub mod grant_amnesty;
pub mod declare_independence;
pub mod appoint_elder;
pub mod pledge_loyalty;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        90  => form_alliance::apply(ctx),
        91  => declare_rivalry::apply(ctx),
        92  => negotiate_peace::apply(ctx),
        93  => surrender::apply(ctx),
        94  => trade_goods::apply(ctx),
        95  => recruit::apply(ctx),
        181 => propose_truce::apply(ctx),
        182 => swear_oath::apply(ctx),
        183 => send_envoy::apply(ctx),
        184 => host_summit::apply(ctx),
        185 => arrange_marriage::apply(ctx),
        186 => hold_council::apply(ctx),
        187 => grant_amnesty::apply(ctx),
        188 => declare_independence::apply(ctx),
        189 => appoint_elder::apply(ctx),
        190 => pledge_loyalty::apply(ctx),
        _   => 0.0,
    }
}
