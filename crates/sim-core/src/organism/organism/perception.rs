use super::*;

impl Organism {
    pub fn perceive(
        &self,
        grid: &WorldGrid,
        organisms: &[Organism],
        night: bool,
        animal_near: bool,
        spatial: &crate::sim::spatial::SpatialIndex,
    ) -> String {
        let mut nearby = Vec::with_capacity(16);
        self.perceive_into(grid, organisms, night, animal_near, spatial, &mut nearby)
    }

    pub fn perceive_into(
        &self,
        grid: &WorldGrid,
        organisms: &[Organism],
        night: bool,
        animal_near: bool,
        spatial: &crate::sim::spatial::SpatialIndex,
        nearby: &mut Vec<usize>,
    ) -> String {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let scan: i32 = if night {
            if self.traits.curiosity > 0.7 {
                8
            } else {
                6
            }
        } else {
            8
        };

        let hunger_raw = if self.energy < 0.2 {
            2
        } else if self.energy < 0.5 {
            1
        } else {
            0
        };
        let hunger = if self.infection > 0.5 {
            hunger_raw.max(1)
        } else {
            hunger_raw
        };
        let thirst = if self.hydration < 0.2 {
            2
        } else if self.hydration < 0.5 {
            1
        } else {
            0
        };

        let mut food_dx = 0i32;
        let mut food_dy = 0i32;
        let mut water_dx = 0i32;
        let mut water_dy = 0i32;
        let mut food_dist = 999i32;
        let mut water_dist = 999i32;
        let mut fire_near = false;
        let fire_r = (2.0 + 2.0 * self.traits.fear) as i32;

        for dx in -scan..=scan {
            for dy in -scan..=scan {
                let t = grid.get(ix + dx, iy + dy);
                let dist = dx.abs() + dy.abs();
                match t {
                    Tile::Food if dist < food_dist => {
                        food_dist = dist;
                        food_dx = dx;
                        food_dy = dy;
                    }
                    Tile::Water if dist < water_dist => {
                        water_dist = dist;
                        water_dx = dx;
                        water_dy = dy;
                    }
                    Tile::Fire if dist <= fire_r => {
                        fire_near = true;
                    }
                    _ => {}
                }
            }
        }

        let food_dir = if food_dist == 999 {
            'X'
        } else {
            dir_char(food_dx, food_dy)
        };
        let water_dir = if water_dist == 999 {
            'X'
        } else {
            dir_char(water_dx, water_dy)
        };
        let remembered_food_dir = remembered_dir_char(
            &self.food_memory,
            self.x,
            self.y,
            &self.danger_memory,
            hunger as f32 / 2.0,
        );
        let remembered_water_dir = remembered_dir_char(
            &self.water_memory,
            self.x,
            self.y,
            &self.danger_memory,
            thirst as f32 / 2.0,
        );

        // One bucket query covers both the five-tile social radius and the
        // larger attitude radius. Keep the exact social distance check: the
        // index returns a bucket-aligned superset.
        let mut org_near = 0u8;
        let mut kin_near = 0u8;
        spatial.query_into(self.x as i32, self.y as i32, scan, nearby);
        let mut nearest_lid: Option<&str> = None;
        let mut nearest_d = 999.0f32;
        for &i in nearby.iter() {
            let other = &organisms[i];
            if std::ptr::eq(other, self) || !other.alive {
                continue;
            }
            let distance = (other.x - self.x).abs() + (other.y - self.y).abs();
            if distance <= 5.0 {
                org_near = 1;
                if other.lineage_id == self.lineage_id {
                    kin_near = 1;
                }
            }
            if other.lineage_id != self.lineage_id && distance < nearest_d {
                nearest_d = distance;
                nearest_lid = Some(&other.lineage_id);
            }
        }

        let food_tr = if grid.detect_trail(ix, iy, TrailKind::Food, 5) > 0.4 {
            1
        } else {
            0
        };
        let water_tr = if grid.detect_trail(ix, iy, TrailKind::Water, 5) > 0.4 {
            1
        } else {
            0
        };

        let att_char = {
            match nearest_lid {
                Some(lid) if nearest_d <= scan as f32 => {
                    let att = self.attitude_toward(lid);
                    if att >= 0.25 {
                        'A'
                    } else if att <= -0.25 {
                        'H'
                    } else {
                        'N'
                    }
                }
                _ => 'X',
            }
        };

        let inf_level = if self.infection > 0.4 {
            '2'
        } else if self.infection > 0.15 {
            '1'
        } else {
            '0'
        };

        let danger_near = self
            .danger_memory
            .iter()
            .any(|(&(mx, my), &v)| v > 0.30 && (mx - ix).abs() + (my - iy).abs() <= 5);

        let warmth_char = {
            let mut has_warmth = false;
            'outer: for ddx in -4i32..=4 {
                for ddy in -4i32..=4 {
                    if grid.get(ix + ddx, iy + ddy) == crate::world::tiles::Tile::Campfire {
                        has_warmth = true;
                        break 'outer;
                    }
                }
            }
            if has_warmth {
                'W'
            } else if grid.temp_at(ix, iy) < 8.0 {
                'C'
            } else {
                'N'
            }
        };

