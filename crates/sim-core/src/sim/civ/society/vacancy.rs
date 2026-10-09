//! Homes follow the people who live in them. A tribe builds a home only
//! while it is short of room, moves into an empty home before building a
//! new one, and homes nobody lives in fall to ruin and crumble away. Without
//! this every hut ever raised stood forever, and an old world was a carpet
//! of empty villages.

use crate::hashing::{FxHashMap, FxHashSet};
use crate::math::DetMath;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;

/// Days an empty hut stands before it falls in. Sturdier homes last longer
/// in proportion to their service life.
const HUT_NEGLECT_DAYS: f32 = 40.0;
/// Ticks a fallen-in empty home lies as a ruin before it crumbles away.
pub(crate) const CRUMBLE_TICKS: u64 = DAY_LENGTH * 20;
/// Ticks after a repair before a ruin can crumble.
const REPAIR_GRACE_TICKS: u64 = 600;
/// Furthest an empty home may lie from a tribe's centre for it to move in.
const MOVE_IN_RADIUS: i32 = 30;

/// Buildings people live in.
pub(crate) fn is_home(kind: BuildingKind) -> bool {
    use BuildingKind::*;
    matches!(kind, Hut | House | Manor | TownHouse | Apartment | Skyscraper)
}

/// Spare beds a tribe keeps beyond one per person, so newlyweds and
/// newborns have somewhere to sleep before the next home is finished.
fn spare_beds(population: usize) -> usize {
    (population / 4).max(2)
}

struct Tribe {
    population: usize,
    x: f32,
    y: f32,
}

fn living_tribes(sim: &Simulation) -> FxHashMap<&str, Tribe> {
    let mut tribes: FxHashMap<&str, Tribe> = FxHashMap::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        let t = tribes.entry(o.lineage_id.as_str()).or_insert(Tribe {
            population: 0,
            x: 0.0,
            y: 0.0,
        });
        t.population += 1;
        t.x += o.x;
        t.y += o.y;
    }
    for t in tribes.values_mut() {
        t.x /= t.population as f32;
        t.y /= t.population as f32;
    }
    tribes
}

/// Beds in a tribe's standing homes, finished or not.
pub(crate) fn housing_capacity(sim: &Simulation, lineage: &str) -> usize {
    sim.buildings
        .iter()
        .filter(|b| !b.decorative && !b.is_ruined() && is_home(b.kind))
        .filter(|b| b.owner_lineage.as_deref() == Some(lineage))
        .map(|b| usize::from(b.kind.capacity()))
        .sum()
}

/// True while a tribe has fewer beds than people: only then does anyone
/// set out to build another home.
pub(crate) fn short_of_housing(sim: &Simulation, lineage: &str) -> bool {
    let population = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lineage)
        .count();
    housing_capacity(sim, lineage) < population
}

/// Indices of standing homes nobody lives in: every home of a tribe that
/// has died out, and a living tribe's homes beyond what its people fill,
/// the ones farthest from its centre first.
pub(crate) fn empty_homes(sim: &Simulation) -> FxHashSet<usize> {
    let tribes = living_tribes(sim);
    let mut empty = FxHashSet::default();
    let mut by_tribe: FxHashMap<&str, Vec<(f32, usize)>> = FxHashMap::default();
    for (i, b) in sim.buildings.iter().enumerate() {
        if b.decorative || b.is_ruined() || !b.is_complete() || !is_home(b.kind) {
            continue;
        }
        match b.owner_lineage.as_deref().and_then(|l| tribes.get_key_value(l)) {
            Some((&lineage, t)) => {
                let d = (b.x as f32 - t.x).det_hypot(b.y as f32 - t.y);
                by_tribe.entry(lineage).or_default().push((d, i));
            }
            None => {
                empty.insert(i);
            }
        }
    }
    for (lineage, mut homes) in by_tribe {
        let t = &tribes[lineage];
        let wanted = t.population + spare_beds(t.population);
        homes.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
        let mut beds = 0usize;
        for (_, i) in homes {
            if beds >= wanted {
                empty.insert(i);
            } else {
                beds += usize::from(sim.buildings[i].kind.capacity());
            }
        }
    }
    empty
}

