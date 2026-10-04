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

        format!("{hunger}{thirst}{food_dir}{water_dir}{mem_food}{mem_water}{fire_near_c}{org_near}{food_tr}{water_tr}{kin_near}{att_char}{inf_level}{dnear}{warmth}{carry}{food_reserve}{water_reserve}{shelter}{animal}{hazard}",
            hunger = hunger,
            thirst = thirst,
            food_dir = food_dir,
            water_dir = water_dir,
            mem_food = remembered_food_dir,
            mem_water = remembered_water_dir,
            fire_near_c = if fire_near { 1 } else { 0 },
            org_near = org_near,
            food_tr = food_tr,
            water_tr = water_tr,
            kin_near = kin_near,
            att_char = att_char,
            inf_level = inf_level,
            dnear = if danger_near { 'D' } else { 'S' },
            warmth = warmth_char,
            carry  = carry_char,
            food_reserve = food_reserve_char,
            water_reserve = water_reserve_char,
            shelter = shelter_char,
            animal  = animal_char,
            hazard  = hazard_char,
        )
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
