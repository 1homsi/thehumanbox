//! Action 291: with rock_near and fire_near; discover "currency".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.rock_near {
        ctx.think("needs stone to mint coins");
        return 0.0;
    }
    if !ctx.fire_near {
        ctx.think("needs fire to forge coins");
        return 0.0;
    }
    ctx.think("minting the first coins");
    ctx.discover("currency", "minted coins from stone and fire");
    ctx.event("build", "forged primitive currency using rock and flame");
    0.02
}
