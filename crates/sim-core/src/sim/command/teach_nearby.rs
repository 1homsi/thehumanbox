use super::Simulation;

impl Simulation {
    /// Teach the tribe of the living person nearest the point (within the reach) the next secret it still
    /// lacks for its age: the gift of technology. Returns false when nobody is in reach, or the tribe has
    /// no secret left or was taught too recently (the same rules as the teach command).
    pub(super) fn cmd_teach_nearby(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let Some(i) = self.nearest_in_reach(x, y, radius) else {
            return false;
        };
        let lineage = self.organisms[i].lineage_id.clone();
        self.teach_tribe(&lineage)
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    #[test]
    fn teaching_the_tribe_nearby_gives_its_people_a_secret_then_waits_before_the_next() {
        let mut sim = Simulation::new(14);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = 90.0;
        sim.organisms[0].y = 90.0;
        let lineage = "tribe-teach".to_string();
        sim.organisms[0].lineage_id = lineage.clone();
        sim.lineage_eras
            .insert(lineage.clone(), crate::sim::era::Era::PreStone);
        let secret = sim
            .next_missing_discovery(&lineage)
            .expect("a new tribe lacks something");
        assert!(!sim.organisms[0].discoveries.contains(secret));
        assert!(sim.apply_command_json(r#"{"cmd":"teach_nearby","x":90.0,"y":90.0,"radius":4.0}"#));
        assert!(
            sim.organisms[0].discoveries.contains(secret),
            "the person learned the tribe's next secret"
        );
        assert!(
            !sim.apply_command_json(r#"{"cmd":"teach_nearby","x":90.0,"y":90.0,"radius":4.0}"#),
            "the tribe is not taught again straight away"
        );
    }

    #[test]
    fn teaching_with_nobody_in_reach_does_nothing() {
        let mut sim = Simulation::new(14);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        assert!(!sim.apply_command_json(r#"{"cmd":"teach_nearby","x":5.0,"y":5.0}"#));
    }
}