/// Hand a tribe the nearest standing building a vanished tribe left within
/// reach that `wanted` accepts. Returns its kind when it took one over.
fn take_over(
    sim: &mut Simulation,
    lineage: &str,
    wanted: impl Fn(BuildingKind) -> bool,
    verb: &str,
) -> Option<BuildingKind> {
    let tribes = living_tribes(sim);
    let t = tribes.get(lineage)?;
    let (cx, cy) = (t.x, t.y);
    let best = sim
        .buildings
        .iter()
        .enumerate()
        .filter(|(_, b)| !b.decorative && b.is_complete() && !b.is_ruined() && wanted(b.kind))
        .filter(|(_, b)| b.owner_lineage.as_deref().is_none_or(|l| !tribes.contains_key(l)))
        .map(|(i, b)| ((b.x as f32 - cx).det_hypot(b.y as f32 - cy), i))
        .filter(|(d, _)| *d <= MOVE_IN_RADIUS as f32)
        .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
    drop(tribes);
    let (_, i) = best?;
    let kind = sim.buildings[i].kind;
    sim.buildings[i].owner_lineage = Some(lineage.to_string());
    sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    let name = sim
        .lineage_names
        .get(lineage)
        .cloned()
        .unwrap_or_else(|| "a tribe".to_string());
    let detail = format!(
        "{verb} empty {} left by those who came before",
        kind.name().replace('_', " ")
    );
    push_event(&mut sim.events, sim.tick_count, "life", &name, &detail);
    Some(kind)
}

/// Move a tribe that needs room into the nearest empty home a vanished
/// tribe left behind. True when it moved.
pub(crate) fn move_into_empty_home(sim: &mut Simulation, lineage: &str) -> bool {
    take_over(sim, lineage, is_home, "moved into an").is_some()
}

/// Before raising a `kind`, a tribe takes over one a vanished tribe left
/// standing nearby: a town hall stands empty only until someone needs one.
pub(crate) fn take_over_empty(sim: &mut Simulation, lineage: &str, kind: BuildingKind) -> bool {
    take_over(sim, lineage, |k| k == kind, "took over the").is_some()
}

/// Buildings whose ruins stay as the world's history instead of crumbling.
fn landmark(kind: BuildingKind) -> bool {
    use BuildingKind::*;
    matches!(
        kind,
        Cathedral
            | Castle
            | Pyramid
            | Ziggurat
            | Coliseum
            | University
            | Observatory
            | Stadium
            | Museum
            | Temple
            | Monument
            | Obelisk
            | Mausoleum
            | GraveStone
    )
}

/// Wells and bridges reshape the land and serve whoever comes by; they are
/// never left to fall in.
fn weathers(kind: BuildingKind) -> bool {
    !matches!(kind, BuildingKind::Well | BuildingKind::Bridge)
}

/// Indices of standing buildings other than homes whose tribe has died out.
pub(crate) fn abandoned_buildings(sim: &Simulation) -> Vec<usize> {
    let living: FxHashSet<&str> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.as_str())
        .collect();
    sim.buildings
        .iter()
        .enumerate()
        .filter(|(_, b)| !b.decorative && b.is_complete() && !b.is_ruined())
        .filter(|(_, b)| !is_home(b.kind) && weathers(b.kind))
        .filter(|(_, b)| b.owner_lineage.as_deref().is_none_or(|l| !living.contains(l)))
        .map(|(i, _)| i)
        .collect()
}

/// Wear on the empty homes of a village that is dying out is multiplied by this,
/// so its homes fall in within about two weeks rather than six.
const DECLINE_WEAR: f32 = 3.0;
/// A tribe has to have reached this many people before losing most of them counts as decline.
const DECLINE_MIN_PEAK: u32 = 8;

/// True when a home's owner has died out (or it has no owner), or a tribe that
/// once reached `DECLINE_MIN_PEAK` now has under a third of its peak.
fn declining_village(sim: &Simulation, people: &FxHashMap<String, u32>, owner: Option<&str>) -> bool {
    let Some(lineage) = owner else {
        return true;
    };
    let now = people.get(lineage).copied().unwrap_or(0);
    if now == 0 {
        return true;
    }
    let peak = sim.lineage_peak_pop.get(lineage).copied().unwrap_or(0);
    peak >= DECLINE_MIN_PEAK && now * 3 <= peak
}

