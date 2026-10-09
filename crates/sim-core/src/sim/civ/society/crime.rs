//! Crime and justice. In a tribe whose wealth is uneven (see `inequality.rs`),
//! an adult from the poorest quarter sometimes steals from the richest member.
//! Some thefts are seen, and the tribe's government answers each one: a tribe
//! with no state gets the goods back and the thief is shamed, a monarchy, empire
//! or theocracy fines the thief into its treasury and flogs them, and a
//! republic, democracy, federation or corporation tries the thief and keeps the
//! fine. A thief may kill the victim to get away; a killer who is seen is
//! executed by a state, and in a tribe the goods are taken back. Every theft and
//! killing is written into the chronicle and counted on the tribe card.

use super::government::GovernmentKind;
use super::inequality::lineage_inequality;
use crate::organism::organism::Harm;
use crate::sim::agents::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use rand::RngExt;
use serde::{Deserialize, Serialize};

/// Fewest living people in a tribe for crime to count (as for unrest).
const MIN_PEOPLE_FOR_CRIME: usize = 8;
/// How much more than the poorest quarter a person must hold to be robbed.
const ROBBABLE_GAP: u32 = 3;
/// Gap at which a tribe starts to see thefts, and the gap at which it sees the most.
/// Wealth starts even (everyone holds the same), so a small gap already counts.
const THEFT_FROM_GINI: f32 = 0.08;
const THEFT_FULL_GINI: f32 = 0.3;
/// Chance per day that a tribe with the widest gap has a theft.
const THEFT_PER_DAY: f32 = 0.15;
/// Chance that a theft ends with the victim killed.
const MURDER_SHARE: f32 = 0.05;
/// Chronicle headlines kept at most (as for unrest).
const MAX_HEADLINES: usize = 80;

/// What a tribe's crime has come to, kept for the tribe card.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CrimeTally {
    /// Thefts, seen or not.
    pub thefts: u32,
    /// Victims killed by a thief.
    pub murders: u32,
    /// Thefts that were seen and answered by the tribe's government.
    pub punished: u32,
}

/// How a seen theft is answered, by the kind of government.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Verdict {
    /// Nobody saw it.
    Unseen,
    /// No state: the goods go back to the victim and the thief is shamed.
    Returned,
    /// Monarchy, empire or theocracy: the thief pays the fine into the treasury and is flogged.
    Fined,
    /// Republic, democracy, federation or corporation: a trial, the fine goes to the treasury.
    Tried,
}

/// The outcome of one theft, rolled before it is settled.
#[derive(Clone, Copy, Debug)]
struct Roll {
    caught: bool,
    murder: bool,
}

/// Chance that a theft is seen, by the kind of government (no government counts as tribal).
fn caught_chance(kind: GovernmentKind) -> f32 {
    match kind {
        GovernmentKind::Tribal | GovernmentKind::Chiefdom => 0.4,
        GovernmentKind::Monarchy | GovernmentKind::Empire | GovernmentKind::Theocracy => 0.6,
        GovernmentKind::Republic
        | GovernmentKind::Democracy
        | GovernmentKind::Federation
        | GovernmentKind::Corporate => 0.8,
    }
}

fn verdict_for(kind: GovernmentKind, caught: bool) -> Verdict {
    if !caught {
        return Verdict::Unseen;
    }
    match kind {
        GovernmentKind::Tribal | GovernmentKind::Chiefdom => Verdict::Returned,
        GovernmentKind::Monarchy | GovernmentKind::Empire | GovernmentKind::Theocracy => Verdict::Fined,
        GovernmentKind::Republic
        | GovernmentKind::Democracy
        | GovernmentKind::Federation
        | GovernmentKind::Corporate => Verdict::Tried,
    }
}

