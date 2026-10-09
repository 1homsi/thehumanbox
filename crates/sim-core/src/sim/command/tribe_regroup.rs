use super::Simulation;
use crate::math::DetMath;
use crate::sim::world_events::push_event;

/// How far from a click a split takes the people of a tribe, in tiles, unless the radius says otherwise.
const DEFAULT_SPLIT_RADIUS: f32 = 6.0;
const MAX_SPLIT_RADIUS: f32 = 16.0;
/// A split needs at least this many people to found a settlement, and leaves at least this many behind.
const MIN_SPLIT: usize = 2;
const MIN_LEFT_BEHIND: usize = 2;

impl Simulation {
    /// Two tribes become one: the living people nearest the first click and the second click must be
    /// of different tribes, and every living member of the second tribe joins the first. Returns false
    /// when either click finds nobody, or both are of the same tribe.
    pub(super) fn cmd_merge_tribes(&mut self, ax: f32, ay: f32, bx: f32, by: f32) -> bool {
        let (Some(a), Some(b)) = (
            self.nearest_in_reach(ax, ay, 0.0),
            self.nearest_in_reach(bx, by, 0.0),
        ) else {
            return false;
        };
        let winner = self.organisms[a].lineage_id.clone();
        let loser = self.organisms[b].lineage_id.clone();
        if winner.is_empty() || loser.is_empty() || winner == loser {
            return false;
        }
        for o in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == loser)
        {
            o.lineage_id = winner.clone();
        }
        // Neither tribe keeps an attitude toward the other once they are one.
        for o in self.organisms.iter_mut() {
            o.lineage_attitudes.remove(&loser);
            if o.lineage_id == winner {
                o.lineage_attitudes.remove(&winner);
            }
        }
        let winner_name = self
            .lineage_names
            .get(&winner)
            .cloned()
            .unwrap_or_else(|| "a tribe".into());
        let loser_name = self
            .lineage_names
            .get(&loser)
            .cloned()
            .unwrap_or_else(|| "another tribe".into());
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "tribe",
            &winner_name,
            &format!("{loser_name} joined {winner_name}: the two tribes became one"),
        );
        true
    }

    /// Part of a tribe founds a settlement of its own: the living members of the tribe of the person
    /// nearest the click, who are within the radius of it, become a new tribe with a new name. Needs
    /// at least two people to go and two to stay. Returns false otherwise.
    pub(super) fn cmd_split_tribe(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let Some(nearest) = self.nearest_in_reach(x, y, 0.0) else {
            return false;
        };
        let old = self.organisms[nearest].lineage_id.clone();
        if old.is_empty() {
            return false;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_SPLIT_RADIUS)
        } else {
            DEFAULT_SPLIT_RADIUS
        };
        let living: Vec<usize> = (0..self.organisms.len())
            .filter(|&i| self.organisms[i].alive && self.organisms[i].lineage_id == old)
            .collect();
        let movers: Vec<usize> = living
            .iter()
            .copied()
            .filter(|&i| (self.organisms[i].x - x).det_hypot(self.organisms[i].y - y) <= reach)
            .collect();
        if movers.len() < MIN_SPLIT || living.len() - movers.len() < MIN_LEFT_BEHIND {
            return false;
        }
        let new_lid = format!("L{}", crate::sim::agents::spawn::seeded_id(&mut self.rng, 6));
        let name = crate::organism::organism::generate_tribe_name(&mut self.rng);
        self.lineage_names.insert(new_lid.clone(), name.clone());
        for &i in &movers {
            self.organisms[i].lineage_id = new_lid.clone();
        }
        let old_name = self
            .lineage_names
            .get(&old)
            .cloned()
            .unwrap_or_else(|| "a tribe".into());
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "tribe",
            &name,
            &format!(
                "split from {old_name}: {} people founded a new tribe",
                movers.len()
            ),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::organism::organism::Sex;
    use crate::sim::simulation::Simulation;

    /// Only the listed people are alive; each is placed and given a tribe.
    fn people(sim: &mut Simulation, who: &[(f32, f32, &str)]) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        for (k, &(x, y, lid)) in who.iter().enumerate() {
            let o = &mut sim.organisms[k];
            o.alive = true;
            o.x = x;
            o.y = y;
            o.lineage_id = lid.to_string();
            o.sex = Sex::Female;
        }
    }

    fn tribe_of(sim: &Simulation, k: usize) -> String {
        sim.organisms[k].lineage_id.clone()
    }

    #[test]
    fn merging_two_tribes_moves_every_living_member_of_the_second_into_the_first() {
        let mut sim = Simulation::new(21);
        people(
            &mut sim,
            &[
                (10.0, 10.0, "LA"),
                (40.0, 40.0, "LB"),
                (41.0, 40.0, "LB"),
                (90.0, 90.0, "LC"),
            ],
        );
        assert!(sim.apply_command_json(r#"{"cmd":"merge_tribes","ax":10.0,"ay":10.0,"bx":40.0,"by":40.0}"#));
        assert_eq!(tribe_of(&sim, 1), "LA");
        assert_eq!(tribe_of(&sim, 2), "LA");
        assert_eq!(tribe_of(&sim, 3), "LC", "a third tribe is untouched");
    }

    #[test]
    fn merging_needs_two_different_tribes() {
        let mut sim = Simulation::new(21);
        people(&mut sim, &[(10.0, 10.0, "LA"), (11.0, 10.0, "LA")]);
        assert!(!sim.apply_command_json(r#"{"cmd":"merge_tribes","ax":10.0,"ay":10.0,"bx":11.0,"by":10.0}"#));
        assert!(
            !sim.apply_command_json(r#"{"cmd":"merge_tribes","ax":10.0,"ay":10.0,"bx":200.0,"by":200.0}"#)
        );
    }

    #[test]
    fn splitting_founds_a_new_tribe_from_the_group_near_the_click() {
        let mut sim = Simulation::new(22);
        people(
            &mut sim,
            &[
                (80.0, 80.0, "LA"),
                (81.0, 80.0, "LA"),
                (80.0, 81.0, "LA"),
                (120.0, 120.0, "LA"),
                (121.0, 120.0, "LA"),
            ],
        );
        assert!(sim.apply_command_json(r#"{"cmd":"split_tribe","x":80.0,"y":80.0,"radius":3.0}"#));
        let new = tribe_of(&sim, 0);
        assert_ne!(new, "LA", "the group near the click leaves the old tribe");
        assert_eq!(tribe_of(&sim, 1), new);
        assert_eq!(tribe_of(&sim, 2), new);
        assert_eq!(tribe_of(&sim, 3), "LA", "the far people stay behind");
        assert!(sim.lineage_names.contains_key(&new), "the new tribe has a name");
    }

    #[test]
    fn a_split_that_would_leave_no_one_behind_is_refused() {
        let mut sim = Simulation::new(22);
        people(
            &mut sim,
            &[(80.0, 80.0, "LA"), (81.0, 80.0, "LA"), (80.0, 81.0, "LA")],
        );
        assert!(!sim.apply_command_json(r#"{"cmd":"split_tribe","x":80.0,"y":80.0,"radius":3.0}"#));
        assert_eq!(tribe_of(&sim, 0), "LA");
    }
}
