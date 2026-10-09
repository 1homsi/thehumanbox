//! Livestock. A tribe that has tamed animals fences a pasture (a pen) beside its
//! houses. The wild sheep, cows, goats and chickens that wander near the village are
//! taken into the pens, graze on the ground round them and breed there. Each head
//! gives food to the tribe every village pass (milk and meat from a cow, wool and
//! meat from a sheep or goat, eggs and meat from a hen), into the granaries when the
//! tribe has one, and otherwise into the hands of people who have no food.
//!
//! A kept animal carries `Animal::keeper` and `Animal::pen`, which save with the world.
//! A pen that is lost turns its animals wild again. The pass draws no random numbers:
//! captures walk animals and pens in index order, and breeding runs on a fixed pace.

use crate::organism::animal::{Animal, AnimalKind};
use crate::sim::civ::land::village_fields::Tribe;
use crate::sim::civ::land::village_stores;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;

/// Head a pen takes in from the wild.
pub(crate) const PEN_CAP: usize = 6;
/// Head a pen holds once its herd breeds.
pub(crate) const BREED_CAP: usize = 9;
/// Wild animals a tribe takes into its pens in one village pass.
const CAPTURE_PER_PASS: usize = 2;
/// How far from a house or a pen a wild animal may roam and still be taken in, in tiles.
/// Herders range this far; a captured animal is driven into its pen.
const CAPTURE_REACH: i32 = 16;
/// Measures of food for the people with none, per head, when no granary takes it.
const HUNGRY_CAP: u8 = 3;

/// Food a kept head gives each village pass, in measures.
pub(crate) fn food_per_head(kind: AnimalKind) -> u32 {
    match kind {
        AnimalKind::Cow => 2,
        AnimalKind::Sheep | AnimalKind::Goat | AnimalKind::Chicken => 1,
        _ => 0,
    }
}

/// The animals a village can keep.
pub(crate) fn is_livestock(kind: AnimalKind) -> bool {
    matches!(
        kind,
        AnimalKind::Sheep | AnimalKind::Cow | AnimalKind::Goat | AnimalKind::Chicken
    )
}

/// How many pens a tribe fences: one, and one more for each four houses, at most three.
pub(crate) fn pens_wanted(dwellings: usize) -> usize {
    (1 + dwellings / 4).min(3)
}

/// The operational pens a tribe owns, as tiles, in building order.
pub(crate) fn pens_of(sim: &Simulation, lineage: &str) -> Vec<(i32, i32)> {
    sim.buildings
        .iter()
        .filter(|b| {
            b.kind == BuildingKind::Pen && b.is_operational() && b.owner_lineage.as_deref() == Some(lineage)
        })
        .map(|b| (b.x, b.y))
        .collect()
}

/// Livestock a tribe keeps, alive.
pub(crate) fn head_of(sim: &Simulation, lineage: &str) -> usize {
    sim.animals
        .iter()
        .filter(|a| a.alive && a.keeper.as_deref() == Some(lineage))
        .count()
}

/// Keeps the herd for one tribe: fences its pens, turns loose animals whose pen is gone,
/// takes wild animals into the pens, lets the herds breed and brings in their food.
pub(crate) fn tick_livestock(sim: &mut Simulation, tribe: &Tribe) {
    let domesticated = tribe
        .members
        .iter()
        .any(|&i| sim.organisms[i].discoveries.contains("animal_domestication"));
    if !domesticated {
        return;
    }
    let now = sim.tick_count;
    release_orphans(sim, &tribe.lineage);
    // A new pen is fenced only where wild livestock roams near the houses, and only once
    // the pens it has are full: a pen with no animals to keep would be empty ground.
    let pens = pens_of(sim, &tribe.lineage);
    let room = pens.iter().all(|&p| kept_at(sim, p) >= PEN_CAP);
    if pens.len() < pens_wanted(tribe.dwellings.len()) && room && wild_livestock_near(sim, &tribe.dwellings) {
        village_stores::place(sim, tribe, BuildingKind::Pen);
    }
    capture(sim, tribe);
    breed(sim, tribe, now);
    yield_food(sim, tribe);
}

