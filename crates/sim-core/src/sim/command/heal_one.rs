use super::Simulation;
use crate::math::DetMath;

/// How far from the clicked point a person may be and still be the one healed, in tiles.
const DEFAULT_REACH: f32 = 4.0;
const MAX_REACH: f32 = 16.0;

impl Simulation {
    /// Heal the living person nearest the point (within the radius): full health, no infection, and none of
    /// their sicknesses. Returns false when nobody is in reach.
    pub(super) fn cmd_heal_one(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_REACH)
        } else {
            DEFAULT_REACH
        };
        let nearest = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (i, (o.x - x).det_hypot(o.y - y)))
            .filter(|&(_, d)| d <= reach)
            .min_by(|a, b| a.1.total_cmp(&b.1));
        let Some((i, _)) = nearest else {
            return false;
        };
        let person = &mut self.organisms[i];
        person.health = 1.0;
        person.infection = 0.0;
        person.diseases.clear();
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    #[test]
    fn heal_one_restores_only_the_nearest_person_in_reach() {
        let mut sim = Simulation::new(9);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = 60.0;
        sim.organisms[0].y = 60.0;
        sim.organisms[0].health = 0.2;
        sim.organisms[0].infection = 0.9;
        sim.organisms[0].diseases.push(("fever".to_string(), 500));
        sim.organisms[1].alive = true;
        sim.organisms[1].x = 200.0;
        sim.organisms[1].y = 200.0;
        sim.organisms[1].health = 0.2;

        assert!(sim.apply_command_json(r#"{"cmd":"heal_one","x":61.0,"y":61.0}"#));
        assert_eq!(sim.organisms[0].health, 1.0);
        assert_eq!(sim.organisms[0].infection, 0.0);
        assert!(sim.organisms[0].diseases.is_empty());
        assert_eq!(
            sim.organisms[1].health, 0.2,
            "the person out of reach is left alone"
        );
    }

    #[test]
    fn heal_one_reports_nobody_in_reach() {
        let mut sim = Simulation::new(9);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = 60.0;
        sim.organisms[0].y = 60.0;
        sim.organisms[0].health = 0.2;
        assert!(!sim.apply_command_json(r#"{"cmd":"heal_one","x":90.0,"y":90.0}"#));
        assert_eq!(sim.organisms[0].health, 0.2);
    }
}
