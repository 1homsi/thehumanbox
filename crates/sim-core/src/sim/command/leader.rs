use super::Simulation;
use crate::sim::age_stage::AgeStage;

/// How far from the clicked point a person may be and still be the one made leader, in tiles.
const DEFAULT_REACH: f32 = 4.0;
const MAX_REACH: f32 = 16.0;

impl Simulation {
    /// Make the grown person nearest the point (within the radius) the leader of their tribe. The
    /// tribe's government names them as its ruler, so the next election keeps them while they live.
    /// Refuses children, the dead, and tribes whose government has no leader (a plain tribal band).
    /// Returns false when nobody qualifies.
    pub(super) fn cmd_make_leader(&mut self, x: f32, y: f32, radius: f32) -> bool {
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
            .filter(|(_, o)| o.alive && matches!(o.age_stage(), AgeStage::Adult | AgeStage::Elder))
            .map(|(i, o)| (i, (o.x - x).hypot(o.y - y)))
            .filter(|&(_, d)| d <= reach)
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(i, _)| i);
        let Some(i) = nearest else {
            return false;
        };
        let lineage = self.organisms[i].lineage_id.clone();
        let person_id = self.organisms[i].id.clone();
        let Some(government) = self.governments.get_mut(&lineage) else {
            return false;
        };
        if government.kind.leader_count() == 0 {
            return false;
        }
        let previous = government.leader_id.replace(person_id);
        if let Some(previous) = previous {
            if let Some(old) = self.organisms.iter_mut().find(|o| o.id == previous) {
                old.is_leader = false;
            }
        }
        self.organisms[i].is_leader = true;
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::civ::society::government::{Government, GovernmentKind};
    use crate::sim::simulation::Simulation;

    #[test]
    fn make_leader_names_the_nearest_adult_as_their_tribes_ruler() {
        let mut sim = Simulation::new(4);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        let lineage = "L-leader".to_string();
        let tick = sim.tick_count;
        sim.governments.insert(
            lineage.clone(),
            Government::new(lineage.clone(), GovernmentKind::Chiefdom, tick),
        );
        for (k, age) in [(0usize, 9000u32), (1, 9000)] {
            sim.organisms[k].alive = true;
            sim.organisms[k].lineage_id = lineage.clone();
            sim.organisms[k].age = age;
            sim.organisms[k].max_age = 14000;
        }
        sim.organisms[0].x = 80.0;
        sim.organisms[0].y = 80.0;
        sim.organisms[1].x = 150.0;
        sim.organisms[1].y = 150.0;
        let person_id = sim.organisms[0].id.clone();

        assert!(sim.apply_command_json(r#"{"cmd":"make_leader","x":81.0,"y":81.0}"#));
        assert_eq!(
            sim.governments[&lineage].leader_id.as_deref(),
            Some(person_id.as_str())
        );
        assert!(sim.organisms[0].is_leader);
        assert!(!sim.organisms[1].is_leader);
    }

    #[test]
    fn make_leader_refuses_children_and_tribes_without_a_ruler() {
        let mut sim = Simulation::new(4);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        let lineage = "L-band".to_string();
        let tick = sim.tick_count;
        sim.governments.insert(
            lineage.clone(),
            Government::new(lineage.clone(), GovernmentKind::Tribal, tick),
        );
        sim.organisms[0].alive = true;
        sim.organisms[0].lineage_id = lineage.clone();
        sim.organisms[0].age = 9000;
        sim.organisms[0].max_age = 14000;
        sim.organisms[0].x = 80.0;
        sim.organisms[0].y = 80.0;
        assert!(
            !sim.apply_command_json(r#"{"cmd":"make_leader","x":80.0,"y":80.0}"#),
            "a tribal band has no ruler"
        );

        sim.governments.get_mut(&lineage).unwrap().kind = GovernmentKind::Monarchy;
        sim.organisms[0].age = 100;
        assert!(
            !sim.apply_command_json(r#"{"cmd":"make_leader","x":80.0,"y":80.0}"#),
            "a child cannot rule"
        );
        assert!(sim.governments[&lineage].leader_id.is_none());
    }
}
