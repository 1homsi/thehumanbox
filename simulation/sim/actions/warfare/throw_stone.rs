use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied().find(|&k| {
        let o = &ctx.sim.organisms[k];
        o.lineage_id != lid && ctx.sim.organisms[ctx.idx].attitude_toward(&o.lineage_id) < -0.10
    });
    let Some(ki) = pick else {
        ctx.think("no target for a stone");
        return 0.0;
    };
    let o = &mut ctx.sim.organisms[ki];
    o.health = (o.health - 0.03).max(0.0);
    o.fear_level = (o.fear_level + 0.05).min(1.0);
    ctx.think("hurling a stone");
    0.004
}
