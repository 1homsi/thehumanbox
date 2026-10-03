use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let effective_rate = ctx
        .sim
        .governments
        .get(&ctx.lid)
        .map(|government| government.effective_tax_rate())
        .unwrap_or(0.0);
    if effective_rate <= 0.0 {
        ctx.think("there is no lawful tax to collect");
        return 0.0;
    }

    let amount = crate::sim::civ::economy_tick::remit_pending_income_taxes(ctx.sim, &ctx.lid);
    if amount == 0 {
        ctx.think("all payroll tax receipts are already accounted for");
        return 0.0;
    }

    ctx.think("collecting taxes");
    ctx.event(
        "governance",
        &format!("remitted {amount} in rate-assessed payroll taxes to the public treasury"),
    );
    0.007
}
