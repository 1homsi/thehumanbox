//! Action 509: debate philosophy with kin; both boredom -0.08; discover "philosophical_debate".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.kin.is_empty() { return 0.0; }
    let partner = ctx.kin[0];
    ctx.sim.organisms[partner].boredom = (ctx.sim.organisms[partner].boredom - 0.08).max(0.0);
    ctx.org_mut().boredom = (ctx.org().boredom - 0.08).max(0.0);
    ctx.think("wrestling with ideas about the nature of existence");
    ctx.discover("philosophical_debate", "engaged in deep philosophical debate with a peer");
    0.008
}
