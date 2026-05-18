//! Action 236: whisper a secret to one kin; boost trust and comfort.
use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(&ki) = ctx.kin.first() else {
        ctx.think("secrets with no one to tell");
        return 0.0;
    };
    let oid = ctx.sim.organisms[ki].id.clone();
    {
        let me = &mut ctx.sim.organisms[ctx.idx];
        let t = me.org_trust.entry(oid.clone()).or_insert(0.0);
        *t = (*t + 0.08).min(1.0);
        me.comfort = (me.comfort + 0.04).min(1.0);
    }
    {
        let o = &mut ctx.sim.organisms[ki];
        let my_id_placeholder = oid; // reuse var (oid was the other's id)
        let _ = my_id_placeholder;
        o.comfort = (o.comfort + 0.03).min(1.0);
    }
    ctx.think("sharing a secret");
    ctx.event("bond", "whispered a secret to a trusted kin");
    0.006
}
