use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let mates: Vec<usize> = ctx
        .kin
        .iter()
        .copied()
        .filter(|&k| {
            let a = ctx.sim.organisms[k].age;
            a >= 800 && a < 4000
        })
        .collect();
    if mates.len() < 2 {
        ctx.think("seeking matches");
        return 0.0;
    }
    let (a, b) = (mates[0], mates[1]);
    let bid = ctx.sim.organisms[b].id.clone();
    let aid = ctx.sim.organisms[a].id.clone();
    {
        let oa = &mut ctx.sim.organisms[a];
        let t = oa.org_trust.entry(bid).or_insert(0.0);
        *t = (*t + 0.20).min(1.0);
    }
    {
        let ob = &mut ctx.sim.organisms[b];
        let t2 = ob.org_trust.entry(aid).or_insert(0.0);
        *t2 = (*t2 + 0.20).min(1.0);
    }
    ctx.think("arranging a marriage");
    ctx.discover("marriage-rite", "arranged a marriage");
    0.012
}
