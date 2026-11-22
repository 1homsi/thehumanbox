use super::*;

impl Simulation {
    /// Tick start: remember the vitals this tick will be judged against, take stock of kin and hostile neighbours, and apply passive and rival territory pressure.
    pub(super) fn org_setup(&mut self, f: &mut OrgFrame<'_>, look: &super::observe::SenseLook) {
        let idx = f.idx;

        let night = self.is_night();
        let epsilon = (0.30 - self.organisms[idx].age as f32 * 0.00005).max(0.08);

        let prev_energy = self.organisms[idx].energy;
        let prev_hydration = self.organisms[idx].hydration;
        let prev_inv_food = self.organisms[idx].inv_food;
        let prev_inv_water = self.organisms[idx].inv_water;

        let weather_kind = self.weather.kind;
        let tick_now = self.tick_count;
        self.organisms[idx].tick_inner_state(
            look.kin_near,
            look.near_shelter,
            look.hostile_near,
            weather_kind,
            tick_now,
            night,
        );

        for &intruder_lid in &look.intruders {
            let att = self.organisms[idx]
                .lineage_attitudes
                .entry(intruder_lid)
                .or_insert(0.0);
            *att = (*att - 0.0015).max(-1.0);
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
