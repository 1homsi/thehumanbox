//! Action 269: elder gives inv_wood to a young kin; emit "legacy" event.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.sim.organisms[ctx.idx].is_elder {
        ctx.think("only elders may bequeath tools");
        return 0.0;
    }
    if ctx.sim.organisms[ctx.idx].inv_wood == 0 {
        ctx.think("no tools to bequeath");
        return 0.0;
    }
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].age < 400);
    let Some(ki) = pick else {
        ctx.think("no young kin to receive tools");
        return 0.0;
    };
    ctx.sim.organisms[ctx.idx].inv_wood -= 1;
    ctx.sim.organisms[ki].inv_wood = ctx.sim.organisms[ki].inv_wood.saturating_add(1);
    ctx.sim.organisms[ki].comfort = (ctx.sim.organisms[ki].comfort + 0.06).min(1.0);
    ctx.think("bequeathing tools to the young");
    ctx.event("legacy", "bequeathed crafted tools to a young kin member");
    0.010
}
