//! NEON kernels. NEON `fadd`/`fmul`/`fsqrt` are IEEE operations (no FMA unless
//! asked for), and `fcvtzs` saturates the way Rust's `as i32` does.

use std::arch::aarch64::*;

#[inline]
pub unsafe fn hypot4(x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    let x = vld1q_f32(x.as_ptr());
    let y = vld1q_f32(y.as_ptr());
    let (bx, by) = abs_swap(x, y);
    let bx_i = vreinterpretq_s32_f32(bx);
    let by_i = vreinterpretq_s32_f32(by);
    let inf_exp = vdupq_n_s32(0xff << 23);
    let y_is_inf = vceqq_s32(by_i, inf_exp);
    let x_special = vcgtq_s32(bx_i, vdupq_n_s32((0xff << 23) - 1));
    let y_zero = vceqq_s32(by_i, vdupq_n_s32(0));
    let far = vcgtq_s32(vsubq_s32(bx_i, by_i), vdupq_n_s32((25 << 23) - 1));
    let early_sum = vorrq_u32(x_special, vorrq_u32(y_zero, far));
    let sum = vaddq_f32(bx, by);

    let huge = vcgtq_s32(bx_i, vdupq_n_s32(((0x7f + 60) << 23) - 1));
    let tiny = vcltq_s32(by_i, vdupq_n_s32((0x7f - 60) << 23));
    let p90 = vreinterpretq_f32_s32(vdupq_n_s32(0x6c80_0000));
    let pm90 = vreinterpretq_f32_s32(vdupq_n_s32(0x1280_0000));
    let one = vdupq_n_f32(1.0);
    let z = blend(huge, p90, blend(tiny, pm90, one));
    let scale = blend(huge, pm90, blend(tiny, p90, one));
    let sx = vmulq_f32(bx, scale);
    let sy = vmulq_f32(by, scale);
    let root = vsqrtq_f32(sum_of_squares(sx, sy));
    let scaled = vmulq_f32(z, root);
    let mid = blend(early_sum, sum, scaled);
    store(blend(y_is_inf, by, mid))
}

#[inline]
pub unsafe fn l1_4(ox: f32, oy: f32, xs: [f32; 4], ys: [f32; 4]) -> [f32; 4] {
    let dx = vsubq_f32(vld1q_f32(xs.as_ptr()), vdupq_n_f32(ox));
    let dy = vsubq_f32(vld1q_f32(ys.as_ptr()), vdupq_n_f32(oy));
    store(vaddq_f32(vabsq_f32(dx), vabsq_f32(dy)))
}

#[inline]
pub unsafe fn integrate4(
    x: [f32; 4],
    y: [f32; 4],
    prev_x: [f32; 4],
    prev_y: [f32; 4],
    vx: [f32; 4],
    vy: [f32; 4],
    alpha: f32,
    max_step: f32,
) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    let inst_x = vsubq_f32(vld1q_f32(x.as_ptr()), vld1q_f32(prev_x.as_ptr()));
    let inst_y = vsubq_f32(vld1q_f32(y.as_ptr()), vld1q_f32(prev_y.as_ptr()));
    let limit = vdupq_n_f32(max_step);
    let too = vorrq_u32(
        vcgtq_f32(vabsq_f32(inst_x), limit),
        vcgtq_f32(vabsq_f32(inst_y), limit),
    );
    let a = vdupq_n_f32(alpha);
    let b = vdupq_n_f32(1.0 - alpha);
    let zero = vdupq_n_f32(0.0);
    let vx = blend(
        too,
        zero,
        vaddq_f32(vmulq_f32(a, inst_x), vmulq_f32(b, vld1q_f32(vx.as_ptr()))),
    );
    let vy = blend(
        too,
        zero,
        vaddq_f32(vmulq_f32(a, inst_y), vmulq_f32(b, vld1q_f32(vy.as_ptr()))),
    );
    (x, y, store(vx), store(vy))
}

#[inline]
pub unsafe fn trunc4(xs: [f32; 4]) -> [i32; 4] {
    let mut out = [0i32; 4];
    vst1q_s32(out.as_mut_ptr(), vcvtq_s32_f32(vld1q_f32(xs.as_ptr())));
    out
}

#[inline]
unsafe fn abs_swap(x: float32x4_t, y: float32x4_t) -> (float32x4_t, float32x4_t) {
    let ax = vabsq_f32(x);
    let ay = vabsq_f32(y);
    let swap = vcltq_s32(vreinterpretq_s32_f32(ax), vreinterpretq_s32_f32(ay));
    (blend(swap, ay, ax), blend(swap, ax, ay))
}

#[inline]
unsafe fn sum_of_squares(x: float32x4_t, y: float32x4_t) -> float32x4_t {
    let x_lo = vcvt_f64_f32(vget_low_f32(x));
    let y_lo = vcvt_f64_f32(vget_low_f32(y));
    let x_hi = vcvt_f64_f32(vget_high_f32(x));
    let y_hi = vcvt_f64_f32(vget_high_f32(y));
    let lo = vcvt_f32_f64(vaddq_f64(vmulq_f64(x_lo, x_lo), vmulq_f64(y_lo, y_lo)));
    let hi = vcvt_f32_f64(vaddq_f64(vmulq_f64(x_hi, x_hi), vmulq_f64(y_hi, y_hi)));
    vcombine_f32(lo, hi)
}

#[inline]
unsafe fn blend(mask: uint32x4_t, a: float32x4_t, b: float32x4_t) -> float32x4_t {
    vbslq_f32(mask, a, b)
}

#[inline]
unsafe fn store(v: float32x4_t) -> [f32; 4] {
    let mut out = [0f32; 4];
    vst1q_f32(out.as_mut_ptr(), v);
    out
}
