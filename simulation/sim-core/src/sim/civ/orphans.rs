//! Children whose parents are both dead are taken in by the nearest grown
//! person of their tribe, who feeds them and keeps them close. Before this
//! grief was the only thing an orphan got, and orphans starved.

use crate::sim::agents::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// Ticks between checks.
pub(crate) const ORPHAN_STEP: u64 = 120;
/// An orphan hungrier than this is fed.
const HUNGRY: f32 = 0.55;
/// An orphan farther than this from its guardian is called home.
const STRAY: f32 = 7.0;
/// Farthest a guardian may be found, in tiles.
const GUARDIAN_RANGE: f32 = 40.0;

impl Simulation {
    pub(crate) fn tick_orphans(&mut self) {
        let now = self.tick_count;
        let alive_ids: rustc_hash::FxHashSet<&str> = self
            .organisms
            .iter()
            .filter(|o| o.alive)
            .map(|o| o.id.as_str())
            .collect();
        let orphans: Vec<usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .filter(|(_, o)| {
                matches!(
                    AgeStage::from_age(o.age, o.max_age),
                    AgeStage::Infant | AgeStage::Child
                )
            })
            .filter(|(_, o)| !o.parent_id.is_empty() && o.parent_id != "genesis")
            .filter(|(_, o)| {
                !alive_ids.contains(o.parent_id.as_str())
                    && o.father_id.as_deref().is_none_or(|f| !alive_ids.contains(f))
            })
            .map(|(i, _)| i)
            .collect();
        drop(alive_ids);
        if orphans.is_empty() {
            return;
        }
        let guardians: Vec<usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && AgeStage::from_age(o.age, o.max_age) == AgeStage::Adult)
            .map(|(i, _)| i)
            .collect();
        for oi in orphans {
            let (ox, oy, lineage) = {
                let o = &self.organisms[oi];
                (o.x, o.y, o.lineage_id.clone())
            };
            let guardian = guardians
                .iter()
                .copied()
                .filter(|&g| self.organisms[g].lineage_id == lineage)
                .map(|g| (g, (self.organisms[g].x - ox).hypot(self.organisms[g].y - oy)))
                .filter(|&(_, d)| d <= GUARDIAN_RANGE)
                .min_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(&b.0)));
            let Some((g, dist)) = guardian else {
                continue;
            };
            if dist > STRAY {
                let (gx, gy) = (self.organisms[g].x as i32, self.organisms[g].y as i32);
                self.organisms[oi].begin_journey((gx, gy), "following the one who took me in", now);
            }
            if self.organisms[oi].energy < HUNGRY && self.organisms[g].inv_food > 0 && dist <= STRAY + 2.0 {
                self.organisms[g].inv_food -= 1;
                let kid = &mut self.organisms[oi];
                kid.energy = (kid.energy + 0.3).min(1.0);
                kid.comfort = (kid.comfort + 0.05).min(1.0);
                self.organisms[g].think("feeding an orphan", now);
            }
            if self.orphans_cared.insert(self.organisms[oi].id.clone()) {
                let name = self
                    .lineage_names
                    .get(&lineage)
                    .cloned()
                    .unwrap_or_else(|| "a tribe".to_string());
                let who = self.organisms[g].name.clone();
                let kid = self.organisms[oi].name.clone();
                push_event(
                    &mut self.events,
                    now,
                    "life",
                    &name,
                    &format!("{who} took in {kid}, who had lost both parents"),
                );
            }
        }
        // Forget orphans who have grown up or died.
        let still: rustc_hash::FxHashSet<&str> = self
            .organisms
            .iter()
            .filter(|o| {
                o.alive
                    && matches!(
                        AgeStage::from_age(o.age, o.max_age),
                        AgeStage::Infant | AgeStage::Child
                    )
            })
            .map(|o| o.id.as_str())
            .collect();
        self.orphans_cared.retain(|id| still.contains(id.as_str()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;

    fn person(id: &str, lineage: &str, age: u32, x: f32) -> Organism {
        let mut o = Organism::new(
            id.into(),
            id.into(),
            x,
            50.0,
            1,
            String::new(),
            lineage.into(),
            20_000,
            Default::default(),
        );
        o.alive = true;
        o.age = age;
        o.energy = 0.9;
        o
    }

    fn world() -> Simulation {
        let mut sim = Simulation::new(95);
        sim.organisms.clear();
        sim.events.clear();
        sim
    }

    #[test]
    fn an_orphan_is_taken_in_and_fed_by_the_nearest_adult() {
        let mut sim = world();
        let mut kid = person("kid", "clan", 1_500, 50.0);
        kid.parent_id = "dead-mother".into();
        kid.father_id = Some("dead-father".into());
        kid.energy = 0.2;
        sim.organisms.push(kid);
        let mut near = person("near", "clan", 9_000, 54.0);
        near.inv_food = 3;
        sim.organisms.push(near);
        sim.organisms.push(person("far", "clan", 9_000, 90.0));
        sim.organisms.push(person("stranger", "other", 9_000, 51.0));
        sim.tick_orphans();
        assert!(sim.organisms[0].energy > 0.4, "the orphan was never fed");
        assert_eq!(sim.organisms[1].inv_food, 2, "the guardian did not share");
        assert_eq!(sim.organisms[3].inv_food, 0, "a stranger fed the orphan");
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail == "near took in kid, who had lost both parents"));
        // Told once, not every check.
        sim.tick_orphans();
        assert_eq!(
            sim.events.iter().filter(|e| e.detail.contains("took in")).count(),
            1
        );
    }

    #[test]
    fn a_child_with_a_living_parent_is_nobodys_orphan() {
        let mut sim = world();
        let mut kid = person("kid", "clan", 1_500, 50.0);
        kid.parent_id = "mum".into();
        kid.father_id = Some("dead-father".into());
        kid.energy = 0.2;
        sim.organisms.push(kid);
        sim.organisms.push(person("mum", "clan", 9_000, 90.0));
        sim.organisms.push(person("near", "clan", 9_000, 53.0));
        sim.tick_orphans();
        assert!(sim.events.is_empty());
        assert_eq!(sim.organisms[0].energy, 0.2);
    }
}
