use rand::Rng;
use uuid::Uuid;

use crate::organism::organism::{Organism, Sex, apply_sex_traits, generate_name, generate_tribe_name};
use crate::organism::traits::Traits;
use crate::organism::vocabulary::Vocabulary;
use crate::sim::growth;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::{HEIGHT, WIDTH, WorldGrid};
use crate::world::tiles::Tile;

impl Simulation {
    pub(crate) fn spawn_founders(&mut self) {
        const N_TRIBES:    usize = 12;
        const TRIBE_SIZE:  usize = 10;
        const TRIBE_RADIUS: i32  = 16;

        let cols = 4i32;
        let rows = 3i32;
        let sw = WIDTH  as i32 / cols;
        let sh = HEIGHT as i32 / rows;

        let mut anchors: Vec<(i32, i32)> = Vec::new();
        let mut sector_order: Vec<(i32, i32)> = (0..cols).flat_map(|c| (0..rows).map(move |r| (c, r))).collect();
        for i in (1..sector_order.len()).rev() {
            let j = self.rng.gen_range(0..=i);
            sector_order.swap(i, j);
        }

        for (sc, sr) in sector_order {
            if anchors.len() >= N_TRIBES { break; }
            let x0 = sc * sw + 4;
            let y0 = sr * sh + 4;
            let x1 = ((sc + 1) * sw - 4).min(WIDTH as i32 - 2);
            let y1 = ((sr + 1) * sh - 4).min(HEIGHT as i32 - 2);

            let mut land: Vec<(i32, i32)> = Vec::new();
            for y in y0..y1 {
                for x in x0..x1 {
                    if matches!(self.grid.get(x, y), Tile::Grass | Tile::Food) {
                        land.push((x, y));
                    }
                }
            }
            if land.is_empty() { continue; }
            let pick = land[self.rng.gen_range(0..land.len())];
            anchors.push(pick);
        }

        if anchors.len() < N_TRIBES {
            let mut all_land: Vec<(i32, i32)> = (2..(HEIGHT as i32 - 2))
                .flat_map(|y| (2..(WIDTH as i32 - 2)).map(move |x| (x, y)))
                .filter(|&(x, y)| matches!(self.grid.get(x, y), Tile::Grass | Tile::Food))
                .collect();
            let n = all_land.len();
            let mut placed = anchors.len();
            let mut i = 0usize;
            while placed < N_TRIBES && i < n {
                let j = i + self.rng.gen_range(0..(n - i));
                all_land.swap(i, j);
                let (x, y) = all_land[i];
                let far_enough = anchors.iter().all(|&(ax, ay)| {
                    (ax - x).abs() + (ay - y).abs() >= 40
                });
                if far_enough { anchors.push((x, y)); placed += 1; }
                i += 1;
            }
        }
        anchors.truncate(N_TRIBES);

        let mut tribe_anchor: std::collections::HashMap<String, (f32, f32)> = std::collections::HashMap::new();
        for &(ax, ay) in &anchors {
            let lineage_id = Uuid::new_v4().to_string()[..8].to_string();
            let tribe_name = generate_tribe_name(&mut self.rng);
            self.lineage_names.insert(lineage_id.clone(), tribe_name);
            tribe_anchor.insert(lineage_id.clone(), (ax as f32, ay as f32));

            let mut land: Vec<(i32, i32)> = Vec::new();
            for dx in -TRIBE_RADIUS..=TRIBE_RADIUS {
                for dy in -TRIBE_RADIUS..=TRIBE_RADIUS {
                    let nx = ax + dx; let ny = ay + dy;
                    if !WorldGrid::in_bounds(nx, ny) { continue; }
                    if matches!(self.grid.get(nx, ny), Tile::Grass | Tile::Food) {
                        land.push((nx, ny));
                    }
                }
            }
            if land.is_empty() { continue; }

            let n = land.len();
            let take = TRIBE_SIZE.min(n);
            for i in 0..take {
                let j = i + self.rng.gen_range(0..(n - i));
                land.swap(i, j);
            }
            for k in 0..take {
                let (lx, ly) = land[k];
                growth::spawn_organism_with_home(
                    &self.grid, &mut self.organisms,
                    lx as f32, ly as f32,
                    ax as f32, ay as f32,
                    lineage_id.clone(),
                    &mut self.rng,
                );
            }
        }

        let target = N_TRIBES * TRIBE_SIZE;
        let still_needed = target.saturating_sub(self.organisms.len());
        if still_needed > 0 {
            let tribe_ids: Vec<String> = self.lineage_names.keys().cloned().collect();
            let n_tribes = tribe_ids.len();
            let mut all_land: Vec<(i32, i32)> = (2..(HEIGHT as i32 - 2))
                .flat_map(|y| (2..(WIDTH as i32 - 2)).map(move |x| (x, y)))
                .filter(|&(x, y)| matches!(self.grid.get(x, y), Tile::Grass | Tile::Food))
                .collect();
            let n = all_land.len();
            let mut spawned = 0;
            let mut i = 0usize;
            while spawned < still_needed && i < n {
                let j = i + self.rng.gen_range(0..(n - i));
                all_land.swap(i, j);
                let (x, y) = all_land[i];
                let lid = tribe_ids[spawned % n_tribes].clone();
                let (hx, hy) = tribe_anchor.get(&lid).copied().unwrap_or((x as f32, y as f32));
                growth::spawn_organism_with_home(
                    &self.grid, &mut self.organisms,
                    x as f32, y as f32,
                    hx, hy,
                    lid,
                    &mut self.rng,
                );
                spawned += 1;
                i += 1;
            }
        }
    }

