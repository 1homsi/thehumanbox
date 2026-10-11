//! Harbour works. A tribe's harbour (the water where its boats moor, see `fleet.rs`) grows with
//! its town. A shipyard stands on the land beside it from the Bronze age: the boats are built there,
//! from wood the tribe brings to the quay, and each hull takes time on the slip. A warehouse follows
//! from the Iron age: trade boats unload their goods into it, and the goods feed the tribe (see
//! `village_stores.rs`). Piers grow with the people who live near the harbour, and a pier is a berth:
//! a boat is launched only when one is free.
//!
//! Everything here walks buildings, people and boats in a fixed order and draws no random numbers.
use crate::sim::civ::land::village_stores::{fits, occupied_tiles};
use crate::sim::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::sim::tech::fleet::{harbour_near, on_quay, MAX_FLEET, MAX_PER_TRIBE, MIN_TRIBE_FOR_BOAT};
use crate::sim::transportation::{TransportKind, Vehicle};

/// How often the harbour works are checked, in ticks.
const PORT_CHECK_TICKS: u64 = 50;
/// How close to a harbour a yard or a warehouse stands, in tiles (a square search box).
pub(crate) const PORT_REACH: i32 = 6;
/// The ring of tiles around a harbour a yard or a warehouse is built on, in tiles from the harbour.
const BUILD_RING: (i32, i32) = (2, 4);
/// How far from a harbour a home may be and still count among its town, in tiles.
const TOWN_REACH: i32 = 12;
/// One pier, then one more for each this many townsfolk, up to `MAX_PIERS`.
const PEOPLE_PER_PIER: usize = 8;
/// Piers a harbour holds at most.
pub(crate) const MAX_PIERS: u32 = 4;
/// The era a shipyard is built in (boats have sailed since the Bronze age).
const YARD_ERA: Era = Era::Bronze;
/// The era a warehouse is built in.
const WAREHOUSE_ERA: Era = Era::Iron;
/// Measures of goods a warehouse holds.
pub(crate) const WAREHOUSE_CAP: u32 = 60;
/// Wood a hull takes off the slip when it is laid down.
const HULL_WOOD: u32 = 6;
/// Ticks of work a hull takes on the slip before the boat is launched. The work is done only while
/// someone of the tribe stands on the quay (the labour), so an empty quay stops the hull.
const HULL_TICKS: u64 = 300;
/// Wood the people on a quay hew into a canoe, the first boat of a tribe (no yard needed for it).
const CANOE_WOOD: u32 = 4;
/// Wood a shipyard takes from its quay at each check, at most.
const WOOD_PER_CHECK: u32 = 2;
/// Wood a shipyard keeps in store, at most (two hulls' worth).
const YARD_WOOD_CAP: u32 = 12;

/// The piers at a harbour: one, and one more for each `PEOPLE_PER_PIER` people of `lineage` who
/// live within `TOWN_REACH` of it, up to `MAX_PIERS`.
pub fn piers_at(sim: &Simulation, harbour: (i32, i32), lineage: &str) -> u32 {
    let reach = TOWN_REACH as f32;
    let town = sim
        .organisms
        .iter()
        .filter(|o| {
            o.alive
                && o.lineage_id == lineage
                && (o.home_x - harbour.0 as f32)
                    .abs()
                    .max((o.home_y - harbour.1 as f32).abs())
                    <= reach
        })
        .count();
    (1 + (town / PEOPLE_PER_PIER) as u32).min(MAX_PIERS)
}

/// Index of an operational building of `kind` that `lineage` owns within `reach` of `at`.
fn building_within(
    sim: &Simulation,
    kind: BuildingKind,
    lineage: &str,
    at: (i32, i32),
    reach: i32,
) -> Option<usize> {
    sim.buildings.iter().position(|b| {
        b.kind == kind
            && b.is_operational()
            && b.owner_lineage.as_deref() == Some(lineage)
            && (b.x - at.0).abs().max((b.y - at.1).abs()) <= reach
    })
}

/// Takes up to `want` measures of goods out of the warehouse `lineage` holds near `at`. Returns what it gave.
pub(crate) fn take_from_warehouse(sim: &mut Simulation, lineage: &str, at: (i32, i32), want: u32) -> u32 {
    let Some(i) = building_within(sim, BuildingKind::Warehouse, lineage, at, PORT_REACH) else {
        return 0;
    };
    let b = &mut sim.buildings[i];
    let got = b.stock.min(want);
    b.stock -= got;
    got
}

