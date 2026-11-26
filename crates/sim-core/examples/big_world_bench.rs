//! Big-world numbers for issue #1062, from a saved world: tick cost, the frames the browser worker posts,
//! and the save's size and write time.
//!
//! `cargo run --release -p sim-core --example big_world_bench -- <save> [ticks] [--no-frames]`
//!
//! A ~3,000-person world comes from the headless crowd run the perf gate uses:
//! `headless --seed 42 --ticks 2600 --every 2600 --crowd 2900 --crowd-at 2000 --save crowd3k.save`.
//!
//! Wall time is only as steady as the machine. To compare two builds, count instructions
//! (`/usr/bin/time -l` on macOS) with and without `--no-frames`. The last line is the FNV-1a 64 of the
//! save after the run: two builds that make the same world print the same value. The frames' hash does the
//! same for what the page is sent.
use sim_core::sim::serialize::frame_codec;
use sim_core::sim::simulation::Simulation;
use std::time::Instant;

const FNV_START: u64 = 0xcbf2_9ce4_8422_2325;

fn fnv1a64(start: u64, bytes: &[u8]) -> u64 {
    bytes.iter().fold(start, |h, &b| {
        (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

/// The value `pct`% of the way up an ascending list.
fn percentile<T: Copy>(sorted: &[T], pct: usize) -> T {
    sorted[(sorted.len() * pct / 100).min(sorted.len() - 1)]
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let frames = !args.iter().any(|a| a == "--no-frames");
    let mut positional = args.iter().filter(|a| !a.starts_with("--"));
    let path = positional
        .next()
        .expect("usage: big_world_bench <save> [ticks] [--no-frames]");
    let ticks: usize = positional
        .next()
        .map_or(300, |s| s.parse().expect("ticks is a number"));
    let mut sim = Simulation::load_strict(42, path).unwrap_or_else(|err| panic!("{path}: {err}"));
    let alive = |sim: &Simulation| sim.organisms.iter().filter(|o| o.alive).count();
    println!(
        "loaded {path}: tick {} alive {} organisms {}",
        sim.tick_count,
        alive(&sim),
        sim.organisms.len()
    );

    let mut tick_ms = Vec::with_capacity(ticks);
    let mut frame_ms = Vec::with_capacity(ticks);
    let mut frame_bytes = Vec::with_capacity(ticks);
    let mut frames_hash = FNV_START;
    // The worker's first frame is a full one, then a delta after every tick at 1x.
    let full = frames.then(|| frame_codec::encode(&sim.state_frame()).expect("frame encodes"));
    for _ in 0..ticks {
        let started = Instant::now();
        sim.tick();
        tick_ms.push(started.elapsed().as_secs_f64() * 1000.0);
        if frames {
            let started = Instant::now();
            let frame = frame_codec::encode(&sim.state_frame_incremental()).expect("frame encodes");
            frame_ms.push(started.elapsed().as_secs_f64() * 1000.0);
            frame_bytes.push(frame.len());
            frames_hash = fnv1a64(frames_hash, &frame);
        }
    }

    let started = Instant::now();
    let save = sim.to_save_state().to_bytes();
    let save_ms = started.elapsed().as_secs_f64() * 1000.0;

    let mean = |v: &[f64]| v.iter().sum::<f64>() / v.len().max(1) as f64;
    if !tick_ms.is_empty() {
        let mut sorted = tick_ms.clone();
        sorted.sort_by(f64::total_cmp);
        println!(
            "ticks {ticks}: mean {:.2} ms  p50 {:.2}  p95 {:.2}  max {:.2}  (alive at end {})",
            mean(&tick_ms),
            percentile(&sorted, 50),
            percentile(&sorted, 95),
            sorted[sorted.len() - 1],
            alive(&sim)
        );
    }
    if let (Some(full), false) = (full, frame_bytes.is_empty()) {
        frame_bytes.sort_unstable();
        println!(
            "frames: full {} KB, then deltas of mean {} KB  p95 {} KB  max {} KB, built in {:.2} ms each (hash {:#018x})",
            full.len() / 1024,
            frame_bytes.iter().sum::<usize>() / frame_bytes.len() / 1024,
            percentile(&frame_bytes, 95) / 1024,
            frame_bytes[frame_bytes.len() - 1] / 1024,
            mean(&frame_ms),
            fnv1a64(frames_hash, &full)
        );
    }
    println!(
        "save: {:.2} MB uncompressed, written in {save_ms:.0} ms",
        save.len() as f64 / 1_048_576.0
    );
    println!("world {:#018x}", fnv1a64(FNV_START, &save));
}
