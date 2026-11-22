//! Before/after timings for the movement, distance, and bucketing kernels.
//!
//!   cargo run --release -p sim-core --example simd_bench
//!
//! The scalar column is the same math the simulation used to run one lane at a
//! time. The simd column is what the tick uses. Bits match; see `simd` tests.
use sim_core::simd::{
    bucket_coords, bucket_coords_scalar, hypot_distances, hypot_distances_scalar, integrate_velocity,
    integrate_velocity_scalar, l1_distances, l1_distances_scalar, VelocityIn, VelocityOut,
};
use std::hint::black_box;
use std::time::Instant;

const N: usize = 16_384;
const ROUNDS: u32 = 40;

fn main() {
    let mut state = 0x1234_5678_9abc_def0u64;
    let mut next = || {
        state = state.wrapping_mul(0x9E37_79B9_7F4A_7C15).wrapping_add(1);
        f32::from_bits((state as u32) & 0x7fff_ffff) % 800.0
    };
    let x: Vec<f32> = (0..N).map(|_| next()).collect();
    let y: Vec<f32> = (0..N).map(|_| next()).collect();
    let prev_x = x.clone();
    let prev_y = y.clone();
    let vx = vec![0.1f32; N];
    let vy = vec![-0.1f32; N];
    let alive = vec![true; N];
    let input = VelocityIn {
        x: &x,
        y: &y,
        prev_x: &prev_x,
        prev_y: &prev_y,
        vx: &vx,
        vy: &vy,
        alive: &alive,
    };

    let mut px = vec![0f32; N];
    let mut py = vec![0f32; N];
    let mut ox = vec![0f32; N];
    let mut oy = vec![0f32; N];
    let scalar_v = time(|| {
        integrate_velocity_scalar(
            black_box(&input),
            0.4,
            2.0,
            &mut VelocityOut {
                prev_x: &mut px,
                prev_y: &mut py,
                vx: &mut ox,
                vy: &mut oy,
            },
        );
        black_box(ox[0]);
    });
    let simd_v = time(|| {
        integrate_velocity(
            black_box(&input),
            0.4,
            2.0,
            &mut VelocityOut {
                prev_x: &mut px,
                prev_y: &mut py,
                vx: &mut ox,
                vy: &mut oy,
            },
        );
        black_box(ox[0]);
    });

    let mut dist = vec![0f32; N];
    let scalar_h = time(|| {
        hypot_distances_scalar(black_box(40.0), black_box(20.0), &x, &y, &mut dist);
        black_box(dist[0]);
    });
    let simd_h = time(|| {
        hypot_distances(black_box(40.0), black_box(20.0), &x, &y, &mut dist);
        black_box(dist[0]);
    });

    let scalar_l = time(|| {
        l1_distances_scalar(black_box(40.0), black_box(20.0), &x, &y, &mut dist);
        black_box(dist[0]);
    });
    let simd_l = time(|| {
        l1_distances(black_box(40.0), black_box(20.0), &x, &y, &mut dist);
        black_box(dist[0]);
    });

    let mut bx = vec![0i32; N];
    let mut by = vec![0i32; N];
    let scalar_b = time(|| {
        bucket_coords_scalar(&x, &y, 10, &mut bx, &mut by);
        black_box(bx[0]);
    });
    let simd_b = time(|| {
        bucket_coords(&x, &y, 10, &mut bx, &mut by);
        black_box(bx[0]);
    });

    println!("kernel ({N} lanes x {ROUNDS} rounds)");
    report("velocity ema", scalar_v, simd_v);
    report("det_hypot distances", scalar_h, simd_h);
    report("sensing l1 distances", scalar_l, simd_l);
    report("spatial buckets", scalar_b, simd_b);
}

fn time(mut body: impl FnMut()) -> f64 {
    body();
    let start = Instant::now();
    for _ in 0..ROUNDS {
        body();
    }
    start.elapsed().as_secs_f64() * 1e3 / f64::from(ROUNDS)
}

fn report(name: &str, scalar_ms: f64, simd_ms: f64) {
    let speedup = scalar_ms / simd_ms;
    println!("  {name:<22} scalar {scalar_ms:8.3} ms   simd {simd_ms:8.3} ms   {speedup:.2}x");
}
