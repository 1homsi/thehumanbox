use super::Simulation;
use crate::math::DetMath;

/// How far from a clicked point a person may be and still be the one married, in tiles.
const REACH: f32 = 4.0;

impl Simulation {
    /// Marry two people chosen by the player: the grown person nearest each point becomes the other's
    /// partner. Both must be adults without a partner, and of different sexes. Returns false when either
    /// point has nobody eligible in reach, or when the two points pick the same person.
    pub(super) fn cmd_marry(&mut self, ax: f32, ay: f32, bx: f32, by: f32) -> bool {
        if !(ax.is_finite() && ay.is_finite() && bx.is_finite() && by.is_finite()) {
            return false;
        }
        let Some(a) = self.nearest_eligible(ax, ay, None) else {
            return false;
        };
        let Some(b) = self.nearest_eligible(bx, by, Some(a)) else {
            return false;
        };
        if self.organisms[a].sex == self.organisms[b].sex {
            return false;
        }
        let (id_a, id_b) = (self.organisms[a].id.clone(), self.organisms[b].id.clone());
        self.organisms[a].partner_id = Some(id_b);
        self.organisms[b].partner_id = Some(id_a);
        // Ready for children now rather than after the usual wait, as with the love blessing.
        self.organisms[a].last_reproduced = 0;
        self.organisms[b].last_reproduced = 0;
        true
    }

    /// The index of the living, grown, unpartnered person nearest the point, within reach.
    fn nearest_eligible(&self, x: f32, y: f32, exclude: Option<usize>) -> Option<usize> {
        self.organisms
            .iter()
            .enumerate()
            .filter(|(i, o)| Some(*i) != exclude && o.alive && o.age >= 700 && o.partner_id.is_none())
            .map(|(i, o)| (i, (o.x - x).det_hypot(o.y - y)))
            .filter(|&(_, d)| d <= REACH)
            .min_by(|a, b| a.1.total_cmp(&b.1))
            .map(|(i, _)| i)
    }
}

#[cfg(test)]
mod tests {
    use crate::organism::organism::Sex;
    use crate::sim::simulation::Simulation;

    /// Two adults, one of each sex, side by side, and nobody else alive.
    fn two_adults(sex_b: Sex) -> Simulation {
        let mut sim = Simulation::new(9);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = 60.0;
        sim.organisms[0].y = 60.0;
        sim.organisms[0].age = 900;
        sim.organisms[0].sex = Sex::Female;
        sim.organisms[1].alive = true;
        sim.organisms[1].x = 62.0;
        sim.organisms[1].y = 60.0;
        sim.organisms[1].age = 900;
        sim.organisms[1].sex = sex_b;
        sim
    }

    #[test]
    fn marry_pairs_the_two_people_nearest_the_points() {
        let mut sim = two_adults(Sex::Male);
        let id0 = sim.organisms[0].id.clone();
        let id1 = sim.organisms[1].id.clone();
        assert!(sim.apply_command_json(r#"{"cmd":"marry","ax":60.0,"ay":60.0,"bx":62.0,"by":60.0}"#));
        assert_eq!(sim.organisms[0].partner_id.as_deref(), Some(id1.as_str()));
        assert_eq!(sim.organisms[1].partner_id.as_deref(), Some(id0.as_str()));
    }

    #[test]
    fn marry_refuses_two_people_of_the_same_sex() {
        let mut sim = two_adults(Sex::Female);
        assert!(!sim.apply_command_json(r#"{"cmd":"marry","ax":60.0,"ay":60.0,"bx":62.0,"by":60.0}"#));
        assert!(sim.organisms[0].partner_id.is_none());
        assert!(sim.organisms[1].partner_id.is_none());
    }

    #[test]
    fn marry_skips_children_and_people_already_partnered() {
        let mut sim = two_adults(Sex::Male);
        sim.organisms[1].age = 10;
        assert!(!sim.apply_command_json(r#"{"cmd":"marry","ax":60.0,"ay":60.0,"bx":62.0,"by":60.0}"#));
        sim.organisms[1].age = 900;
        sim.organisms[1].partner_id = Some("someone-else".to_string());
        assert!(!sim.apply_command_json(r#"{"cmd":"marry","ax":60.0,"ay":60.0,"bx":62.0,"by":60.0}"#));
    }

    #[test]
    fn marry_needs_a_second_person_in_reach_of_the_second_point() {
        let mut sim = two_adults(Sex::Male);
        sim.organisms[1].x = 200.0;
        assert!(!sim.apply_command_json(r#"{"cmd":"marry","ax":60.0,"ay":60.0,"bx":60.5,"by":60.0}"#));
        assert!(sim.organisms[0].partner_id.is_none());
    }
}
