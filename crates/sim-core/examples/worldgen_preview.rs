//! Renders generated worlds to PPM images for eyeballing world generation:
//! `cargo run --release -p sim-core --example worldgen_preview -- <out_dir> <seed>...`
use sim_core::world::grid::{WorldGrid, HEIGHT, WIDTH};
use sim_core::world::tiles::{Biome, Tile};
use std::io::Write;

fn color(grid: &WorldGrid, x: i32, y: i32) -> [u8; 3] {
    let i = WorldGrid::idx(x, y);
    let elev = grid.elevation[i];
    let shade = |c: [u8; 3], k: f32| c.map(|v| (v as f32 * k).clamp(0.0, 255.0) as u8);
    match grid.get(x, y) {
        Tile::Water => {
            let d = grid.depth[i];
            shade([52, 116, 178], 1.15 - d * 0.55)
        }
        Tile::Rock => shade([128, 122, 116], 0.75 + elev * 0.5),
        Tile::Snow => [236, 240, 244],
        Tile::Sand => [222, 204, 140],
        Tile::Fire => [230, 90, 40],
        Tile::Mineral => [170, 140, 200],
        Tile::Food => [92, 150, 60],
        _ => {
            let base = match Biome::from_u8(grid.biome[i]) {
                Biome::Grassland => [126, 170, 82],
                Biome::Forest => [56, 112, 58],
                Biome::Desert => [206, 180, 112],
                Biome::Wetland => [84, 136, 104],
                Biome::Tundra => [170, 182, 160],
                Biome::Volcanic => [96, 70, 64],
                Biome::Jungle => [34, 92, 40],
                Biome::Savanna => [176, 172, 84],
                Biome::Taiga => [52, 86, 70],
                Biome::Badlands => [178, 98, 62],
            };
            // Light relief shading from elevation.
            shade(base, 0.8 + elev * 0.45)
        }
    }
}

fn main() {
    let mut args = std::env::args().skip(1);
    let out = args.next().expect("out dir");
    for seed in args {
        let seed: u64 = seed.parse().expect("seed");
        let t = std::time::Instant::now();
        let grid = WorldGrid::new(seed);
        let ms = t.elapsed().as_millis();
        let path = format!("{out}/world-{seed}.ppm");
        let mut f = std::fs::File::create(&path).unwrap();
        write!(f, "P6\n{WIDTH} {HEIGHT}\n255\n").unwrap();
        for y in 0..HEIGHT as i32 {
            for x in 0..WIDTH as i32 {
                f.write_all(&color(&grid, x, y)).unwrap();
            }
        }
        let land = grid.tiles.iter().filter(|&&t| t != Tile::Water as i8).count();
        let rock = grid.tiles.iter().filter(|&&t| t == Tile::Rock as i8).count();
        let mut biomes = [0usize; 10];
        for (i, &t) in grid.tiles.iter().enumerate() {
            if t != Tile::Water as i8 {
                biomes[grid.biome[i] as usize] += 1;
            }
        }
        let share: Vec<String> = [
            "grass", "forest", "desert", "wetland", "tundra", "volcanic", "jungle", "savanna", "taiga",
            "badlands",
        ]
        .iter()
        .zip(biomes)
        .map(|(n, c)| format!("{n} {:.0}%", c as f32 * 100.0 / land.max(1) as f32))
        .collect();
        println!("  {}", share.join(", "));
        println!(
            "seed {seed}: {:.0}% land, {:.1}% of it rock ({ms} ms)",
            land as f32 * 100.0 / (WIDTH * HEIGHT) as f32,
            rock as f32 * 100.0 / land.max(1) as f32
        );
    }
}
