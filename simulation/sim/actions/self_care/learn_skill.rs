//! Action 115: learn a discovery from an elder kin.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let teacher = ctx.kin.iter().copied()
        .find(|&k| ctx.sim.organisms[k].is_elder);
    let Some(ki) = teacher else {
        ctx.think("seeking a teacher");
        return 0.0;
    };
    let theirs: Vec<String> = ctx.sim.organisms[ki]
        .discoveries.iter().cloned().collect();
    let mut gained = false;
    for d in theirs {
        if !ctx.sim.organisms[ctx.idx].discoveries.contains(&d) {
            ctx.sim.organisms[ctx.idx].discoveries.insert(d);
            gained = true;
            break;
        }
    }
    ctx.think("learning from an elder");
    if gained { 0.012 } else { 0.0 }
}
