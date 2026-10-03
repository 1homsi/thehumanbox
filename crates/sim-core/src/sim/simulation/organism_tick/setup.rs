use super::*;

impl Simulation {
    /// Tick start: remember the vitals this tick will be judged against, take stock of kin and hostile neighbours, and apply passive and rival territory pressure.
    pub(super) fn org_setup(&mut self, f: &mut OrgFrame<'_>) {
        let idx = f.idx;
        let org_idx_by_id = f.org_idx_by_id;
        let spatial = f.spatial;
        let spatial_buf = &mut *f.spatial_buf;

        let night = self.is_night();
        let epsilon = (0.30 - self.organisms[idx].age as f32 * 0.00005).max(0.08);

        let prev_energy = self.organisms[idx].energy;
        let prev_hydration = self.organisms[idx].hydration;
        let prev_inv_food = self.organisms[idx].inv_food;
        let prev_inv_water = self.organisms[idx].inv_water;

        {
            let org = &self.organisms[idx];
            let ox = org.x as i32;
            let oy = org.y as i32;
            spatial.query_into(ox, oy, 6, spatial_buf);
            let mut kin_near: usize = 0;
            let mut hostile_near = false;
            for &i in spatial_buf.iter() {
                if i == idx {
                    continue;
                }
                let o = &self.organisms[i];
                if !o.alive {
                    continue;
                }
                let dist = (o.x - org.x).abs() + (o.y - org.y).abs();
                if o.lineage_id == org.lineage_id {
                    if dist <= 5.0 {
                        kin_near += 1;
                    }
                } else if !hostile_near && dist <= 6.0 && org.attitude_toward(&o.lineage_id) < -0.2 {
                    hostile_near = true;
                }
            }
            let near_shelter = org.near_shelter(&self.grid, &self.buildings);
            let weather_kind = self.weather.kind;
            let tick_now = self.tick_count;
            self.organisms[idx].tick_inner_state(
                kin_near,
                near_shelter,
                hostile_near,
                weather_kind,
                tick_now,
                night,
            );
        }

        {
            let my_lid = self.organisms[idx].lineage_id.clone();
            let intruders: Vec<String> = if let Some(elder_id) = self.lineage_elders.get(&my_lid) {
                if let Some(&elder_idx) = org_idx_by_id.get(elder_id) {
                    let ex = self.organisms[elder_idx].home_x;
                    let ey = self.organisms[elder_idx].home_y;
                    let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                    if (ox - ex).abs() + (oy - ey).abs() < 20.0 {
                        // Query the spatial index around the home instead of
                        // scanning every organism — this block runs per-tick
                        // for every organism near its lineage's elder home.
                        spatial.query_into(ex as i32, ey as i32, 12, spatial_buf);
                        let mut v: Vec<String> = Vec::new();
                        for &i in spatial_buf.iter() {
                            let o = &self.organisms[i];
                            if !o.alive || o.lineage_id == my_lid {
                                continue;
                            }
                            if (o.x - ex).abs() + (o.y - ey).abs() < 12.0 {
                                v.push(o.lineage_id.clone());
                            }
                        }
                        v
                    } else {
                        Vec::new()
                    }
                } else {
                    Vec::new()
                }
            } else {
                Vec::new()
            };
            for intruder_lid in intruders {
                let att = self.organisms[idx]
                    .lineage_attitudes
                    .entry(intruder_lid)
                    .or_insert(0.0);
                *att = (*att - 0.0015).max(-1.0);
            }
        }

        // Passive territory: organisms gradually stamp their lineage onto land they inhabit.
        // Those with borders/territory discovery claim a wider radius around home.
        if self.tick_count % 40 == (idx as u64 % 40) {
            let has_borders = self.organisms[idx].discoveries.contains("territory")
                || self.organisms[idx].discoveries.contains("borders");
            let (hx, hy) = (
                self.organisms[idx].home_x as i32,
                self.organisms[idx].home_y as i32,
            );
            let lid = self.organisms[idx].lineage_id.clone();
            let radius = if has_borders { 4 } else { 1 };
            self.claim_territory(&lid, hx, hy, radius);
        }

        // Rival territory pressure: being on a rival's claimed tile
        // degrades attitude. The inverse map (tile_owner) makes this
        // an O(1) lookup instead of an O(L × T_avg) scan of every
        // lineage's claimed tile set.
        {
            let (ox_i, oy_i) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let rival_lid: Option<String> = self
                .tile_owner
                .get(&(ox_i, oy_i))
                .filter(|lid| lid.as_str() != self.organisms[idx].lineage_id)
                .cloned();
            if let Some(rival) = rival_lid {
                let att = self.organisms[idx].lineage_attitudes.entry(rival).or_insert(0.0);
                *att = (*att - 0.002).max(-1.0);
            }
        }

        f.epsilon = epsilon;
        f.night = night;
        f.prev_energy = prev_energy;
        f.prev_hydration = prev_hydration;
        f.prev_inv_food = prev_inv_food;
        f.prev_inv_water = prev_inv_water;
    }
}