/// Once a day: in each tribe whose wealth is uneven, a theft may happen. Tribes are visited
/// in id order and the random draws happen only for tribes that are uneven enough, so the
/// same seed gives the same crimes on every run.
pub(crate) fn tick_crime(sim: &mut Simulation, tick: u64) {
    let mut tribes: Vec<(String, f32)> = lineage_inequality(&sim.organisms)
        .into_iter()
        .filter(|(_, _, people)| *people >= MIN_PEOPLE_FOR_CRIME)
        .map(|(lid, gini, _)| (lid, gini))
        .collect();
    tribes.sort_by(|a, b| a.0.cmp(&b.0));
    for (lid, gini) in tribes {
        let uneven = ((gini - THEFT_FROM_GINI) / (THEFT_FULL_GINI - THEFT_FROM_GINI)).clamp(0.0, 1.0);
        if uneven <= 0.0 || sim.rng.random::<f32>() >= THEFT_PER_DAY * uneven {
            continue;
        }
        let members: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lid)
            .map(|(i, _)| i)
            .collect();
        // The poorest quarter (the line at the 25th percentile) may steal. The richest member
        // is the one robbed; on a tie, the one met first.
        let mut wealth: Vec<u32> = members.iter().map(|&i| sim.organisms[i].wealth).collect();
        wealth.sort_unstable();
        let poor_line = wealth[wealth.len() / 4];
        let Some(victim) = members.iter().copied().max_by(|&a, &b| {
            sim.organisms[a]
                .wealth
                .cmp(&sim.organisms[b].wealth)
                .then(b.cmp(&a))
        }) else {
            continue;
        };
        if sim.organisms[victim].wealth < poor_line + ROBBABLE_GAP {
            continue;
        }
        let thieves: Vec<usize> = members
            .iter()
            .copied()
            .filter(|&i| {
                let o = &sim.organisms[i];
                o.wealth <= poor_line && AgeStage::from_age(o.age, o.max_age) == AgeStage::Adult
            })
            .collect();
        if thieves.is_empty() {
            continue;
        }
        let thief = thieves[sim.rng.random_range(0..thieves.len())];
        let kind = sim
            .governments
            .get(&lid)
            .map(|g| g.kind)
            .unwrap_or(GovernmentKind::Tribal);
        let roll = Roll {
            caught: sim.rng.random::<f32>() < caught_chance(kind),
            murder: sim.rng.random::<f32>() < MURDER_SHARE,
        };
        settle_theft(sim, &lid, thief, victim, roll, tick);
    }
}

