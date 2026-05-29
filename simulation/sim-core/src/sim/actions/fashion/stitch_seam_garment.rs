use super::super::ctx::ActionCtx;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.take_good("piece", 1) {
        ctx.think("no pieces to stitch");
        return 0.005;
    }
    ctx.add_good("garment", 1);
    ctx.think("stitch seam");
    ctx.event("chore", "stitched a garment together");
    0.06
}