/// Animals whose pen is no longer standing turn wild.
fn release_orphans(sim: &mut Simulation, lineage: &str) {
    let pens = pens_of(sim, lineage);
    for a in sim.animals.iter_mut() {
        if a.keeper.as_deref() != Some(lineage) {
            continue;
        }
        let standing = a.pen.is_some_and(|p| pens.contains(&p));
        if !standing {
            a.keeper = None;
            a.pen = None;
        }
    }
}

fn reach(a: &Animal, pen: (i32, i32)) -> i32 {
    (a.x as i32 - pen.0).abs().max((a.y as i32 - pen.1).abs())
}

/// Animals a pen keeps.
fn kept_at(sim: &Simulation, pen: (i32, i32)) -> usize {
    sim.animals
        .iter()
        .filter(|a| a.alive && a.pen == Some(pen))
        .count()
}

/// True when a wild livestock animal roams within reach of one of the houses.
fn wild_livestock_near(sim: &Simulation, dwellings: &[(i32, i32)]) -> bool {
    sim.animals.iter().any(|a| {
        a.alive
            && !a.away
            && a.bonded_org.is_none()
            && a.keeper.is_none()
            && is_livestock(a.kind)
            && dwellings.iter().any(|&h| reach(a, h) <= CAPTURE_REACH)
    })
}

/// Whether a wild animal is in herding range of a pen: within `CAPTURE_REACH` of the pen or of
/// one of the houses. Pens are fenced where wild livestock roams near the houses (see
/// `wild_livestock_near`), and a pen sits a few tiles off its houses, so the houses set the
/// range too: an animal that was in reach at placement is still taken in.
fn in_herding_range(a: &Animal, pen: (i32, i32), dwellings: &[(i32, i32)]) -> bool {
    reach(a, pen) <= CAPTURE_REACH || dwellings.iter().any(|&h| reach(a, h) <= CAPTURE_REACH)
}

