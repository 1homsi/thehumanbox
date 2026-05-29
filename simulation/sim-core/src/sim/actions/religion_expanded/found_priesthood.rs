use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.org().is_elder || ctx.kin.len() < 3 {
        return 0.0;
    }
    ctx.event(
        "governance",
        "establishing a formal priesthood to guide the faithful",
    );
    ctx.discover("priesthood", "founded the first organised priesthood");
    0.020
}
