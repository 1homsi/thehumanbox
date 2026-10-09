//! Settled tribes farm. A tribe that knows agriculture and lives in houses sows
//! a field on open grass a few steps from its dwellings, two plots at most per
//! pass, and brings each field in once it ripens. Before this a farming
//! discovery sat with a handful of people, and a field was a rare accident of
//! one person's choice: no seed run in a whole world of forty tribes.
//!
//! The pass draws no random numbers and walks tribes and tiles in a fixed
//! order, so the same seed still gives the same world.

use crate::hashing::{FxHashMap, FxHashSet};
use crate::sim::actions::agriculture::farm_ops::{crop_for_plot, harvest_crop, plant_crop};
use crate::sim::civ::land::village_livestock;
use crate::sim::civ::land::village_stores;
use crate::sim::config::SEASON_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;
use crate::world::grid::{HEIGHT, ROAD_NONE, WIDTH};
use crate::world::tiles::Tile;

/// Ticks between village farming passes.
pub(crate) const SOW_STEP: u64 = 600;
/// The season a village sows in: spring (the world calls it "recovery").
const SOWING_SEASON: &str = "recovery";
/// Ticks after the autumn season starts when a village field is ripe.
const AUTUMN_LEAD: u64 = 300;

/// The first autumn (the world's "decline" season) after `now`: a field sown in
/// spring is timed to ripen then, so the year reads sow, grow, harvest.
pub(crate) fn next_autumn(now: u64) -> u64 {
    let year = SEASON_LENGTH * 4;
    let mut start = now - now % year + SEASON_LENGTH;
    if start <= now {
        start += year;
    }
    start
}
/// Closest and furthest a new field may lie from a dwelling, in tiles.
const SOW_MIN_REACH: i32 = 2;
const SOW_MAX_REACH: i32 = 6;
/// Fields a tribe may open per pass.
const SOW_PER_PASS: usize = 2;
/// Fields per dwelling a tribe may hold. Ground is cheap, so a village with
/// houses keeps a few plots for its people.
const PLOTS_PER_DWELLING: usize = 2;
/// Soil below this is left alone (the same bar the farming actions use).
const SOW_MIN_FERTILITY: f32 = 0.30;

/// Living members of each tribe, in index order, and the tribe's operational
/// dwellings sorted by position.
pub(crate) struct Tribe {
    pub(crate) lineage: String,
    pub(crate) members: Vec<usize>,
    pub(crate) dwellings: Vec<(i32, i32)>,
}

fn tribes_with_dwellings(sim: &Simulation) -> Vec<Tribe> {
    let mut by_lineage: FxHashMap<&str, Vec<usize>> = FxHashMap::default();
    for (i, org) in sim.organisms.iter().enumerate() {
        if org.alive {
            by_lineage.entry(org.lineage_id.as_str()).or_default().push(i);
        }
    }
    let mut dwellings: FxHashMap<&str, Vec<(i32, i32)>> = FxHashMap::default();
    for b in sim.buildings.iter() {
        if !b.is_operational() || !matches!(b.kind, BuildingKind::Hut | BuildingKind::House) {
            continue;
        }
        if let Some(owner) = b.owner_lineage.as_deref() {
            dwellings.entry(owner).or_default().push((b.x, b.y));
        }
    }
    let mut tribes: Vec<Tribe> = by_lineage
        .into_iter()
        .filter_map(|(lineage, members)| {
            let mut spots = dwellings.remove(lineage)?;
            spots.sort_unstable();
            Some(Tribe {
                lineage: lineage.to_string(),
                members,
                dwellings: spots,
            })
        })
        .collect();
    tribes.sort_by(|a, b| a.lineage.cmp(&b.lineage));
    tribes
}

/// The first tile on a ring round a dwelling that can take a new field.
fn field_site(
    sim: &Simulation,
    dwellings: &[(i32, i32)],
    occupied: &FxHashSet<(i32, i32)>,
) -> Option<(i32, i32)> {
    for &(hx, hy) in dwellings {
        for reach in SOW_MIN_REACH..=SOW_MAX_REACH {
            for dy in -reach..=reach {
                for dx in -reach..=reach {
                    if dx.abs().max(dy.abs()) != reach {
                        continue;
                    }
                    let (x, y) = (hx + dx, hy + dy);
                    if !in_bounds(x, y) || occupied.contains(&(x, y)) {
                        continue;
                    }
                    if !matches!(sim.grid.get(x, y), Tile::Grass)
                        || sim.grid.road_at(x, y) != ROAD_NONE
                        || sim.grid.fertility_at(x, y) < SOW_MIN_FERTILITY
                    {
                        continue;
                    }
                    return Some((x, y));
                }
            }
        }
    }
    None
}

fn in_bounds(x: i32, y: i32) -> bool {
    x >= 0 && y >= 0 && (x as usize) < WIDTH && (y as usize) < HEIGHT
}

fn water_within(sim: &Simulation, x: i32, y: i32, reach: i32) -> bool {
    (-reach..=reach).any(|dy| (-reach..=reach).any(|dx| matches!(sim.grid.get(x + dx, y + dy), Tile::Water)))
}

