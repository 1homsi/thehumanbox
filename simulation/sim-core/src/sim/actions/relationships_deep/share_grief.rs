use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(partner_idx) = super::emotional_partner(ctx.sim, ctx.idx, 2220, &ctx.near) else {
        return 0.0;
    };
    let actor_name = ctx.org().name.clone();
    let partner_name = ctx.sim.organisms[partner_idx].name.clone();
    for person_idx in [ctx.idx, partner_idx] {
        let person = &mut ctx.sim.organisms[person_idx];
        person.grief_ticks = person.grief_ticks.saturating_sub(20);
        person.comfort = (person.comfort + 0.04).min(1.0);
        person.loneliness = (person.loneliness - 0.03).max(0.0);
    }
    ctx.sim.organisms[partner_idx].think(&format!("shared grief with {actor_name}"), ctx.tick);
    ctx.think(&format!("shared grief with {partner_name}"));
    ctx.event("life", &format!("shared grief with {partner_name}"));
    0.005
}
