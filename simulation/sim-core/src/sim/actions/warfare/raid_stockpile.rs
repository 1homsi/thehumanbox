use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    // A raid takes food from someone who has it: a nearby rival's stores.
    let me = ctx.idx;
    let lineage = ctx.lid.clone();
    let victim = ctx.near.iter().copied().find(|&i| {
        let o = &ctx.sim.organisms[i];
        o.alive
            && o.lineage_id != lineage
            && o.inv_food > 0
            && ctx.sim.organisms[me].attitude_toward(&o.lineage_id) < -0.1
    });
    let Some(v) = victim else {
        ctx.think("scouting for caches");
        return 0.0;
    };
    ctx.sim.organisms[v].inv_food -= 1;
    let their = ctx.sim.organisms[v].lineage_id.clone();
    ctx.sim.organisms[v].update_attitude(&lineage, -0.05);
    let o = &mut ctx.sim.organisms[me];
    o.inv_food = o.inv_food.saturating_add(1);
    o.update_attitude(&their, -0.02);
    ctx.think("raiding a stockpile");
    ctx.discover("stockpile-raid", "raided a cache");
    0.010
}
