use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    super::super::relationships::share_secret::apply(ctx)
}