/// Moves the goods, applies the verdict and writes the theft into the chronicle. A killing
/// takes the victim's life first. A killer who is seen is executed by a state; in a tribe
/// the goods are taken back from them instead.
fn settle_theft(sim: &mut Simulation, lid: &str, thief: usize, victim: usize, roll: Roll, tick: u64) {
    let kind = sim
        .governments
        .get(lid)
        .map(|g| g.kind)
        .unwrap_or(GovernmentKind::Tribal);
    let stolen = (sim.organisms[victim].wealth / 4)
        .max(1)
        .min(sim.organisms[victim].wealth);
    sim.organisms[victim].wealth -= stolen;
    sim.organisms[thief].wealth += stolen;

    let tribe = sim
        .lineage_names
        .get(lid)
        .cloned()
        .unwrap_or_else(|| "a tribe".into());
    let thief_name = sim.organisms[thief].name.clone();
    let victim_name = sim.organisms[victim].name.clone();

    let verdict = verdict_for(kind, roll.caught);
    let mut executed = false;
    let verdict_text = match verdict {
        Verdict::Unseen => "nobody saw it".to_string(),
        Verdict::Returned => {
            // The goods go back to the victim, or to their kin when the victim is dead.
            sim.organisms[thief].wealth = sim.organisms[thief].wealth.saturating_sub(stolen);
            sim.organisms[victim].wealth = sim.organisms[victim].wealth.saturating_add(stolen);
            sim.organisms[thief].comfort = (sim.organisms[thief].comfort - 0.1).max(0.0);
            "caught, the goods went back and the thief was shamed".to_string()
        }
        Verdict::Fined | Verdict::Tried => {
            sim.organisms[thief].wealth = sim.organisms[thief].wealth.saturating_sub(stolen);
            if let Some(government) = sim.governments.get_mut(lid) {
                government.treasury += u64::from(stolen);
            }
            if roll.murder {
                executed = true;
                if verdict == Verdict::Tried {
                    "caught and tried, executed for the killing".to_string()
                } else {
                    "caught, executed for the killing".to_string()
                }
            } else if verdict == Verdict::Fined {
                sim.organisms[thief].health = (sim.organisms[thief].health - 0.2).max(0.05);
                format!("caught, fined {stolen} into the treasury and flogged")
            } else {
                format!("caught and tried, the fine of {stolen} went to the treasury")
            }
        }
    };

    let detail = format!("stole {stolen} from {victim_name} of {tribe}; {verdict_text}");
    push_event(&mut sim.events, tick, "theft", &thief_name, &detail);
    sim.organisms[thief].log_life(tick, "crime", detail.clone());
    sim.organisms[victim].log_life(tick, "crime", format!("robbed by {thief_name}"));
    {
        let tally = sim.lineage_crime.entry(lid.to_string()).or_default();
        tally.thefts += 1;
        if verdict != Verdict::Unseen {
            tally.punished += 1;
        }
    }
    let mut headlines: Vec<String> = Vec::new();
    if verdict != Verdict::Unseen {
        headlines.push(format!(
            "\u{2696}\u{FE0F} {thief_name} of {tribe} was caught stealing from {victim_name}: {verdict_text}."
        ));
    }

    if roll.murder {
        // The victim dies of the wound here; the mortality phase writes the death.
        sim.organisms[victim].health = 0.0;
        sim.organisms[victim].mark_harm(Harm::Murder, tick);
        sim.lineage_crime.entry(lid.to_string()).or_default().murders += 1;
        let text = format!("{thief_name} killed {victim_name} of {tribe} to get away with the goods");
        push_event(&mut sim.events, tick, "murder", &thief_name, &text);
        headlines.push(format!("\u{1F5E1}\u{FE0F} {text}."));
    }
    if executed {
        // The state's sentence: the killer dies of the execution, not of a wound.
        sim.organisms[thief].health = 0.0;
        sim.organisms[thief].mark_harm(Harm::Execution, tick);
    }

    for line in headlines {
        sim.headlines.push_back((tick, line));
    }
    while sim.headlines.len() > MAX_HEADLINES {
        sim.headlines.pop_front();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;
    use crate::sim::civ::government::Government;

    fn person(id: &str, lid: &str, wealth: u32) -> Organism {
        let mut o = Organism::new(
            id.into(),
            id.into(),
            0.0,
            0.0,
            0,
            String::new(),
            lid.into(),
            9000,
            Traits::default(),
        );
        o.alive = true;
        o.age = 2000;
        o.max_age = 4000;
        o.health = 1.0;
        o.comfort = 0.5;
        o.wealth = wealth;
        o
    }

    fn tribe(sim: &mut Simulation, lid: &str, kind: GovernmentKind) {
        sim.organisms.clear();
        sim.events.clear();
        sim.headlines.clear();
        sim.organisms.push(person("rich", lid, 40));
        for i in 0..7 {
            sim.organisms.push(person(&format!("poor{i}"), lid, 0));
        }
        sim.governments
            .insert(lid.into(), Government::new(lid.into(), kind, 0));
    }

    fn total(sim: &Simulation, lid: &str) -> u64 {
        sim.organisms
            .iter()
            .filter(|o| o.lineage_id == lid)
            .map(|o| u64::from(o.wealth))
            .sum()
    }

    #[test]
    fn a_tribe_with_uneven_wealth_has_thefts_from_its_richest_member() {
        let mut sim = Simulation::new(4);
        tribe(&mut sim, "stark", GovernmentKind::Tribal);
        let mut day = 0u64;
        while !sim.events.iter().any(|e| e.etype == "theft") && day < 400 {
            day += 1;
            tick_crime(&mut sim, day * crate::sim::cosmos::DAY_LENGTH);
        }
        assert!(
            sim.events.iter().any(|e| e.etype == "theft"),
            "a theft happens within 400 days"
        );
        assert!(sim.lineage_crime["stark"].thefts >= 1);
    }

    #[test]
    fn an_even_tribe_has_no_thefts() {
        let mut sim = Simulation::new(4);
        sim.organisms.clear();
        for i in 0..9 {
            sim.organisms.push(person(&format!("p{i}"), "even", 5));
        }
        for day in 1..=200u64 {
            tick_crime(&mut sim, day * crate::sim::cosmos::DAY_LENGTH);
        }
        assert!(!sim.events.iter().any(|e| e.etype == "theft"));
    }

    #[test]
    fn goods_are_kept_by_the_thief_when_unseen_and_conserved_always() {
        let mut sim = Simulation::new(4);
        tribe(&mut sim, "clan", GovernmentKind::Monarchy);
        let before = total(&sim, "clan") + sim.governments["clan"].treasury;
        settle_theft(
            &mut sim,
            "clan",
            1,
            0,
            Roll {
                caught: false,
                murder: false,
            },
            100,
        );
        assert_eq!(sim.organisms[0].wealth, 30);
        assert_eq!(sim.organisms[1].wealth, 10);
        assert_eq!(total(&sim, "clan") + sim.governments["clan"].treasury, before);
        assert_eq!(sim.lineage_crime["clan"].punished, 0);
    }

    #[test]
    fn a_tribe_with_no_state_gets_the_goods_back() {
        let mut sim = Simulation::new(4);
        tribe(&mut sim, "band", GovernmentKind::Tribal);
        settle_theft(
            &mut sim,
            "band",
            1,
            0,
            Roll {
                caught: true,
                murder: false,
            },
            100,
        );
        assert_eq!(sim.organisms[0].wealth, 40, "the victim has the goods back");
        assert_eq!(sim.organisms[1].wealth, 0, "the thief keeps nothing");
        assert!(sim.organisms[1].comfort < 0.5, "the thief is shamed");
        assert_eq!(sim.lineage_crime["band"].punished, 1);
    }

    #[test]
    fn a_monarchy_fines_the_thief_into_its_treasury() {
        let mut sim = Simulation::new(4);
        tribe(&mut sim, "realm", GovernmentKind::Monarchy);
        let before_health = sim.organisms[1].health;
        settle_theft(
            &mut sim,
            "realm",
            1,
            0,
            Roll {
                caught: true,
                murder: false,
            },
            100,
        );
        assert_eq!(sim.organisms[0].wealth, 30);
        assert_eq!(sim.organisms[1].wealth, 0);
        assert_eq!(sim.governments["realm"].treasury, 10);
        assert!(sim.organisms[1].health < before_health, "the thief is flogged");
        assert!(sim.organisms[1].health >= 0.05, "the flogging is never fatal");
    }

    #[test]
    fn a_thief_who_is_unseen_can_kill_the_victim() {
        let mut sim = Simulation::new(4);
        tribe(&mut sim, "fierce", GovernmentKind::Tribal);
        settle_theft(
            &mut sim,
            "fierce",
            1,
            0,
            Roll {
                caught: false,
                murder: true,
            },
            100,
        );
        assert_eq!(sim.organisms[0].health, 0.0);
        assert_eq!(sim.organisms[0].fatal_harm(100), Some(Harm::Murder));
        assert_eq!(sim.lineage_crime["fierce"].murders, 1);
        assert!(sim.events.iter().any(|e| e.etype == "murder"));
        assert_eq!(sim.organisms[1].health, 1.0, "the killer is not hurt when unseen");
    }

    #[test]
    fn a_killer_caught_by_a_state_is_executed() {
        let mut sim = Simulation::new(4);
        tribe(&mut sim, "throne", GovernmentKind::Empire);
        settle_theft(
            &mut sim,
            "throne",
            1,
            0,
            Roll {
                caught: true,
                murder: true,
            },
            100,
        );
        assert_eq!(sim.organisms[0].health, 0.0);
        assert_eq!(sim.organisms[1].health, 0.0);
        assert_eq!(sim.organisms[1].fatal_harm(100), Some(Harm::Execution));
    }

    #[test]
    fn the_same_seed_gives_the_same_crimes() {
        let run = || {
            let mut sim = Simulation::new(9);
            tribe(&mut sim, "same", GovernmentKind::Republic);
            for day in 1..=300u64 {
                tick_crime(&mut sim, day * crate::sim::cosmos::DAY_LENGTH);
            }
            sim.events
                .iter()
                .map(|e| format!("{}{}{}", e.tick, e.actor, e.detail))
                .collect::<Vec<_>>()
        };
        assert_eq!(run(), run());
    }
}
