

pub mod develop_writing;
pub mod send_message;
pub mod post_notice;
pub mod spread_rumor;
pub mod deny_rumor;
pub mod call_for_help;
pub mod sound_alarm;
pub mod signal_allies;
pub mod establish_postal_route;
pub mod carve_inscription;
pub mod publish_decree;
pub mod develop_symbol;
pub mod create_code;
pub mod decode_message;
pub mod inter_tribal_signal;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        406 => develop_writing::apply(ctx),
        407 => send_message::apply(ctx),
        408 => post_notice::apply(ctx),
        409 => spread_rumor::apply(ctx),
        410 => deny_rumor::apply(ctx),
        411 => call_for_help::apply(ctx),
        412 => sound_alarm::apply(ctx),
        413 => signal_allies::apply(ctx),
        414 => establish_postal_route::apply(ctx),
        415 => carve_inscription::apply(ctx),
        416 => publish_decree::apply(ctx),
        417 => develop_symbol::apply(ctx),
        418 => create_code::apply(ctx),
        419 => decode_message::apply(ctx),
        420 => inter_tribal_signal::apply(ctx),
        _   => 0.0,
    }
}
