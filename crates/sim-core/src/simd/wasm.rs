//! `simd128` kernels. Compiled only into the SIMD wasm module (`wasm-simd`).
//! The scalar module leaves this file out, so a browser without WASM SIMD can
//! still instantiate the fallback build.

use core::arch::wasm32::*;

#[target_feature(enable = "simd128")]
#[inline]
pub unsafe fn hypot4(x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    let x = f32x4(x[0], x[1], x[2], x[3]);
    let y = f32x4(y[0], y[1], y[2], y[3]);
    let (bx, by) = abs_swap(x, y);
    let inf_exp = i32x4_splat(0xff << 23);
    let y_is_inf = i32x4_eq(by, inf_exp);
    let x_special = i32x4_gt(bx, i32x4_splat((0xff << 23) - 1));
    let y_zero = i32x4_eq(by, i32x4_splat(0));
    let far = i32x4_gt(i32x4_sub(bx, by), i32x4_splat((25 << 23) - 1));
    let early_sum = v128_or(x_special, v128_or(y_zero, far));
    let sum = f32x4_add(bx, by);

    let huge = i32x4_gt(bx, i32x4_splat(((0x7f + 60) << 23) - 1));
    let tiny = i32x4_lt(by, i32x4_splat((0x7f - 60) << 23));
    let p90 = f32x4_splat(f32::from_bits(0x6c80_0000));
    let pm90 = f32x4_splat(f32::from_bits(0x1280_0000));
    let one = f32x4_splat(1.0);
    let z = blend(huge, p90, blend(tiny, pm90, one));
    let scale = blend(huge, pm90, blend(tiny, p90, one));
    let sx = f32x4_mul(bx, scale);
    let sy = f32x4_mul(by, scale);
    let root = f32x4_sqrt(sum_of_squares(sx, sy));
    let scaled = f32x4_mul(z, root);
    let mid = blend(early_sum, sum, scaled);
    store(blend(y_is_inf, by, mid))
}

#[target_feature(enable = "simd128")]
#[inline]
pub unsafe fn l1_4(ox: f32, oy: f32, xs: [f32; 4], ys: [f32; 4]) -> [f32; 4] {
    let dx = f32x4_sub(f32x4(xs[0], xs[1], xs[2], xs[3]), f32x4_splat(ox));
    let dy = f32x4_sub(f32x4(ys[0], ys[1], ys[2], ys[3]), f32x4_splat(oy));
    store(f32x4_add(f32x4_abs(dx), f32x4_abs(dy)))
}

#[target_feature(enable = "simd128")]
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
    let inst_x = f32x4_sub(
        f32x4(x[0], x[1], x[2], x[3]),
        f32x4(prev_x[0], prev_x[1], prev_x[2], prev_x[3]),
    );
    let inst_y = f32x4_sub(
        f32x4(y[0], y[1], y[2], y[3]),
        f32x4(prev_y[0], prev_y[1], prev_y[2], prev_y[3]),
    );
    let limit = f32x4_splat(max_step);
    let too = v128_or(
        f32x4_gt(f32x4_abs(inst_x), limit),
        f32x4_gt(f32x4_abs(inst_y), limit),
    );
    let a = f32x4_splat(alpha);
    let b = f32x4_splat(1.0 - alpha);
    let zero = f32x4_splat(0.0);
    let vx = blend(
        too,
        zero,
        f32x4_add(
            f32x4_mul(a, inst_x),
            f32x4_mul(b, f32x4(vx[0], vx[1], vx[2], vx[3])),
        ),
    );
    let vy = blend(
        too,
        zero,
        f32x4_add(
            f32x4_mul(a, inst_y),
            f32x4_mul(b, f32x4(vy[0], vy[1], vy[2], vy[3])),
        ),
    );
    (x, y, store(vx), store(vy))
}

#[target_feature(enable = "simd128")]
#[inline]
pub unsafe fn trunc4(xs: [f32; 4]) -> [i32; 4] {
    let i = i32x4_trunc_sat_f32x4(f32x4(xs[0], xs[1], xs[2], xs[3]));
    [
        i32x4_extract_lane::<0>(i),
        i32x4_extract_lane::<1>(i),
        i32x4_extract_lane::<2>(i),
        i32x4_extract_lane::<3>(i),
    ]
}

#[target_feature(enable = "simd128")]
unsafe fn abs_swap(x: v128, y: v128) -> (v128, v128) {
    let ax = f32x4_abs(x);
    let ay = f32x4_abs(y);
    let swap = i32x4_lt(ax, ay);
    (blend(swap, ay, ax), blend(swap, ax, ay))
}

#[target_feature(enable = "simd128")]
unsafe fn sum_of_squares(x: v128, y: v128) -> v128 {
    let x_lo = f64x2_promote_low_f32x4(x);
    let y_lo = f64x2_promote_low_f32x4(y);
    let x_hi = f64x2_promote_low_f32x4(i32x4_shuffle::<2, 3, 0, 1>(x, x));
    let y_hi = f64x2_promote_low_f32x4(i32x4_shuffle::<2, 3, 0, 1>(y, y));
    let lo = f32x4_demote_f64x2_zero(f64x2_add(f64x2_mul(x_lo, x_lo), f64x2_mul(y_lo, y_lo)));
    let hi = f32x4_demote_f64x2_zero(f64x2_add(f64x2_mul(x_hi, x_hi), f64x2_mul(y_hi, y_hi)));
    i32x4_shuffle::<0, 1, 4, 5>(lo, hi)
}

#[target_feature(enable = "simd128")]
#[inline]
unsafe fn blend(mask: v128, a: v128, b: v128) -> v128 {
    v128_or(v128_and(mask, a), v128_andnot(b, mask))
}

#[target_feature(enable = "simd128")]
#[inline]
unsafe fn store(v: v128) -> [f32; 4] {
    [
        f32x4_extract_lane::<0>(v),
        f32x4_extract_lane::<1>(v),
        f32x4_extract_lane::<2>(v),
        f32x4_extract_lane::<3>(v),
    ]
}
