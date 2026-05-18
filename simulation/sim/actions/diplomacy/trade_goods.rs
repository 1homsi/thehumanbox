
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("looking for a trade partner");
        return 0.0;
    };
    let can_give = ctx.org().inv_food > 0
                && ctx.sim.organisms[ki].carry_room() > 0;
    if !can_give {
        ctx.think("nothing to trade");
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    ctx.sim.organisms[ki].inv_food =
        ctx.sim.organisms[ki].inv_food.saturating_add(1);
    if ctx.sim.organisms[ki].inv_stone > 0 {
        ctx.sim.organisms[ki].inv_stone -= 1;
        ctx.sim.organisms[ctx.idx].inv_stone =
            ctx.sim.organisms[ctx.idx].inv_stone.saturating_add(1);
    }
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    ctx.sim.organisms[ctx.idx].update_attitude(&their, 0.04);
    ctx.think("trading goods");
    ctx.discover("trade", "opened trade with another tribe");
    0.01
}
