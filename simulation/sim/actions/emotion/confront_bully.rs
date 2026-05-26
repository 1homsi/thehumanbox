use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx.near.iter().copied().find(|&k| {
        let o = &ctx.sim.organisms[k];
        o.lineage_id != lid
    });
    let Some(_ki) = pick else {
        ctx.think("no bully in sight");
        return 0.0;
    };
    ctx.think("standing up to the aggressor");
    ctx.event("social", "confronted a bully to defend the group's dignity");
    0.006
}
