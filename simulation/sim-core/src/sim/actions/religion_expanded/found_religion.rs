use super::super::ctx::ActionCtx;
use super::{action_is_possible, create_religion, recount_religion_adherents, religion_kind_for_era};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !action_is_possible(ctx.sim, ctx.idx, 456, &ctx.near, ctx.tick) {
        return 0.0;
    }
    let lid = ctx.lid.clone();

    let kind = religion_kind_for_era(ctx.sim.era(&lid));
    let name_seed = ctx
        .sim
        .world_seed
        .wrapping_add(ctx.tick)
        .wrapping_add(u64::from(ctx.sim.next_religion_id));
    let religion_id = create_religion(ctx.sim, kind, &lid, ctx.tick, name_seed);

    {
        let founder = &mut ctx.sim.organisms[ctx.idx];
        founder.religion_id = Some(religion_id.clone());
        founder.piety = founder.piety.max(0.35);
    }
    for &kin_idx in &ctx.kin {
        let follower = &mut ctx.sim.organisms[kin_idx];
        if follower.religion_id.is_none() {
            follower.religion_id = Some(religion_id.clone());
            follower.piety = follower.piety.max(0.20);
        }
    }
    recount_religion_adherents(ctx.sim);

    let religion_name = ctx
        .sim
        .religions
        .iter()
        .find(|religion| religion.id == religion_id)
        .map(|religion| religion.name.clone())
        .unwrap_or_else(|| religion_id.clone());
    ctx.event(
        "culture",
        &format!(
            "lineage {lid} elder founded {religion_name}, an organised {} faith",
            kind.name()
        ),
    );
    ctx.discover("organized_religion", "founded an organised religion");
    0.020
}