        let carry_char = match (self.carrying > 0, self.carrying_type) {
            (true, 2) => 'R',
            (true, _) => 'K',
            _ => '0',
        };
        let food_reserve_char = reserve_char(self.inv_food, 3);
        let water_reserve_char = reserve_char(self.inv_water, 4);

        let shelter_char = {
            let mut s = false;
            'sh: for ddx in -2i32..=2 {
                for ddy in -2i32..=2 {
                    let nx = ix + ddx;
                    let ny = iy + ddy;
                    if matches!(grid.get(nx, ny), Tile::Hut | Tile::Rock) || grid.structure_at(nx, ny) >= 0.35
                    {
                        s = true;
                        break 'sh;
                    }
                }
            }
            if s {
                'S'
            } else {
                'E'
            }
        };

        let animal_char = if animal_near { 'A' } else { '.' };

        let hazard_val = if crate::world::grid::WorldGrid::in_bounds(ix, iy) {
            grid.hazard[crate::world::grid::WorldGrid::idx(ix, iy)]
        } else {
            0.0
        };
        let hazard_char = if hazard_val > 0.15 {
            'H'
        } else if hazard_val > 0.05 {
            'h'
        } else {
            '.'
        };

        perception_key(&KeyParts {
            hunger,
            thirst,
            food_dir,
            water_dir,
            remembered_food_dir,
            remembered_water_dir,
            fire_near,
            org_near,
            food_tr,
            water_tr,
            kin_near,
            att_char,
            inf_level,
            danger_near,
            warmth_char,
            carry_char,
            food_reserve_char,
            water_reserve_char,
            shelter_char,
            animal_char,
            hazard_char,
        })
    }

    pub fn near_shelter(&self, grid: &WorldGrid, buildings: &BuildingList) -> bool {
        self.has_shelter_within(grid, buildings, 2)
    }

    pub(crate) fn has_shelter_within(&self, grid: &WorldGrid, buildings: &BuildingList, radius: i32) -> bool {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let legacy_shelter = (-radius..=radius).any(|dx| {
            (-radius..=radius).any(|dy| {
                let nx = ix + dx;
                let ny = iy + dy;
                // Must stay in sync with `find_shelter_tile`: `Tile::Rock`
                // is not walkable, so counting it here made an organism
                // believe it was sheltered while `find_shelter_tile` could
                // never return the rock it was looking for.
                matches!(grid.get(nx, ny), Tile::Hut | Tile::Campfire) || grid.structure_at(nx, ny) >= 0.35
            })
        });
        legacy_shelter
            || buildings.any_near(ix, iy, radius, |building| {
                if !building.provides_shelter_for(&self.lineage_id) {
                    return false;
                }
                let (sx, sy) = building.closest_footprint_tile(ix, iy);
                (sx - ix).abs() <= radius && (sy - iy).abs() <= radius
            })
    }

    /// The scan of every building this replaced, kept to check the index against.
    #[cfg(test)]
    pub(crate) fn has_shelter_within_reference(
        &self,
        grid: &WorldGrid,
        buildings: &[crate::sim::buildings::Building],
        radius: i32,
    ) -> bool {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let legacy_shelter = (-radius..=radius).any(|dx| {
            (-radius..=radius).any(|dy| {
                let nx = ix + dx;
                let ny = iy + dy;
                matches!(grid.get(nx, ny), Tile::Hut | Tile::Campfire) || grid.structure_at(nx, ny) >= 0.35
            })
        });
        legacy_shelter
            || buildings.iter().any(|building| {
                if !building.provides_shelter_for(&self.lineage_id) {
                    return false;
                }
                let (sx, sy) = building.closest_footprint_tile(ix, iy);
                (sx - ix).abs() <= radius && (sy - iy).abs() <= radius
            })
    }

    pub(crate) fn has_shelter_project_within(&self, buildings: &BuildingList, radius: i32) -> bool {
        let (ix, iy) = (self.x as i32, self.y as i32);
        buildings.any_near(ix, iy, radius, |building| {
            if !building.is_shelter_project_for(&self.lineage_id) {
                return false;
            }
            let (sx, sy) = building.closest_footprint_tile(ix, iy);
            (sx - ix).abs() <= radius && (sy - iy).abs() <= radius
        })
    }

    pub(crate) fn find_shelter_tile(
        &self,
        grid: &WorldGrid,
        buildings: &BuildingList,
        radius: i32,
    ) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best: Option<(i32, i32)> = None;
        let mut best_dist = radius + 1;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let nx = ix + dx;
                let ny = iy + dy;
                let is_shelter = matches!(grid.get(nx, ny), Tile::Hut | Tile::Campfire)
                    || grid.structure_at(nx, ny) >= 0.35;
                if is_shelter {
                    let dist = dx.abs() + dy.abs();
                    if dist < best_dist {
                        best_dist = dist;
                        best = Some((nx, ny));
                    }
                }
            }
        }
        // The list-order scan took the first building to beat the best so far,
        // so ties go to the building earliest in the list. Only buildings closer
        // than `best_dist <= radius + 1` can win, and every one of those lies
        // within `radius` on both axes, so the index's candidates (in cell order)
        // are ranked by (distance, list position) to the same effect.
        let mut best_position = usize::MAX;
        buildings.visit_near(ix, iy, radius, |position, building| {
            if !building.provides_shelter_for(&self.lineage_id) {
                return false;
            }
            let (sx, sy) = building.closest_footprint_tile(ix, iy);
            let dist = (sx - ix).abs() + (sy - iy).abs();
            if dist < best_dist
                || (dist == best_dist && best_position != usize::MAX && position < best_position)
            {
                best_dist = dist;
                best_position = position;
                best = Some((sx, sy));
            }
            false
        });
        best
    }

    /// The scan of every building this replaced, kept to check the index against.
    #[cfg(test)]
    pub(crate) fn find_shelter_tile_reference(
        &self,
        grid: &WorldGrid,
        buildings: &[crate::sim::buildings::Building],
        radius: i32,
    ) -> Option<(i32, i32)> {
        let (ix, iy) = (self.x as i32, self.y as i32);
        let mut best: Option<(i32, i32)> = None;
        let mut best_dist = radius + 1;
        for dx in -radius..=radius {
            for dy in -radius..=radius {
                let nx = ix + dx;
                let ny = iy + dy;
                let is_shelter = matches!(grid.get(nx, ny), Tile::Hut | Tile::Campfire)
                    || grid.structure_at(nx, ny) >= 0.35;
                if is_shelter {
                    let dist = dx.abs() + dy.abs();
                    if dist < best_dist {
                        best_dist = dist;
                        best = Some((nx, ny));
                    }
                }
            }
        }
        for building in buildings
            .iter()
            .filter(|building| building.provides_shelter_for(&self.lineage_id))
        {
            let (sx, sy) = building.closest_footprint_tile(ix, iy);
            let dist = (sx - ix).abs() + (sy - iy).abs();
            if dist < best_dist {
                best_dist = dist;
                best = Some((sx, sy));
            }
        }
        best
    }
}