/// Puts cargo from a boat of `from` into a warehouse held by another tribe near `quay`. Returns the
/// cargo that did not fit (all of it when there is no such warehouse).
pub(crate) fn unload_into_warehouse(sim: &mut Simulation, from: &str, quay: (i32, i32), cargo: u32) -> u32 {
    let found = sim.buildings.iter().position(|b| {
        b.kind == BuildingKind::Warehouse
            && b.is_operational()
            && b.owner_lineage.as_deref().is_some_and(|o| o != from)
            && (b.x - quay.0).abs().max((b.y - quay.1).abs()) <= PORT_REACH
    });
    let Some(i) = found else {
        return cargo;
    };
    let b = &mut sim.buildings[i];
    let put = WAREHOUSE_CAP.saturating_sub(b.stock).min(cargo);
    b.stock += put;
    cargo - put
}

/// Runs the harbour works of every tribe that fishes from a harbour: the yard and the warehouse are
/// raised beside it when the era allows, wood comes in from the quay, and hulls are laid and launched.
pub(crate) fn tick_ports(sim: &mut Simulation) {
    let now = sim.tick_count;
    if !now.is_multiple_of(PORT_CHECK_TICKS) {
        return;
    }
    let mut fleet_total = sim.vehicles.iter().filter(|v| v.harbour.is_some()).count();
    let mut tribes: Vec<String> = Vec::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if !tribes.contains(&o.lineage_id) {
            tribes.push(o.lineage_id.clone());
        }
    }
    for tribe in tribes {
        let members: Vec<usize> = sim
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == tribe)
            .map(|(i, _)| i)
            .collect();
        let fisher = members
            .iter()
            .any(|&i| sim.organisms[i].discoveries.contains("fishing"));
        if members.len() < MIN_TRIBE_FOR_BOAT || !fisher {
            continue;
        }
        let harbour = members.iter().find_map(|&i| {
            let o = &sim.organisms[i];
            harbour_near(&sim.grid, o.home_x.round() as i32, o.home_y.round() as i32)
        });
        let Some(harbour) = harbour else { continue };
        // The first boat is a canoe hewn on the quay from wood the people there carry: no yard needed.
        let owned = sim
            .vehicles
            .iter()
            .filter(|v| v.harbour.is_some() && v.owner_lineage == tribe)
            .count();
        let moored = sim.vehicles.iter().filter(|v| v.harbour == Some(harbour)).count() as u32;
        if owned == 0
            && fleet_total < MAX_FLEET
            && moored < piers_at(sim, harbour, &tribe)
            && take_quay_wood(sim, &tribe, harbour, CANOE_WOOD)
        {
            launch_boat(sim, &tribe, harbour);
            fleet_total += 1;
        }
        let era = sim.era(&tribe);
        if era >= YARD_ERA
            && building_within(sim, BuildingKind::Shipyard, &tribe, harbour, PORT_REACH).is_none()
        {
            build_port_work(sim, &tribe, harbour, BuildingKind::Shipyard);
        }
        let Some(yard) = building_within(sim, BuildingKind::Shipyard, &tribe, harbour, PORT_REACH) else {
            continue;
        };
        if era >= WAREHOUSE_ERA
            && building_within(sim, BuildingKind::Warehouse, &tribe, harbour, PORT_REACH).is_none()
        {
            build_port_work(sim, &tribe, harbour, BuildingKind::Warehouse);
        }
        // Wood from the people on the quay, up to what the yard can keep.
        let room = YARD_WOOD_CAP
            .saturating_sub(sim.buildings[yard].stock)
            .min(WOOD_PER_CHECK);
        let mut taken = 0u32;
        for o in sim
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == tribe && on_quay(o, harbour))
        {
            while o.inv_wood > 0 && taken < room {
                o.inv_wood -= 1;
                taken += 1;
            }
            if taken >= room {
                break;
            }
        }
        sim.buildings[yard].stock += taken;
        // A hull goes on the slip when the yard has wood for one and the tribe may keep another boat.
        let owned = sim
            .vehicles
            .iter()
            .filter(|v| v.harbour.is_some() && v.owner_lineage == tribe)
            .count();
        let cap = MAX_PER_TRIBE.min(1 + members.len() / 12);
        if sim.buildings[yard].hull_work.is_none()
            && sim.buildings[yard].stock >= HULL_WOOD
            && owned < cap
            && fleet_total < MAX_FLEET
        {
            sim.buildings[yard].stock -= HULL_WOOD;
            sim.buildings[yard].hull_work = Some(HULL_TICKS);
        }
        // Labour: someone on the quay works the slip for this check.
        let crew = members.iter().any(|&i| on_quay(&sim.organisms[i], harbour));
        let Some(work) = sim.buildings[yard].hull_work else {
            continue;
        };
        let work = if crew {
            work.saturating_sub(PORT_CHECK_TICKS)
        } else {
            work
        };
        sim.buildings[yard].hull_work = Some(work);
        // A finished hull is launched into a free berth.
        let moored = sim.vehicles.iter().filter(|v| v.harbour == Some(harbour)).count() as u32;
        if work == 0 && fleet_total < MAX_FLEET && moored < piers_at(sim, harbour, &tribe) {
            launch_boat(sim, &tribe, harbour);
            fleet_total += 1;
            sim.buildings[yard].hull_work = None;
        }
    }
}

