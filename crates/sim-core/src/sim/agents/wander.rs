use crate::math::DetMath;
use rand::RngExt;

use crate::hashing::FxHashMap;
use crate::sim::config::{lineage_overcrowding_threshold, DEFAULT_MAX_POPULATION};
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Tile;

/// Kin standing within 8 tiles, summed in index order, and how many of the lineage are alive.
/// The wander pass reads this instead of scanning again; a tribe that splits recomputes it for the
/// people after the founder.
#[derive(Clone, Copy)]
pub(crate) struct KinCrowd {
    sumx: f32,
    sumy: f32,
    count: u32,
    lineage_total: usize,
}

impl Simulation {
    /// Kin crowds for everyone `need` marks, in index order. Reading only: positions, who is alive, lineages.
    pub(crate) fn kin_crowds(
        &self,
        spatial: &SpatialIndex,
        lineage_members: &FxHashMap<crate::intern::Sym, Vec<usize>>,
        need: &[bool],
    ) -> Vec<Option<KinCrowd>> {
        self.kin_crowds_from(0, need.len(), spatial, lineage_members, need)
    }

    pub(crate) fn refill_kin_crowds(
        &self,
        from: usize,
        crowds: &mut [Option<KinCrowd>],
        spatial: &SpatialIndex,
        lineage_members: &FxHashMap<crate::intern::Sym, Vec<usize>>,
        need: &[bool],
    ) {
        if from >= crowds.len() {
            return;
        }
        let tail = self.kin_crowds_from(from, crowds.len(), spatial, lineage_members, need);
        for (slot, crowd) in crowds[from..].iter_mut().zip(tail) {
            *slot = crowd;
        }
    }

    fn kin_crowds_from(
        &self,
        start: usize,
        end: usize,
        spatial: &SpatialIndex,
        lineage_members: &FxHashMap<crate::intern::Sym, Vec<usize>>,
        need: &[bool],
    ) -> Vec<Option<KinCrowd>> {
        let count = end.saturating_sub(start);
        crate::sim::par::map_with(
            count,
            || Vec::with_capacity(32),
            |buf, k| {
                let i = start + k;
                if i >= need.len() || !need[i] || !self.organisms[i].alive {
                    return None;
                }
                Some(self.kin_crowd_at(i, spatial, lineage_members, buf))
            },
        )
    }

    fn kin_crowd_at(
        &self,
        idx: usize,
        spatial: &SpatialIndex,
        lineage_members: &FxHashMap<crate::intern::Sym, Vec<usize>>,
        buf: &mut Vec<usize>,
    ) -> KinCrowd {
        let my_id = self.organisms[idx].id;
        let hot = self
            .organism_columns
            .ready_for(self.organisms.len())
            .then(|| self.organism_columns.neighbours());
        let (lid, mx, my) = if let Some(hot) = hot {
            (hot.lineage[idx], hot.x[idx], hot.y[idx])
        } else {
            let org = &self.organisms[idx];
            (org.lineage_id, org.x, org.y)
        };
        // Same window as `ordered_nearby`: the query is padded by 2, then the walk keeps distance <= 8,
        // and the indices are sorted so the sum is the one a single thread would add up.
        spatial.query_into(mx as i32, my as i32, 10, buf);
        buf.sort_unstable();
        let mut sumx = 0.0f32;
        let mut sumy = 0.0f32;
        let mut count = 0u32;
        for &i in buf.iter() {
            if let Some(hot) = hot {
                if !hot.alive_at(i) || self.organisms[i].id == my_id || hot.lineage[i] != lid {
                    continue;
                }
                let d = (hot.x[i] - mx).abs() + (hot.y[i] - my).abs();
                if d <= 8.0 {
                    sumx += hot.x[i];
                    sumy += hot.y[i];
                    count += 1;
                }
            } else {
                let o = &self.organisms[i];
                if !o.alive || o.id == my_id || o.lineage_id != lid {
                    continue;
                }
                let d = (o.x - mx).abs() + (o.y - my).abs();
                if d <= 8.0 {
                    sumx += o.x;
                    sumy += o.y;
                    count += 1;
                }
            }
        }
        let lineage_total = if count >= 2 {
            lineage_members
                .get(lid.as_str())
                .into_iter()
                .flatten()
                .filter(|&&member_idx| {
                    if let Some(hot) = hot {
                        hot.alive_at(member_idx) && hot.lineage[member_idx] == lid
                    } else {
                        let o = &self.organisms[member_idx];
                        o.alive && o.lineage_id == lid
                    }
                })
                .count()
        } else {
            0
        };
        KinCrowd {
            sumx,
            sumy,
            count,
            lineage_total,
        }
    }

    pub(crate) fn validate_or_assign_wander_target_indexed(
        &mut self,
        idx: usize,
        spatial: &SpatialIndex,
        lineage_members: &FxHashMap<crate::intern::Sym, Vec<usize>>,
        crowd: Option<KinCrowd>,
    ) {
        self.validate_or_assign_wander_target(idx, Some((spatial, lineage_members)), crowd);
    }

