
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let pupil = ctx.kin.iter().copied()
        .filter(|&k| ctx.sim.organisms[k].age < 1000)
        .min_by_key(|&k| ctx.sim.organisms[k].age);
    let Some(ki) = pupil else {
        ctx.think("looking for a student");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.boredom = (o.boredom - 0.06).max(0.0);
    }
    ctx.think("teaching a new word");
    ctx.discover("language", "spread a new word");
    let tn = ctx.sim.organisms[ki].name.clone();
    ctx.event("social", &format!("taught {} a new word", tn));
    0.004
}
