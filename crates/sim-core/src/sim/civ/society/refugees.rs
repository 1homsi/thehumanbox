//! The last few of a tribe that can no longer raise children do not wait
//! alone to die out: they seek refuge with the nearest tribe that does not
//! hate them, and live out their lives among it. A god who wants the old
//! tribe to go on has to send it newcomers first.

use crate::hashing::FxHashMap;
use crate::math::DetMath;
use crate::organism::organism::Sex;
use crate::sim::agents::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// Ticks between checks.
pub(crate) const REFUGE_STEP: u64 = 600;
/// A tribe this small, and unable to have children, seeks refuge.
const REMNANT: usize = 3;
/// A host must be at least this large to take others in.
const HOST_MIN: usize = 6;
/// Farthest a remnant will travel to its hosts, in tiles.
const REFUGE_RANGE: f32 = 60.0;
/// The remnant must not feel worse than this about its hosts.
const MIN_GOODWILL: f32 = -0.2;

#[derive(Default)]
struct Tribe {
    members: Vec<usize>,
    x: f32,
    y: f32,
    women: usize,
    men: usize,
}

impl Simulation {
    pub(crate) fn tick_refugees(&mut self) {
        let mut tribes: FxHashMap<String, Tribe> = FxHashMap::default();
        for (i, o) in self.organisms.iter().enumerate().filter(|(_, o)| o.alive) {
            let t = tribes.entry(o.lineage_id.clone()).or_default();
            t.members.push(i);
            t.x += o.x;
            t.y += o.y;
            if AgeStage::from_age(o.age, o.max_age).can_reproduce() {
                match o.sex {
                    Sex::Female => t.women += 1,
                    Sex::Male => t.men += 1,
                }
            }
        }
        for t in tribes.values_mut() {
            t.x /= t.members.len() as f32;
            t.y /= t.members.len() as f32;
        }
        let mut remnants: Vec<&String> = tribes
            .iter()
            .filter(|(_, t)| t.members.len() <= REMNANT && (t.women == 0 || t.men == 0))
            .map(|(l, _)| l)
            .collect();
        remnants.sort();

        let mut moves: Vec<(String, String)> = Vec::new();
        for lineage in remnants {
            let remnant = &tribes[lineage];
            let goodwill = |host: &str| {
                remnant
                    .members
                    .iter()
                    .map(|&i| self.organisms[i].attitude_toward(host))
                    .sum::<f32>()
                    / remnant.members.len() as f32
            };
            let host = tribes
                .iter()
                .filter(|(l, t)| *l != lineage && t.members.len() >= HOST_MIN)
                .map(|(l, t)| (l, (t.x - remnant.x).det_hypot(t.y - remnant.y)))
                .filter(|&(l, d)| d <= REFUGE_RANGE && goodwill(l) >= MIN_GOODWILL)
                .min_by(|a, b| a.1.total_cmp(&b.1).then(a.0.cmp(b.0)));
            if let Some((host, _)) = host {
                moves.push((lineage.clone(), host.clone()));
            }
        }

        let now = self.tick_count;
        for (lineage, host) in moves {
            let (hx, hy) = (tribes[&host].x as i32, tribes[&host].y as i32);
            let members = tribes[&lineage].members.clone();
            for &i in &members {
                let o = &mut self.organisms[i];
                o.lineage_id = host.clone();
                o.home_x = hx as f32;
                o.home_y = hy as f32;
                o.begin_journey((hx, hy), "seeking refuge", now);
            }
            // They were taken in, not wiped out: no dynasty-death notice.
            self.lineage_peak_pop.swap_remove(&lineage);
            self.tribe_peril.swap_remove(&lineage);
            let from = self
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| "a tribe".to_string());
            let to = self
                .lineage_names
                .get(&host)
                .cloned()
                .unwrap_or_else(|| "their neighbours".to_string());
            let who = if members.len() == 1 {
                format!("The last of the {from} was")
            } else {
                format!("The last {} of the {from} were", members.len())
            };
            push_event(
                &mut self.events,
                now,
                "milestone",
                &from,
                &format!("found refuge among the {to}"),
            );
            self.headlines
                .push_back((now, format!("\u{1F3D5}\u{FE0F} {who} taken in by the {to}.")));
        }
        while self.headlines.len() > 80 {
            self.headlines.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;

    fn person(id: &str, lineage: &str, x: f32, sex: Sex) -> Organism {
        let mut o = Organism::new(
            id.into(),
            id.into(),
            x,
            50.0,
            0,
            String::new(),
            lineage.into(),
            20_000,
            Default::default(),
        );
        o.alive = true;
        o.age = 9_000;
        o.sex = sex;
        o
    }

    fn world() -> Simulation {
        let mut sim = Simulation::new(61);
        sim.organisms.clear();
        sim.events.clear();
        sim.headlines.clear();
        sim.lineage_names.insert("last".into(), "Ashfolk".into());
        sim.lineage_names.insert("host".into(), "Lupif".into());
        for i in 0..8 {
            let sex = if i % 2 == 0 { Sex::Female } else { Sex::Male };
            sim.organisms.push(person(&format!("h{i}"), "host", 80.0, sex));
        }
        sim
    }

    #[test]
    fn the_last_of_a_tribe_find_refuge_with_a_friendly_neighbour() {
        let mut sim = world();
        sim.organisms.push(person("a", "last", 60.0, Sex::Male));
        sim.organisms.push(person("b", "last", 61.0, Sex::Male));
        sim.lineage_peak_pop.insert("last".into(), 20);
        sim.tick_refugees();
        assert!(sim.organisms.iter().all(|o| o.lineage_id == "host"));
        assert!(
            !sim.lineage_peak_pop.contains_key("last"),
            "they would be mourned as dead"
        );
        assert!(sim
            .events
            .iter()
            .any(|e| e.actor == "Ashfolk" && e.detail == "found refuge among the Lupif"));
        assert!(sim
            .headlines
            .iter()
            .any(|(_, h)| h.contains("The last 2 of the Ashfolk were taken in by the Lupif")));
    }

    #[test]
    fn a_remnant_that_can_still_have_children_stays_its_own() {
        let mut sim = world();
        sim.organisms.push(person("a", "last", 60.0, Sex::Male));
        sim.organisms.push(person("b", "last", 61.0, Sex::Female));
        sim.tick_refugees();
        assert_eq!(sim.organisms.iter().filter(|o| o.lineage_id == "last").count(), 2);
    }

    #[test]
    fn enemies_are_no_refuge() {
        let mut sim = world();
        for id in ["a", "b"] {
            let mut o = person(id, "last", 60.0, Sex::Male);
            o.lineage_attitudes.insert("host".into(), -0.8);
            sim.organisms.push(o);
        }
        sim.tick_refugees();
        assert_eq!(sim.organisms.iter().filter(|o| o.lineage_id == "last").count(), 2);
    }
}
