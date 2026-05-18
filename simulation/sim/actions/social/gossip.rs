
use crate::organism::organism::Organism;
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("looking for news");
        return 0.0;
    };
    let snap: Vec<((i32, i32), f32)> = ctx.sim.organisms[ctx.idx]
        .food_memory.iter().take(3).map(|(&k, &v)| (k, v)).collect();
    let ms = ctx.sim.organisms[ki].traits.memory_strength;
    for (k, v) in snap {
        Organism::remember(&mut ctx.sim.organisms[ki].food_memory, k.0, k.1, v * 0.5, ms);
    }
    ctx.think("trading gossip");
    0.004
}
