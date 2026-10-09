use super::*;
use std::collections::BTreeMap;

/// Two tribes whose settlement centres are this close (Manhattan distance) can open a route.
pub(super) const MERCHANT_ROUTE_REACH: u64 = 60;
/// How often merchants look for a new route to open.
pub(super) const MERCHANT_ROUTE_SCAN_TICKS: u64 = 120;
/// How often routes are checked for a caravan to send.
pub(super) const MERCHANT_DISPATCH_SCAN_TICKS: u64 = 30;
/// A route sends at most one caravan per this many ticks.
pub(super) const CARAVAN_INTERVAL_TICKS: u64 = 240;
/// Most units of one good a merchant loads onto a caravan.
pub(super) const MERCHANT_LOAD: u32 = 3;
/// Units of a good a donor keeps for their own needs.
const DONOR_KEEP: u32 = 2;
/// A tribe sends a good only when it has at least this many units per person to spare.
const SPARE_PER_PERSON: f32 = 2.0;
/// Land goods are made a few at a time, so a tribe that makes one sends it at a lower bar.
const LAND_SPARE_PER_PERSON: f32 = 0.1;
/// A tribe with this many units of a land good per person pays the era's price for it.
const LAND_FULL_PER_PERSON: f32 = 1.0;
/// Goods a merchant can carry between tribes: the staples, then what the land gives
/// (see `economy::LAND_GOODS`). Tools and water stay at home.
const TRADE_GOOD_COUNT: usize = 9;
const TRADE_GOODS: [&str; TRADE_GOOD_COUNT] = [
    "food", "wood", "stone", "clay", "salt", "ore", "spice", "ochre", "fur",
];

fn is_merchant(org: &crate::organism::organism::Organism) -> bool {
    org.alive && org.specialty.as_deref() == Some("merchant")
}

fn stock_of(org: &crate::organism::organism::Organism, good: &str) -> u32 {
    match good {
        "food" => u32::from(org.inv_food),
        "wood" => u32::from(org.inv_wood),
        "stone" => u32::from(org.inv_stone),
        land if is_land_good(land) => u32::from(org.land_good_count(land)),
        _ => 0,
    }
}

/// The units per person a tribe must have before it sends a good.
fn spare_per_person(good: &str) -> f32 {
    if is_land_good(good) {
        LAND_SPARE_PER_PERSON
    } else {
        SPARE_PER_PERSON
    }
}

fn has_route_between(sim: &Simulation, first: &str, second: &str) -> bool {
    sim.trade_routes.iter().any(|route| {
        (route.lineage_a == first && route.lineage_b == second)
            || (route.lineage_a == second && route.lineage_b == first)
    })
}

/// A merchant opens a route to the nearest neighbouring tribe whose settlement
/// stands within reach of theirs and that has no route yet.
pub(super) fn open_merchant_routes(sim: &mut Simulation) {
    if sim.trade_routes.len() >= MAX_TRADE_ROUTES {
        return;
    }
    let centers: BTreeMap<String, [i32; 2]> = settlements::snapshots(sim)
        .iter()
        .filter(|settlement| settlement.tier >= 1 && valid_world_point(settlement.center))
        .map(|settlement| (settlement.lineage_id.clone(), settlement.center))
        .collect();
    let merchants: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, org)| is_merchant(org))
        .map(|(idx, _)| idx)
        .collect();
    for merchant_idx in merchants {
        if sim.trade_routes.len() >= MAX_TRADE_ROUTES {
            break;
        }
        let lineage = sim.organisms[merchant_idx].lineage_id.clone();
        let Some(&center) = centers.get(&lineage) else {
            continue;
        };
        let mut best: Option<(u64, &String)> = None;
        for (other, other_center) in &centers {
            if *other == lineage || has_route_between(sim, &lineage, other) {
                continue;
            }
            let distance = manhattan_distance(center, *other_center);
            if distance > MERCHANT_ROUTE_REACH {
                continue;
            }
            if best.is_none_or(|(best_distance, _)| distance < best_distance) {
                best = Some((distance, other));
            }
        }
        let Some((_, partner)) = best else {
            continue;
        };
        let partner = partner.clone();
        if let Some(partner_idx) = sim
            .organisms
            .iter()
            .position(|org| org.alive && org.lineage_id == partner)
        {
            establish_route(sim, merchant_idx, partner_idx);
        }
    }
}

/// The goods a tribe has to spare that the other tribe is short of, with the
/// gap per person between the two tribes. Stock is compared per person, so a
/// big tribe is not a rich one by size alone.
fn surplus_goods(sim: &Simulation, sender: &str, receiver: &str) -> Vec<(&'static str, f32)> {
    let (sender_people, sender_stock) = lineage_stock(sim, sender);
    let (receiver_people, receiver_stock) = lineage_stock(sim, receiver);
    if sender_people == 0 || receiver_people == 0 {
        return Vec::new();
    }
    TRADE_GOODS
        .iter()
        .enumerate()
        .filter_map(|(index, good)| {
            let sends = sender_stock[index] as f32 / sender_people as f32;
            let gets = receiver_stock[index] as f32 / receiver_people as f32;
            (sends >= spare_per_person(good) && gets < sends * 0.5).then_some((*good, sends - gets))
        })
        .collect()
}

