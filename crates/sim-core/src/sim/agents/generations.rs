//! Generations. The founders of a tribe are generation 1; a child is one more
//! than its parent (the generation a person is in is stored as 0 for the
//! founders, so the number people see is `generation + 1`). The chronicle
//! marks the first great-grandchild and each fifth generation after.

use crate::sim::simulation::Simulation;

/// The generation a person is shown as: founders are the first.
pub fn shown_generation(stored: u32) -> u32 {
    stored + 1
}

/// The chronicle line for a tribe reaching a shown generation, if it is one of
/// the milestones.
pub fn milestone_line(tribe: &str, shown: u32) -> Option<String> {
    match shown {
        4 => Some(format!("the first great-grandchild of {tribe} is born")),
        n if n >= 5 && n % 5 == 0 => Some(format!("the {} generation of {tribe} is born", ordinal(n))),
        _ => None,
    }
}

fn ordinal(n: u32) -> String {
    let suffix = match (n % 100, n % 10) {
        (11..=13, _) => "th",
        (_, 1) => "st",
        (_, 2) => "nd",
        (_, 3) => "rd",
        _ => "th",
    };
    format!("{n}{suffix}")
}

impl Simulation {
    /// Records each newborn's generation and marks the milestones a tribe
    /// reaches for the first time.
    pub(crate) fn note_generations(&mut self, born: &[(String, u32)]) {
        let tick = self.tick_count;
        for (lineage, stored) in born {
            let shown = shown_generation(*stored);
            let reached = self
                .lineage_generations_reached
                .get(lineage)
                .copied()
                .unwrap_or(0);
            if shown <= reached {
                continue;
            }
            self.lineage_generations_reached.insert(lineage.clone(), shown);
            // Every generation between the old and the new is reached, so a
            // milestone counts when this birth passes it.
            let tribe = self
                .lineage_names
                .get(lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".into());
            for passed in (reached + 1)..=shown {
                if let Some(line) = milestone_line(&tribe, passed) {
                    crate::sim::world_events::push_event(&mut self.events, tick, "generation", &tribe, &line);
                    self.headlines.push_back((
                        tick,
                        format!("\u{1F9EC} {}", line[..1].to_uppercase() + &line[1..]),
                    ));
                    while self.headlines.len() > 80 {
                        self.headlines.pop_front();
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_milestones_are_named_in_order() {
        assert_eq!(shown_generation(0), 1);
        assert_eq!(
            milestone_line("Vuto", 4).unwrap(),
            "the first great-grandchild of Vuto is born"
        );
        assert_eq!(
            milestone_line("Vuto", 5).unwrap(),
            "the 5th generation of Vuto is born"
        );
        assert_eq!(
            milestone_line("Vuto", 20).unwrap(),
            "the 20th generation of Vuto is born"
        );
        assert!(milestone_line("Vuto", 21).is_none());
        assert_eq!(
            milestone_line("Vuto", 10).unwrap(),
            "the 10th generation of Vuto is born"
        );
        assert!(milestone_line("Vuto", 6).is_none());
    }

    #[test]
    fn a_milestone_is_chronicled_once_per_tribe() {
        let mut sim = Simulation::new(11);
        sim.events.clear();
        sim.headlines.clear();
        sim.tick_count = 5000;
        // A birth to shown generation 4 (stored 3) reaches the great-grandchild line.
        sim.note_generations(&[("lin-a".into(), 3)]);
        // Another fourth-generation birth is not new.
        sim.note_generations(&[("lin-a".into(), 3)]);
        // A birth to shown generation 5 (stored 4) reaches the fifth.
        sim.note_generations(&[("lin-a".into(), 4)]);
        let lines: Vec<&str> = sim
            .events
            .iter()
            .filter(|e| e.etype == "generation")
            .map(|e| e.detail.as_str())
            .collect();
        assert_eq!(lines.len(), 2, "{lines:?}");
        assert!(lines[0].contains("great-grandchild"));
        assert!(lines[1].contains("5th generation"));
        assert_eq!(sim.lineage_generations_reached.get("lin-a"), Some(&5));
    }
}