    pub(crate) fn spawn_immigrant_tribe(&mut self) {
        let mut candidates: Vec<(i32, i32, f32)> = Vec::new();
        for y in 4..(HEIGHT as i32 - 4) {
            for x in 4..(WIDTH as i32 - 4) {
                if !matches!(self.grid.get(x, y), Tile::Grass | Tile::Food) { continue; }
                let fert = self.grid.fertility_at(x, y);
                if fert < 0.4 { continue; }
                let mut water_near = false;
                'wn: for dx in -4i32..=4 { for dy in -4i32..=4 {
                    if WorldGrid::in_bounds(x+dx, y+dy)
                        && matches!(self.grid.get(x+dx, y+dy), Tile::Water) { water_near = true; break 'wn; }
                }}
                if !water_near { continue; }
                candidates.push((x, y, fert));
            }
        }
        if candidates.is_empty() { return; }
        // Score each candidate by fertility AND distance to the nearest
        // alive organism. Heavily favour remote tiles so a new tribe lands
        // somewhere the existing population isn't, not next door to the
        // densest cluster.
        let scored: Vec<(i32, i32, f32)> = candidates.into_iter().map(|(x, y, fert)| {
            let nearest_org_d2: f32 = self.organisms.iter()
                .filter(|o| o.alive)
                .map(|o| (o.x - x as f32).powi(2) + (o.y - y as f32).powi(2))
                .fold(f32::INFINITY, f32::min);
            let dist = if nearest_org_d2.is_finite() { nearest_org_d2.sqrt() } else { 9999.0 };
            // Saturate the distance term at 80 tiles — beyond that, more
            // distance doesn't matter; we already have isolation.
            let dist_score = (dist / 80.0).min(1.0);
            let score = dist_score * 0.7 + (fert.min(1.0)) * 0.3;
            (x, y, score)
        }).collect();
        let mut scored = scored;
        scored.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        let top = scored.len().min(12).max(1);
        let (anchor_x, anchor_y, _) = scored[self.rng.gen_range(0..top)];

        let tribe_size = self.rng.gen_range(8usize..=14);
        let lineage_id = Uuid::new_v4().to_string()[..8].to_string();
        let tribe_name = generate_tribe_name(&mut self.rng);
        self.lineage_names.insert(lineage_id.clone(), tribe_name.clone());

