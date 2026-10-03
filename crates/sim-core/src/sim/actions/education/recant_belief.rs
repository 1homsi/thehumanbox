use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.org_mut().comfort = (ctx.org().comfort - 0.03).max(0.0);
    ctx.think("admitting I was wrong takes more courage than stubbornness");
    ctx.discover("recantation", "publicly recanted a previously held belief");
    ctx.event(
        "culture",
        "a tribesman recants a belief in the face of new evidence",
    );
    0.007
}