/// Takes exactly `want` wood from the people on the quay at `harbour`, if they carry that much between them.
fn take_quay_wood(sim: &mut Simulation, lineage: &str, harbour: (i32, i32), want: u32) -> bool {
    let carried: u32 = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lineage && on_quay(o, harbour))
        .map(|o| u32::from(o.inv_wood))
        .sum();
    if carried < want {
        return false;
    }
    let mut left = want;
    for o in sim
        .organisms
        .iter_mut()
        .filter(|o| o.alive && o.lineage_id == lineage && on_quay(o, harbour))
    {
        let give = left.min(u32::from(o.inv_wood));
        o.inv_wood -= give as u8;
        left -= give;
        if left == 0 {
            break;
        }
    }
    true
}

/// Launches a new boat from the yard at `harbour`, moored at its berth.
fn launch_boat(sim: &mut Simulation, lineage: &str, harbour: (i32, i32)) {
    sim.vehicles.push(Vehicle {
        id: sim.next_vehicle_id,
        kind: TransportKind::Boat,
        owner_lineage: lineage.to_string(),
        x: harbour.0,
        y: harbour.1,
        occupants: Vec::new(),
        cargo: 0,
        route: Vec::new(),
        ready_tick: 0,
        harbour: Some(harbour),
        bound_for: None,
        ferry: None,
    });
    sim.next_vehicle_id += 1;
    let tick = sim.tick_count;
    let name = tribe_name(sim, lineage);
    crate::sim::world_events::push_event(
        &mut sim.events,
        tick,
        "build",
        &name,
        "launched a new boat from the shipyard",
    );
}

/// Raises a shipyard or a warehouse on open grass two to four tiles from the harbour.
fn build_port_work(sim: &mut Simulation, lineage: &str, harbour: (i32, i32), kind: BuildingKind) -> bool {
    let occupied = occupied_tiles(sim);
    let (near, far) = BUILD_RING;
    let mut site = None;
    'search: for reach in near..=far {
        for dy in -reach..=reach {
            for dx in -reach..=reach {
                if dx.abs().max(dy.abs()) != reach {
                    continue;
                }
                let (x, y) = (harbour.0 + dx, harbour.1 + dy);
                if fits(sim, x, y, kind, &occupied) {
                    site = Some((x, y));
                    break 'search;
                }
            }
        }
    }
    let Some((x, y)) = site else { return false };
    let tick = sim.tick_count;
    let id = sim
        .buildings
        .iter()
        .map(|b| b.id)
        .max()
        .unwrap_or(0)
        .saturating_add(1);
    let mut building = Building::new(id, kind, x, y, Some(lineage.to_string()), tick);
    building.condition = 1.0;
    sim.buildings.push(building);
    let name = tribe_name(sim, lineage);
    let what = match kind {
        BuildingKind::Shipyard => "raised a shipyard on the quay, where the boats are built",
        _ => "raised a warehouse on the quay for the goods that come by boat",
    };
    crate::sim::world_events::push_event(&mut sim.events, tick, "build", &name, what);
    true
}

