use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

impl Simulation {
    pub(crate) fn consume_material(&mut self, idx: usize) {
        let o = &mut self.organisms[idx];
        if o.inv_stone > 0 {
            o.inv_stone -= 1;
        } else if o.inv_wood > 0 {
            o.inv_wood -= 1;
        }
    }

    pub(crate) fn craft(&mut self, idx: usize, what: &str, base: f32, reward: &mut f32) {
        let nm = self.organisms[idx].name.clone();
        let tick = self.tick_count;
        if self.organisms[idx].discover(what) {
            *reward += base;
            push_event(
                &mut self.events,
                tick,
                "build",
                &nm,
                &format!("crafted {} for the first time", what),
            );
        } else {
            *reward += base * 0.3;
        }
    }
}