/// Once a day: empty homes weather without anyone to mend them, and the
/// ruins of homes nobody needs crumble away.
pub(crate) fn tick_vacancy(sim: &mut Simulation) {
    let now = sim.tick_count;
    let mut neglected: Vec<usize> = empty_homes(sim).into_iter().collect();
    neglected.extend(abandoned_buildings(sim));
    let mut people: FxHashMap<String, u32> = FxHashMap::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        *people.entry(o.lineage_id.clone()).or_insert(0) += 1;
    }
    // Empty homes of a village that is dying out fall in sooner, so its ruins show.
    let fast: Vec<bool> = neglected
        .iter()
        .map(|&i| {
            let b = &sim.buildings[i];
            is_home(b.kind) && declining_village(sim, &people, b.owner_lineage.as_deref())
        })
        .collect();
    let mut changed = false;
    for (&i, &hurried) in neglected.iter().zip(&fast) {
        let b = &mut sim.buildings[i];
        let life = f32::from(b.kind.service_life_years().max(1));
        let mut wear = 1.0 / (HUT_NEGLECT_DAYS * life / 50.0);
        if hurried {
            wear *= DECLINE_WEAR;
        }
        b.damage = (b.damage_fraction() + wear).min(1.0);
        b.last_damage_tick = Some(now);
        if b.damage >= 1.0 && b.ruined_at_tick.is_none() {
            b.ruined_at_tick = Some(now);
        }
        changed = true;
    }

    let living: FxHashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    // A tribe still short of room may yet rebuild its fallen homes.
    let needs_room: FxHashSet<String> = living_tribes(sim)
        .iter()
        .filter(|(lineage, t)| housing_capacity(sim, lineage) < t.population)
        .map(|(lineage, _)| lineage.to_string())
        .collect();
    let gone: Vec<bool> = sim
        .buildings
        .iter()
        .map(|b| {
            let gone_tribe = b.owner_lineage.as_deref().is_none_or(|l| !living.contains(l));
            (is_home(b.kind) || (gone_tribe && weathers(b.kind) && !landmark(b.kind)))
                && !b.decorative
                && b.ruined_at_tick
                    .is_some_and(|t| now.saturating_sub(t) >= CRUMBLE_TICKS)
                && b.last_repair_tick
                    .is_none_or(|t| now.saturating_sub(t) > REPAIR_GRACE_TICKS)
                && b.owner_lineage.as_deref().is_none_or(|l| !needs_room.contains(l))
        })
        .collect();
    let crumbled = gone.iter().filter(|&&g| g).count();
    let homes = sim
        .buildings
        .iter()
        .zip(&gone)
        .filter(|(b, &g)| g && is_home(b.kind))
        .count();
    if crumbled > 0 {
        let mut i = 0;
        sim.buildings.retain(|_| {
            i += 1;
            !gone[i - 1]
        });
        changed = true;
        let detail = match (crumbled, homes == crumbled) {
            (1, true) => "an empty home crumbled back into the earth".to_string(),
            (1, false) => "an abandoned building crumbled back into the earth".to_string(),
            (n, true) => format!("{n} empty homes crumbled back into the earth"),
            (n, false) => format!("{n} abandoned buildings crumbled back into the earth"),
        };
        push_event(&mut sim.events, now, "life", "the old village", &detail);
    }
    if changed {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::sim::tech::buildings::Building;

    fn person(id: &str, lineage: &str, x: f32, y: f32) -> Organism {
        let mut o = Organism::new(
            id.to_string(),
            id.to_string(),
            x,
            y,
            0,
            String::new(),
            lineage.to_string(),
            20_000,
            Default::default(),
        );
        o.alive = true;
        o.age = 1500;
        o
    }

    fn hut(id: u32, x: i32, y: i32, owner: &str) -> Building {
        let mut b = Building::new(id, BuildingKind::Hut, x, y, Some(owner.to_string()), 0);
        b.condition = 1.0;
        b
    }

    fn world() -> Simulation {
        let mut sim = Simulation::new(77);
        sim.buildings.clear();
        sim.organisms.clear();
        sim
    }

    fn days(sim: &mut Simulation, n: u64) {
        for _ in 0..n {
            sim.tick_count += DAY_LENGTH;
            tick_vacancy(sim);
        }
    }

    #[test]
    fn a_vanished_tribes_homes_fall_in_and_crumble_away() {
        let mut sim = world();
        sim.buildings.push(hut(1, 40, 40, "gone"));
        let mut house = Building::new(2, BuildingKind::House, 44, 40, Some("gone".into()), 0);
        house.condition = 1.0;
        sim.buildings.push(house);

        days(&mut sim, HUT_NEGLECT_DAYS as u64 + 1);
        // The hut has fallen in by now, and may already have crumbled away; the house has not.
        assert!(
            sim.buildings
                .iter()
                .find(|b| b.id == 1)
                .is_none_or(|b| b.is_ruined()),
            "the empty hut still stands"
        );
        assert!(
            sim.buildings
                .iter()
                .find(|b| b.id == 2)
                .is_some_and(|b| !b.is_ruined()),
            "a sturdy house fell as fast as a hut"
        );

        days(&mut sim, CRUMBLE_TICKS / DAY_LENGTH + 1);
        assert!(
            sim.buildings.iter().all(|b| b.id != 1),
            "the ruined hut never crumbled"
        );
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.contains("crumbled back into the earth")));
    }

    #[test]
    fn the_empty_homes_of_a_dying_village_fall_in_sooner() {
        let mut sim = world();
        // Two people left of a village that once had twelve: four beds are wanted, six huts stand.
        sim.lineage_peak_pop.insert("dying".into(), 12);
        sim.lineage_peak_pop.insert("steady".into(), 2);
        for lineage in ["dying", "steady"] {
            for i in 0..2 {
                sim.organisms
                    .push(person(&format!("{lineage}{i}"), lineage, 50.0, 50.0));
            }
        }
        for i in 0..6 {
            sim.buildings.push(hut(1 + i, 40 + 3 * i as i32, 40, "dying"));
            sim.buildings.push(hut(10 + i, 40 + 3 * i as i32, 60, "steady"));
        }
        days(&mut sim, 14);
        let ruined = |owner: &str| {
            sim.buildings
                .iter()
                .filter(|b| b.owner_lineage.as_deref() == Some(owner) && b.is_ruined())
                .count()
        };
        assert!(
            ruined("dying") >= 2,
            "a dying village's empty homes stand two weeks on"
        );
        assert_eq!(
            ruined("steady"),
            0,
            "a village that has not lost its people fell in as fast"
        );
    }

    #[test]
    fn a_shrunken_tribe_keeps_the_homes_nearest_its_people() {
        let mut sim = world();
        for i in 0..4 {
            sim.organisms.push(person(&format!("p{i}"), "clan", 50.0, 50.0));
        }
        for i in 0..10 {
            sim.buildings.push(hut(i + 1, 50 + i as i32 * 3, 50, "clan"));
        }
        let empty = empty_homes(&sim);
        // Four people and two spare beds fill three huts; the seven farthest stand empty.
        assert_eq!(empty.len(), 7);
        assert!(
            (0..3).all(|i| !empty.contains(&i)),
            "a home beside the people was left empty"
        );
        assert!(!short_of_housing(&sim, "clan"));

        days(
            &mut sim,
            HUT_NEGLECT_DAYS as u64 + 1 + CRUMBLE_TICKS / DAY_LENGTH + 1,
        );
        assert_eq!(sim.buildings.len(), 3, "surplus huts never went");
    }

    #[test]
    fn a_tribe_moves_into_a_nearby_empty_home_instead_of_building() {
        let mut sim = world();
        for i in 0..4 {
            sim.organisms.push(person(&format!("p{i}"), "clan", 50.0, 50.0));
        }
        sim.buildings.push(hut(1, 120, 50, "gone"));
        sim.buildings.push(hut(2, 60, 50, "gone"));
        assert!(short_of_housing(&sim, "clan"));
        assert!(move_into_empty_home(&mut sim, "clan"));
        assert_eq!(sim.buildings[1].owner_lineage.as_deref(), Some("clan"));
        assert_eq!(
            sim.buildings[0].owner_lineage.as_deref(),
            Some("gone"),
            "moved into a hut far away"
        );
        assert!(
            !move_into_empty_home(&mut sim, "clan"),
            "claimed a hut out of reach"
        );
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.contains("moved into an empty hut")));
    }

    #[test]
    fn a_tribe_still_short_of_room_keeps_its_ruins_to_rebuild() {
        let mut sim = world();
        for i in 0..4 {
            sim.organisms.push(person(&format!("p{i}"), "clan", 50.0, 50.0));
        }
        let mut ruin = hut(1, 52, 50, "clan");
        ruin.damage = 1.0;
        ruin.ruined_at_tick = Some(0);
        sim.buildings.push(ruin);
        days(&mut sim, CRUMBLE_TICKS / DAY_LENGTH + 2);
        assert_eq!(
            sim.buildings.len(),
            1,
            "a needed home crumbled before it could be rebuilt"
        );
    }

    fn built(id: u32, kind: BuildingKind, x: i32, owner: &str) -> Building {
        let mut b = Building::new(id, kind, x, 40, Some(owner.to_string()), 0);
        b.condition = 1.0;
        b
    }

    #[test]
    fn a_tribe_takes_over_a_vanished_tribes_hall_instead_of_building_one() {
        let mut sim = world();
        for i in 0..6 {
            sim.organisms.push(person(&format!("p{i}"), "clan", 40.0, 40.0));
        }
        sim.buildings.push(built(1, BuildingKind::CityHall, 48, "gone"));
        sim.buildings.push(built(2, BuildingKind::Forge, 46, "gone"));
        assert!(
            !take_over_empty(&mut sim, "clan", BuildingKind::Market),
            "took over a kind nobody left"
        );
        assert!(take_over_empty(&mut sim, "clan", BuildingKind::CityHall));
        assert_eq!(sim.buildings[0].owner_lineage.as_deref(), Some("clan"));
        assert_eq!(sim.buildings[1].owner_lineage.as_deref(), Some("gone"));
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.contains("took over the empty city hall")));
    }

    #[test]
    fn a_vanished_tribes_workshops_crumble_but_its_monuments_and_wells_remain() {
        let mut sim = world();
        sim.buildings
            .push(built(1, BuildingKind::MarketStall, 40, "gone"));
        sim.buildings.push(built(2, BuildingKind::Temple, 50, "gone"));
        sim.buildings.push(built(3, BuildingKind::Well, 60, "gone"));
        for b in &mut sim.buildings {
            // Long neglected already: one more day tips them over.
            b.damage = 0.999;
        }
        days(&mut sim, 1);
        assert!(sim.buildings[0].is_ruined());
        assert!(sim.buildings[1].is_ruined());
        assert!(!sim.buildings[2].is_ruined(), "a well fell in");

        days(&mut sim, CRUMBLE_TICKS / DAY_LENGTH + 1);
        let kinds: Vec<BuildingKind> = sim.buildings.iter().map(|b| b.kind).collect();
        assert!(
            !kinds.contains(&BuildingKind::MarketStall),
            "the stall never crumbled"
        );
        assert!(
            kinds.contains(&BuildingKind::Temple),
            "the temple ruin was erased from history"
        );
        assert!(kinds.contains(&BuildingKind::Well));
        assert!(sim
            .events
            .iter()
            .any(|e| e.detail.contains("abandoned building crumbled")));
    }

    #[test]
    fn a_living_tribes_workshop_is_not_neglected() {
        let mut sim = world();
        sim.organisms.push(person("p0", "clan", 40.0, 40.0));
        sim.buildings.push(built(1, BuildingKind::Forge, 41, "clan"));
        days(&mut sim, 30);
        assert_eq!(sim.buildings[0].damage, 0.0);
    }
}
