
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.sim.organisms[ctx.idx].inv_food == 0 {
        ctx.think("no food to donate");
        return 0.0;
    }
    let pick = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].energy < 0.35);
    let Some(ki) = pick else {
        ctx.think("all kin are well-fed");
        return 0.0;
    };
    ctx.sim.organisms[ctx.idx].inv_food -= 1;
    ctx.sim.organisms[ki].inv_food =     ctx.sim.organisms[ki].inv_food.saturating_add(1);
    ctx.sim.organisms[ki].energy = (ctx.sim.organisms[ki].energy + 0.05).min(1.0);
    ctx.think("donating food to the needy");
    ctx.discover("charity", "donated food to a hungry kin");
    ctx.event("social", "gave food to a low-energy tribe member");
    0.01
}
