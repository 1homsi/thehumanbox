//! Portable SIMD for the hot numeric passes: movement integration, distance
//! checks, and spatial bucketing.
//!
//! Native builds use SSE2 or NEON. The wasm SIMD module (`feature = "wasm-simd"`)
//! uses `simd128`; the scalar module and any other target run the same
//! operations one lane at a time. Every kernel matches the scalar path
//! bit for bit: no fused multiply-add, no reassociation, and `hypot` follows
//! `DetMath::det_hypot` (the f64 product inside `libm::hypotf`, then `sqrt`).

use crate::math::DetMath;
use std::ptr;

/// Run `body` where the wasm SIMD kernels can inline. `simd128` is not a
/// baseline feature, so only a `target_feature` function may contain those
/// calls. Native SSE2 and NEON are baseline and inline into an ordinary one.
macro_rules! simd_kernel {
    ($name:ident ($($arg:ident: $ty:ty),* $(,)?) $body:block) => {
        #[cfg(all(target_arch = "wasm32", feature = "wasm-simd"))]
        #[target_feature(enable = "simd128")]
        #[inline]
        unsafe fn $name($($arg: $ty),*) $body

        #[cfg(not(all(target_arch = "wasm32", feature = "wasm-simd")))]
        #[inline]
        fn $name($($arg: $ty),*) $body
    };
}

macro_rules! run_simd_kernel {
    ($name:ident ($($arg:expr),* $(,)?)) => {
        #[cfg(all(target_arch = "wasm32", feature = "wasm-simd"))]
        unsafe { $name($($arg),*) }
        #[cfg(not(all(target_arch = "wasm32", feature = "wasm-simd")))]
        $name($($arg),*)
    };
}

#[cfg(target_arch = "aarch64")]
mod aarch64;
#[cfg(all(target_arch = "wasm32", feature = "wasm-simd"))]
mod wasm;
#[cfg(target_arch = "x86_64")]
mod x86;

const LANES: usize = 4;

/// Release builds drop `debug_assert`, and the kernels then read a fixed width.
/// A short slice has to fail here, before that read.
#[inline(always)]
fn require_equal_len(n: usize, lengths: &[usize]) {
    assert!(lengths.iter().all(|&len| len == n), "simd slice lengths differ");
}

/// Positions and the previous smoothed velocity, one lane per organism.
pub struct VelocityIn<'a> {
    pub x: &'a [f32],
    pub y: &'a [f32],
    pub prev_x: &'a [f32],
    pub prev_y: &'a [f32],
    pub vx: &'a [f32],
    pub vy: &'a [f32],
    pub alive: &'a [bool],
}

/// Where the integration writes the new previous position and smoothed velocity.
pub struct VelocityOut<'a> {
    pub prev_x: &'a mut [f32],
    pub prev_y: &'a mut [f32],
    pub vx: &'a mut [f32],
    pub vy: &'a mut [f32],
}

