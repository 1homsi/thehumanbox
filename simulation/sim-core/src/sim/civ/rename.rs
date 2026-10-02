//! The player names a tribe. A name they chose is theirs: every list, label
//! and headline already reads `lineage_names`, so one write renames the
//! tribe everywhere, and the save carries it.

use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// Longest tribe name, in characters.
pub const MAX_TRIBE_NAME: usize = 24;

/// A name fit to show: trimmed, one line, printable, at most 24 characters.
/// None when nothing usable is left.
pub fn clean_tribe_name(raw: &str) -> Option<String> {
    let collapsed: String = raw
        .chars()
        .filter(|c| !c.is_control())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let name: String = collapsed.chars().take(MAX_TRIBE_NAME).collect();
    let name = name.trim().to_string();
    (!name.is_empty()).then_some(name)
}

impl Simulation {
    /// Rename a living tribe. False when the name is unusable, the tribe
    /// has no one alive, or it already carries that name.
    pub(crate) fn rename_tribe(&mut self, lineage: &str, raw: &str) -> bool {
        let Some(name) = clean_tribe_name(raw) else {
            return false;
        };
        if !self.organisms.iter().any(|o| o.alive && o.lineage_id == lineage) {
            return false;
        }
        let old = self.lineage_names.get(lineage).cloned();
        if old.as_deref() == Some(name.as_str()) {
            return false;
        }
        self.lineage_names.insert(lineage.to_string(), name.clone());
        let was = old.unwrap_or_else(|| "a tribe".to_string());
        push_event(
            &mut self.events,
            self.tick_count,
            "milestone",
            &name,
            &format!("will be known as {name}, who were the {was}"),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_cleaned_for_display() {
        assert_eq!(clean_tribe_name("  Ashfolk  ").as_deref(), Some("Ashfolk"));
        assert_eq!(clean_tribe_name("Sun\n  Riders\t").as_deref(), Some("Sun Riders"));
        assert_eq!(clean_tribe_name("   \n ").as_deref(), None);
        assert_eq!(
            clean_tribe_name(&"x".repeat(80)).map(|n| n.chars().count()),
            Some(MAX_TRIBE_NAME)
        );
        assert_eq!(clean_tribe_name("a\u{0}b").as_deref(), Some("ab"));
    }

    #[test]
    fn the_player_renames_a_living_tribe_and_it_sticks_across_a_save() {
        let mut sim = Simulation::new(97);
        let lineage = sim.organisms.iter().find(|o| o.alive).unwrap().lineage_id.clone();
        let old = sim.lineage_names.get(&lineage).cloned().unwrap();
        let json = format!(r#"{{"cmd":"rename_tribe","lineage":"{lineage}","name":"The Dawn Walkers"}}"#);
        assert!(sim.apply_command_json(&json));
        assert_eq!(sim.lineage_names[&lineage], "The Dawn Walkers");
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail == format!("will be known as The Dawn Walkers, who were the {old}")));
        assert!(
            !sim.apply_command_json(&json),
            "renaming to the same name changed nothing"
        );
        let state = serde_json::from_str(&serde_json::to_string(&sim.to_save_state()).unwrap()).unwrap();
        let restored = Simulation::from_save(97, state);
        assert_eq!(restored.lineage_names[&lineage], "The Dawn Walkers");
    }

    #[test]
    fn a_dead_or_unknown_tribe_cannot_be_renamed() {
        let mut sim = Simulation::new(98);
        assert!(!sim.rename_tribe("no-such-tribe", "Ghosts"));
        let lineage = sim.organisms.iter().find(|o| o.alive).unwrap().lineage_id.clone();
        assert!(!sim.rename_tribe(&lineage, "   "));
    }
}
