use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let kids: Vec<usize> = ctx
        .kin
        .iter()
        .copied()
        .filter(|&k| ctx.sim.organisms[k].age < 500)
        .collect();
    if kids.is_empty() {
        ctx.think("looking for kids to play");
        return 0.0;
    }
    for &ki in &kids {
        let o = &mut ctx.sim.organisms[ki];
        o.comfort = (o.comfort + 0.06).min(1.0);
        o.boredom = (o.boredom - 0.10).max(0.0);
    }
    ctx.org_mut().comfort = (ctx.org().comfort + 0.03).min(1.0);
    let bonus = 0.004 * kids.len().min(4) as f32;
    ctx.think("playing with the kids");
    bonus
}
