//! Action 231: console a kin with low health or comfort.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].health < 0.4 || ctx.sim.organisms[ki].comfort < 0.3);
    let Some(ki) = pick else {
        ctx.think("no grieving kin nearby");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.07).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.03).min(1.0);
    ctx.think("comforting a grieving kin");
    ctx.event("social", "comforted a grieving kin member");
    0.007
}
