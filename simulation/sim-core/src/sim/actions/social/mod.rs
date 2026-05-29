pub mod apologize;
pub mod befriend;
pub mod boast;
pub mod comfort_child;
pub mod console;
pub mod gossip;
pub mod greet_stranger;
pub mod mediate;
pub mod praise;
pub mod scold;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        80 => console::apply(ctx),
        81 => comfort_child::apply(ctx),
        82 => praise::apply(ctx),
        83 => scold::apply(ctx),
        84 => gossip::apply(ctx),
        85 => greet_stranger::apply(ctx),
        86 => apologize::apply(ctx),
        87 => mediate::apply(ctx),
        88 => boast::apply(ctx),
        89 => befriend::apply(ctx),
        _ => 0.0,
    }
}
