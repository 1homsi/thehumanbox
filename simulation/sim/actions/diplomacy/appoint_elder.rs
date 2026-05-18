
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied()
        .max_by_key(|&k| ctx.sim.organisms[k].age);
    let Some(ki) = pick else {
        ctx.think("looking for wisdom");
        return 0.0;
    };
    let o = &mut ctx.sim.organisms[ki];
    o.is_elder = true;
    o.comfort = (o.comfort + 0.08).min(1.0);
    ctx.think("naming an elder");
    ctx.discover("elders", "named the first elder");
    0.008
}
