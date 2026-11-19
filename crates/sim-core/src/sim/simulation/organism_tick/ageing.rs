use super::*;

/// Health is a resource too: injury should outweigh passive healing and make
/// dangerous actions less attractive in similar future situations.
fn health_feedback(before: f32, after: f32) -> f32 {
    let delta = after - before;
    if delta < 0.0 {
        delta * 2.0
    } else {
        delta * 0.25
    }
}

impl Simulation {
    /// Ageing and senescence, and the base reward for how the body fared this tick.
    pub(super) fn org_ageing(&mut self, f: &mut OrgFrame<'_>) {
        let current_tile = f.current_tile;
        let idx = f.idx;
        let prev_energy = f.prev_energy;
        let prev_hydration = f.prev_hydration;
        let prev_inv_food = f.prev_inv_food;
        let prev_inv_water = f.prev_inv_water;

        body_ageing(
            &mut self.organisms[idx],
            current_tile == Tile::Fire,
            self.tick_count,
        );

        let mut reward = (self.organisms[idx].energy - prev_energy) * 2.0
            + (self.organisms[idx].hydration - prev_hydration) * 2.0;
        reward += health_feedback(f.prev_health, self.organisms[idx].health);
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

pub(super) fn body_ageing(o: &mut Organism, on_fire: bool, tick: u64) {
    let senescence_start = if o.max_age > 0 {
        (o.max_age as f32 * 0.65) as u32
    } else {
        u32::MAX
    };
    let well_nourished = o.energy > 0.6 && o.hydration > 0.6;
    if well_nourished && !on_fire && o.infection < 0.3 {
        let regen = if o.age < senescence_start { 0.001 } else { 0.0003 };
        o.health = (o.health + regen).min(1.0);
    }
    if o.max_age > 0 && o.age > senescence_start {
        let decline =
            ((o.age - senescence_start) as f32 / (o.max_age - senescence_start).max(1) as f32).min(1.0);
        o.energy = (o.energy - 0.001 * decline).max(0.0);
    }

    o.age += 1;
    if o.age.is_multiple_of(100) {
        o.decay_memory(tick);
    }

    if o.nursing_until > tick {
        if o.energy < 0.85 {
            o.energy = (o.energy + 0.012).min(1.0);
        }
        if o.hydration < 0.85 {
            o.hydration = (o.hydration + 0.010).min(1.0);
        }
    }
}

#[cfg(test)]
mod health_tests {
    use super::health_feedback;
    use crate::organism::{organism::Organism, traits::Traits};

    #[test]
    fn injury_penalty_outweighs_equal_passive_healing() {
        assert!(health_feedback(1.0, 0.8) < 0.0);
        assert!(health_feedback(0.8, 1.0) > 0.0);
        assert!(-health_feedback(1.0, 0.8) > health_feedback(0.8, 1.0));
        assert_eq!(health_feedback(0.8, 0.8), 0.0);
    }

    #[test]
    fn injury_lowers_learned_value_of_the_action() {
        let mut person = Organism::new(
            "test",
            "Test".into(),
            0.0,
            0.0,
            0,
            String::new(),
            "tribe",
            5000,
            Traits::default(),
        );
        person.learn_transition(
            "injury",
            24,
            health_feedback(1.0, 0.8),
            "next",
            None,
            Some(true),
            false,
        );
        assert!(person.q_table["injury"]
            .iter()
            .any(|&(action, value)| action == 24 && value < 0.0));
    }
}
