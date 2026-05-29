use rand::Rng;

use crate::sim::simulation::Simulation;
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Tile;

impl Simulation {
    pub(crate) fn validate_or_assign_wander_target(&mut self, idx: usize) {
        if let Some((tx, ty)) = self.organisms[idx].wander_target {
            if !self.is_good_land_target(tx, ty) {
                self.organisms[idx].wander_target = None;
            }
        }

        if self.organisms[idx].wander_target.is_some() {
            return;
        }
        if self.organisms[idx].energy < 0.45 || self.organisms[idx].hydration < 0.45 {
            return;
        }
        if self.organisms[idx].age < 600 || self.organisms[idx].fear_level > 0.65 {
            return;
        }

        let lid = self.organisms[idx].lineage_id.clone();
        let (mx, my) = (self.organisms[idx].x, self.organisms[idx].y);
        let mut sumx = 0.0f32;
        let mut sumy = 0.0f32;
        let mut count = 0u32;
        for o in &self.organisms {
            if !o.alive || o.id == self.organisms[idx].id {
                continue;
            }
            if o.lineage_id != lid {
                continue;
            }
            let d = (o.x - mx).abs() + (o.y - my).abs();
            if d <= 8.0 {
                sumx += o.x;
                sumy += o.y;
                count += 1;
            }
        }
        if count >= 2 {
            let curiosity = self.organisms[idx].traits.curiosity;
            let age = self.organisms[idx].age;
            let lineage_total = self
                .organisms
                .iter()
                .filter(|o| o.alive && o.lineage_id == lid)
                .count();
            let overcrowded = lineage_total >= 45;
            let fork_eligible = age >= 700 && curiosity >= 0.40 && count >= 4;
            let fork_chance = if overcrowded { 0.7 } else { 0.35 };
            if (fork_eligible || (overcrowded && age >= 700 && count >= 3))
                && self.rng.random::<f32>() < fork_chance
            {
                if let Some((fx, fy)) = self.find_far_empty_anchor(mx as i32, my as i32) {
                    self.fork_new_tribe(idx, fx, fy);
                    return;
                }
            }

            let cx = sumx / count as f32;
            let cy = sumy / count as f32;
            let mut dx = mx - cx;
            let mut dy = my - cy;
            let len = (dx * dx + dy * dy).sqrt();
            if len < 0.5 {
                let a = self.rng.random::<f32>() * std::f32::consts::TAU;
                dx = a.cos();
                dy = a.sin();
            } else {
                dx /= len;
                dy /= len;
            }
            let push = 80.0 + (count as f32 - 3.0) * 18.0;
            let tx = (mx + dx * push).round() as i32;
            let ty = (my + dy * push).round() as i32;
            let tx = tx.clamp(5, WIDTH as i32 - 5);
            let ty = ty.clamp(5, HEIGHT as i32 - 5);
            if self.is_good_land_target(tx, ty) {
                self.organisms[idx].wander_target = Some((tx, ty));
                self.organisms[idx].think("seeking elbow room", self.tick_count);
                return;
            }
        }

        let curiosity = self.organisms[idx].traits.curiosity;
        let age = self.organisms[idx].age;

        let adolescent = age >= 1500 && age < 1900;
        if curiosity < 0.40 && !adolescent {
            return;
        }

        let hash = self.organisms[idx]
            .id
            .bytes()
            .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        let base_period = (450u64).saturating_sub((curiosity * 200.0) as u64).max(140);
        let period = if adolescent {
            base_period.max(120) / 2
        } else {
            base_period
        };
        if self.tick_count % period != (hash % period) {
            return;
        }

        let (x, y) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        let min_dist = 60 + (curiosity * 90.0) as i32;
        let max_dist = 250 + (curiosity * 400.0) as i32;
        if let Some(target) = self.find_distant_land_target(x, y, min_dist, max_dist) {
            self.organisms[idx].wander_target = Some(target);
            self.organisms[idx].think("planning expedition", self.tick_count);
            self.organisms[idx].log_event(format!(
                "set out toward distant land at ({},{})",
                target.0, target.1
            ));
        }
    }

    pub(crate) fn find_distant_land_target(
        &mut self,
        x: i32,
        y: i32,
        min_dist: i32,
        max_dist: i32,
    ) -> Option<(i32, i32)> {
        for _ in 0..80 {
            let dx = self.rng.random_range(-max_dist..=max_dist);
            let dy = self.rng.random_range(-max_dist..=max_dist);
            let dist = dx.abs() + dy.abs();
            if dist < min_dist || dist > max_dist {
                continue;
            }
            let tx = (x + dx).clamp(5, WIDTH as i32 - 5);
            let ty = (y + dy).clamp(5, HEIGHT as i32 - 5);
            let actual_dist = (tx - x).abs() + (ty - y).abs();
            if actual_dist < min_dist {
                continue;
            }
            if self.is_good_land_target(tx, ty) {
                return Some((tx, ty));
            }
        }
        None
    }

    pub(crate) fn is_good_land_target(&self, x: i32, y: i32) -> bool {
        let tile = self.grid.get(x, y);
        if matches!(
            tile,
            Tile::Water | Tile::Rock | Tile::Void | Tile::Fire | Tile::Hut | Tile::Mineral
        ) {
            return false;
        }
        let nearby_water = (-2i32..=2)
            .flat_map(|dx| (-2i32..=2).map(move |dy| (dx, dy)))
            .filter(|(dx, dy)| {
                self.grid.get(x + dx, y + dy) == Tile::Water && self.grid.depth_at(x + dx, y + dy) > 0.30
            })
            .count();
        nearby_water < 5
    }

    pub(crate) fn nearest_land_from(&self, x: i32, y: i32, radius: i32) -> Option<(i32, i32)> {
        let mut best = None;
        let mut best_dist = radius + 1;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let nx = x + dx;
                let ny = y + dy;
                if !self.is_good_land_target(nx, ny) {
                    continue;
                }
                let dist = dx.abs() + dy.abs();
                if dist > 0 && dist < best_dist {
                    best = Some((nx, ny));
                    best_dist = dist;
                }
            }
        }
        best
    }
}
