

use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

impl Simulation {
    pub(crate) fn do_raid(&mut self, idx: usize, near: &[usize], ambush: bool) -> f32 {
        let lid = self.organisms[idx].lineage_id.clone();
        let target = near.iter().copied().find(|&k| {
            self.organisms[k].lineage_id != lid
                && self.organisms[idx].attitude_toward(&self.organisms[k].lineage_id) < -0.15
        });
        let Some(ti) = target else { return 0.0; };

        let dmg = if ambush { 0.10 } else { 0.06 };
        self.organisms[ti].health = (self.organisms[ti].health - dmg).max(0.0);
        self.organisms[ti].fear_level = (self.organisms[ti].fear_level + 0.15).min(1.0);

        let their = self.organisms[ti].lineage_id.clone();
        self.organisms[idx].update_attitude(&their, -0.10);
        self.organisms[ti].update_attitude(&lid, -0.15);

        if self.organisms[ti].inv_food > 0 {
            self.organisms[ti].inv_food -= 1;
            self.organisms[idx].inv_food = self.organisms[idx].inv_food.saturating_add(1);
        }

        let nm   = self.organisms[idx].name.clone();
        let tick = self.tick_count;
        let verb = if ambush { "ambushed" } else { "raided" };
        push_event(&mut self.events, tick, "challenge", &nm,
                   &format!("{} a rival from {}", verb, their));
        self.history.challenges_total += 1;
        self.organisms[idx].think(
            if ambush { "springing an ambush" } else { "raiding" },
            tick,
        );

        if ambush { 0.014 } else { 0.010 }
    }
}
