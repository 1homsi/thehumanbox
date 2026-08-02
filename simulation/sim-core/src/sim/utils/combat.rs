use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

impl Simulation {
    pub(crate) fn do_raid(&mut self, idx: usize, near: &[usize], ambush: bool) -> f32 {
        let lid = self.organisms[idx].lineage_id.clone();
        let target = near
            .iter()
            .copied()
            .filter(|&k| {
                self.organisms[k].alive
                    && self.organisms[k].lineage_id != lid
                    && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) < -0.15
            })
            .min_by(|&left, &right| {
                let left_org = &self.organisms[left];
                let right_org = &self.organisms[right];
                self.organisms[idx]
                    .attitude_toward(&left_org.lineage_id)
                    .total_cmp(&self.organisms[idx].attitude_toward(&right_org.lineage_id))
                    .then_with(|| {
                        let left_distance = (left_org.x - self.organisms[idx].x).abs()
                            + (left_org.y - self.organisms[idx].y).abs();
                        let right_distance = (right_org.x - self.organisms[idx].x).abs()
                            + (right_org.y - self.organisms[idx].y).abs();
                        left_distance.total_cmp(&right_distance)
                    })
                    .then_with(|| left.cmp(&right))
            });
        let Some(ti) = target else {
            return 0.0;
        };

        let their = self.organisms[ti].lineage_id.clone();
        let (tx, ty) = (self.organisms[ti].x as i32, self.organisms[ti].y as i32);
        let defender_on_duty =
            crate::sim::actions::warfare::stand_guard::active_guard(self, &their, tx, ty).is_some();
        let attacker_damage = (if ambush { 0.10 } else { 0.06 }
            * self.organisms[idx].combat_tool_bonus()
            * (0.85 + self.organisms[idx].traits.aggression * 0.30))
            .min(0.28);
        let defender_can_counter = self.organisms[ti].age_stage().can_combat()
            && self.organisms[ti].energy > 0.20
            && self.organisms[ti].health > 0.25;
        let counter_damage = if defender_can_counter {
            let duty_bonus = if defender_on_duty { 1.40 } else { 1.0 };
            (0.028 * self.organisms[ti].combat_tool_bonus() * duty_bonus * if ambush { 0.45 } else { 1.0 })
                .min(0.22)
        } else {
            0.0
        };

        self.organisms[ti].health = (self.organisms[ti].health - attacker_damage).max(0.0);
        self.organisms[ti].fear_level = (self.organisms[ti].fear_level + 0.15).min(1.0);
        self.organisms[ti].energy = (self.organisms[ti].energy - 0.025).max(0.0);
        self.organisms[idx].health = (self.organisms[idx].health - counter_damage).max(0.0);
        self.organisms[idx].fear_level = (self.organisms[idx].fear_level + counter_damage * 0.8).min(1.0);
        self.organisms[idx].energy = (self.organisms[idx].energy - 0.045).max(0.0);
        if self.organisms[ti].health <= 0.0 && self.organisms[ti].alive {
            self.organisms[ti].alive = false;
            self.history.deaths_combat += 1;
        }
        if self.organisms[idx].health <= 0.0 && self.organisms[idx].alive {
            self.organisms[idx].alive = false;
            self.history.deaths_combat += 1;
        }

        self.organisms[idx].update_attitude(&their, -0.10);
        self.organisms[ti].update_attitude(&lid, -0.15);

        let stole_food = self.organisms[idx].carry_room() > 0 && self.organisms[ti].inv_food > 0;
        if stole_food {
            self.organisms[ti].inv_food -= 1;
            self.organisms[idx].inv_food += 1;
        }
        crate::sim::actions::warfare::intercept_raid::mark_recent_attack(
            self,
            idx,
            &their,
            tx,
            ty,
            stole_food.then_some(crate::sim::survival_resources::CachedSupply::Food),
        );

        let nm = self.organisms[idx].name.clone();
        let tick = self.tick_count;
        let verb = if ambush { "ambushed" } else { "raided" };
        push_event(
            &mut self.events,
            tick,
            "challenge",
            &nm,
            &format!("{} a rival from {}", verb, their),
        );
        self.history.challenges_total += 1;
        self.organisms[idx].think(if ambush { "springing an ambush" } else { "raiding" }, tick);

        if !self.organisms[idx].alive {
            -0.025
        } else if ambush || stole_food {
            0.014
        } else {
            0.008
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn combatants() -> (Simulation, usize, usize) {
        let mut sim = Simulation::new(0xC0B447);
        let attacker = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let defender = sim
            .organisms
            .iter()
            .position(|organism| organism.alive && organism.id != sim.organisms[attacker].id)
            .unwrap();
        sim.organisms[attacker].lineage_id = "attackers".into();
        sim.organisms[defender].lineage_id = "defenders".into();
        sim.organisms[attacker]
            .lineage_attitudes
            .insert("defenders".into(), -0.8);
        sim.organisms[attacker].age = sim.organisms[attacker].max_age / 2;
        sim.organisms[defender].age = sim.organisms[defender].max_age / 2;
        sim.organisms[attacker].energy = 0.90;
        sim.organisms[attacker].health = 0.90;
        sim.organisms[defender].energy = 0.90;
        sim.organisms[defender].health = 0.90;
        sim.organisms[defender].inv_food = 2;
        (sim, attacker, defender)
    }

    #[test]
    fn full_raider_cannot_overfill_inventory_or_steal_food() {
        let (mut sim, attacker, defender) = combatants();
        sim.organisms[attacker].inv_wood = sim.organisms[attacker].carry_max() as u8;

        sim.do_raid(attacker, &[defender], false);

        assert_eq!(sim.organisms[defender].inv_food, 2);
        assert_eq!(sim.organisms[attacker].inv_food, 0);
        assert_eq!(sim.organisms[attacker].carry_room(), 0);
    }

    #[test]
    fn person_raid_does_not_damage_anonymous_or_friendly_map_structures() {
        let (mut sim, attacker, defender) = combatants();
        let (x, y) = (sim.organisms[defender].x as i32, sim.organisms[defender].y as i32);
        *sim.grid.structure_at_mut(x, y) = 0.8;

        sim.do_raid(attacker, &[defender], false);

        assert!((sim.grid.structure_at(x, y) - 0.8).abs() < f32::EPSILON);
    }

    #[test]
    fn equipped_guard_counterattack_is_stronger_than_unarmed_defense() {
        let (mut plain, attacker, defender) = combatants();
        let (mut guarded, guarded_attacker, guarded_defender) = combatants();
        guarded.organisms[guarded_defender].give_tool("iron_sword");
        guarded.organisms[guarded_defender].directive = format!(
            "guard_area:{}:{}",
            guarded.organisms[guarded_defender].x as i32, guarded.organisms[guarded_defender].y as i32
        );
        guarded.organisms[guarded_defender].directive_until = guarded.tick_count + 100;

        plain.do_raid(attacker, &[defender], false);
        guarded.do_raid(guarded_attacker, &[guarded_defender], false);

        assert!(guarded.organisms[guarded_attacker].health < plain.organisms[attacker].health);
    }
}
