use super::super::ctx::ActionCtx;
use crate::sim::government::LawKind;

const TAX_RATE_STEP: f32 = 0.02;
const MAX_TAX_RATE: f32 = 0.5;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some(government) = ctx.sim.governments.get_mut(&ctx.lid) else {
        ctx.think("there is no government able to levy a tax");
        return 0.0;
    };
    if !government.has_law(LawKind::Taxation) {
        ctx.think("taxation has not been enacted into law");
        return 0.0;
    }

    let old_rate = government.tax_rate.clamp(0.0, MAX_TAX_RATE);
    let new_rate = (old_rate + TAX_RATE_STEP).min(MAX_TAX_RATE);
    if new_rate <= old_rate {
        ctx.think("the tax rate is already at its legal limit");
        return 0.0;
    }
    government.tax_rate = new_rate;

    let detail = format!("set the public tax rate to {:.0}%", new_rate * 100.0);
    ctx.think("levying a tax");
    ctx.event("governance", &detail);
    0.006
}