/// Takes the nearest wild livestock into pens with room, a couple of animals per pass.
fn capture(sim: &mut Simulation, tribe: &Tribe) {
    let mut taken = 0usize;
    let mut first_ever = false;
    for pen in pens_of(sim, &tribe.lineage) {
        while taken < CAPTURE_PER_PASS {
            let kept_here = sim
                .animals
                .iter()
                .filter(|a| a.alive && a.pen == Some(pen))
                .count();
            if kept_here >= PEN_CAP {
                break;
            }
            let found = sim
                .animals
                .iter()
                .enumerate()
                .filter(|(_, a)| {
                    a.alive
                        && !a.away
                        && a.bonded_org.is_none()
                        && a.keeper.is_none()
                        && is_livestock(a.kind)
                        && in_herding_range(a, pen, &tribe.dwellings)
                })
                .min_by_key(|(i, a)| (reach(a, pen), *i))
                .map(|(i, _)| i);
            let Some(i) = found else {
                break;
            };
            if head_of(sim, &tribe.lineage) == 0 {
                first_ever = true;
            }
            // The herders drive it into the pen.
            let a = &mut sim.animals[i];
            a.keeper = Some(tribe.lineage.clone());
            a.pen = Some(pen);
            a.x = pen.0 as f32;
            a.y = pen.1 as f32;
            taken += 1;
        }
        if taken >= CAPTURE_PER_PASS {
            break;
        }
    }
    if first_ever {
        let name = sim
            .lineage_names
            .get(&tribe.lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        let tick = sim.tick_count;
        crate::sim::world_events::push_event(
            &mut sim.events,
            tick,
            "life",
            &name,
            "took its first wild animals into the pen",
        );
    }
}

/// A pen whose herd has two or more head breeds one young animal of its first kind per
/// pass, up to `BREED_CAP` head.
fn breed(sim: &mut Simulation, tribe: &Tribe, now: u64) {
    for pen in pens_of(sim, &tribe.lineage) {
        let kept: Vec<AnimalKind> = sim
            .animals
            .iter()
            .filter(|a| a.alive && a.pen == Some(pen) && a.keeper.as_deref() == Some(tribe.lineage.as_str()))
            .map(|a| a.kind)
            .collect();
        if kept.len() < 2 || kept.len() >= BREED_CAP {
            continue;
        }
        let id = sim.next_animal_id;
        sim.next_animal_id += 1;
        let mut young = Animal::new(id, pen.0 as f32, pen.1 as f32, kept[0]);
        young.born_tick = now;
        young.keeper = Some(tribe.lineage.clone());
        young.pen = Some(pen);
        sim.animals.push(young);
    }
}

/// The herd's food for the pass goes to the granaries (the first with room). What does
/// not fit goes to people with no food of their own, up to a few measures each.
fn yield_food(sim: &mut Simulation, tribe: &Tribe) {
    let head: u32 = sim
        .animals
        .iter()
        .filter(|a| a.alive && a.keeper.as_deref() == Some(tribe.lineage.as_str()))
        .map(|a| food_per_head(a.kind))
        .sum();
    if head == 0 {
        return;
    }
    // A barn's fodder and tools raise the herd's yield by half.
    let total = if village_stores::owns(sim, &tribe.lineage, BuildingKind::Barn) {
        head + head / 2
    } else {
        head
    };
    let mut left = village_stores::deposit(sim, &tribe.lineage, total);
    for &idx in &tribe.members {
        if left == 0 {
            break;
        }
        let person = &mut sim.organisms[idx];
        while left > 0 && person.inv_food < HUNGRY_CAP {
            person.inv_food = person.inv_food.saturating_add(1);
            left -= 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::land::village_fields::Tribe;
    use crate::sim::tech::buildings::Building;
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Tile;

    /// A tribe that has tamed animals, with a house and open grass round it, and a wild
    /// sheep and cow a few steps away.
    fn herding_tribe(seed: u64) -> (Simulation, Tribe) {
        let mut sim = Simulation::new(seed);
        let lineage = sim.organisms[0].lineage_id.clone();
        for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == lineage) {
            o.discoveries.insert("animal_domestication".to_string());
        }
        let (hx, hy) = (120, 120);
        for dy in -10..=10 {
            for dx in -10..=10 {
                sim.grid.set(hx + dx, hy + dy, Tile::Grass);
                sim.grid.fertility[WorldGrid::idx(hx + dx, hy + dy)] = 0.8;
            }
        }
        sim.farms.clear();
        sim.buildings.clear();
        sim.animals.clear();
        let mut house = Building::new(900, BuildingKind::Hut, hx, hy, Some(lineage.clone()), 0);
        house.condition = 1.0;
        sim.buildings.push(house);
        sim.animals
            .push(Animal::new(1, (hx + 3) as f32, hy as f32, AnimalKind::Sheep));
        sim.animals
            .push(Animal::new(2, (hx - 4) as f32, (hy + 2) as f32, AnimalKind::Cow));
        let members: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.lineage_id == lineage)
            .map(|(i, _)| i)
            .collect();
        let tribe = Tribe {
            lineage,
            members,
            dwellings: vec![(hx, hy)],
        };
        (sim, tribe)
    }

    #[test]
    fn a_tribe_fences_a_pen_and_takes_in_the_wild_animals_near_it() {
        let (mut sim, tribe) = herding_tribe(5_101);
        tick_livestock(&mut sim, &tribe);
        assert_eq!(pens_of(&sim, &tribe.lineage).len(), 1, "one pen for one house");
        assert!(
            sim.animals[0].is_kept() && sim.animals[1].is_kept(),
            "the sheep and the cow are kept"
        );
        assert!(head_of(&sim, &tribe.lineage) >= 2);
    }

    #[test]
    fn an_animal_in_reach_of_the_houses_is_taken_into_a_pen_near_them() {
        // Pens are fenced where wild livestock roams within reach of the houses, and a pen sits a
        // few tiles off them: the herd must reach an animal that is far from the pen but near the
        // houses (16 tiles from the house at (120, 120), 20 from the pen at (100, 120)).
        let (mut sim, tribe) = herding_tribe(5_108);
        sim.animals.clear();
        sim.animals.push(Animal::new(7, 136.0, 120.0, AnimalKind::Sheep));
        let mut pen = Building::new(702, BuildingKind::Pen, 100, 120, Some(tribe.lineage.clone()), 0);
        pen.condition = 1.0;
        sim.buildings.push(pen);
        capture(&mut sim, &tribe);
        assert!(sim.animals[0].is_kept(), "the sheep near the houses is herded in");
        assert_eq!(sim.animals[0].pen, Some((100, 120)));
    }

    #[test]
    fn a_tribe_without_the_discovery_keeps_nothing() {
        let (mut sim, tribe) = herding_tribe(5_102);
        for o in sim.organisms.iter_mut() {
            o.discoveries.remove("animal_domestication");
        }
        tick_livestock(&mut sim, &tribe);
        assert!(pens_of(&sim, &tribe.lineage).is_empty());
        assert_eq!(head_of(&sim, &tribe.lineage), 0);
    }

    #[test]
    fn a_kept_animal_grazes_but_stays_on_its_pasture() {
        let (mut sim, tribe) = herding_tribe(5_103);
        tick_livestock(&mut sim, &tribe);
        let pen = pens_of(&sim, &tribe.lineage)[0];
        let mut rng = rand::rng();
        for _ in 0..5_000 {
            for a in sim.animals.iter_mut() {
                a.graze(&sim.grid, &mut rng);
            }
        }
        for a in &sim.animals {
            let d = (a.x as i32 - pen.0).abs().max((a.y as i32 - pen.1).abs());
            assert!(
                d <= crate::organism::animal::PASTURE_REACH,
                "the animal stays on the pasture"
            );
        }
    }

    #[test]
    fn a_lost_pen_turns_its_animals_wild_again() {
        let (mut sim, tribe) = herding_tribe(5_104);
        tick_livestock(&mut sim, &tribe);
        sim.buildings.retain(|b| b.kind != BuildingKind::Pen);
        release_orphans(&mut sim, &tribe.lineage);
        assert_eq!(
            head_of(&sim, &tribe.lineage),
            0,
            "the herd is wild again once its pen is gone"
        );
    }

    #[test]
    fn a_herd_feeds_the_hungry_when_there_is_no_granary() {
        let (mut sim, tribe) = herding_tribe(5_105);
        tick_livestock(&mut sim, &tribe);
        for &i in &tribe.members {
            sim.organisms[i].inv_food = 0;
        }
        tick_livestock(&mut sim, &tribe);
        let fed: u32 = tribe
            .members
            .iter()
            .map(|&i| sim.organisms[i].inv_food as u32)
            .sum();
        assert!(fed >= 3, "a sheep and a cow give food to the people with none");
    }

    #[test]
    fn a_barn_raises_the_herds_yield_by_half() {
        let (mut sim, tribe) = herding_tribe(5_107);
        for a in sim.animals.iter_mut().take(2) {
            a.keeper = Some(tribe.lineage.clone());
            a.pen = Some((120, 120));
        }
        let mut granary = Building::new(
            700,
            BuildingKind::Granary,
            130,
            130,
            Some(tribe.lineage.clone()),
            0,
        );
        granary.condition = 1.0;
        sim.buildings.push(granary);
        yield_food(&mut sim, &tribe);
        assert_eq!(
            village_stores::stock_of(&sim, &tribe.lineage),
            3,
            "a sheep and a cow give three measures"
        );
        let mut barn = Building::new(701, BuildingKind::Barn, 132, 130, Some(tribe.lineage.clone()), 0);
        barn.condition = 1.0;
        sim.buildings.push(barn);
        yield_food(&mut sim, &tribe);
        assert_eq!(
            village_stores::stock_of(&sim, &tribe.lineage),
            3 + 4,
            "a barn gives half as much again"
        );
    }

    #[test]
    fn a_herd_with_room_breeds_its_kind() {
        let (mut sim, tribe) = herding_tribe(5_106);
        tick_livestock(&mut sim, &tribe);
        sim.tick_count = 600;
        tick_livestock(&mut sim, &tribe);
        assert!(head_of(&sim, &tribe.lineage) > 2, "two head breed a young one");
        assert!(sim.animals.iter().any(|a| a.is_kept() && a.born_tick > 0));
    }

    #[test]
    fn cows_give_most_and_only_livestock_is_kept() {
        assert!(food_per_head(AnimalKind::Cow) > food_per_head(AnimalKind::Sheep));
        assert_eq!(food_per_head(AnimalKind::Deer), 0);
        assert!(is_livestock(AnimalKind::Chicken));
        assert!(!is_livestock(AnimalKind::Wolf));
    }

    #[test]
    fn a_tribe_fences_more_pens_as_it_grows() {
        assert_eq!(pens_wanted(0), 1);
        assert_eq!(pens_wanted(4), 2);
        assert_eq!(pens_wanted(40), 3);
    }
}