/// Smoothed velocity step used by the end-of-tick pass. Dead lanes stay as they were.
#[inline]
pub fn integrate_velocity(input: &VelocityIn<'_>, alpha: f32, max_step: f32, out: &mut VelocityOut<'_>) {
    let n = input.x.len();
    require_equal_len(
        n,
        &[
            input.y.len(),
            input.prev_x.len(),
            input.prev_y.len(),
            input.vx.len(),
            input.vy.len(),
            input.alive.len(),
            out.prev_x.len(),
            out.prev_y.len(),
            out.vx.len(),
            out.vy.len(),
        ],
    );
    simd_kernel!(integrate_velocity_inner(
        input: &VelocityIn<'_>,
        alpha: f32,
        max_step: f32,
        out: &mut VelocityOut<'_>,
    ) {
        let n = input.x.len();
        let mut i = 0;
        while i + LANES <= n {
            // Full groups only: a fixed width load, not a length-checked copy.
            let xs = unsafe { ptr::read_unaligned(input.x.as_ptr().add(i).cast()) };
            let ys = unsafe { ptr::read_unaligned(input.y.as_ptr().add(i).cast()) };
            let px = unsafe { ptr::read_unaligned(input.prev_x.as_ptr().add(i).cast()) };
            let py = unsafe { ptr::read_unaligned(input.prev_y.as_ptr().add(i).cast()) };
            let vx_l = unsafe { ptr::read_unaligned(input.vx.as_ptr().add(i).cast()) };
            let vy_l = unsafe { ptr::read_unaligned(input.vy.as_ptr().add(i).cast()) };
            let live = unsafe { ptr::read_unaligned(input.alive.as_ptr().add(i).cast::<[bool; LANES]>()) };
            let (nx, ny, nvx, nvy) = integrate4(xs, ys, px, py, vx_l, vy_l, alpha, max_step);
            for k in 0..LANES {
                let j = i + k;
                if live[k] {
                    out.prev_x[j] = nx[k];
                    out.prev_y[j] = ny[k];
                    out.vx[j] = nvx[k];
                    out.vy[j] = nvy[k];
                } else {
                    out.prev_x[j] = input.prev_x[j];
                    out.prev_y[j] = input.prev_y[j];
                    out.vx[j] = input.vx[j];
                    out.vy[j] = input.vy[j];
                }
            }
            i += LANES;
        }
        if i < n {
            integrate_velocity_scalar(
                &VelocityIn {
                    x: &input.x[i..],
                    y: &input.y[i..],
                    prev_x: &input.prev_x[i..],
                    prev_y: &input.prev_y[i..],
                    vx: &input.vx[i..],
                    vy: &input.vy[i..],
                    alive: &input.alive[i..],
                },
                alpha,
                max_step,
                &mut VelocityOut {
                    prev_x: &mut out.prev_x[i..],
                    prev_y: &mut out.prev_y[i..],
                    vx: &mut out.vx[i..],
                    vy: &mut out.vy[i..],
                },
            );
        }
    });
    run_simd_kernel!(integrate_velocity_inner(input, alpha, max_step, out));
}

/// In-place EMA on the organism columns. `alive` is `0` for a dead slot.
/// `prev_*` and `v*` are updated in place; dead slots are left as they were.
#[inline]
pub fn integrate_velocity_columns(
    x: &[f32],
    y: &[f32],
    prev_x: &mut [f32],
    prev_y: &mut [f32],
    vx: &mut [f32],
    vy: &mut [f32],
    alive: &[u8],
    alpha: f32,
    max_step: f32,
) {
    let n = x.len();
    require_equal_len(
        n,
        &[
            y.len(),
            prev_x.len(),
            prev_y.len(),
            vx.len(),
            vy.len(),
            alive.len(),
        ],
    );
    simd_kernel!(integrate_columns_inner(
        x: &[f32],
        y: &[f32],
        prev_x: &mut [f32],
        prev_y: &mut [f32],
        vx: &mut [f32],
        vy: &mut [f32],
        alive: &[u8],
        alpha: f32,
        max_step: f32,
    ) {
        let n = x.len();
        let mut i = 0;
        while i + LANES <= n {
            let xs = unsafe { ptr::read_unaligned(x.as_ptr().add(i).cast()) };
            let ys = unsafe { ptr::read_unaligned(y.as_ptr().add(i).cast()) };
            let px = unsafe { ptr::read_unaligned(prev_x.as_ptr().add(i).cast()) };
            let py = unsafe { ptr::read_unaligned(prev_y.as_ptr().add(i).cast()) };
            let vx_l = unsafe { ptr::read_unaligned(vx.as_ptr().add(i).cast()) };
            let vy_l = unsafe { ptr::read_unaligned(vy.as_ptr().add(i).cast()) };
            let live = unsafe { ptr::read_unaligned(alive.as_ptr().add(i).cast::<[u8; LANES]>()) };
            let (nx, ny, nvx, nvy) = integrate4(xs, ys, px, py, vx_l, vy_l, alpha, max_step);
            for k in 0..LANES {
                if live[k] == 0 {
                    continue;
                }
                let j = i + k;
                prev_x[j] = nx[k];
                prev_y[j] = ny[k];
                vx[j] = nvx[k];
                vy[j] = nvy[k];
            }
            i += LANES;
        }
        for j in i..n {
            if alive[j] == 0 {
                continue;
            }
            let (px, py, nvx, nvy) = ema_lane(x[j], y[j], prev_x[j], prev_y[j], vx[j], vy[j], alpha, max_step);
            prev_x[j] = px;
            prev_y[j] = py;
            vx[j] = nvx;
            vy[j] = nvy;
        }
    });
    run_simd_kernel!(integrate_columns_inner(
        x, y, prev_x, prev_y, vx, vy, alive, alpha, max_step
    ));
}