/// Harvest the ripe fields of every tribe that farms, then open or re-sow a
/// couple of plots for each tribe that has the ground and the seed for them.
pub(crate) fn tick_village_fields(sim: &mut Simulation) {
    let now = sim.tick_count;
    let tribes = tribes_with_dwellings(sim);
    for tribe in &tribes {
        let knows = tribe
            .members
            .iter()
            .any(|&i| sim.organisms[i].discoveries.contains("agriculture"));
        if !knows {
            continue;
        }
        harvest_ripe(sim, tribe);
        sow_fields(sim, tribe, now);
        village_stores::ration(sim, tribe);
        village_stores::build_stores(sim, tribe);
        village_livestock::tick_livestock(sim, tribe);
    }
}

fn harvest_ripe(sim: &mut Simulation, tribe: &Tribe) {
    let ripe: Vec<(i32, i32)> = sim
        .farms
        .iter()
        .filter(|f| f.owner_lineage == tribe.lineage && f.is_mature(sim.tick_count))
        .map(|f| (f.x, f.y))
        .collect();
    for (x, y) in ripe {
        // The person nearest the field brings it in.
        let Some(&actor) = tribe.members.iter().min_by_key(|&&i| {
            let o = &sim.organisms[i];
            ((o.x as i32 - x).abs() + (o.y as i32 - y).abs(), i)
        }) else {
            continue;
        };
        if let Some(result) = harvest_crop(sim, actor, x, y) {
            // The harvest was credited to the hands that brought it in; it goes into the
            // granary instead (with the granary and windmill bonus), and only what does not
            // fit stays with them.
            let grain = (result.yield_units as f32 * village_stores::yield_factor(sim, &tribe.lineage))
                .round() as u32;
            let person = &mut sim.organisms[actor];
            person.inv_food = person.inv_food.saturating_sub(result.yield_units);
            let left = village_stores::deposit(sim, &tribe.lineage, grain);
            sim.organisms[actor].inv_food = sim.organisms[actor].inv_food.saturating_add(left.min(255) as u8);
            let tick = sim.tick_count;
            sim.organisms[actor].think("harvesting the field", tick);
        }
    }
}

