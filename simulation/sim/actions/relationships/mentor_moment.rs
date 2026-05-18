//! Action 243: elder teaches a young kin; discover "mentorship".
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.sim.organisms[ctx.idx].is_elder {
        ctx.think("not yet an elder");
        return 0.0;
    }
    let pick = ctx.kin.iter().copied()
        .find(|&ki| ctx.sim.organisms[ki].age < 400);
    let Some(ki) = pick else {
        ctx.think("no young kin to mentor");
        return 0.0;
    };
    {
        let o = &mut ctx.sim.organisms[ki];
        o.boredom = (o.boredom - 0.10).max(0.0);
        o.comfort = (o.comfort + 0.06).min(1.0);
        o.energy  = (o.energy  + 0.04).min(1.0);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort + 0.05).min(1.0);
    ctx.think("sharing wisdom with the young");
    ctx.discover("mentorship", "mentored a younger kin member");
    0.012
}