/// Manhattan distance from `(ox, oy)` to indexed positions, up to four lanes.
#[inline]
pub fn l1_indexed_chunk(
    ox: f32,
    oy: f32,
    xs: &[f32],
    ys: &[f32],
    indices: &[usize],
    start: usize,
) -> (usize, [f32; 4]) {
    let count = (indices.len() - start).min(LANES);
    let mut px = [0f32; LANES];
    let mut py = [0f32; LANES];
    for k in 0..count {
        let i = indices[start + k];
        px[k] = xs[i];
        py[k] = ys[i];
    }
    (count, l1_4(ox, oy, px, py))
}

/// The scalar EMA, kept for the benchmark and as the definition the SIMD lanes have to match.
#[inline]
pub fn integrate_velocity_scalar(
    input: &VelocityIn<'_>,
    alpha: f32,
    max_step: f32,
    out: &mut VelocityOut<'_>,
) {
    for i in 0..input.x.len() {
        if !input.alive[i] {
            out.prev_x[i] = input.prev_x[i];
            out.prev_y[i] = input.prev_y[i];
            out.vx[i] = input.vx[i];
            out.vy[i] = input.vy[i];
            continue;
        }
        let (px, py, vx, vy) = ema_lane(
            input.x[i],
            input.y[i],
            input.prev_x[i],
            input.prev_y[i],
            input.vx[i],
            input.vy[i],
            alpha,
            max_step,
        );
        out.prev_x[i] = px;
        out.prev_y[i] = py;
        out.vx[i] = vx;
        out.vy[i] = vy;
    }
}

/// One organism's EMA. Not inlined, so a NaN payload is the same on every path.
#[inline(never)]
fn ema_lane(
    x: f32,
    y: f32,
    prev_x: f32,
    prev_y: f32,
    vx: f32,
    vy: f32,
    alpha: f32,
    max_step: f32,
) -> (f32, f32, f32, f32) {
    let inst_x = x - prev_x;
    let inst_y = y - prev_y;
    if inst_x.abs() > max_step || inst_y.abs() > max_step {
        (x, y, 0.0, 0.0)
    } else {
        let beta = 1.0 - alpha;
        (x, y, alpha * inst_x + beta * vx, alpha * inst_y + beta * vy)
    }
}

/// `det_hypot(xs[i] - ox, ys[i] - oy)` for each lane.
#[inline]
pub fn hypot_distances(ox: f32, oy: f32, xs: &[f32], ys: &[f32], out: &mut [f32]) {
    require_equal_len(xs.len(), &[ys.len(), out.len()]);
    simd_kernel!(hypot_distances_inner(ox: f32, oy: f32, xs: &[f32], ys: &[f32], out: &mut [f32]) {
        let n = xs.len();
        let mut i = 0;
        while i + LANES <= n {
            let mut dx: [f32; LANES] = unsafe { ptr::read_unaligned(xs.as_ptr().add(i).cast()) };
            let mut dy: [f32; LANES] = unsafe { ptr::read_unaligned(ys.as_ptr().add(i).cast()) };
            for k in 0..LANES {
                dx[k] -= ox;
                dy[k] -= oy;
            }
            let dist = hypot4(dx, dy);
            unsafe { ptr::write_unaligned(out.as_mut_ptr().add(i).cast(), dist) };
            i += LANES;
        }
        if i < n {
            hypot_distances_scalar(ox, oy, &xs[i..], &ys[i..], &mut out[i..]);
        }
    });
    run_simd_kernel!(hypot_distances_inner(ox, oy, xs, ys, out));
}