/// The pieces of a perception key, in the order they are written.
pub(super) struct KeyParts {
    pub hunger: i32,
    pub thirst: i32,
    pub food_dir: char,
    pub water_dir: char,
    pub remembered_food_dir: char,
    pub remembered_water_dir: char,
    pub fire_near: bool,
    pub org_near: u8,
    pub food_tr: i32,
    pub water_tr: i32,
    pub kin_near: u8,
    pub att_char: char,
    pub inf_level: char,
    pub danger_near: bool,
    pub warmth_char: char,
    pub carry_char: char,
    pub food_reserve_char: char,
    pub water_reserve_char: char,
    pub shelter_char: char,
    pub animal_char: char,
    pub hazard_char: char,
}

/// A digit the key writes for a small non-negative number, as `format!` would
/// print it (the callers only produce 0 to 2).
fn digit(n: impl Into<i32>) -> char {
    (b'0' + n.into() as u8) as char
}

/// Join the pieces into the Q-table key: 21 characters, one allocation, no
/// formatting machinery.
pub(super) fn perception_key(k: &KeyParts) -> String {
    let mut key = String::with_capacity(21);
    key.push(digit(k.hunger));
    key.push(digit(k.thirst));
    key.push(k.food_dir);
    key.push(k.water_dir);
    key.push(k.remembered_food_dir);
    key.push(k.remembered_water_dir);
    key.push(digit(i32::from(k.fire_near)));
    key.push(digit(k.org_near));
    key.push(digit(k.food_tr));
    key.push(digit(k.water_tr));
    key.push(digit(k.kin_near));
    key.push(k.att_char);
    key.push(k.inf_level);
    key.push(if k.danger_near { 'D' } else { 'S' });
    key.push(k.warmth_char);
    key.push(k.carry_char);
    key.push(k.food_reserve_char);
    key.push(k.water_reserve_char);
    key.push(k.shelter_char);
    key.push(k.animal_char);
    key.push(k.hazard_char);
    key
}

