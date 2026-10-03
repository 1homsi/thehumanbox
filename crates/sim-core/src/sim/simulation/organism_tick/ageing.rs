use super::*;

impl Simulation {
    /// Ageing and senescence, and the base reward for how the body fared this tick.
    pub(super) fn org_ageing(&mut self, f: &mut OrgFrame<'_>) {
        let current_tile = f.current_tile;
        let idx = f.idx;
        let prev_energy = f.prev_energy;
        let prev_hydration = f.prev_hydration;
        let prev_inv_food = f.prev_inv_food;
        let prev_inv_water = f.prev_inv_water;

        let senescence_start = if self.organisms[idx].max_age > 0 {
            (self.organisms[idx].max_age as f32 * 0.65) as u32
        } else {
            u32::MAX
        };
        let well_nourished = self.organisms[idx].energy > 0.6 && self.organisms[idx].hydration > 0.6;
        if well_nourished && current_tile != Tile::Fire && self.organisms[idx].infection < 0.3 {
            let regen = if self.organisms[idx].age < senescence_start {
                0.001
            } else {
                0.0003
            };
            self.organisms[idx].health = (self.organisms[idx].health + regen).min(1.0);
        }
        if self.organisms[idx].max_age > 0 && self.organisms[idx].age > senescence_start {
            let decline = ((self.organisms[idx].age - senescence_start) as f32
                / (self.organisms[idx].max_age - senescence_start).max(1) as f32)
                .min(1.0);
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.001 * decline).max(0.0);
        }

        self.organisms[idx].age += 1;
        if self.organisms[idx].age.is_multiple_of(100) {
            self.organisms[idx].decay_memory(self.tick_count);
        }

        if self.organisms[idx].nursing_until > self.tick_count {
            if self.organisms[idx].energy < 0.85 {
                self.organisms[idx].energy = (self.organisms[idx].energy + 0.012).min(1.0);
            }
            if self.organisms[idx].hydration < 0.85 {
                self.organisms[idx].hydration = (self.organisms[idx].hydration + 0.010).min(1.0);
            }
        }

        let mut reward = (self.organisms[idx].energy - prev_energy) * 2.0
            + (self.organisms[idx].hydration - prev_hydration) * 2.0;
        reward += reserve_inventory_feedback(
            prev_energy,
            prev_hydration,
            prev_inv_food,
            prev_inv_water,
            &self.organisms[idx],
        );
        if current_tile == Tile::Fire {
            reward -= 0.5;
        }

        f.reward = reward;
    }
}