/// Scalar `det_hypot` distances, for the benchmark and the identity tests.
#[inline]
pub fn hypot_distances_scalar(ox: f32, oy: f32, xs: &[f32], ys: &[f32], out: &mut [f32]) {
    for i in 0..xs.len() {
        out[i] = (xs[i] - ox).det_hypot(ys[i] - oy);
    }
}

/// Manhattan distance `|xs - ox| + |ys - oy|`.
#[inline]
pub fn l1_distances(ox: f32, oy: f32, xs: &[f32], ys: &[f32], out: &mut [f32]) {
    require_equal_len(xs.len(), &[ys.len(), out.len()]);
    simd_kernel!(l1_distances_inner(ox: f32, oy: f32, xs: &[f32], ys: &[f32], out: &mut [f32]) {
        let n = xs.len();
        let mut i = 0;
        while i + LANES <= n {
            let px = unsafe { ptr::read_unaligned(xs.as_ptr().add(i).cast()) };
            let py = unsafe { ptr::read_unaligned(ys.as_ptr().add(i).cast()) };
            let dist = l1_4(ox, oy, px, py);
            unsafe { ptr::write_unaligned(out.as_mut_ptr().add(i).cast(), dist) };
            i += LANES;
        }
        if i < n {
            l1_distances_scalar(ox, oy, &xs[i..], &ys[i..], &mut out[i..]);
        }
    });
    run_simd_kernel!(l1_distances_inner(ox, oy, xs, ys, out));
}

#[inline]
pub fn l1_distances_scalar(ox: f32, oy: f32, xs: &[f32], ys: &[f32], out: &mut [f32]) {
    for i in 0..xs.len() {
        out[i] = (xs[i] - ox).abs() + (ys[i] - oy).abs();
    }
}

/// `x as i32 / bucket` and `y as i32 / bucket`, the spatial index's cell.
#[inline]
pub fn bucket_coords(xs: &[f32], ys: &[f32], bucket: i32, out_x: &mut [i32], out_y: &mut [i32]) {
    require_equal_len(xs.len(), &[ys.len(), out_x.len(), out_y.len()]);
    simd_kernel!(bucket_coords_inner(
        xs: &[f32],
        ys: &[f32],
        bucket: i32,
        out_x: &mut [i32],
        out_y: &mut [i32],
    ) {
        let n = xs.len();
        let mut i = 0;
        while i + LANES <= n {
            let px = unsafe { ptr::read_unaligned(xs.as_ptr().add(i).cast()) };
            let py = unsafe { ptr::read_unaligned(ys.as_ptr().add(i).cast()) };
            let (bx, by) = bucket4(px, py, bucket);
            unsafe { ptr::write_unaligned(out_x.as_mut_ptr().add(i).cast(), bx) };
            unsafe { ptr::write_unaligned(out_y.as_mut_ptr().add(i).cast(), by) };
            i += LANES;
        }
        if i < n {
            bucket_coords_scalar(&xs[i..], &ys[i..], bucket, &mut out_x[i..], &mut out_y[i..]);
        }
    });
    run_simd_kernel!(bucket_coords_inner(xs, ys, bucket, out_x, out_y));
}

#[inline]
pub fn bucket_coords_scalar(xs: &[f32], ys: &[f32], bucket: i32, out_x: &mut [i32], out_y: &mut [i32]) {
    for i in 0..xs.len() {
        out_x[i] = xs[i] as i32 / bucket;
        out_y[i] = ys[i] as i32 / bucket;
    }
}

#[cfg(target_arch = "x86_64")]
#[inline]
pub(crate) fn hypot4(x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    nan_lanes_from_libm(x, y, unsafe { x86::hypot4(x, y) })
}
#[cfg(target_arch = "aarch64")]
#[inline]
pub(crate) fn hypot4(x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    nan_lanes_from_libm(x, y, unsafe { aarch64::hypot4(x, y) })
}
#[cfg(all(target_arch = "wasm32", feature = "wasm-simd"))]
#[inline]
pub(crate) fn hypot4(x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    nan_lanes_from_libm(x, y, unsafe { wasm::hypot4(x, y) })
}
#[cfg(not(any(
    target_arch = "x86_64",
    target_arch = "aarch64",
    all(target_arch = "wasm32", feature = "wasm-simd"),
)))]
pub(crate) fn hypot4(x: [f32; 4], y: [f32; 4]) -> [f32; 4] {
    [
        x[0].det_hypot(y[0]),
        x[1].det_hypot(y[1]),
        x[2].det_hypot(y[2]),
        x[3].det_hypot(y[3]),
    ]
}