        let mut land: Vec<(i32, i32)> = Vec::new();
        for dx in -6i32..=6 { for dy in -6i32..=6 {
            let nx = anchor_x + dx; let ny = anchor_y + dy;
            if !WorldGrid::in_bounds(nx, ny) { continue; }
            if matches!(self.grid.get(nx, ny), Tile::Grass | Tile::Food) {
                land.push((nx, ny));
            }
        }}
        if land.is_empty() { return; }
        let take = tribe_size.min(land.len());

        let start_idx = self.organisms.len();
        for k in 0..take {
            let j = k + self.rng.gen_range(0..(land.len() - k));
            land.swap(k, j);
            let (lx, ly) = land[k];

            let id = Uuid::new_v4().to_string()[..8].to_string();
            let sex = if k % 2 == 0 { Sex::Male } else { Sex::Female };
            let mut traits = Traits::random(&mut self.rng);
            apply_sex_traits(&mut traits, sex);
            let max_age = self.rng.gen_range(
                (8000.0 + 4000.0 * traits.resilience) as u32
                ..=(18000.0 + 8000.0 * traits.resilience) as u32
            );
            let mut org = Organism::new(
                id.clone(), generate_name(&mut self.rng, sex),
                lx as f32, ly as f32,
                0, String::new(), lineage_id.clone(), max_age, traits,
            );
            org.home_x = anchor_x as f32;
            org.home_y = anchor_y as f32;
            org.sex = sex;
            org.age = self.rng.gen_range(2000u32..=5000);
            org.energy    = 0.85;
            org.hydration = 0.85;
            org.health    = 0.95;
            org.vocabulary = Vocabulary::generate(&mut self.rng);
            self.organisms.push(org);
        }

        let n = self.organisms.len() - start_idx;
        for k in (0..n).step_by(2) {
            if k + 1 >= n { break; }
            let a = start_idx + k;
            let b = start_idx + k + 1;
            let aid = self.organisms[a].id.clone();
            let bid = self.organisms[b].id.clone();
            self.organisms[a].partner_id = Some(bid);
            self.organisms[b].partner_id = Some(aid);
        }

        push_event(&mut self.events, self.tick_count, "migrate", &tribe_name,
            &format!("a wandering tribe arrives ({} souls)", take));
    }

    pub(crate) fn find_far_empty_anchor(&mut self, fx: i32, fy: i32) -> Option<(i32, i32)> {
        const MIN_DIST_FROM_OTHER_HOMES: i32 = 90;
        const MIN_DIST_FROM_FORKER:      i32 = 120;
        for _ in 0..120 {
            let tx = self.rng.gen_range(8..(WIDTH as i32 - 8));
            let ty = self.rng.gen_range(8..(HEIGHT as i32 - 8));
            if (tx - fx).abs() + (ty - fy).abs() < MIN_DIST_FROM_FORKER { continue; }
            if !self.is_good_land_target(tx, ty) { continue; }
            let too_close = self.organisms.iter().any(|o| {
                o.alive && (o.home_x as i32 - tx).abs() + (o.home_y as i32 - ty).abs() < MIN_DIST_FROM_OTHER_HOMES
            });
            if too_close { continue; }
            return Some((tx, ty));
        }
        None
    }

    pub(crate) fn fork_new_tribe(&mut self, idx: usize, anchor_x: i32, anchor_y: i32) {
        let new_lid = Uuid::new_v4().to_string()[..8].to_string();
        let new_name = generate_tribe_name(&mut self.rng);
        self.lineage_names.insert(new_lid.clone(), new_name.clone());

        let founder_name = self.organisms[idx].name.clone();
        let old_name = self.lineage_names
            .get(&self.organisms[idx].lineage_id).cloned().unwrap_or_default();

        self.organisms[idx].lineage_id = new_lid.clone();
        self.organisms[idx].home_x = anchor_x as f32;
        self.organisms[idx].home_y = anchor_y as f32;
        self.organisms[idx].wander_target = Some((anchor_x, anchor_y));
        self.organisms[idx].think("founding new tribe", self.tick_count);
        self.organisms[idx].log_event(format!(
            "broke from the {} and set out to found the {}",
            old_name, new_name
        ));
        push_event(&mut self.events, self.tick_count, "migrate", &founder_name,
            &format!("breaks off to found the {}", new_name));
    }
}