    pub(crate) fn validate_or_assign_wander_target(
        &mut self,
        idx: usize,
        indexed: Option<(&SpatialIndex, &FxHashMap<crate::intern::Sym, Vec<usize>>)>,
        crowd: Option<KinCrowd>,
    ) {
        if let Some(journey) = self.organisms[idx].journey.clone() {
            let org = &self.organisms[idx];
            let distance = (journey.target.0 - org.x as i32)
                .abs()
                .max((journey.target.1 - org.y as i32).abs());
            let arrived = distance <= 2;
            let expired = self.tick_count >= journey.expires_at;
            let invalid = !self.grid.get(journey.target.0, journey.target.1).walkable();
            if arrived || expired || invalid {
                let org = &mut self.organisms[idx];
                org.journey = None;
                org.wander_target = None;
                org.settled_until = self.tick_count + crate::organism::mind::JOURNEY_REST;
                if arrived {
                    org.boredom *= 0.4;
                    org.curiosity_drive *= 0.5;
                    org.log_life(
                        self.tick_count,
                        "life",
                        format!("arrived after {}", journey.description),
                    );
                    org.think("looking around a new place", self.tick_count);
                } else {
                    org.log_life(
                        self.tick_count,
                        "life",
                        format!("ended journey: {}", journey.description),
                    );
                }
                return;
            }
            // Keep an interrupted journey's destination until it completes;
            // incidental needs may otherwise replace the wander suggestion.
            self.organisms[idx].wander_target = Some(journey.target);
            return;
        }
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
        let lid = self.organisms[idx].lineage_id;
        let (mx, my) = (self.organisms[idx].x, self.organisms[idx].y);
        let (sumx, sumy, count, lineage_total) = if let Some(crowd) = crowd {
            (crowd.sumx, crowd.sumy, crowd.count, crowd.lineage_total)
        } else {
            let mut sumx = 0.0f32;
            let mut sumy = 0.0f32;
            let mut count = 0u32;
            let my_id = self.organisms[idx].id;
            let mut visit = |o: &crate::organism::organism::Organism| {
                if !o.alive || o.id == my_id || o.lineage_id != lid {
                    return;
                }
                let d = (o.x - mx).abs() + (o.y - my).abs();
                if d <= 8.0 {
                    sumx += o.x;
                    sumy += o.y;
                    count += 1;
                }
            };
            if let Some((spatial, _)) = indexed {
                for (_, o) in spatial.ordered_nearby(&self.organisms, mx, my, 8) {
                    visit(o);
                }
            } else {
                for o in &self.organisms {
                    visit(o);
                }
            }
            let lineage_total = if count >= 2 {
                if let Some((_, lineage_members)) = indexed {
                    lineage_members
                        .get(lid.as_str())
                        .into_iter()
                        .flatten()
                        .filter(|&&member_idx| {
                            let o = &self.organisms[member_idx];
                            o.alive && o.lineage_id == lid
                        })
                        .count()
                } else {
                    self.organisms
                        .iter()
                        .filter(|o| o.alive && o.lineage_id == lid)
                        .count()
                }
            } else {
                0
            };
            (sumx, sumy, count, lineage_total)
        };
        if count >= 2 {
            let curiosity = self.organisms[idx].traits.curiosity;
            let age = self.organisms[idx].age;
            let population_limit = self.population_limit();
            let overcrowded = lineage_total >= lineage_overcrowding_threshold(population_limit);
            let fork_eligible = age >= 700 && curiosity >= 0.40 && count >= 4;
            // Forks now take a band of up to five, so they happen less often.
            let fork_chance = if overcrowded {
                0.35
            } else if population_limit > DEFAULT_MAX_POPULATION {
                // Large desktop worlds need stable, growing civilizations to
                // reach their late eras. Expeditions still happen, but they
                // no longer fragment every settlement at the hosted-world
                // rate long before a lineage can mature.
                0.04
            } else {
                0.12
            };
            if (fork_eligible || (overcrowded && age >= 700 && count >= 3))
                && self.rng.random::<f32>() < fork_chance
            {
                if let Some((fx, fy)) = self.find_far_empty_anchor(mx as i32, my as i32) {
                    self.fork_new_tribe(idx, fx, fy);
                    return;
                }
            }

            if self.tick_count < self.organisms[idx].settled_until {
                return;
            }
            let cx = sumx / count as f32;
            let cy = sumy / count as f32;
            let mut dx = mx - cx;
            let mut dy = my - cy;
            let len = (dx * dx + dy * dy).sqrt();
            if len < 0.5 {
                let a = self.rng.random::<f32>() * std::f32::consts::TAU;
                dx = a.det_cos();
                dy = a.det_sin();
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
                self.organisms[idx].begin_journey((tx, ty), "seeking open land", self.tick_count);
                return;
            }
        }

        let curiosity = self.organisms[idx].traits.curiosity;
        let age = self.organisms[idx].age;

        let adolescent = (1500..1900).contains(&age);
        if (curiosity < 0.40 && !adolescent) || self.tick_count < self.organisms[idx].settled_until {
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
        // Reachable destinations: targets up to ~650 tiles away rarely
        // arrived before the journey expired, so explorers looped.
        let min_dist = 30 + (curiosity * 40.0) as i32;
        let max_dist = 90 + (curiosity * 110.0) as i32;
        if let Some(target) = self.find_distant_land_target(x, y, min_dist, max_dist) {
            self.organisms[idx].begin_journey(target, "exploring distant land", self.tick_count);
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
        if self.grid.hazard_at(x, y) >= 0.45 {
            return false;
        }
        let nearby_hazards = (-2i32..=2)
            .flat_map(|dx| (-2i32..=2).map(move |dy| (dx, dy)))
            .filter(|(dx, dy)| self.grid.hazard_at(x + dx, y + dy) >= 0.65)
            .count();
        if nearby_hazards >= 3 {
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
