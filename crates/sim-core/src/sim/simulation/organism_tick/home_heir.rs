//! The family home passes on. When someone dies the house they lived in is
//! not lost: it goes to their eldest living child, or, with no child alive,
//! to the partner who survives them. The new owner's biography records it.

use super::*;

impl Simulation {
    /// Hands the dead person's home to their heir (see module docs). Called
    /// once when a person dies.
    pub(super) fn pass_family_home(&mut self, dead: usize) {
        let dead_id = self.organisms[dead].id.clone();
        let dead_name = self.organisms[dead].name.clone();
        let (home_x, home_y) = (self.organisms[dead].home_x, self.organisms[dead].home_y);
        if home_x == 0.0 && home_y == 0.0 {
            return;
        }
        // The eldest living child is the heir.
        let mut heir: Option<(usize, u32)> = None;
        for (i, o) in self.organisms.iter().enumerate() {
            if i == dead || !o.alive {
                continue;
            }
            let is_child = o.parent_id == dead_id || o.father_id.as_deref() == Some(dead_id.as_str());
            if !is_child {
                continue;
            }
            if heir.is_none_or(|(_, age)| o.age > age) {
                heir = Some((i, o.age));
            }
        }
        // With no child alive, the surviving partner keeps the house.
        let heir = heir.map(|(i, _)| i).or_else(|| {
            let pid = self.organisms[dead].partner_id.clone()?;
            self.organisms.iter().position(|o| o.alive && o.id == pid)
        });
        let Some(h) = heir else { return };
        let heir_name = self.organisms[h].name.clone();
        self.organisms[h].home_x = home_x;
        self.organisms[h].home_y = home_y;
        let tick = self.tick_count;
        self.organisms[h].log_life_rel(
            tick,
            "inheritance",
            format!("inherited the family home from {dead_name}"),
            Some(dead_id),
            Some(dead_name.clone()),
        );
        push_event(
            &mut self.events,
            tick,
            "inheritance",
            &heir_name,
            &format!("{heir_name} inherited the family home from {dead_name}"),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;

    fn person(id: &str, age: u32, home: (f32, f32)) -> Organism {
        let mut o = Organism::new(
            id.into(),
            id.into(),
            0.0,
            0.0,
            0,
            String::new(),
            "lin".into(),
            9000,
            Traits::default(),
        );
        o.alive = true;
        o.age = age;
        o.home_x = home.0;
        o.home_y = home.1;
        o
    }

    #[test]
    fn the_eldest_living_child_inherits_the_home() {
        let mut sim = Simulation::new(8);
        sim.organisms.clear();
        sim.organisms.push(person("parent", 5000, (30.0, 40.0)));
        let mut young = person("young", 1500, (0.0, 0.0));
        young.parent_id = "parent".into();
        let mut eldest = person("eldest", 4000, (0.0, 0.0));
        eldest.parent_id = "parent".into();
        let mut stranger = person("stranger", 9000, (0.0, 0.0));
        stranger.parent_id = "someone-else".into();
        sim.organisms.push(young);
        sim.organisms.push(eldest);
        sim.organisms.push(stranger);
        sim.organisms[0].alive = false;
        sim.pass_family_home(0);
        assert_eq!((sim.organisms[2].home_x, sim.organisms[2].home_y), (30.0, 40.0));
        assert_eq!((sim.organisms[1].home_x, sim.organisms[1].home_y), (0.0, 0.0));
        assert_eq!((sim.organisms[3].home_x, sim.organisms[3].home_y), (0.0, 0.0));
        let line = sim.organisms[2]
            .life_log
            .iter()
            .any(|e| e.text.contains("inherited the family home from parent"));
        assert!(line, "the heir's biography records it");
    }

    #[test]
    fn with_no_child_the_surviving_partner_keeps_the_house() {
        let mut sim = Simulation::new(8);
        sim.organisms.clear();
        let mut dead = person("dead", 5000, (12.0, 9.0));
        dead.partner_id = Some("widow".into());
        sim.organisms.push(dead);
        sim.organisms.push(person("widow", 4800, (0.0, 0.0)));
        sim.organisms[0].alive = false;
        sim.pass_family_home(0);
        assert_eq!((sim.organisms[1].home_x, sim.organisms[1].home_y), (12.0, 9.0));
    }
}
