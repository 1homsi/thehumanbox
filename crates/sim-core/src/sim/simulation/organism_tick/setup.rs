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
            let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
            spatial.query_into(ox as i32, oy as i32, 6, spatial_buf);
            let (kin_near, hostile_near) = if self.organism_columns.ready_for(self.organisms.len()) {
                debug_assert_eq!(self.organism_columns.x[idx].to_bits(), ox.to_bits());
                kin_near_columns(&self.organism_columns, &self.organisms, idx, spatial_buf)
            } else {
                kin_near_structs(&self.organisms, idx, spatial_buf)
            };
            let near_shelter = self.organisms[idx].near_shelter(&self.grid, &self.buildings);
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
            let my_lid = &self.organisms[idx].lineage_id;
            let intruders: Vec<String> = if let Some(elder_id) = self.lineage_elders.get(my_lid.as_str()) {
                if let Some(&elder_idx) = org_idx_by_id.get(elder_id.as_str()) {
                    let ex = self.organisms[elder_idx].home_x;
                    let ey = self.organisms[elder_idx].home_y;
                    let (ox, oy) = (self.organisms[idx].x, self.organisms[idx].y);
                    if (ox - ex).abs() + (oy - ey).abs() < 20.0 {
                        // Query the spatial index around the home instead of
                        // scanning every organism — this block runs per-tick
                        // for every organism near its lineage's elder home.
                        spatial.query_into(ex as i32, ey as i32, 12, spatial_buf);
                        intruders_near(
                            &self.organisms,
                            self.organism_columns
                                .ready_for(self.organisms.len())
                                .then(|| self.organism_columns.neighbours()),
                            my_lid,
                            ex,
                            ey,
                            spatial_buf,
                        )
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
                    .entry(intruder_lid.into())
                    .or_insert(0.0);
                *att = (*att - 0.0015).max(-1.0);
            }
        }

        // Passive territory: organisms gradually stamp their lineage onto land they inhabit.
        // Those with borders/territory discovery claim a wider radius around home.
        if self.tick_count % 40 == (idx as u64 % 40) {
            let has_borders = self.organisms[idx].discoveries.has(Hot::Territory)
                || self.organisms[idx].discoveries.has(Hot::Borders);
            let (hx, hy) = (
                self.organisms[idx].home_x as i32,
                self.organisms[idx].home_y as i32,
            );
            let lid = self.organisms[idx].lineage_id;
            let radius = if has_borders { 4 } else { 1 };
            self.claim_territory(&lid, hx, hy, radius);
        }

        // Rival territory pressure: being on a rival's claimed tile
        // degrades attitude. The inverse map (tile_owner) makes this
        // an O(1) lookup instead of an O(L × T_avg) scan of every
        // lineage's claimed tile set.
        {
            let (ox_i, oy_i) = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
            let rival_lid: Option<crate::intern::Sym> = self
                .tile_owner
                .get(&(ox_i, oy_i))
                .filter(|lid| **lid != self.organisms[idx].lineage_id)
                .copied();
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

/// Kin within 5 tiles and a hostile neighbour within 6, from the hot columns.
fn kin_near_columns(
    cols: &crate::organism::columns::OrganismColumns,
    organisms: &[Organism],
    idx: usize,
    near: &[usize],
) -> (usize, bool) {
    let (ox, oy) = (cols.x[idx], cols.y[idx]);
    let mine = cols.lineage[idx];
    let mut kin_near = 0usize;
    let mut hostile_near = false;
    for &i in near {
        if i == idx || cols.alive[i] == 0 {
            continue;
        }
        let dist = (cols.x[i] - ox).abs() + (cols.y[i] - oy).abs();
        let other = cols.lineage[i];
        // The distance test comes first: the lineage compare is a string compare.
        if dist <= 5.0 && other == mine {
            kin_near += 1;
        } else if !hostile_near
            && dist <= 6.0
            && other != mine
            && organisms[idx].attitude_toward(other.as_str()) < -0.2
        {
            hostile_near = true;
        }
    }
    (kin_near, hostile_near)
}

fn kin_near_structs(organisms: &[Organism], idx: usize, near: &[usize]) -> (usize, bool) {
    let org = &organisms[idx];
    let mut kin_near = 0usize;
    let mut hostile_near = false;
    for &i in near {
        if i == idx {
            continue;
        }
        let o = &organisms[i];
        if !o.alive {
            continue;
        }
        let dist = (o.x - org.x).abs() + (o.y - org.y).abs();
        // The distance test comes first: the lineage compare is a string compare.
        if dist <= 5.0 && o.lineage_id == org.lineage_id {
            kin_near += 1;
        } else if !hostile_near
            && dist <= 6.0
            && o.lineage_id != org.lineage_id
            && org.attitude_toward(&o.lineage_id) < -0.2
        {
            hostile_near = true;
        }
    }
    (kin_near, hostile_near)
}

fn intruders_near(
    organisms: &[Organism],
    hot: Option<crate::organism::columns::NeighbourCols<'_>>,
    my_lid: &crate::intern::Sym,
    ex: f32,
    ey: f32,
    near: &[usize],
) -> Vec<String> {
    let mut v = Vec::new();
    if let Some(hot) = hot {
        for &i in near {
            if !hot.alive_at(i) || hot.lineage[i] == *my_lid {
                continue;
            }
            if (hot.x[i] - ex).abs() + (hot.y[i] - ey).abs() < 12.0 {
                v.push(hot.lineage[i].to_string());
            }
        }
    } else {
        for &i in near {
            let o = &organisms[i];
            if !o.alive || o.lineage_id == *my_lid {
                continue;
            }
            if (o.x - ex).abs() + (o.y - ey).abs() < 12.0 {
                v.push(o.lineage_id.to_string());
            }
        }
    }
    v
}
