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
/// Goods a merchant can carry between tribes. Tools and water stay at home.
const TRADE_GOODS: [&str; 3] = ["food", "wood", "stone"];

fn is_merchant(org: &crate::organism::organism::Organism) -> bool {
    org.alive && org.specialty.as_deref() == Some("merchant")
}

fn stock_of(org: &crate::organism::organism::Organism, good: &str) -> u32 {
    match good {
        "food" => u32::from(org.inv_food),
        "wood" => u32::from(org.inv_wood),
        "stone" => u32::from(org.inv_stone),
        _ => 0,
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

/// The good a tribe has most to spare of, that the other tribe is short of.
/// Stock is compared per person, so a big tribe is not a rich one by size alone.
fn surplus_good(sim: &Simulation, sender: &str, receiver: &str) -> Option<&'static str> {
    let (sender_people, sender_stock) = lineage_stock(sim, sender);
    let (receiver_people, receiver_stock) = lineage_stock(sim, receiver);
    if sender_people == 0 || receiver_people == 0 {
        return None;
    }
    let mut best: Option<(f32, &'static str)> = None;
    for (index, good) in TRADE_GOODS.iter().enumerate() {
        let sends = sender_stock[index] as f32 / sender_people as f32;
        let gets = receiver_stock[index] as f32 / receiver_people as f32;
        if sends < SPARE_PER_PERSON || gets >= sends * 0.5 {
            continue;
        }
        let gap = sends - gets;
        if best.is_none_or(|(best_gap, _)| gap > best_gap) {
            best = Some((gap, good));
        }
    }
    best.map(|(_, good)| good)
}

/// Living people in a tribe and their combined stock of each trade good.
fn lineage_stock(sim: &Simulation, lineage: &str) -> (u32, [u32; 3]) {
    let mut people = 0u32;
    let mut stock = [0u32; 3];
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
        let spare = stock_of(&sim.organisms[donor_idx], good).saturating_sub(DONOR_KEEP);
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
    let Some(good) = surplus_good(sim, sender, receiver) else {
        return false;
    };
    gather_for_merchant(sim, sender, merchant_idx, good, MERCHANT_LOAD);
    let carried = stock_of(&sim.organisms[merchant_idx], good).min(MERCHANT_LOAD);
    if carried == 0 {
        return false;
    }
    dispatch_cargo_on_route_index(sim, merchant_idx, route_index, good.to_string(), carried)
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