fn sow_fields(sim: &mut Simulation, tribe: &Tribe, now: u64) {
    // Fields are sown in spring only; a fallow plot waits for the next spring.
    if sim.season() != SOWING_SEASON {
        return;
    }
    let cap = (tribe.dwellings.len() * PLOTS_PER_DWELLING).max(1);
    let mut sowed = 0usize;
    let mut first_ever = false;
    for _ in 0..SOW_PER_PASS {
        let plots = sim
            .farms
            .iter()
            .filter(|f| f.owner_lineage == tribe.lineage)
            .count();
        // A fallow plot the tribe already owns is re-sown before new ground is broken.
        let fallow = sim
            .farms
            .iter()
            .filter(|f| f.owner_lineage == tribe.lineage && f.harvested)
            .map(|f| (f.x, f.y))
            .next();
        let site = match fallow {
            Some(site) => Some(site),
            None if plots < cap => {
                let occupied: FxHashSet<(i32, i32)> = sim
                    .farms
                    .iter()
                    .map(|f| (f.x, f.y))
                    .chain(sim.buildings.iter().map(|b| (b.x, b.y)))
                    .collect();
                field_site(sim, &tribe.dwellings, &occupied)
            }
            None => None,
        };
        let Some((x, y)) = site else {
            break;
        };
        let Some(actor) = tribe.members.iter().copied().find(|&i| {
            let o = &sim.organisms[i];
            o.inv_food > 0 || o.tools.get("seeds").copied().unwrap_or(0) > 0
        }) else {
            break;
        };
        let water = water_within(sim, x, y, 2);
        let crop = crop_for_plot(sim, actor, x, y, water);
        if plant_crop(sim, actor, x, y, crop, false).is_none() {
            break;
        }
        // The field is timed to the autumn harvest, and the planter is seen sowing it.
        let ready = next_autumn(now) + AUTUMN_LEAD;
        if let Some(farm) = sim.farms.iter_mut().find(|f| f.x == x && f.y == y) {
            farm.ready_tick = ready;
            farm.season_timed = true;
        }
        sim.organisms[actor].think("sowing the field", now);
        if plots == 0 {
            first_ever = true;
        }
        sowed += 1;
    }
    if first_ever && sowed > 0 {
        let name = sim
            .lineage_names
            .get(&tribe.lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        push_event(
            &mut sim.events,
            now,
            "build",
            &name,
            "sowed its first field beside the houses",
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::era::Era;
    use crate::sim::tech::buildings::Building;
    use crate::world::grid::WorldGrid;

    /// A tribe that knows farming, with one house and open grass round it.
    fn farming_tribe(seed: u64) -> (Simulation, String, (i32, i32)) {
        let mut sim = Simulation::new(seed);
        let lineage = sim.organisms[0].lineage_id.clone();
        for o in sim.organisms.iter_mut().filter(|o| o.lineage_id == lineage) {
            o.discoveries.insert("agriculture".to_string());
            o.inv_food = 3;
        }
        sim.lineage_eras.insert(lineage.clone(), Era::Bronze);
        let (hx, hy) = (120, 120);
        for dy in -8..=8 {
            for dx in -8..=8 {
                sim.grid.set(hx + dx, hy + dy, Tile::Grass);
                sim.grid.fertility[WorldGrid::idx(hx + dx, hy + dy)] = 0.8;
            }
        }
        sim.farms.clear();
        sim.buildings.clear();
        let mut house = Building::new(900, BuildingKind::Hut, hx, hy, Some(lineage.clone()), 0);
        house.condition = 1.0;
        sim.buildings.push(house);
        (sim, lineage, (hx, hy))
    }

    /// Tick of the first spring pass in the second year (season "recovery").
    const SPRING: u64 = 9_000;

    #[test]
    fn the_autumn_after_a_tick_is_the_next_decline_season() {
        assert_eq!(next_autumn(SPRING), 15_000);
        assert_eq!(next_autumn(14_999), 15_000);
        assert_eq!(
            next_autumn(15_000),
            27_000,
            "the autumn that starts a year is already past"
        );
        assert_eq!(next_autumn(0), 3_000);
    }

    #[test]
    fn a_tribe_sows_its_first_field_in_spring_and_times_it_to_autumn() {
        let (mut sim, lineage, (hx, hy)) = farming_tribe(4_242);
        sim.tick_count = SPRING;
        assert_eq!(sim.season(), SOWING_SEASON);
        tick_village_fields(&mut sim);
        assert!(
            !sim.farms.is_empty(),
            "a farming tribe with a house sows a field in spring"
        );
        let farm = &sim.farms[0];
        assert!(
            (farm.x - hx).abs().max((farm.y - hy).abs()) >= SOW_MIN_REACH,
            "beside the house, not on it"
        );
        assert_eq!(farm.owner_lineage, lineage);
        assert!(farm.season_timed);
        assert_eq!(farm.ready_tick, next_autumn(SPRING) + AUTUMN_LEAD);
        assert!(
            farm.progress(SPRING + 1_000) < 1.0,
            "a spring field is still growing"
        );
    }

    #[test]
    fn a_calendar_timed_field_ignores_weather_and_tending() {
        let (mut sim, _, _) = farming_tribe(4_243);
        sim.tick_count = SPRING;
        tick_village_fields(&mut sim);
        let ready = sim.farms[0].ready_tick;
        assert_eq!(sim.farms[0].adjust_ready_tick(SPRING + 100, -500), 0);
        assert_eq!(
            sim.farms[0].ready_tick, ready,
            "the autumn harvest stays on its date"
        );
    }

    #[test]
    fn nothing_is_sown_outside_spring() {
        let (mut sim, _, _) = farming_tribe(4_244);
        for tick in [0, 3_000, 6_000] {
            sim.tick_count = tick;
            tick_village_fields(&mut sim);
        }
        assert!(sim.farms.is_empty(), "summer, autumn and winter sow nothing");
    }

    #[test]
    fn the_field_is_brought_in_in_autumn_then_sown_again_next_spring() {
        let (mut sim, lineage, _) = farming_tribe(4_245);
        sim.tick_count = SPRING;
        tick_village_fields(&mut sim);
        let ripe = sim.farms[0].ready_tick;
        let food_before: u32 = sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .map(|o| o.inv_food as u32)
            .sum::<u32>()
            + crate::sim::civ::land::village_stores::stock_of(&sim, &lineage);

        sim.tick_count = ripe;
        tick_village_fields(&mut sim);
        let food_after: u32 = sim
            .organisms
            .iter()
            .filter(|o| o.alive && o.lineage_id == lineage)
            .map(|o| o.inv_food as u32)
            .sum::<u32>()
            + crate::sim::civ::land::village_stores::stock_of(&sim, &lineage);
        assert!(sim.farms[0].harvested, "the ripe field is brought in");
        assert!(food_after > food_before, "the harvest adds food to the tribe");
        assert!(
            sim.organisms.iter().any(|o| o.thought == "harvesting the field"),
            "a person is seen working the harvest"
        );

        // Autumn and winter: the stubble stays fallow.
        sim.tick_count = ripe + 3_000;
        tick_village_fields(&mut sim);
        assert!(sim.farms[0].harvested);

        // The next spring the plot is sown again.
        sim.tick_count = SPRING + 12_000;
        tick_village_fields(&mut sim);
        assert!(!sim.farms[0].harvested, "the next spring re-sows the plot");
        assert!(sim.organisms.iter().any(|o| o.thought == "sowing the field"));
    }

    #[test]
    fn a_tribe_without_the_discovery_or_a_house_sows_nothing() {
        let mut sim = Simulation::new(4_246);
        sim.farms.clear();
        sim.buildings.clear();
        sim.tick_count = SPRING;
        tick_village_fields(&mut sim);
        assert!(sim.farms.is_empty());
    }
}