/// Vector add does not propagate a NaN payload the way scalar `+` does, and
/// `det_hypot` returns that scalar sum for a NaN argument. Finite lanes stay
/// on the SIMD path. The scalar build calls `det_hypot` directly.
#[cfg(any(
    target_arch = "x86_64",
    target_arch = "aarch64",
    all(target_arch = "wasm32", feature = "wasm-simd"),
))]
#[inline]
fn nan_lanes_from_libm(x: [f32; 4], y: [f32; 4], mut got: [f32; 4]) -> [f32; 4] {
    if x.iter().any(|v| v.is_nan()) || y.iter().any(|v| v.is_nan()) {
        for k in 0..4 {
            if x[k].is_nan() || y[k].is_nan() {
                got[k] = x[k].det_hypot(y[k]);
            }
        }
    }
    got
}

#[cfg(target_arch = "x86_64")]
#[inline]
pub(crate) fn l1_4(ox: f32, oy: f32, xs: [f32; 4], ys: [f32; 4]) -> [f32; 4] {
    unsafe { x86::l1_4(ox, oy, xs, ys) }
}
#[cfg(target_arch = "aarch64")]
#[inline]
pub(crate) fn l1_4(ox: f32, oy: f32, xs: [f32; 4], ys: [f32; 4]) -> [f32; 4] {
    unsafe { aarch64::l1_4(ox, oy, xs, ys) }
}
#[cfg(all(target_arch = "wasm32", feature = "wasm-simd"))]
pub(crate) fn l1_4(ox: f32, oy: f32, xs: [f32; 4], ys: [f32; 4]) -> [f32; 4] {
    unsafe { wasm::l1_4(ox, oy, xs, ys) }
}
#[cfg(not(any(
    target_arch = "x86_64",
    target_arch = "aarch64",
    all(target_arch = "wasm32", feature = "wasm-simd"),
)))]
pub(crate) fn l1_4(ox: f32, oy: f32, xs: [f32; 4], ys: [f32; 4]) -> [f32; 4] {
    [
        (xs[0] - ox).abs() + (ys[0] - oy).abs(),
        (xs[1] - ox).abs() + (ys[1] - oy).abs(),
        (xs[2] - ox).abs() + (ys[2] - oy).abs(),
        (xs[3] - ox).abs() + (ys[3] - oy).abs(),
    ]
}

#[inline]
pub(crate) fn integrate4(
    x: [f32; 4],
    y: [f32; 4],
    prev_x: [f32; 4],
    prev_y: [f32; 4],
    vx: [f32; 4],
    vy: [f32; 4],
    alpha: f32,
    max_step: f32,
) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    let (nx, ny, mut nvx, mut nvy) = integrate4_arch(x, y, prev_x, prev_y, vx, vy, alpha, max_step);
    // Adding two NaNs does not keep one payload. A NaN lane goes through the
    // same out-of-line step the scalar loop uses.
    if nvx.iter().any(|v| v.is_nan()) || nvy.iter().any(|v| v.is_nan()) {
        for k in 0..4 {
            if !nvx[k].is_nan() && !nvy[k].is_nan() {
                continue;
            }
            let (_, _, sx, sy) = ema_lane(x[k], y[k], prev_x[k], prev_y[k], vx[k], vy[k], alpha, max_step);
            nvx[k] = sx;
            nvy[k] = sy;
        }
    }
    (nx, ny, nvx, nvy)
}

