use super::Simulation;
use crate::math::DetMath;
use crate::sim::world_events::push_event;

/// How far from the click a comet is seen, in tiles, unless the radius says otherwise.
const DEFAULT_COMET_REACH: f32 = 25.0;
const MAX_COMET_REACH: f32 = 40.0;
/// Fear added to everyone who sees the sun go dark.
const ECLIPSE_FEAR: f32 = 0.35;
/// Awe added to everyone who sees the lights of an aurora, and how much less afraid they feel.
const AURORA_AWE: f32 = 0.3;
const AURORA_CALM: f32 = 0.1;
/// Awe added to everyone who sees a comet, and to everyone who sees the sun go dark.
const COMET_AWE: f32 = 0.4;
const ECLIPSE_AWE: f32 = 0.1;

impl Simulation {
    /// The sun goes dark for a while: everyone alive is frightened and a little awed.
    /// Returns false when nobody is alive to see it.
    pub(super) fn cmd_eclipse(&mut self) -> bool {
        let mut seen = 0usize;
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            o.fear_level = (o.fear_level + ECLIPSE_FEAR).min(1.0);
            o.awe = (o.awe + ECLIPSE_AWE).min(1.0);
            seen += 1;
        }
        if seen == 0 {
            return false;
        }
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "omen",
            "world",
            "the sun went dark for a while, and everyone who saw it was afraid",
        );
        true
    }

    /// Lights dance across the sky over the whole world: everyone alive is awed and a little calmer.
    /// Returns false when nobody is alive to see them.
    pub(super) fn cmd_aurora(&mut self) -> bool {
        let mut seen = 0usize;
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            o.awe = (o.awe + AURORA_AWE).min(1.0);
            o.fear_level = (o.fear_level - AURORA_CALM).max(0.0);
            seen += 1;
        }
        if seen == 0 {
            return false;
        }
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "omen",
            "world",
            "lights danced across the night sky, and everyone who saw them was awed",
        );
        true
    }

    /// A comet streaks across the sky over the point. Everyone alive within the reach sees it and is
    /// awed. Returns false when nobody is in reach.
    pub(super) fn cmd_comet(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_COMET_REACH)
        } else {
            DEFAULT_COMET_REACH
        };
        let mut seen = 0usize;
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if (o.x - x).det_hypot(o.y - y) <= reach {
                o.awe = (o.awe + COMET_AWE).min(1.0);
                seen += 1;
            }
        }
        if seen == 0 {
            return false;
        }
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "omen",
            "world",
            &format!("a comet streaked across the sky over ({:.0}, {:.0})", x, y),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    fn only_these_alive(sim: &mut Simulation, people: &[(f32, f32)]) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
            o.fear_level = 0.0;
            o.awe = 0.0;
        }
        for (k, &(x, y)) in people.iter().enumerate() {
            sim.organisms[k].alive = true;
            sim.organisms[k].x = x;
            sim.organisms[k].y = y;
        }
    }

    #[test]
    fn an_eclipse_frightens_everyone_alive_and_no_one_dead() {
        let mut sim = Simulation::new(8);
        only_these_alive(&mut sim, &[(10.0, 10.0), (250.0, 250.0)]);
        sim.organisms[2].alive = false;
        sim.organisms[2].fear_level = 0.0;
        assert!(sim.apply_command_json(r#"{"cmd":"eclipse"}"#));
        assert!(sim.organisms[0].fear_level > 0.3 && sim.organisms[0].awe > 0.0);
        assert!(sim.organisms[1].fear_level > 0.3, "people far away see it too");
        assert_eq!(sim.organisms[2].fear_level, 0.0, "the dead are not frightened");
    }

    #[test]
    fn a_comet_is_seen_only_within_its_reach() {
        let mut sim = Simulation::new(8);
        only_these_alive(&mut sim, &[(100.0, 100.0), (200.0, 200.0)]);
        assert!(sim.apply_command_json(r#"{"cmd":"comet","x":100.0,"y":100.0,"radius":10.0}"#));
        assert!(sim.organisms[0].awe > 0.0, "the person under the comet is awed");
        assert_eq!(sim.organisms[1].awe, 0.0, "the person far away does not see it");
    }

    #[test]
    fn an_aurora_awes_everyone_alive_and_calms_them_a_little() {
        let mut sim = Simulation::new(8);
        only_these_alive(&mut sim, &[(10.0, 10.0), (250.0, 250.0)]);
        sim.organisms[0].fear_level = 0.5;
        sim.organisms[2].alive = false;
        sim.organisms[2].awe = 0.0;
        assert!(sim.apply_command_json(r#"{"cmd":"aurora"}"#));
        assert!(
            sim.organisms[0].awe > 0.2 && sim.organisms[1].awe > 0.2,
            "the lights are seen across the world"
        );
        assert!(sim.organisms[0].fear_level < 0.5, "they feel a little calmer");
        assert_eq!(sim.organisms[2].awe, 0.0, "the dead see nothing");
    }

    #[test]
    fn an_aurora_over_an_empty_world_changes_nothing() {
        let mut sim = Simulation::new(8);
        only_these_alive(&mut sim, &[]);
        assert!(!sim.apply_command_json(r#"{"cmd":"aurora"}"#));
    }

    #[test]
    fn a_comet_nobody_can_see_changes_nothing() {
        let mut sim = Simulation::new(8);
        only_these_alive(&mut sim, &[(200.0, 200.0)]);
        assert!(!sim.apply_command_json(r#"{"cmd":"comet","x":20.0,"y":20.0}"#));
        assert_eq!(sim.organisms[0].awe, 0.0);
    }
}
