use super::*;

#[derive(Debug)]
pub(super) struct WorldReport {
    pub(super) land_tiles: usize,
    pub(super) livable_tiles: usize,
    pub(super) harsh_tiles: usize,
    pub(super) water_tiles: usize,
    pub(super) coastline_tiles: usize,
    pub(super) land_components: usize,
    pub(super) largest_land_component: usize,
    pub(super) grassland_tiles: usize,
    pub(super) forest_tiles: usize,
    pub(super) wetland_tiles: usize,
    pub(super) desert_tiles: usize,
    pub(super) tundra_tiles: usize,
    pub(super) volcanic_tiles: usize,
    pub(super) jungle_tiles: usize,
    pub(super) savanna_tiles: usize,
    pub(super) taiga_tiles: usize,
    pub(super) badlands_tiles: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum WorldVerdict {
    Healthy,
    Harsh,
    Fragmented,
}

impl WorldVerdict {
    pub(super) fn label(self) -> &'static str {
        match self {
            WorldVerdict::Healthy => "HEALTHY",
            WorldVerdict::Harsh => "HARSH",
            WorldVerdict::Fragmented => "FRAGMENT",
        }
    }

    pub(super) fn is_unhealthy(self) -> bool {
        self != WorldVerdict::Healthy
    }
}

impl WorldReport {
    pub(super) fn habitability_ratio(&self) -> f32 {
        if self.land_tiles == 0 {
            0.0
        } else {
            self.livable_tiles as f32 / self.land_tiles as f32
        }
    }

    pub(super) fn coastline_ratio(&self) -> f32 {
        if self.land_tiles == 0 {
            0.0
        } else {
            self.coastline_tiles as f32 / self.land_tiles as f32
        }
    }

    pub(super) fn largest_component_ratio(&self) -> f32 {
        if self.land_tiles == 0 {
            0.0
        } else {
            self.largest_land_component as f32 / self.land_tiles as f32
        }
    }

    pub(super) fn quality_score(&self) -> f32 {
        let habitability = self.habitability_ratio();
        let coastline = self.coastline_ratio();
        let fragmentation_penalty = if self.land_components > 8 {
            ((self.land_components - 8) as f32 * 0.02).min(0.20)
        } else {
            0.0
        };
        let harsh_penalty = if self.land_tiles == 0 {
            0.0
        } else {
            self.harsh_tiles as f32 / self.land_tiles as f32 * 0.35
        };
        (habitability * 0.60 + coastline.min(0.45) * 0.25 + self.largest_component_ratio() * 0.15
            - fragmentation_penalty
            - harsh_penalty)
            .max(0.0)
    }

    pub(super) fn verdict(&self) -> WorldVerdict {
        if self.habitability_ratio() < 0.70 || self.harsh_tiles > self.livable_tiles {
            WorldVerdict::Harsh
        } else if self.largest_component_ratio() < 0.58 || self.land_components > 55 {
            WorldVerdict::Fragmented
        } else {
            WorldVerdict::Healthy
        }
    }
}

pub(super) fn build_world_report(seed: u64) -> WorldReport {
    let grid = WorldGrid::new(seed);
    let mut land_tiles = 0usize;
    let mut livable_tiles = 0usize;
    let mut harsh_tiles = 0usize;
    let mut water_tiles = 0usize;
    let mut coastline_tiles = 0usize;
    let mut grassland_tiles = 0usize;
    let mut forest_tiles = 0usize;
    let mut wetland_tiles = 0usize;
    let mut desert_tiles = 0usize;
    let mut tundra_tiles = 0usize;
    let mut volcanic_tiles = 0usize;
    let mut jungle_tiles = 0usize;
    let mut savanna_tiles = 0usize;
    let mut taiga_tiles = 0usize;
    let mut badlands_tiles = 0usize;

    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            let tile = grid.get(x, y);
            let biome = grid.biome_at(x, y);
            match tile {
                Tile::Water | Tile::Void => {
                    water_tiles += 1;
                }
                Tile::Grass | Tile::Food | Tile::Ash => {
                    land_tiles += 1;
                    livable_tiles += 1;
                }
                Tile::Rock | Tile::Snow | Tile::Sand | Tile::Fire | Tile::Scorched | Tile::Mineral => {
                    land_tiles += 1;
                    harsh_tiles += 1;
                }
                Tile::Campfire | Tile::Hut | Tile::Flooded => {
                    land_tiles += 1;
                }
            }

            if !matches!(tile, Tile::Water | Tile::Void) {
                let coastal = [(-1i32, 0i32), (1, 0), (0, -1), (0, 1)].iter().any(|&(dx, dy)| {
                    WorldGrid::in_bounds(x + dx, y + dy) && grid.get(x + dx, y + dy) == Tile::Water
                });
                if coastal {
                    coastline_tiles += 1;
                }
            }

            match biome {
                Biome::Grassland => grassland_tiles += 1,
                Biome::Forest => forest_tiles += 1,
                Biome::Wetland => wetland_tiles += 1,
                Biome::Desert => desert_tiles += 1,
                Biome::Tundra => tundra_tiles += 1,
                Biome::Volcanic => volcanic_tiles += 1,
                Biome::Jungle => jungle_tiles += 1,
                Biome::Savanna => savanna_tiles += 1,
                Biome::Taiga => taiga_tiles += 1,
                Biome::Badlands => badlands_tiles += 1,
            }
        }
    }

    let (land_components, largest_land_component) = land_component_stats(&grid);

    WorldReport {
        land_tiles,
        livable_tiles,
        harsh_tiles,
        water_tiles,
        coastline_tiles,
        land_components,
        largest_land_component,
        grassland_tiles,
        forest_tiles,
        wetland_tiles,
        desert_tiles,
        tundra_tiles,
        volcanic_tiles,
        jungle_tiles,
        savanna_tiles,
        taiga_tiles,
        badlands_tiles,
    }
}

