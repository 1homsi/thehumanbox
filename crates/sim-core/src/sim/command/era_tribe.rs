use super::Simulation;
use crate::sim::civ::progress::eras::{Era, LADDER};
use crate::sim::world_events::push_event;

impl Simulation {
    /// A tribe founded already knowing the discoveries of an age: a family settles where you click, and its
    /// people hold every discovery the ages up to the named one require. False for an unknown age, or when
    /// there is no room for a family.
    pub(super) fn cmd_era_tribe(&mut self, x: f32, y: f32, era: String) -> bool {
        let Some(era) = Era::from_name(&era) else {
            return false;
        };
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let known: Vec<&'static str> = LADDER
            .iter()
            .copied()
            .take_while(|e| *e <= era)
            .flat_map(|e| e.required_discoveries().iter().copied())
            .collect();
        let before = self.organisms.len();
        if !self.cmd_family(x, y) {
            return false;
        }
        let lineage = self.organisms[before].lineage_id.clone();
        for person in self.organisms[before..]
            .iter_mut()
            .filter(|o| o.lineage_id == lineage)
        {
            for d in &known {
                person.discoveries.insert((*d).to_string());
            }
        }
        push_event(
            &mut self.events,
            self.tick_count,
            "life",
            "the world",
            &format!(
                "a tribe of the {} age settles near ({x:.0}, {y:.0}), knowing what that age knew",
                era.name()
            ),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::civ::progress::eras::{Era, LADDER};
    use crate::sim::simulation::Simulation;

    #[test]
    fn a_bronze_age_tribe_knows_what_the_stone_and_bronze_ages_knew() {
        let mut sim = Simulation::new(81);
        let before = sim.organisms.len();
        assert!(sim.apply_command_json(r#"{"cmd":"era_tribe","x":100.0,"y":100.0,"era":"bronze"}"#));
        let known: Vec<&str> = LADDER
            .iter()
            .copied()
            .take_while(|e| *e <= Era::Bronze)
            .flat_map(|e| e.required_discoveries().iter().copied())
            .collect();
        assert!(!known.is_empty());
        let newcomers = &sim.organisms[before..];
        assert!(!newcomers.is_empty(), "a family was founded");
        for person in newcomers
            .iter()
            .filter(|o| o.lineage_id == newcomers[0].lineage_id)
        {
            for d in &known {
                assert!(person.discoveries.contains(*d), "{d} is known");
            }
        }
    }

    #[test]
    fn an_unknown_age_is_refused_and_nobody_is_added() {
        let mut sim = Simulation::new(82);
        let before = sim.organisms.len();
        assert!(!sim.apply_command_json(r#"{"cmd":"era_tribe","x":100.0,"y":100.0,"era":"jurassic"}"#));
        assert_eq!(sim.organisms.len(), before);
    }
}
