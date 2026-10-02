//! The gods can teach a tribe the next secret it lacks for its next age. The
//! card already says what a tribe still has to learn; this lets the player
//! act on it, at the price of waiting: a tribe cannot be taught again for
//! a season, so the gods cannot simply hand it the ages.

use crate::sim::civ::prayers::PrayerKind;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// Ticks before the same tribe can be taught again.
pub const TEACH_COOLDOWN: u64 = 3_000;

impl Simulation {
    /// The next discovery a tribe lacks for its next age, if any.
    pub(crate) fn next_missing_discovery(&self, lineage: &str) -> Option<&'static str> {
        let era = self.lineage_eras.get(lineage)?;
        let next = era.advance()?;
        next.required_discoveries().iter().copied().find(|d| {
            !self
                .organisms
                .iter()
                .any(|o| o.alive && o.lineage_id == lineage && o.discoveries.contains(*d))
        })
    }

    /// Teach every living member of a tribe its next missing secret. False
    /// when the tribe lacks nothing, was taught within the season, or has
    /// no one alive.
    pub(crate) fn teach_tribe(&mut self, lineage: &str) -> bool {
        let now = self.tick_count;
        if self
            .teach_cooldown
            .get(lineage)
            .is_some_and(|&t| now.saturating_sub(t) < TEACH_COOLDOWN)
        {
            return false;
        }
        let Some(secret) = self.next_missing_discovery(lineage) else {
            return false;
        };
        let mut people = 0usize;
        let (mut sx, mut sy) = (0.0f32, 0.0f32);
        for o in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == lineage)
        {
            o.discover(secret);
            o.think("the gods taught us a secret", now);
            people += 1;
            sx += o.x;
            sy += o.y;
        }
        if people == 0 {
            return false;
        }
        self.teach_cooldown.insert(lineage.to_string(), now);
        let name = self
            .lineage_names
            .get(lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        push_event(
            &mut self.events,
            now,
            "answered",
            &name,
            &format!(
                "were taught the secret of {} by the gods",
                secret.replace(['-', '_'], " ")
            ),
        );
        // A tribe that was praying for knowledge has been heard.
        self.answer_prayers(
            &[PrayerKind::Knowledge],
            Some((sx / people as f32, sy / people as f32)),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lineage_of(sim: &Simulation) -> String {
        sim.organisms.iter().find(|o| o.alive).unwrap().lineage_id.clone()
    }

    #[test]
    fn teaching_gives_the_whole_tribe_its_next_missing_secret_once_a_season() {
        let mut sim = Simulation::new(99);
        let lineage = lineage_of(&sim);
        sim.lineage_eras
            .insert(lineage.clone(), crate::sim::civ::eras::Era::PreStone);
        let secret = sim
            .next_missing_discovery(&lineage)
            .expect("a new tribe lacks something");
        assert!(sim.apply_command_json(&format!(r#"{{"cmd":"teach","lineage":"{lineage}"}}"#)));
        for o in sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
        {
            assert!(
                o.discoveries.contains(secret),
                "{} never learned {secret}",
                o.name
            );
        }
        assert_ne!(sim.next_missing_discovery(&lineage), Some(secret));
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.starts_with("were taught the secret of") && e.etype == "answered"));
        // Not again within the season.
        assert!(!sim.teach_tribe(&lineage));
        sim.tick_count += TEACH_COOLDOWN;
        assert!(sim.teach_tribe(&lineage));
    }

    #[test]
    fn unknown_tribes_cannot_be_taught() {
        let mut sim = Simulation::new(100);
        assert!(!sim.teach_tribe("no-such-tribe"));
    }
}