pub(super) fn land_component_stats(grid: &WorldGrid) -> (usize, usize) {
    let mut visited = vec![false; WIDTH * HEIGHT];
    let mut components = 0usize;
    let mut largest = 0usize;

    for y in 0..HEIGHT as i32 {
        for x in 0..WIDTH as i32 {
            let idx = WorldGrid::idx(x, y);
            if visited[idx] || matches!(grid.get(x, y), Tile::Water | Tile::Void) {
                continue;
            }
            components += 1;
            let mut stack = vec![(x, y)];
            visited[idx] = true;
            let mut size = 0usize;
            while let Some((cx, cy)) = stack.pop() {
                size += 1;
                for (nx, ny) in WorldGrid::neighbors(cx, cy) {
                    let ni = WorldGrid::idx(nx, ny);
                    if visited[ni] || matches!(grid.get(nx, ny), Tile::Water | Tile::Void) {
                        continue;
                    }
                    visited[ni] = true;
                    stack.push((nx, ny));
                }
            }
            largest = largest.max(size);
        }
    }

    (components, largest)
}

pub(super) fn print_world_report(seed: u64) {
    let report = build_world_report(seed);
    println!("world_report seed={}", seed);
    println!(
        " land={} livable={} harsh={} water={} habitability={:.1}%",
        report.land_tiles,
        report.livable_tiles,
        report.harsh_tiles,
        report.water_tiles,
        report.habitability_ratio() * 100.0,
    );
    println!(
        " coastline={} land_components={} largest_component={} largest_component_ratio={:.1}%",
        report.coastline_tiles,
        report.land_components,
        report.largest_land_component,
        report.largest_component_ratio() * 100.0,
    );
    println!(
        " biomes grass={} forest={} wetland={} desert={} tundra={} volcanic={} jungle={} savanna={} taiga={} badlands={}",
        report.grassland_tiles,
        report.forest_tiles,
        report.wetland_tiles,
        report.desert_tiles,
        report.tundra_tiles,
        report.volcanic_tiles,
        report.jungle_tiles,
        report.savanna_tiles,
        report.taiga_tiles,
        report.badlands_tiles,
    );
    println!(
        " quality_score={:.3} verdict={}",
        report.quality_score(),
        report.verdict().label(),
    );
}

pub(super) fn run_world_report_sweep(start_seed: u64, sweep_seeds: usize) -> usize {
    println!(
        "{:<8} {:<9} {:>7} {:>7} {:>7} {:>8} {:>8} {:>8} {:>8}",
        "seed", "verdict", "land", "live", "harsh", "habit%", "coast%", "pieces", "score"
    );
    println!("{}", "-".repeat(90));
    let mut reports = Vec::new();
    for offset in 0..sweep_seeds {
        let seed = start_seed + offset as u64;
        let report = build_world_report(seed);
        println!(
            "{:<8} {:<9} {:>7} {:>7} {:>7} {:>7.1} {:>8.1} {:>8} {:>8.3}",
            seed,
            report.verdict().label(),
            report.land_tiles,
            report.livable_tiles,
            report.harsh_tiles,
            report.habitability_ratio() * 100.0,
            report.coastline_ratio() * 100.0,
            report.land_components,
            report.quality_score(),
        );
        reports.push(report);
    }

    let avg_habitability =
        reports.iter().map(|r| r.habitability_ratio()).sum::<f32>() / reports.len().max(1) as f32;
    let avg_score = reports.iter().map(|r| r.quality_score()).sum::<f32>() / reports.len().max(1) as f32;
    let unhealthy = reports.iter().filter(|r| r.verdict().is_unhealthy()).count();
    println!("\nworld_report summary");
    println!(" avg_habitability={:.1}%", avg_habitability * 100.0);
    println!(" avg_quality_score={:.3}", avg_score);
    println!(" unhealthy_worlds={} / {}", unhealthy, reports.len());
    unhealthy
}
