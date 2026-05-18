//! Action 232: jealousy at a stranger near kin; lower attitude briefly.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let stranger = ctx.near.iter().copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(_) = stranger else {
        ctx.think("no rival to envy");
        return 0.0;
    };
    if ctx.kin.is_empty() {
        ctx.think("jealous but alone");
        return 0.0;
    }
    // Lower attitude toward all foreign lineages slightly
    let foreign_lids: Vec<String> = ctx.near.iter()
        .map(|&k| ctx.sim.organisms[k].lineage_id.clone())
        .filter(|l| *l != lid)
        .collect::<std::collections::HashSet<_>>()
        .into_iter().collect();
    for fl in &foreign_lids {
        ctx.sim.organisms[ctx.idx].update_attitude(fl, -0.04);
    }
    ctx.sim.organisms[ctx.idx].comfort = (ctx.sim.organisms[ctx.idx].comfort - 0.04).max(0.0);
    ctx.think("overcome with jealousy");
    ctx.event("social", "had a jealousy outburst over rivals");
    0.003
}
