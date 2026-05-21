
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let disc = &ctx.sim.organisms[ctx.idx].discoveries;
    // Tool quality scales success: bare hands < stone tools < spear/bow
    let success_p: f32 = if disc.contains("bow") || disc.contains("spear") {
        0.40
    } else if disc.contains("stone_tools") || disc.contains("trap") {
        0.28
    } else {
        0.12  // bare hands - hard without tools
    };

    if ctx.chance(success_p) {
        ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
        ctx.think("caught small game");
        ctx.discover("trapping-game", "learned to hunt small game");
        0.012 + (success_p - 0.12) * 0.05
    } else {
        ctx.think("tracking small game");
        0.0
    }
}