#[cfg(target_arch = "x86_64")]
#[inline]
fn integrate4_arch(
    x: [f32; 4],
    y: [f32; 4],
    prev_x: [f32; 4],
    prev_y: [f32; 4],
    vx: [f32; 4],
    vy: [f32; 4],
    alpha: f32,
    max_step: f32,
) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    unsafe { x86::integrate4(x, y, prev_x, prev_y, vx, vy, alpha, max_step) }
}
#[cfg(target_arch = "aarch64")]
#[inline]
fn integrate4_arch(
    x: [f32; 4],
    y: [f32; 4],
    prev_x: [f32; 4],
    prev_y: [f32; 4],
    vx: [f32; 4],
    vy: [f32; 4],
    alpha: f32,
    max_step: f32,
) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    unsafe { aarch64::integrate4(x, y, prev_x, prev_y, vx, vy, alpha, max_step) }
}
#[cfg(all(target_arch = "wasm32", feature = "wasm-simd"))]
fn integrate4_arch(
    x: [f32; 4],
    y: [f32; 4],
    prev_x: [f32; 4],
    prev_y: [f32; 4],
    vx: [f32; 4],
    vy: [f32; 4],
    alpha: f32,
    max_step: f32,
) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    unsafe { wasm::integrate4(x, y, prev_x, prev_y, vx, vy, alpha, max_step) }
}
#[cfg(not(any(
    target_arch = "x86_64",
    target_arch = "aarch64",
    all(target_arch = "wasm32", feature = "wasm-simd"),
)))]
fn integrate4_arch(
    x: [f32; 4],
    y: [f32; 4],
    prev_x: [f32; 4],
    prev_y: [f32; 4],
    vx: [f32; 4],
    vy: [f32; 4],
    alpha: f32,
    max_step: f32,
) -> ([f32; 4], [f32; 4], [f32; 4], [f32; 4]) {
    let input = VelocityIn {
        x: &x,
        y: &y,
        prev_x: &prev_x,
        prev_y: &prev_y,
        vx: &vx,
        vy: &vy,
        alive: &[true; 4],
    };
    let mut out_x = x;
    let mut out_y = y;
    let mut out_vx = vx;
    let mut out_vy = vy;
    integrate_velocity_scalar(
        &input,
        alpha,
        max_step,
        &mut VelocityOut {
            prev_x: &mut out_x,
            prev_y: &mut out_y,
            vx: &mut out_vx,
            vy: &mut out_vy,
        },
    );
    (out_x, out_y, out_vx, out_vy)
}

#[inline(always)]
pub(crate) fn bucket4(xs: [f32; 4], ys: [f32; 4], bucket: i32) -> ([i32; 4], [i32; 4]) {
    let bx = trunc4(xs);
    let by = trunc4(ys);
    (
        [bx[0] / bucket, bx[1] / bucket, bx[2] / bucket, bx[3] / bucket],
        [by[0] / bucket, by[1] / bucket, by[2] / bucket, by[3] / bucket],
    )
}