/// The good for the next caravan on a route. The staples go first, by the largest
/// gap, as they always have: food, wood and stone are what a short tribe needs
/// most, so a land good never takes a caravan from them. A land good travels only
/// when no staple is spare and the other tribe is short of it; those goods then
/// take turns, by the route's history.
fn surplus_good(sim: &Simulation, route_index: usize, sender: &str, receiver: &str) -> Option<&'static str> {
    let goods = surplus_goods(sim, sender, receiver);
    let mut best_staple: Option<(f32, &'static str)> = None;
    for &(good, gap) in goods.iter().filter(|(good, _)| !is_land_good(good)) {
        if best_staple.is_none_or(|(best_gap, _)| gap > best_gap) {
            best_staple = Some((gap, good));
        }
    }
    if let Some((_, good)) = best_staple {
        return Some(good);
    }
    if goods.is_empty() {
        return None;
    }
    let route = &sim.trade_routes[route_index];
    let turn = (route.deliveries as usize).wrapping_add((sim.tick_count / CARAVAN_INTERVAL_TICKS) as usize);
    goods.get(turn % goods.len()).map(|(good, _)| *good)
}

/// Living people in a tribe and their combined stock of each trade good.
fn lineage_stock(sim: &Simulation, lineage: &str) -> (u32, [u32; TRADE_GOOD_COUNT]) {
    let mut people = 0u32;
    let mut stock = [0u32; TRADE_GOOD_COUNT];
    for org in sim
        .organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage)
    {
        people += 1;
        for (index, good) in TRADE_GOODS.iter().enumerate() {
            stock[index] += stock_of(org, good);
        }
    }
    (people, stock)
}

/// Brings goods from the sender's people to the merchant, nearest first. Donors
/// keep a small reserve, so a merchant only takes a tribe's spare food or timber.
fn gather_for_merchant(sim: &mut Simulation, sender: &str, merchant_idx: usize, good: &str, want: u32) {
    let (mx, my) = (sim.organisms[merchant_idx].x, sim.organisms[merchant_idx].y);
    let mut donors: Vec<(u64, String, usize)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(idx, org)| *idx != merchant_idx && org.alive && org.lineage_id == sender)
        .map(|(idx, org)| {
            let distance = manhattan_distance([mx as i32, my as i32], [org.x as i32, org.y as i32]);
            (distance, org.id.clone(), idx)
        })
        .collect();
    donors.sort();
    let mut need = want.saturating_sub(stock_of(&sim.organisms[merchant_idx], good));
    for (_, _, donor_idx) in donors {
        if need == 0 {
            break;
        }
        // Staples keep a small reserve at home; land goods are all for trade.
        let keep = if is_land_good(good) { 0 } else { DONOR_KEEP };
        let spare = stock_of(&sim.organisms[donor_idx], good).saturating_sub(keep);
        let take = spare.min(need).min(cargo_room(sim, merchant_idx, good));
        if take == 0 || !consume_cargo(sim, donor_idx, good, take) {
            continue;
        }
        let accepted = add_cargo(sim, merchant_idx, good, take);
        need = need.saturating_sub(accepted);
    }
}

/// Sends one caravan from `sender` to `receiver` on the route, loaded by the
/// sender's merchant. Returns false when the sender has no merchant, nothing to
/// spare, or the route cannot carry it now.
fn send_merchant_caravan(sim: &mut Simulation, route_index: usize, sender: &str, receiver: &str) -> bool {
    let Some(merchant_idx) = sim
        .organisms
        .iter()
        .position(|org| is_merchant(org) && org.lineage_id == sender)
    else {
        return false;
    };
    let Some(good) = surplus_good(sim, route_index, sender, receiver) else {
        return false;
    };
    gather_for_merchant(sim, sender, merchant_idx, good, MERCHANT_LOAD);
    let carried = stock_of(&sim.organisms[merchant_idx], good).min(MERCHANT_LOAD);
    if carried == 0 {
        return false;
    }
    if !dispatch_cargo_on_route_index(sim, merchant_idx, route_index, good.to_string(), carried) {
        return false;
    }
    // The price rises with scarcity: a tribe with none of the good in store pays
    // up to double the era's price for it.
    let (receiver_people, receiver_stock) = lineage_stock(sim, receiver);
    let index = TRADE_GOODS.iter().position(|name| *name == good).unwrap_or(0);
    let per_person = receiver_stock[index] as f32 / receiver_people.max(1) as f32;
    let full = if is_land_good(good) {
        LAND_FULL_PER_PERSON
    } else {
        1.0
    };
    let scarcity = (1.0 - per_person / full).clamp(0.0, 1.0);
    if let Some(caravan) = sim.caravans.last_mut() {
        let base = caravan.unit_price as f32;
        caravan.unit_price = (base * (1.0 + scarcity)).round().clamp(1.0, 200.0) as u32;
    }
    true
}

/// Each route with no caravan on the road and a full interval since its last
/// one sends a caravan from whichever side has goods to spare.
pub(super) fn run_merchant_caravans(sim: &mut Simulation) {
    let tick = sim.tick_count;
    for route_index in 0..sim.trade_routes.len() {
        if sim.caravans.len() >= MAX_CARAVANS {
            break;
        }
        let route = &sim.trade_routes[route_index];
        let (route_id, last_dispatch) = (route.id, route.last_dispatch_tick);
        let (lineage_a, lineage_b) = (route.lineage_a.clone(), route.lineage_b.clone());
        if last_dispatch != 0 && tick.saturating_sub(last_dispatch) < CARAVAN_INTERVAL_TICKS {
            continue;
        }
        if sim.caravans.iter().any(|caravan| caravan.route_id == route_id) {
            continue;
        }
        // Alternate which side is tried first, so neither tribe always sends.
        let a_first = (u64::from(route_id) + tick / CARAVAN_INTERVAL_TICKS).is_multiple_of(2);
        let directions = if a_first {
            [(lineage_a.clone(), lineage_b.clone()), (lineage_b, lineage_a)]
        } else {
            [(lineage_b.clone(), lineage_a.clone()), (lineage_a, lineage_b)]
        };
        for (sender, receiver) in directions {
            if send_merchant_caravan(sim, route_index, &sender, &receiver) {
                break;
            }
        }
    }
}
