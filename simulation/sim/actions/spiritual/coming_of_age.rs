
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pick = ctx.kin.iter().copied().filter(|&k| {
        let a = ctx.sim.organisms[k].age;
        a >= 700 && a < 900
    }).min_by_key(|&k| ctx.sim.organisms[k].age);
    let Some(ki) = pick else {
        ctx.think("watching the young grow");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.08).min(1.0);
    }
    ctx.think("a coming-of-age rite");
    ctx.discover("rites-of-passage", "marked a coming of age");
    0.008
}
