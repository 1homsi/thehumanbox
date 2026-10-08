use super::Simulation;
use crate::sim::civ::divine::rename::clean_tribe_name;

impl Simulation {
    /// Give the person with this id a name of the player's choosing. It is shown in place of the
    /// generated first name, and it is saved with the world. False when nobody has that id, the name
    /// is unusable, or the person already carries that name.
    pub(super) fn cmd_rename_person(&mut self, id: String, raw: String) -> bool {
        let Some(name) = clean_tribe_name(&raw) else {
            return false;
        };
        let Some(person) = self.organisms.iter_mut().find(|o| o.id == id) else {
            return false;
        };
        if person.custom_name.as_deref() == Some(name.as_str()) {
            return false;
        }
        person.custom_name = Some(name);
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    /// A world with just two living people, so the ids are known.
    fn two_people() -> (Simulation, String, String) {
        let mut sim = Simulation::new(9);
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[1].alive = true;
        let ids = (sim.organisms[0].id.clone(), sim.organisms[1].id.clone());
        (sim, ids.0, ids.1)
    }

    #[test]
    fn rename_gives_one_person_a_custom_name_and_leaves_the_other_alone() {
        let (mut sim, a, b) = two_people();
        let body = format!(r#"{{"cmd":"rename_person","id":"{a}","name":"  Mira  "}}"#);
        assert!(sim.apply_command_json(&body));
        let first = sim.organisms.iter().find(|o| o.id == a).unwrap();
        let second = sim.organisms.iter().find(|o| o.id == b).unwrap();
        assert_eq!(first.custom_name.as_deref(), Some("Mira"));
        assert!(second.custom_name.is_none());
    }

    #[test]
    fn rename_refuses_an_unknown_person_a_blank_name_and_the_same_name_again() {
        let (mut sim, a, _) = two_people();
        assert!(!sim.apply_command_json(r#"{"cmd":"rename_person","id":"nobody","name":"Mira"}"#));
        assert!(!sim.apply_command_json(&format!(r#"{{"cmd":"rename_person","id":"{a}","name":"   "}}"#)));
        assert!(sim.apply_command_json(&format!(r#"{{"cmd":"rename_person","id":"{a}","name":"Mira"}}"#)));
        assert!(!sim.apply_command_json(&format!(r#"{{"cmd":"rename_person","id":"{a}","name":"Mira"}}"#)));
    }

    #[test]
    fn a_custom_name_survives_save_and_load() {
        let (mut sim, a, _) = two_people();
        assert!(sim.apply_command_json(&format!(r#"{{"cmd":"rename_person","id":"{a}","name":"Oren"}}"#)));
        let json = serde_json::to_string(&sim.to_save_state()).expect("save");
        let loaded = Simulation::from_save(9, serde_json::from_str(&json).expect("load"));
        let restored = loaded.organisms.iter().find(|o| o.id == a).unwrap();
        assert_eq!(restored.custom_name.as_deref(), Some("Oren"));
    }
}
