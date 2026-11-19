use super::Simulation;

impl Simulation {
    pub(super) fn cmd_follow(&mut self, id: Option<String>) -> bool {
        let id = id.filter(|id| self.organisms.iter().any(|o| o.alive && &o.id == id));
        if self.followed == id {
            return false;
        }
        self.followed = id;
        self.calm_towns = None;
        true
    }

    pub fn followed(&self) -> Option<&str> {
        self.followed.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    #[test]
    fn following_someone_keeps_their_town_awake_and_letting_go_frees_it() {
        let mut sim = Simulation::new(9);
        let id = sim
            .organisms
            .iter()
            .find(|o| o.alive)
            .map(|o| o.id.clone())
            .unwrap();
        assert!(sim.apply_command_json(&format!(r#"{{"cmd":"follow","id":"{id}"}}"#)));
        assert_eq!(sim.followed(), Some(id.as_str()));
        assert!(!sim.apply_command_json(&format!(r#"{{"cmd":"follow","id":"{id}"}}"#)));
        assert!(sim.apply_command_json(r#"{"cmd":"follow"}"#));
        assert_eq!(sim.followed(), None);
        assert!(!sim.apply_command_json(r#"{"cmd":"follow","id":"nobody"}"#));
    }
}