#[cfg(target_arch = "x86_64")]
#[inline(always)]
fn trunc4(xs: [f32; 4]) -> [i32; 4] {
    unsafe { x86::trunc4(xs) }
}
#[cfg(target_arch = "aarch64")]
#[inline]
fn trunc4(xs: [f32; 4]) -> [i32; 4] {
    unsafe { aarch64::trunc4(xs) }
}
#[cfg(all(target_arch = "wasm32", feature = "wasm-simd"))]
fn trunc4(xs: [f32; 4]) -> [i32; 4] {
    unsafe { wasm::trunc4(xs) }
}
#[cfg(not(any(
    target_arch = "x86_64",
    target_arch = "aarch64",
    all(target_arch = "wasm32", feature = "wasm-simd"),
)))]
fn trunc4(xs: [f32; 4]) -> [i32; 4] {
    xs.map(|x| x as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bits_eq(got: f32, expect: f32) -> bool {
        got.to_bits() == expect.to_bits()
    }

    #[test]
    fn hypot_lanes_match_det_hypot_on_edges_and_random_bits() {
        let samples = [
            0.0,
            -0.0,
            1.0,
            -1.0,
            0.5,
            -2.0,
            3.5,
            10.0,
            80.0,
            120.0,
            800.0,
            -150.0,
            90_000.0,
            -70_000.0,
            1e-20,
            -1e-40,
            1e20,
            -1e30,
            f32::MIN,
            f32::MAX,
            f32::MIN_POSITIVE,
            f32::EPSILON,
            f32::INFINITY,
            f32::NEG_INFINITY,
            f32::NAN,
        ];
        let mut batch_x = [0f32; 4];
        let mut batch_y = [0f32; 4];
        let mut n = 0;
        for &x in &samples {
            for &y in &samples {
                batch_x[n] = x;
                batch_y[n] = y;
                n += 1;
                if n == 4 {
                    check_hypot(batch_x, batch_y);
                    n = 0;
                }
            }
        }
        if n > 0 {
            check_hypot(batch_x, batch_y);
        }
        let mut state = 0x1234_5678_9abc_def0u64;
        for _ in 0..4_000 {
            for k in 0..4 {
                state = state
                    .wrapping_mul(0x9E37_79B9_7F4A_7C15)
                    .wrapping_add(0x1234_5678);
                batch_x[k] = f32::from_bits(state as u32);
                batch_y[k] = f32::from_bits((state >> 32) as u32);
            }
            check_hypot(batch_x, batch_y);
        }
    }

    fn check_hypot(x: [f32; 4], y: [f32; 4]) {
        let got = hypot4(x, y);
        for k in 0..4 {
            let expect = x[k].det_hypot(y[k]);
            assert!(
                bits_eq(got[k], expect),
                "hypot({:08x}, {:08x}) lane {k}: got {:08x} expect {:08x}",
                x[k].to_bits(),
                y[k].to_bits(),
                got[k].to_bits(),
                expect.to_bits()
            );
        }
    }

    #[test]
    fn distance_batches_match_scalar_including_a_short_tail() {
        let xs = [0.0, 3.5, -2.0, 10.0, 80.5, f32::NAN, 1e-20];
        let ys = [0.0, -1.0, 4.0, 10.0, -3.0, 2.0, -1e-20];
        let mut got_h = [0f32; 7];
        let mut exp_h = [0f32; 7];
        let mut got_l = [0f32; 7];
        let mut exp_l = [0f32; 7];
        hypot_distances(1.25, -0.5, &xs, &ys, &mut got_h);
        hypot_distances_scalar(1.25, -0.5, &xs, &ys, &mut exp_h);
        l1_distances(1.25, -0.5, &xs, &ys, &mut got_l);
        l1_distances_scalar(1.25, -0.5, &xs, &ys, &mut exp_l);
        for i in 0..xs.len() {
            assert!(bits_eq(got_h[i], exp_h[i]), "hypot[{i}]");
            assert!(bits_eq(got_l[i], exp_l[i]), "l1[{i}]");
        }
    }

    #[test]
    fn velocity_integration_matches_scalar_across_resets_and_dead_lanes() {
        let x = [1.0, 5.0, 0.0, -3.0, 8.0, f32::NAN, 2.0];
        let y = [1.0, 0.5, 9.0, -3.0, 1.0, 1.0, -4.0];
        let prev_x = [0.0, 0.0, 0.0, -3.0, 0.0, 0.0, 2.0];
        let prev_y = [0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0];
        let vx = [0.2, -0.4, 1.0, 0.0, 3.0, 0.5, -1.0];
        let vy = [0.2, 0.1, -1.0, 0.7, 0.0, 0.5, 0.25];
        let alive = [true, true, false, true, true, true, true];
        let input = VelocityIn {
            x: &x,
            y: &y,
            prev_x: &prev_x,
            prev_y: &prev_y,
            vx: &vx,
            vy: &vy,
            alive: &alive,
        };
        let mut a = [0f32; 7];
        let mut b = [0f32; 7];
        let mut c = [0f32; 7];
        let mut d = [0f32; 7];
        let mut e = [0f32; 7];
        let mut f = [0f32; 7];
        let mut g = [0f32; 7];
        let mut h = [0f32; 7];
        integrate_velocity(
            &input,
            0.4,
            2.0,
            &mut VelocityOut {
                prev_x: &mut a,
                prev_y: &mut b,
                vx: &mut c,
                vy: &mut d,
            },
        );
        integrate_velocity_scalar(
            &input,
            0.4,
            2.0,
            &mut VelocityOut {
                prev_x: &mut e,
                prev_y: &mut f,
                vx: &mut g,
                vy: &mut h,
            },
        );
        for i in 0..x.len() {
            assert!(bits_eq(a[i], e[i]) && bits_eq(b[i], f[i]), "prev {i}");
            assert!(
                bits_eq(c[i], g[i]) && bits_eq(d[i], h[i]),
                "vel {i} got {} expect {}",
                c[i],
                g[i]
            );
        }
        // A step of exactly the cap stays; anything past it clears both axes.
        let zeros = [0.0; 4];
        let ones = [1.0; 4];
        let (px, _, vx, vy) = integrate4([2.0, 2.0001, 0.0, 0.0], zeros, zeros, zeros, ones, ones, 0.4, 2.0);
        assert!(bits_eq(px[0], 2.0));
        assert!(vx[0] != 0.0 && vy[0] != 0.0, "exact cap keeps the ema");
        assert_eq!(vx[1], 0.0);
        assert_eq!(vy[1], 0.0);
    }

    #[test]
    fn velocity_nan_payloads_in_a_full_group_match_scalar_bits() {
        let nan_x = f32::from_bits(0x7fc0_0011);
        let nan_v = f32::from_bits(0x7fc0_0022);
        let x = [nan_x; 4];
        let zeros = [0.0; 4];
        let vx = [nan_v; 4];
        let alive = [true; 4];
        let input = VelocityIn {
            x: &x,
            y: &zeros,
            prev_x: &zeros,
            prev_y: &zeros,
            vx: &vx,
            vy: &zeros,
            alive: &alive,
        };
        let mut got_x = [0f32; 4];
        let mut got_y = [0f32; 4];
        let mut got_vx = [0f32; 4];
        let mut got_vy = [0f32; 4];
        let mut exp_x = [0f32; 4];
        let mut exp_y = [0f32; 4];
        let mut exp_vx = [0f32; 4];
        let mut exp_vy = [0f32; 4];
        integrate_velocity(
            &input,
            0.4,
            2.0,
            &mut VelocityOut {
                prev_x: &mut got_x,
                prev_y: &mut got_y,
                vx: &mut got_vx,
                vy: &mut got_vy,
            },
        );
        integrate_velocity_scalar(
            &input,
            0.4,
            2.0,
            &mut VelocityOut {
                prev_x: &mut exp_x,
                prev_y: &mut exp_y,
                vx: &mut exp_vx,
                vy: &mut exp_vy,
            },
        );
        for i in 0..4 {
            assert_eq!(got_vx[i].to_bits(), exp_vx[i].to_bits(), "vx {i}");
            assert_eq!(got_vy[i].to_bits(), exp_vy[i].to_bits(), "vy {i}");
        }
    }

    #[test]
    #[should_panic(expected = "simd slice lengths differ")]
    fn a_short_output_is_rejected_before_the_raw_write() {
        let xs = [1.0; 4];
        let mut out = [];
        hypot_distances(0.0, 0.0, &xs, &xs, &mut out);
    }

    #[test]
    fn bucket_lanes_match_the_truncating_cast_used_by_the_spatial_index() {
        let xs = [
            0.0,
            -0.0,
            0.9,
            -0.9,
            10.0,
            -15.2,
            799.9,
            -150.0,
            90_000.0,
            f32::NAN,
            f32::INFINITY,
            f32::NEG_INFINITY,
            2147483648.0,
            -2147483648.0,
            1e20,
        ];
        let ys = [
            0.0, 3.2, -4.0, 7.0, 19.0, 6.0, 399.1, -8.0, -70_000.0, 1.0, -1.0, 2.0, 4.0, 5.0, -6.0,
        ];
        for bucket in [1, 7, 10] {
            let mut got_x = [0i32; 15];
            let mut got_y = [0i32; 15];
            let mut exp_x = [0i32; 15];
            let mut exp_y = [0i32; 15];
            bucket_coords(&xs, &ys, bucket, &mut got_x, &mut got_y);
            bucket_coords_scalar(&xs, &ys, bucket, &mut exp_x, &mut exp_y);
            assert_eq!(got_x, exp_x, "bucket {bucket} x");
            assert_eq!(got_y, exp_y, "bucket {bucket} y");
        }
    }
}
