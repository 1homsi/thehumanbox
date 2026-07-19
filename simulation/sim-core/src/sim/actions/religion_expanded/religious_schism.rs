use super::super::ctx::ActionCtx;
use super::{action_is_possible, create_religion, recount_religion_adherents, MIN_SCHISM_MEMBERS};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !action_is_possible(ctx.sim, ctx.idx, 469, &ctx.near, ctx.tick) {
        return 0.0;
    }
    let Some(parent_id) = ctx.org().religion_id.clone() else {
        return 0.0;
    };
    let Some(parent) = ctx
        .sim
        .religions
        .iter()
        .find(|religion| religion.id == parent_id)
        .cloned()
    else {
        return 0.0;
    };
    let mut coreligionists: Vec<usize> = ctx
        .kin
        .iter()
        .copied()
        .filter(|&kin_idx| ctx.sim.organisms[kin_idx].religion_id.as_deref() == Some(parent_id.as_str()))
        .collect();
    coreligionists.sort_unstable();
    let name_seed = ctx
        .sim
        .world_seed
        .wrapping_add(ctx.tick)
        .wrapping_add(u64::from(ctx.sim.next_religion_id));
    let sect_id = create_religion(ctx.sim, parent.kind, &ctx.lid, ctx.tick, name_seed);
    let mut converts = vec![ctx.idx];
    converts.extend(coreligionists.into_iter().take(MIN_SCHISM_MEMBERS - 1));
    for convert_idx in converts {
        let convert = &mut ctx.sim.organisms[convert_idx];
        convert.religion_id = Some(sect_id.clone());
        convert.piety = convert.piety.max(0.25);
    }
    recount_religion_adherents(ctx.sim);

    let sect_name = ctx
        .sim
        .religions
        .iter()
        .find(|religion| religion.id == sect_id)
        .map(|religion| religion.name.clone())
        .unwrap_or_else(|| sect_id.clone());
    ctx.event(
        "governance",
        &format!(
            "{sect_name} split from {}, tearing the religious community apart",
            parent.name
        ),
    );
    ctx.discover("schism", "witnessed a devastating religious schism");
    0.008
}
