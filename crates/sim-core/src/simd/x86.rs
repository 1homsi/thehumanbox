//! SSE2 kernels. SSE2 is the x86_64 baseline, so these stay ordinary functions
//! and inline into the tick. No fused multiply-add: every op is a plain IEEE
//! add, sub, mul, sqrt, or compare, and the bits match the scalar path.

use std::arch::x86_64::*;

#[inline]
pub unsafe fn hypot4(x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    let x = _mm_loadu_ps(x.as_ptr());
    let y = _mm_loadu_ps(y.as_ptr());
    let (bx, by) = abs_swap(x, y);
    let bx_i = _mm_castps_si128(bx);
    let by_i = _mm_castps_si128(by);
    let inf_exp = _mm_set1_epi32(0xff << 23);
    let y_is_inf = _mm_castsi128_ps(_mm_cmpeq_epi32(by_i, inf_exp));
    let x_special = _mm_castsi128_ps(_mm_cmpgt_epi32(bx_i, _mm_set1_epi32((0xff << 23) - 1)));
    let y_zero = _mm_castsi128_ps(_mm_cmpeq_epi32(by_i, _mm_setzero_si128()));
    let far = _mm_castsi128_ps(_mm_cmpgt_epi32(
        _mm_sub_epi32(bx_i, by_i),
        _mm_set1_epi32((25 << 23) - 1),
    ));
    let early_sum = _mm_or_ps(x_special, _mm_or_ps(y_zero, far));
    let sum = _mm_add_ps(bx, by);

    let huge = _mm_castsi128_ps(_mm_cmpgt_epi32(bx_i, _mm_set1_epi32(((0x7f + 60) << 23) - 1)));
    let tiny = _mm_castsi128_ps(_mm_cmplt_epi32(by_i, _mm_set1_epi32((0x7f - 60) << 23)));
    let p90 = _mm_castsi128_ps(_mm_set1_epi32(0x6c80_0000));
    let pm90 = _mm_castsi128_ps(_mm_set1_epi32(0x1280_0000));
    let one = _mm_set1_ps(1.0);
    let z_tiny = blend(tiny, pm90, one);
    let z = blend(huge, p90, z_tiny);
    let scale = blend(huge, pm90, blend(tiny, p90, one));
    let sx = _mm_mul_ps(bx, scale);
    let sy = _mm_mul_ps(by, scale);
    let root = _mm_sqrt_ps(sum_of_squares(sx, sy));
    let scaled = _mm_mul_ps(z, root);
    let mid = blend(early_sum, sum, scaled);
    store(blend(y_is_inf, by, mid))
}

#[inline]
pub unsafe fn l1_4(ox: f32, oy: f32, xs: [f32; 4], ys: [f32; 4]) -> [f32; 4] {
    let dx = _mm_sub_ps(_mm_loadu_ps(xs.as_ptr()), _mm_set1_ps(ox));
    let dy = _mm_sub_ps(_mm_loadu_ps(ys.as_ptr()), _mm_set1_ps(oy));
    let sign = _mm_set1_ps(-0.0);
    store(_mm_add_ps(_mm_andnot_ps(sign, dx), _mm_andnot_ps(sign, dy)))
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
    let inst_x = _mm_sub_ps(_mm_loadu_ps(x.as_ptr()), _mm_loadu_ps(prev_x.as_ptr()));
    let inst_y = _mm_sub_ps(_mm_loadu_ps(y.as_ptr()), _mm_loadu_ps(prev_y.as_ptr()));
    let sign = _mm_set1_ps(-0.0);
    let limit = _mm_set1_ps(max_step);
    let too = _mm_or_ps(
        _mm_cmpgt_ps(_mm_andnot_ps(sign, inst_x), limit),
        _mm_cmpgt_ps(_mm_andnot_ps(sign, inst_y), limit),
    );
    let a = _mm_set1_ps(alpha);
    let b = _mm_set1_ps(1.0 - alpha);
    let zero = _mm_setzero_ps();
    let vx = blend(
        too,
        zero,
        _mm_add_ps(_mm_mul_ps(a, inst_x), _mm_mul_ps(b, _mm_loadu_ps(vx.as_ptr()))),
    );
    let vy = blend(
        too,
        zero,
        _mm_add_ps(_mm_mul_ps(a, inst_y), _mm_mul_ps(b, _mm_loadu_ps(vy.as_ptr()))),
    );
    (x, y, store(vx), store(vy))
}

#[inline(always)]
pub unsafe fn trunc4(xs: [f32; 4]) -> [i32; 4] {
    // `cvttps2dq` does not saturate the way `as i32` does. One compare covers
    // every lane: NaN and anything outside the i32 range take the scalar cast.
    let v = _mm_loadu_ps(xs.as_ptr());
    let abs = _mm_andnot_ps(_mm_set1_ps(-0.0f32), v);
    let bad = _mm_or_ps(
        _mm_cmpunord_ps(v, v),
        _mm_cmpge_ps(abs, _mm_set1_ps(2147483648.0f32)),
    );
    if _mm_movemask_ps(bad) != 0 {
        return xs.map(|x| x as i32);
    }
    let i = _mm_cvttps_epi32(v);
    let mut out = [0i32; 4];
    _mm_storeu_si128(out.as_mut_ptr().cast(), i);
    out
}

#[inline]
unsafe fn abs_swap(x: __m128, y: __m128) -> (__m128, __m128) {
    let sign = _mm_set1_ps(-0.0);
    let ax = _mm_andnot_ps(sign, x);
    let ay = _mm_andnot_ps(sign, y);
    let swap = _mm_castsi128_ps(_mm_cmplt_epi32(_mm_castps_si128(ax), _mm_castps_si128(ay)));
    (blend(swap, ay, ax), blend(swap, ax, ay))
}

#[inline]
unsafe fn sum_of_squares(x: __m128, y: __m128) -> __m128 {
    let x_lo = _mm_cvtps_pd(x);
    let y_lo = _mm_cvtps_pd(y);
    let x_hi = _mm_cvtps_pd(_mm_movehl_ps(x, x));
    let y_hi = _mm_cvtps_pd(_mm_movehl_ps(y, y));
    let lo = _mm_cvtpd_ps(_mm_add_pd(_mm_mul_pd(x_lo, x_lo), _mm_mul_pd(y_lo, y_lo)));
    let hi = _mm_cvtpd_ps(_mm_add_pd(_mm_mul_pd(x_hi, x_hi), _mm_mul_pd(y_hi, y_hi)));
    _mm_movelh_ps(lo, hi)
}

#[inline]
unsafe fn blend(mask: __m128, a: __m128, b: __m128) -> __m128 {
    _mm_or_ps(_mm_and_ps(mask, a), _mm_andnot_ps(mask, b))
}

#[inline]
unsafe fn store(v: __m128) -> [f32; 4] {
    let mut out = [0f32; 4];
    _mm_storeu_ps(out.as_mut_ptr(), v);
    out
}