fn tribe_name(sim: &Simulation, lineage: &str) -> String {
    sim.lineage_names
        .get(lineage)
        .cloned()
        .unwrap_or_else(|| "a tribe".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::era::Era;
    use crate::sim::transportation::Vehicle;
    use crate::world::tiles::Tile;

    /// A lake with a grass shore on its western edge, and forty people of one tribe on the shore at
    /// (89, 100), a fisher among them.
    fn coastal_sim() -> (Simulation, String) {
        let mut sim = Simulation::new(42);
        sim.animals.clear();
        for y in 90..=110 {
            for x in 90..=120 {
                sim.grid.set(x, y, Tile::Water);
            }
        }
        for y in 88..=112 {
            for x in 80..=89 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms.truncate(40);
        assert_eq!(sim.organisms.len(), 40, "the world starts with forty people");
        let lineage = sim.organisms[0].lineage_id.clone();
        for o in sim.organisms.iter_mut() {
            o.lineage_id = lineage.clone();
            o.alive = true;
            o.home_x = 89.0;
            o.home_y = 100.0;
            o.x = 89.0;
            o.y = 100.0;
        }
        sim.organisms[0].discover("fishing");
        sim.vehicles.clear();
        (sim, lineage)
    }

    /// Runs the harbour works at each check tick from `from` to `to`, inclusive.
    fn run_works(sim: &mut Simulation, from: u64, to: u64) {
        for t in (from..=to).step_by(50) {
            sim.tick_count = t;
            tick_ports(sim);
        }
    }

    fn yard_stock(sim: &Simulation, lineage: &str) -> u32 {
        let i = building_within(sim, BuildingKind::Shipyard, lineage, (90, 100), PORT_REACH).unwrap();
        sim.buildings[i].stock
    }

    #[test]
    fn no_shipyard_before_the_bronze_age_and_no_boat_without_one() {
        let (mut sim, lineage) = coastal_sim();
        sim.lineage_eras.insert(lineage.clone(), Era::PreStone);
        for o in sim.organisms.iter_mut() {
            o.inv_wood = 9;
        }
        run_works(&mut sim, 0, 600);
        assert!(building_within(&sim, BuildingKind::Shipyard, &lineage, (90, 100), PORT_REACH).is_none());
        assert_eq!(
            sim.vehicles.len(),
            1,
            "without a shipyard a tribe has its canoe and no more"
        );
    }

    #[test]
    fn a_bronze_tribe_raises_a_shipyard_and_builds_its_next_boat_from_wood_and_time() {
        let (mut sim, lineage) = coastal_sim();
        sim.lineage_eras.insert(lineage.clone(), Era::Bronze);
        for o in sim.organisms.iter_mut() {
            o.inv_wood = 10;
        }
        run_works(&mut sim, 0, 0);
        assert!(building_within(&sim, BuildingKind::Shipyard, &lineage, (90, 100), PORT_REACH).is_some());
        assert_eq!(
            sim.vehicles.len(),
            1,
            "the first boat is a canoe hewn from four wood on the quay"
        );
        assert_eq!(
            yard_stock(&sim, &lineage),
            2,
            "two wood a check comes off the quay"
        );
        run_works(&mut sim, 50, 100);
        assert_eq!(
            yard_stock(&sim, &lineage),
            0,
            "six wood lays a hull, which takes the wood off the store"
        );
        let i = building_within(&sim, BuildingKind::Shipyard, &lineage, (90, 100), PORT_REACH).unwrap();
        assert_eq!(
            sim.buildings[i].hull_work,
            Some(HULL_TICKS - PORT_CHECK_TICKS),
            "the crew works on the quay at once"
        );
        run_works(&mut sim, 150, 300);
        assert_eq!(sim.vehicles.len(), 1, "the hull takes time on the slip");
        run_works(&mut sim, 350, 350);
        let boats: Vec<&Vehicle> = sim.vehicles.iter().filter(|v| v.harbour.is_some()).collect();
        assert_eq!(boats.len(), 2, "the yard launches the second boat");
        assert!(boats
            .iter()
            .all(|b| b.harbour == Some((90, 100)) && b.owner_lineage == lineage));
        let i = building_within(&sim, BuildingKind::Shipyard, &lineage, (90, 100), PORT_REACH).unwrap();
        assert!(sim.buildings[i].hull_work.is_none());
    }

    #[test]
    fn piers_grow_with_the_townsfolk_who_live_near_the_harbour() {
        let (mut sim, lineage) = coastal_sim();
        for o in sim.organisms.iter_mut().skip(8) {
            o.home_x = 10.0;
        }
        assert_eq!(
            piers_at(&sim, (90, 100), &lineage),
            2,
            "eight townsfolk make a second pier"
        );
        for o in sim.organisms.iter_mut() {
            o.home_x = 10.0;
        }
        assert_eq!(
            piers_at(&sim, (90, 100), &lineage),
            1,
            "a town out of reach leaves one pier"
        );
        for o in sim.organisms.iter_mut() {
            o.home_x = 89.0;
        }
        assert_eq!(
            piers_at(&sim, (90, 100), &lineage),
            MAX_PIERS,
            "forty townsfolk fill the piers up to the most a harbour holds"
        );
    }

    #[test]
    fn a_warehouse_takes_another_tribes_goods_and_gives_them_back_to_its_own_tribe() {
        let (mut sim, lineage) = coastal_sim();
        sim.lineage_eras.insert(lineage.clone(), Era::Iron);
        run_works(&mut sim, 0, 0);
        assert!(building_within(&sim, BuildingKind::Warehouse, &lineage, (90, 100), PORT_REACH).is_some());
        assert_eq!(
            unload_into_warehouse(&mut sim, &lineage, (90, 100), 5),
            5,
            "a tribe's own boat is not a stranger"
        );
        assert_eq!(
            unload_into_warehouse(&mut sim, "a stranger", (90, 100), 5),
            0,
            "a stranger's cargo fits"
        );
        assert_eq!(take_from_warehouse(&mut sim, &lineage, (90, 100), 3), 3);
        assert_eq!(take_from_warehouse(&mut sim, &lineage, (90, 100), 9), 2);
    }
}