/// The `format!` this replaced, kept to check the key writer against.
#[cfg(test)]
pub(super) fn perception_key_reference(k: &KeyParts) -> String {
    format!(
        "{hunger}{thirst}{food_dir}{water_dir}{mem_food}{mem_water}{fire_near_c}{org_near}{food_tr}{water_tr}{kin_near}{att_char}{inf_level}{dnear}{warmth}{carry}{food_reserve}{water_reserve}{shelter}{animal}{hazard}",
        hunger = k.hunger,
        thirst = k.thirst,
        food_dir = k.food_dir,
        water_dir = k.water_dir,
        mem_food = k.remembered_food_dir,
        mem_water = k.remembered_water_dir,
        fire_near_c = if k.fire_near { 1 } else { 0 },
        org_near = k.org_near,
        food_tr = k.food_tr,
        water_tr = k.water_tr,
        kin_near = k.kin_near,
        att_char = k.att_char,
        inf_level = k.inf_level,
        dnear = if k.danger_near { 'D' } else { 'S' },
        warmth = k.warmth_char,
        carry = k.carry_char,
        food_reserve = k.food_reserve_char,
        water_reserve = k.water_reserve_char,
        shelter = k.shelter_char,
        animal = k.animal_char,
        hazard = k.hazard_char,
    )
}

#[cfg(test)]
mod key_tests {
    use super::*;

    #[test]
    fn the_key_writer_matches_format() {
        let dirs = ['X', 'N', 'S', 'E', 'W', 'O'];
        let mut state = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = move || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for _ in 0..20_000 {
            let mut pick = |n: usize| (next() % n as u64) as usize;
            let k = KeyParts {
                hunger: pick(3) as i32,
                thirst: pick(3) as i32,
                food_dir: dirs[pick(6)],
                water_dir: dirs[pick(6)],
                remembered_food_dir: dirs[pick(6)],
                remembered_water_dir: dirs[pick(6)],
                fire_near: pick(2) == 1,
                org_near: pick(2) as u8,
                food_tr: pick(2) as i32,
                water_tr: pick(2) as i32,
                kin_near: pick(2) as u8,
                att_char: ['A', 'H', 'N', 'X'][pick(4)],
                inf_level: ['0', '1', '2'][pick(3)],
                danger_near: pick(2) == 1,
                warmth_char: ['W', 'C', 'N'][pick(3)],
                carry_char: ['R', 'K', '0'][pick(3)],
                food_reserve_char: ['0', '1', '2'][pick(3)],
                water_reserve_char: ['0', '1', '2'][pick(3)],
                shelter_char: ['S', 'E'][pick(2)],
                animal_char: ['A', '.'][pick(2)],
                hazard_char: ['H', 'h', '.'][pick(3)],
            };
            assert_eq!(perception_key(&k), perception_key_reference(&k));
        }
    }
}
