use super::Simulation;
use serde::{Deserialize, Serialize};

pub const WORLD_MODS_VERSION: u32 = 1;
pub const MAX_WORLD_MODS: usize = 12;
pub const MAX_WORLD_MOD_BYTES: usize = 100_000;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldMod {
    pub raw: String,
    #[serde(default)]
    pub enabled: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorldMods {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub mods: Vec<WorldMod>,
}

impl WorldMods {
    pub fn is_empty(&self) -> bool {
        self.mods.is_empty()
    }
}

impl Simulation {
    pub(super) fn cmd_set_world_mods(&mut self, mods: Vec<WorldMod>) -> bool {
        if mods.len() > MAX_WORLD_MODS || mods.iter().any(|m| m.raw.len() > MAX_WORLD_MOD_BYTES) {
            return false;
        }
        self.world_mods = if mods.is_empty() {
            WorldMods::default()
        } else {
            WorldMods {
                version: WORLD_MODS_VERSION,
                mods,
            }
        };
        true
    }
}

#[cfg(test)]
mod tests {
    use super::{WorldMod, MAX_WORLD_MODS, WORLD_MODS_VERSION};
    use crate::sim::simulation::Simulation;
    use serde_json::json;

    fn manifest() -> String {
        json!({
            "version": 1,
            "id": "storm-kit",
            "name": "Storm kit",
            "groups": [],
            "actions": []
        })
        .to_string()
    }

    fn fingerprint(sim: &Simulation) -> u64 {
        sim.to_save_state()
            .to_bytes()
            .iter()
            .fold(0xcbf2_9ce4_8422_2325u64, |h, &b| {
                (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3)
            })
    }

    #[test]
    fn a_world_keeps_its_mods_through_a_save_in_both_formats() {
        let mut sim = Simulation::new(41);
        let set = json!({"cmd": "set_world_mods", "mods": [{"raw": manifest(), "enabled": true}]});
        assert!(sim.apply_command_json(&set.to_string()));
        assert_eq!(sim.world_mods.version, WORLD_MODS_VERSION);
        for state in [
            crate::sim::persistence::SaveState::from_bytes(&sim.to_save_state().to_bytes()).unwrap(),
            serde_json::from_slice(&serde_json::to_vec(&sim.to_save_state()).unwrap()).unwrap(),
        ] {
            let reloaded = Simulation::from_save(41, state);
            assert_eq!(reloaded.world_mods, sim.world_mods);
        }
    }

    #[test]
    fn a_world_without_mods_saves_exactly_as_before_and_old_saves_load_without_them() {
        let mut sim = Simulation::new(42);
        sim.tick_n(30);
        let before = sim.to_save_state().to_bytes();
        assert!(sim.apply_command_json(r#"{"cmd":"set_world_mods","mods":[]}"#));
        assert!(sim.world_mods.is_empty());
        assert_eq!(sim.to_save_state().to_bytes(), before);
        let json = serde_json::to_value(sim.to_save_state()).unwrap();
        assert!(json.get("world_mods").is_none());
        let reloaded = Simulation::from_save(42, serde_json::from_value(json).unwrap());
        assert!(reloaded.world_mods.is_empty());
    }

    #[test]
    fn too_many_or_too_large_mods_are_refused() {
        let mut sim = Simulation::new(43);
        let one = WorldMod {
            raw: manifest(),
            enabled: true,
        };
        let many: Vec<WorldMod> = (0..=MAX_WORLD_MODS).map(|_| one.clone()).collect();
        let cmd = json!({"cmd": "set_world_mods", "mods": many});
        assert!(!sim.apply_command_json(&cmd.to_string()));
        let huge = json!({"cmd": "set_world_mods", "mods": [{"raw": "x".repeat(100_001), "enabled": true}]});
        assert!(!sim.apply_command_json(&huge.to_string()));
        assert!(sim.world_mods.is_empty());
        let nested = json!({"cmd": "composite", "steps": [{"cmd": "set_world_mods", "mods": []}]});
        assert!(!sim.apply_command_json(&nested.to_string()));
    }

    #[test]
    fn a_world_driven_by_a_mod_composite_reloads_to_the_same_fingerprint() {
        let mut sim = Simulation::new(44);
        sim.tick_n(60);
        let set = json!({"cmd": "set_world_mods", "mods": [{"raw": manifest(), "enabled": true}]});
        assert!(sim.apply_command_json(&set.to_string()));
        let (x, y) = sim
            .organisms
            .iter()
            .find(|o| o.alive)
            .map(|o| (o.x, o.y))
            .expect("someone alive");
        let storm = json!({"cmd": "composite", "steps": [
            {"cmd": "weather", "kind": "storm"},
            {"cmd": "bless", "x": x, "y": y, "radius": 6.0},
            {"cmd": "spawn_animal", "x": x, "y": y, "kind": "deer", "count": 3, "radius": 5.0}
        ]});
        assert!(sim.apply_command_json(&storm.to_string()));
        sim.tick_n(40);
        let saved = sim.to_save_state().to_bytes();
        let reload = || {
            Simulation::from_save(
                44,
                crate::sim::persistence::SaveState::from_bytes(&saved).unwrap(),
            )
        };
        let (mut a, mut b) = (reload(), reload());
        assert_eq!(a.world_mods, sim.world_mods);
        assert_eq!(a.tick_count, sim.tick_count);
        assert_eq!(fingerprint(&a), fingerprint(&b));
        a.tick_n(50);
        b.tick_n(50);
        assert_eq!(fingerprint(&a), fingerprint(&b));
    }
}
