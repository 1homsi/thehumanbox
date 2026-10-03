use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let has_hostile = ctx.near.iter().any(|&k| ctx.sim.organisms[k].lineage_id != lid);
    if !has_hostile {
        ctx.think("no raid to intercept");
        return 0.0;
    }
    for i in 0..ctx.kin.len() {
        let ki = ctx.kin[i];
        let o = &mut ctx.sim.organisms[ki];
        o.fear_level = (o.fear_level - 0.05).max(0.0);
    }
    ctx.think("intercepting raiders");
    ctx.discover("defense", "intercepted a raid");
    0.008
}
