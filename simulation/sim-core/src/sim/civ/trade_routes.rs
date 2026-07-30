use std::collections::{BTreeSet, HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::sim::civ::economy::{PriceTable, Trade};
use crate::sim::civ::settlements;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::{TrailKind, HEIGHT, WIDTH};

const MAX_TRADE_ROUTES: usize = 64;
const MAX_CARAVANS: usize = 128;
const MAX_CARAVANS_PER_ROUTE: usize = 4;
const MAX_AUTOMATIC_DELIVERIES_PER_TICK: usize = 16;
const TRADE_LOG_CAP: usize = 500;
const AUTO_UNLOAD_GRACE_TICKS: u64 = 60;
const STRANDED_CARAVAN_TICKS: u64 = 2_400;
const ROUTE_REFRESH_TICKS: u64 = 120;
const ROAD_MARK_TICKS: u64 = 10;
const MAX_PAYMENT_PER_DELIVERY: u32 = 250;
const MAX_CARAVAN_TRAVEL_TICKS: u64 = 1_200;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct TradeRoute {
    pub id: u32,
    pub lineage_a: String,
    pub lineage_b: String,
    pub a_center: [i32; 2],
    pub b_center: [i32; 2],
    pub established_tick: u64,
    pub last_dispatch_tick: u64,
    pub deliveries: u32,
    pub volume: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Caravan {
    pub id: u32,
    pub route_id: u32,
    pub sender_lineage: String,
    pub receiver_lineage: String,
    pub sender_org_id: String,
    pub cargo: String,
    pub amount: u32,
    pub unit_price: u32,
    pub departed_tick: u64,
    pub arrives_tick: u64,
    pub from: [i32; 2],
    pub to: [i32; 2],
    /// Q-learning state captured by the simulation immediately after action
    /// 288 successfully queues this caravan. It belongs in local saves so a
    /// reload cannot erase delayed credit, but it is deliberately omitted
    /// from the public wire payload.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(crate) dispatch_state: String,
}

fn canonical_endpoints(
    lineage_a: String,
    center_a: [i32; 2],
    lineage_b: String,
    center_b: [i32; 2],
) -> (String, [i32; 2], String, [i32; 2]) {
    if lineage_a <= lineage_b {
        (lineage_a, center_a, lineage_b, center_b)
    } else {
        (lineage_b, center_b, lineage_a, center_a)
    }
}

fn allocate_available_id(next: &mut u32, used: &HashSet<u32>) -> Option<u32> {
    // u32::MAX stays reserved as an invalid sentinel. Imported counters may
    // point at it (or immediately behind it), so probe the bounded live set
    // and wrap instead of permanently exhausting future allocations.
    let mut candidate = if *next == 0 || *next == u32::MAX { 1 } else { *next };
    for _ in 0..=used.len() {
        if !used.contains(&candidate) {
            *next = if candidate == u32::MAX - 1 {
                1
            } else {
                candidate + 1
            };
            return Some(candidate);
        }
        candidate = if candidate == u32::MAX - 1 {
            1
        } else {
            candidate + 1
        };
    }
    None
}

fn valid_world_point([x, y]: [i32; 2]) -> bool {
    x >= 0 && y >= 0 && x < WIDTH as i32 && y < HEIGHT as i32
}

fn manhattan_distance(first: [i32; 2], second: [i32; 2]) -> u64 {
    u64::from(first[0].abs_diff(second[0])) + u64::from(first[1].abs_diff(second[1]))
}

fn settlement_endpoints(
    sim: &Simulation,
    first_lineage: &str,
    second_lineage: &str,
) -> Option<([i32; 2], [i32; 2])> {
    if first_lineage.is_empty() || second_lineage.is_empty() || first_lineage == second_lineage {
        return None;
    }
    let snapshots = settlements::snapshots(sim);
    let first = snapshots
        .iter()
        .find(|settlement| settlement.lineage_id == first_lineage && settlement.tier >= 1)?;
    let second = snapshots
        .iter()
        .find(|settlement| settlement.lineage_id == second_lineage && settlement.tier >= 1)?;
    if !valid_world_point(first.center) || !valid_world_point(second.center) {
        return None;
    }
    Some((first.center, second.center))
}

pub fn establish_route(sim: &mut Simulation, actor_idx: usize, partner_idx: usize) -> bool {
    let Some(actor) = sim.organisms.get(actor_idx).filter(|organism| organism.alive) else {
        return false;
    };
    let Some(partner) = sim.organisms.get(partner_idx).filter(|organism| organism.alive) else {
        return false;
    };
    if actor.lineage_id == partner.lineage_id {
        return false;
    }

    let actor_lineage = actor.lineage_id.clone();
    let partner_lineage = partner.lineage_id.clone();
    let actor_name = actor.name.clone();
    let Some((actor_center, partner_center)) = settlement_endpoints(sim, &actor_lineage, &partner_lineage)
    else {
        return false;
    };
    let (lineage_a, a_center, lineage_b, b_center) =
        canonical_endpoints(actor_lineage, actor_center, partner_lineage, partner_center);

    if let Some(existing) = sim
        .trade_routes
        .iter_mut()
        .find(|route| route.lineage_a == lineage_a && route.lineage_b == lineage_b)
    {
        // Re-contact refreshes map anchors, but duplicate route actions do not
        // earn a reward or campaign progress.
        existing.a_center = a_center;
        existing.b_center = b_center;
        return false;
    }
    if sim.trade_routes.len() >= MAX_TRADE_ROUTES {
        return false;
    }
    let used_route_ids: HashSet<u32> = sim.trade_routes.iter().map(|route| route.id).collect();
    let Some(id) = allocate_available_id(&mut sim.next_trade_route_id, &used_route_ids) else {
        return false;
    };

    sim.trade_routes.push(TradeRoute {
        id,
        lineage_a: lineage_a.clone(),
        lineage_b: lineage_b.clone(),
        a_center,
        b_center,
        established_tick: sim.tick_count,
        last_dispatch_tick: 0,
        deliveries: 0,
        volume: 0,
    });

    let a_name = sim
        .lineage_names
        .get(&lineage_a)
        .cloned()
        .unwrap_or_else(|| lineage_a.clone());
    let b_name = sim
        .lineage_names
        .get(&lineage_b)
        .cloned()
        .unwrap_or_else(|| lineage_b.clone());
    push_event(
        &mut sim.events,
        sim.tick_count,
        "trade",
        &actor_name,
        &format!("{actor_name} opened a permanent trade route between {a_name} and {b_name}"),
    );
    true
}

fn cargo_candidate(sim: &Simulation, actor_idx: usize) -> Option<(String, u32)> {
    let actor = sim.organisms.get(actor_idx)?;
    let mut candidates = vec![
        ("wood".to_string(), u32::from(actor.inv_wood), 0u8),
        ("stone".to_string(), u32::from(actor.inv_stone), 1u8),
        ("food".to_string(), u32::from(actor.inv_food), 2u8),
        ("water".to_string(), u32::from(actor.inv_water), 3u8),
    ];
    let mut tool_names: Vec<&String> = actor.tools.keys().collect();
    tool_names.sort();
    candidates.extend(tool_names.into_iter().map(|name| {
        (
            name.clone(),
            u32::from(actor.tools.get(name).copied().unwrap_or(0)),
            4u8,
        )
    }));
    candidates
        .into_iter()
        .filter(|(_, count, _)| *count > 0)
        .max_by(|a, b| {
            a.1.cmp(&b.1)
                .then_with(|| b.2.cmp(&a.2))
                .then_with(|| b.0.cmp(&a.0))
        })
        .map(|(cargo, available, _)| (cargo, available.min(3)))
}

fn consume_cargo(sim: &mut Simulation, actor_idx: usize, cargo: &str, amount: u32) -> bool {
    let Some(actor) = sim.organisms.get_mut(actor_idx) else {
        return false;
    };
    let amount = u8::try_from(amount).unwrap_or(u8::MAX);
    let slot = match cargo {
        "food" => &mut actor.inv_food,
        "water" => &mut actor.inv_water,
        "wood" => &mut actor.inv_wood,
        "stone" => &mut actor.inv_stone,
        tool => {
            let Some(slot) = actor.tools.get_mut(tool) else {
                return false;
            };
            if *slot < amount {
                return false;
            }
            *slot -= amount;
            if *slot == 0 {
                actor.tools.remove(tool);
            }
            return true;
        }
    };
    if *slot < amount {
        return false;
    }
    *slot -= amount;
    true
}

fn route_direction(route: &TradeRoute, sender_lineage: &str) -> Option<([i32; 2], [i32; 2], String)> {
    if route.lineage_a == sender_lineage {
        Some((route.a_center, route.b_center, route.lineage_b.clone()))
    } else if route.lineage_b == sender_lineage {
        Some((route.b_center, route.a_center, route.lineage_a.clone()))
    } else {
        None
    }
}

fn dispatch_route_index(sim: &Simulation, actor_idx: usize, partner_lineage: Option<&str>) -> Option<usize> {
    let Some(actor) = sim.organisms.get(actor_idx).filter(|organism| organism.alive) else {
        return None;
    };
    if sim.caravans.len() >= MAX_CARAVANS || cargo_candidate(sim, actor_idx).is_none() {
        return None;
    }

    let actor_lineage = actor.lineage_id.clone();
    let mut candidates: Vec<(usize, usize, u64, u32)> = sim
        .trade_routes
        .iter()
        .enumerate()
        .filter_map(|(route_index, route)| {
            let receiver_lineage = if route.lineage_a == actor_lineage {
                route.lineage_b.as_str()
            } else if route.lineage_b == actor_lineage {
                route.lineage_a.as_str()
            } else {
                return None;
            };
            if partner_lineage.is_some_and(|requested| requested != receiver_lineage)
                || settlement_endpoints(sim, &actor_lineage, receiver_lineage).is_none()
            {
                return None;
            }
            let active = sim
                .caravans
                .iter()
                .filter(|caravan| caravan.route_id == route.id)
                .count();
            (active < MAX_CARAVANS_PER_ROUTE).then_some((
                route_index,
                active,
                route.last_dispatch_tick,
                route.id,
            ))
        })
        .collect();
    candidates.sort_unstable_by_key(|(_, active, last_dispatch_tick, route_id)| {
        (*active, *last_dispatch_tick, *route_id)
    });
    candidates.first().map(|(route_index, _, _, _)| *route_index)
}

pub fn can_dispatch_caravan(sim: &Simulation, actor_idx: usize) -> bool {
    dispatch_route_index(sim, actor_idx, None).is_some()
}

fn dispatch_caravan_on_route_index(sim: &mut Simulation, actor_idx: usize, route_index: usize) -> bool {
    let Some(actor) = sim.organisms.get(actor_idx).filter(|organism| organism.alive) else {
        return false;
    };
    let actor_lineage = actor.lineage_id.clone();
    let actor_id = actor.id.clone();
    let actor_name = actor.name.clone();
    let Some(route) = sim.trade_routes.get(route_index) else {
        return false;
    };
    let receiver_lineage = if route.lineage_a == actor_lineage {
        route.lineage_b.clone()
    } else if route.lineage_b == actor_lineage {
        route.lineage_a.clone()
    } else {
        return false;
    };
    let Some((actor_center, receiver_center)) = settlement_endpoints(sim, &actor_lineage, &receiver_lineage)
    else {
        return false;
    };
    let (canonical_a, canonical_a_center, canonical_b, canonical_b_center) = canonical_endpoints(
        actor_lineage.clone(),
        actor_center,
        receiver_lineage,
        receiver_center,
    );
    if route.lineage_a != canonical_a || route.lineage_b != canonical_b {
        return false;
    }
    let Some((cargo, amount)) = cargo_candidate(sim, actor_idx) else {
        return false;
    };
    let used_caravan_ids: HashSet<u32> = sim.caravans.iter().map(|caravan| caravan.id).collect();
    let Some(id) = allocate_available_id(&mut sim.next_caravan_id, &used_caravan_ids) else {
        return false;
    };

    {
        let route = &mut sim.trade_routes[route_index];
        route.a_center = canonical_a_center;
        route.b_center = canonical_b_center;
    }
    let Some((from, to, receiver_lineage)) = route_direction(&sim.trade_routes[route_index], &actor_lineage)
    else {
        return false;
    };
    if !valid_world_point(from) || !valid_world_point(to) {
        return false;
    }
    if !consume_cargo(sim, actor_idx, &cargo, amount) {
        return false;
    }

    let travel_ticks = manhattan_distance(from, to)
        .saturating_mul(4)
        .clamp(60, MAX_CARAVAN_TRAVEL_TICKS);
    let era = sim
        .lineage_eras
        .get(&actor_lineage)
        .copied()
        .unwrap_or(crate::sim::era::Era::Iron);
    let unit_price = PriceTable::for_era(era).price_for(era, &cargo).max(1).min(100);
    let route_id = sim.trade_routes[route_index].id;
    sim.trade_routes[route_index].last_dispatch_tick = sim.tick_count;
    sim.caravans.push(Caravan {
        id,
        route_id,
        sender_lineage: actor_lineage,
        receiver_lineage: receiver_lineage.clone(),
        sender_org_id: actor_id,
        cargo: cargo.clone(),
        amount,
        unit_price,
        departed_tick: sim.tick_count,
        arrives_tick: sim.tick_count.saturating_add(travel_ticks),
        from,
        to,
        dispatch_state: String::new(),
    });

    let receiver_name = sim
        .lineage_names
        .get(&receiver_lineage)
        .cloned()
        .unwrap_or(receiver_lineage);
    push_event(
        &mut sim.events,
        sim.tick_count,
        "trade",
        &actor_name,
        &format!("{actor_name} dispatched a caravan carrying {amount} {cargo} toward {receiver_name}"),
    );
    true
}

pub fn dispatch_caravan_on_route(sim: &mut Simulation, actor_idx: usize) -> bool {
    let Some(route_index) = dispatch_route_index(sim, actor_idx, None) else {
        return false;
    };
    dispatch_caravan_on_route_index(sim, actor_idx, route_index)
}

pub fn dispatch_caravan(sim: &mut Simulation, actor_idx: usize, partner_idx: usize) -> bool {
    let Some(actor) = sim.organisms.get(actor_idx).filter(|organism| organism.alive) else {
        return false;
    };
    let Some(partner) = sim.organisms.get(partner_idx).filter(|organism| organism.alive) else {
        return false;
    };
    if actor.lineage_id == partner.lineage_id {
        return false;
    }
    let partner_lineage = partner.lineage_id.clone();
    let Some(route_index) = dispatch_route_index(sim, actor_idx, Some(&partner_lineage)) else {
        return false;
    };
    dispatch_caravan_on_route_index(sim, actor_idx, route_index)
}

fn cargo_room(sim: &Simulation, organism_idx: usize, cargo: &str) -> u32 {
    let organism = &sim.organisms[organism_idx];
    match cargo {
        "food" | "water" | "wood" | "stone" => organism.carry_room(),
        tool => u32::from(u8::MAX.saturating_sub(organism.tools.get(tool).copied().unwrap_or(0))),
    }
}

fn add_cargo(sim: &mut Simulation, organism_idx: usize, cargo: &str, amount: u32) -> u32 {
    let room = cargo_room(sim, organism_idx, cargo);
    let accepted = amount.min(room).min(u32::from(u8::MAX));
    if accepted == 0 {
        return 0;
    }
    let accepted_u8 = accepted as u8;
    let organism = &mut sim.organisms[organism_idx];
    match cargo {
        "food" => organism.inv_food = organism.inv_food.saturating_add(accepted_u8),
        "water" => organism.inv_water = organism.inv_water.saturating_add(accepted_u8),
        "wood" => organism.inv_wood = organism.inv_wood.saturating_add(accepted_u8),
        "stone" => organism.inv_stone = organism.inv_stone.saturating_add(accepted_u8),
        tool => {
            let slot = organism.tools.entry(tool.to_string()).or_insert(0);
            *slot = slot.saturating_add(accepted_u8);
        }
    }
    accepted
}

fn ordered_recipients(sim: &Simulation, lineage_id: &str, destination: [i32; 2], cargo: &str) -> Vec<usize> {
    let mut recipients: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(idx, organism)| {
            organism.alive && organism.lineage_id == lineage_id && cargo_room(sim, *idx, cargo) > 0
        })
        .map(|(idx, _)| idx)
        .collect();
    recipients.sort_by(|left, right| {
        let left_org = &sim.organisms[*left];
        let right_org = &sim.organisms[*right];
        let left_distance = manhattan_distance([left_org.x as i32, left_org.y as i32], destination);
        let right_distance = manhattan_distance([right_org.x as i32, right_org.y as i32], destination);
        left_distance
            .cmp(&right_distance)
            .then_with(|| left_org.id.cmp(&right_org.id))
    });
    recipients
}

fn closest_sender(sim: &Simulation, caravan: &Caravan) -> Option<usize> {
    if let Some(index) = sim
        .organisms
        .iter()
        .position(|organism| organism.alive && organism.id == caravan.sender_org_id)
    {
        return Some(index);
    }
    sim.organisms
        .iter()
        .enumerate()
        .filter(|(_, organism)| organism.alive && organism.lineage_id == caravan.sender_lineage)
        .min_by(|(_, left), (_, right)| {
            let left_distance = manhattan_distance([left.x as i32, left.y as i32], caravan.from);
            let right_distance = manhattan_distance([right.x as i32, right.y as i32], caravan.from);
            left_distance
                .cmp(&right_distance)
                .then_with(|| left.id.cmp(&right.id))
        })
        .map(|(index, _)| index)
}

fn deliver_caravan(sim: &mut Simulation, caravan_id: u32) -> bool {
    let Some(caravan_index) = sim.caravans.iter().position(|caravan| caravan.id == caravan_id) else {
        return false;
    };
    let caravan = sim.caravans[caravan_index].clone();
    if caravan.amount == 0 || caravan.arrives_tick > sim.tick_count {
        return false;
    }

    let recipients = ordered_recipients(sim, &caravan.receiver_lineage, caravan.to, &caravan.cargo);
    let Some(&primary_recipient) = recipients.first() else {
        return false;
    };
    let mut remaining = caravan.amount;
    let mut delivered = 0u32;
    for recipient_idx in recipients {
        let accepted = add_cargo(sim, recipient_idx, &caravan.cargo, remaining);
        delivered = delivered.saturating_add(accepted);
        remaining = remaining.saturating_sub(accepted);
        if remaining == 0 {
            break;
        }
    }
    if delivered == 0 {
        return false;
    }

    let sender_idx = closest_sender(sim, &caravan);
    let requested_payment = caravan
        .unit_price
        .saturating_mul(delivered)
        .min(MAX_PAYMENT_PER_DELIVERY);
    let paid = if let Some(sender_idx) = sender_idx {
        let available = sim.organisms[primary_recipient].wealth;
        let paid = requested_payment.min(available);
        sim.organisms[primary_recipient].wealth =
            sim.organisms[primary_recipient].wealth.saturating_sub(paid);
        sim.organisms[sender_idx].wealth = sim.organisms[sender_idx].wealth.saturating_add(paid);
        paid
    } else {
        0
    };

    let buyer_id = sim.organisms[primary_recipient].id.clone();
    let buyer_name = sim.organisms[primary_recipient].name.clone();
    let seller_id = sender_idx
        .map(|index| sim.organisms[index].id.clone())
        .unwrap_or_else(|| caravan.sender_org_id.clone());
    sim.organisms[primary_recipient].update_attitude(&caravan.sender_lineage, 0.025);
    if let Some(sender_idx) = sender_idx {
        sim.organisms[sender_idx].update_attitude(&caravan.receiver_lineage, 0.025);
    }

    sim.trades.push_back(Trade {
        tick: sim.tick_count,
        buyer_id,
        seller_id,
        good: caravan.cargo.clone(),
        amount: delivered,
        price: paid,
    });
    while sim.trades.len() > TRADE_LOG_CAP {
        sim.trades.pop_front();
    }
    if let Some(route) = sim
        .trade_routes
        .iter_mut()
        .find(|route| route.id == caravan.route_id)
    {
        route.volume = route.volume.saturating_add(u64::from(delivered));
    }

    let completed = delivered >= caravan.amount;
    if completed {
        sim.caravans.remove(caravan_index);
        if let Some(route) = sim
            .trade_routes
            .iter_mut()
            .find(|route| route.id == caravan.route_id)
        {
            route.deliveries = route.deliveries.saturating_add(1);
        }
        sim.record_strategy_progress(&caravan.sender_lineage, "trade");
        sim.record_strategy_progress(&caravan.receiver_lineage, "trade");

        if !caravan.dispatch_state.is_empty() {
            if let Some(sender) = sim
                .organisms
                .iter_mut()
                .find(|organism| organism.alive && organism.id == caravan.sender_org_id)
            {
                let reward = (0.014 + delivered as f32 * 0.004 + paid as f32 * 0.000_04).clamp(0.014, 0.040);
                sender.learn(&caravan.dispatch_state, 288, reward, &caravan.dispatch_state);
            }
        }
    } else if let Some(active) = sim.caravans.get_mut(caravan_index) {
        active.amount = active.amount.saturating_sub(delivered);
    }

    let receiver_name = sim
        .lineage_names
        .get(&caravan.receiver_lineage)
        .cloned()
        .unwrap_or_else(|| caravan.receiver_lineage.clone());
    push_event(
        &mut sim.events,
        sim.tick_count,
        "trade",
        &buyer_name,
        &format!(
            "{buyer_name} unloaded {delivered} {} for {receiver_name}, paying {paid}",
            caravan.cargo
        ),
    );
    true
}

fn deliver_due_for_lineage(
    sim: &mut Simulation,
    lineage_id: &str,
    latest_arrival: u64,
    limit: usize,
) -> usize {
    let mut due_ids: Vec<(u64, u32)> = sim
        .caravans
        .iter()
        .filter(|caravan| caravan.receiver_lineage == lineage_id && caravan.arrives_tick <= latest_arrival)
        .map(|caravan| (caravan.arrives_tick, caravan.id))
        .collect();
    due_ids.sort_unstable();
    due_ids
        .into_iter()
        .take(limit)
        .filter(|(_, caravan_id)| deliver_caravan(sim, *caravan_id))
        .count()
}

pub fn receive_due_for_lineage(sim: &mut Simulation, lineage_id: &str) -> bool {
    if lineage_id.is_empty() {
        return false;
    }
    deliver_due_for_lineage(sim, lineage_id, sim.tick_count, 1) > 0
}

fn can_receive_due_for_lineage(sim: &Simulation, lineage_id: &str) -> bool {
    sim.caravans.iter().any(|caravan| {
        caravan.receiver_lineage == lineage_id
            && caravan.arrives_tick <= sim.tick_count
            && !ordered_recipients(sim, lineage_id, caravan.to, &caravan.cargo).is_empty()
    })
}

pub fn action_is_possible(sim: &Simulation, actor_idx: usize, action: usize, nearby: &[usize]) -> bool {
    let Some(actor) = sim.organisms.get(actor_idx).filter(|organism| organism.alive) else {
        return false;
    };
    match action {
        287 => {
            if sim.trade_routes.len() >= MAX_TRADE_ROUTES {
                return false;
            }
            nearby.iter().copied().any(|partner_idx| {
                let Some(partner) = sim.organisms.get(partner_idx).filter(|organism| organism.alive) else {
                    return false;
                };
                if partner.lineage_id == actor.lineage_id {
                    return false;
                }
                let Some((actor_center, partner_center)) =
                    settlement_endpoints(sim, &actor.lineage_id, &partner.lineage_id)
                else {
                    return false;
                };
                let (lineage_a, _, lineage_b, _) = canonical_endpoints(
                    actor.lineage_id.clone(),
                    actor_center,
                    partner.lineage_id.clone(),
                    partner_center,
                );
                !sim.trade_routes
                    .iter()
                    .any(|route| route.lineage_a == lineage_a && route.lineage_b == lineage_b)
            })
        }
        288 | 2704 => can_dispatch_caravan(sim, actor_idx),
        289 => can_receive_due_for_lineage(sim, &actor.lineage_id),
        _ => true,
    }
}

fn mark_caravan_roads(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let marks: Vec<(i32, i32)> = sim
        .caravans
        .iter()
        .filter(|caravan| caravan.departed_tick <= tick && tick < caravan.arrives_tick)
        .filter_map(|caravan| {
            let duration = caravan.arrives_tick.saturating_sub(caravan.departed_tick);
            if duration == 0 {
                return None;
            }
            let elapsed = tick.saturating_sub(caravan.departed_tick).min(duration);
            let progress = elapsed as f64 / duration as f64;
            let x = f64::from(caravan.from[0])
                + (f64::from(caravan.to[0]) - f64::from(caravan.from[0])) * progress;
            let y = f64::from(caravan.from[1])
                + (f64::from(caravan.to[1]) - f64::from(caravan.from[1])) * progress;
            Some((x.round() as i32, y.round() as i32))
        })
        .collect();
    for (x, y) in marks {
        if sim.grid.get(x, y).walkable() {
            sim.grid.leave_trail(x, y, TrailKind::Path, 0.18);
        }
    }
}

fn refresh_route_centers(sim: &mut Simulation) {
    let snapshots = settlements::snapshots(sim);
    let valid_lineages: HashSet<&str> = snapshots
        .iter()
        .filter(|settlement| settlement.tier >= 1)
        .map(|settlement| settlement.lineage_id.as_str())
        .collect();
    for route in &mut sim.trade_routes {
        if let Some(first) = snapshots
            .iter()
            .find(|settlement| settlement.lineage_id == route.lineage_a && settlement.tier >= 1)
        {
            route.a_center = first.center;
        }
        if let Some(second) = snapshots
            .iter()
            .find(|settlement| settlement.lineage_id == route.lineage_b && settlement.tier >= 1)
        {
            route.b_center = second.center;
        }
    }
    let active_route_ids: HashSet<u32> = sim.caravans.iter().map(|caravan| caravan.route_id).collect();
    sim.trade_routes.retain(|route| {
        active_route_ids.contains(&route.id)
            || (valid_lineages.contains(route.lineage_a.as_str())
                && valid_lineages.contains(route.lineage_b.as_str()))
    });
}

fn expire_stranded_caravans(sim: &mut Simulation) {
    let expired_ids: Vec<u32> = sim
        .caravans
        .iter()
        .filter(|caravan| sim.tick_count > caravan.arrives_tick.saturating_add(STRANDED_CARAVAN_TICKS))
        .map(|caravan| caravan.id)
        .collect();
    for caravan_id in expired_ids {
        let Some(index) = sim.caravans.iter().position(|caravan| caravan.id == caravan_id) else {
            continue;
        };
        let caravan = sim.caravans.remove(index);
        let returned = closest_sender(sim, &caravan)
            .map(|sender_idx| add_cargo(sim, sender_idx, &caravan.cargo, caravan.amount))
            .unwrap_or(0);
        let sender_name = sim
            .lineage_names
            .get(&caravan.sender_lineage)
            .cloned()
            .unwrap_or_else(|| caravan.sender_lineage.clone());
        let lost = caravan.amount.saturating_sub(returned);
        let detail = if returned == caravan.amount {
            format!(
                "{sender_name}'s long-delayed caravan returned with {returned} {}",
                caravan.cargo
            )
        } else if returned > 0 {
            format!(
                "{sender_name}'s long-delayed caravan returned {returned} {} but lost {lost}",
                caravan.cargo
            )
        } else {
            format!("{sender_name}'s caravan was lost after its cargo could not be unloaded or returned")
        };
        push_event(&mut sim.events, sim.tick_count, "trade", &sender_name, &detail);
    }
}

pub fn tick(sim: &mut Simulation) {
    if sim.tick_count.is_multiple_of(ROAD_MARK_TICKS) {
        mark_caravan_roads(sim);
    }
    if sim.tick_count.is_multiple_of(ROUTE_REFRESH_TICKS) {
        expire_stranded_caravans(sim);
        refresh_route_centers(sim);
    }
    if sim.tick_count < AUTO_UNLOAD_GRACE_TICKS {
        return;
    }

    let latest_arrival = sim.tick_count.saturating_sub(AUTO_UNLOAD_GRACE_TICKS);
    let due_lineages: BTreeSet<String> = sim
        .caravans
        .iter()
        .filter(|caravan| caravan.arrives_tick <= latest_arrival)
        .map(|caravan| caravan.receiver_lineage.clone())
        .collect();
    let mut remaining = MAX_AUTOMATIC_DELIVERIES_PER_TICK;
    for lineage in due_lineages {
        if remaining == 0 {
            break;
        }
        let delivered = deliver_due_for_lineage(sim, &lineage, latest_arrival, remaining);
        remaining = remaining.saturating_sub(delivered);
    }
}

/// Normalize persisted state before a loaded world resumes. Invalid imports
/// cannot inject duplicate route pairs/IDs or orphan caravans that permanently
/// consume the bounded active slots.
pub(crate) fn repair_loaded_state(sim: &mut Simulation) {
    for route in &mut sim.trade_routes {
        if route.lineage_a > route.lineage_b {
            std::mem::swap(&mut route.lineage_a, &mut route.lineage_b);
            std::mem::swap(&mut route.a_center, &mut route.b_center);
        }
    }
    sim.trade_routes.sort_by_key(|route| route.id);
    let mut route_ids = HashSet::new();
    let mut route_pairs = HashSet::new();
    sim.trade_routes.retain(|route| {
        route.id > 0
            && route.id < u32::MAX
            && !route.lineage_a.is_empty()
            && route.lineage_a != route.lineage_b
            && valid_world_point(route.a_center)
            && valid_world_point(route.b_center)
            && route_ids.insert(route.id)
            && route_pairs.insert((route.lineage_a.clone(), route.lineage_b.clone()))
    });
    sim.trade_routes.truncate(MAX_TRADE_ROUTES);

    let valid_routes: HashMap<u32, (String, String)> = sim
        .trade_routes
        .iter()
        .map(|route| (route.id, (route.lineage_a.clone(), route.lineage_b.clone())))
        .collect();
    sim.caravans.sort_by_key(|caravan| caravan.id);
    for caravan in &mut sim.caravans {
        if caravan.dispatch_state.chars().count() > 512 {
            caravan.dispatch_state = caravan.dispatch_state.chars().take(512).collect();
        }
    }
    let mut caravan_ids = HashSet::new();
    let mut caravans_per_route = HashMap::<u32, usize>::new();
    sim.caravans.retain(|caravan| {
        let route_matches = valid_routes
            .get(&caravan.route_id)
            .is_some_and(|(lineage_a, lineage_b)| {
                (caravan.sender_lineage.as_str() == lineage_a
                    && caravan.receiver_lineage.as_str() == lineage_b)
                    || (caravan.sender_lineage.as_str() == lineage_b
                        && caravan.receiver_lineage.as_str() == lineage_a)
            });
        let valid = caravan.id > 0
            && caravan.id < u32::MAX
            && caravan_ids.insert(caravan.id)
            && route_matches
            && caravan.sender_lineage != caravan.receiver_lineage
            && !caravan.sender_lineage.is_empty()
            && !caravan.receiver_lineage.is_empty()
            && !caravan.cargo.is_empty()
            && caravan.cargo.len() <= 64
            && caravan.amount > 0
            && caravan.amount <= u32::from(u8::MAX)
            && caravan.departed_tick <= sim.tick_count
            && caravan.arrives_tick >= caravan.departed_tick
            && caravan.arrives_tick - caravan.departed_tick <= MAX_CARAVAN_TRAVEL_TICKS
            && valid_world_point(caravan.from)
            && valid_world_point(caravan.to);
        if !valid {
            return false;
        }
        let route_count = caravans_per_route.entry(caravan.route_id).or_default();
        if *route_count >= MAX_CARAVANS_PER_ROUTE {
            return false;
        }
        *route_count += 1;
        true
    });
    sim.caravans.truncate(MAX_CARAVANS);

    if sim.next_trade_route_id == u32::MAX {
        sim.next_trade_route_id = 1;
    }
    if sim.next_caravan_id == u32::MAX {
        sim.next_caravan_id = 1;
    }
    sim.next_trade_route_id = sim
        .trade_routes
        .iter()
        .fold(sim.next_trade_route_id.max(1), |next, route| {
            next.max(route.id.saturating_add(1))
        });
    sim.next_caravan_id = sim
        .caravans
        .iter()
        .fold(sim.next_caravan_id.max(1), |next, caravan| {
            next.max(caravan.id.saturating_add(1))
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::buildings::{Building, BuildingKind};

    fn completed_hut(id: u32, lineage_id: &str, x: i32, y: i32) -> Building {
        let mut building = Building::new(id, BuildingKind::Hut, x, y, Some(lineage_id.into()), 1);
        building.condition = 1.0;
        building
    }

    fn trade_sim() -> Simulation {
        let mut sim = Simulation::new(0x7ADE);
        sim.organisms.truncate(4);
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            let river = index < 2;
            organism.alive = true;
            organism.lineage_id = if river { "river" } else { "hill" }.into();
            organism.x = if river {
                100.0 + index as f32
            } else {
                220.0 + (index - 2) as f32
            };
            organism.y = if river { 100.0 } else { 160.0 };
            organism.home_x = organism.x;
            organism.home_y = organism.y;
            organism.inv_food = 0;
            organism.inv_water = 0;
            organism.inv_wood = 0;
            organism.inv_stone = 0;
            organism.tools.clear();
            organism.wealth = if river { 0 } else { 20 };
        }
        sim.lineage_names.insert("river".into(), "River Folk".into());
        sim.lineage_names.insert("hill".into(), "Hill Folk".into());
        sim.buildings.clear();
        sim.buildings.push(completed_hut(1, "river", 100, 100));
        sim.buildings.push(completed_hut(2, "hill", 220, 160));
        sim
    }

    #[test]
    fn route_dispatch_and_delivery_move_real_cargo_once() {
        let mut sim = trade_sim();
        sim.organisms[0].inv_wood = 3;

        assert!(establish_route(&mut sim, 0, 2));
        assert!(!establish_route(&mut sim, 0, 2));
        assert_eq!(sim.trade_routes.len(), 1);
        assert!(dispatch_caravan_on_route(&mut sim, 0));
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.caravans.len(), 1);

        let arrival = sim.caravans[0].arrives_tick;
        sim.tick_count = arrival;
        assert!(receive_due_for_lineage(&mut sim, "hill"));
        assert!(sim.caravans.is_empty());
        assert_eq!(
            sim.organisms
                .iter()
                .filter(|organism| organism.lineage_id == "hill")
                .map(|organism| u32::from(organism.inv_wood))
                .sum::<u32>(),
            3
        );
        assert_eq!(sim.trade_routes[0].deliveries, 1);
        assert_eq!(sim.trade_routes[0].volume, 3);
        assert_eq!(sim.trades.back().map(|trade| trade.amount), Some(3));
        assert_eq!(sim.organisms[0].wealth, 3);
    }

    #[test]
    fn automatic_delivery_preserves_the_manual_unload_window() {
        let mut sim = trade_sim();
        sim.organisms[0].inv_food = 2;
        assert!(establish_route(&mut sim, 0, 2));
        assert!(dispatch_caravan_on_route(&mut sim, 0));

        let arrival = sim.caravans[0].arrives_tick;
        sim.tick_count = arrival;
        tick(&mut sim);
        assert_eq!(sim.caravans.len(), 1);

        sim.tick_count = arrival + AUTO_UNLOAD_GRACE_TICKS;
        tick(&mut sim);
        assert!(sim.caravans.is_empty());
        assert_eq!(sim.trade_routes[0].deliveries, 1);
    }

    #[test]
    fn route_caravan_and_delayed_credit_state_survive_reload() {
        let mut sim = trade_sim();
        sim.organisms[0].inv_wood = 2;
        assert!(establish_route(&mut sim, 0, 2));
        assert!(dispatch_caravan_on_route(&mut sim, 0));
        sim.caravans[0].dispatch_state = "hungry:0|water:2|foreign:1".into();
        let route_id = sim.trade_routes[0].id;
        let caravan_id = sim.caravans[0].id;
        let seed = sim.world_seed;

        let loaded = Simulation::from_save(seed, sim.to_save_state());

        assert_eq!(loaded.trade_routes.len(), 1);
        assert_eq!(loaded.trade_routes[0].id, route_id);
        assert_eq!(loaded.caravans.len(), 1);
        assert_eq!(loaded.caravans[0].id, caravan_id);
        assert_eq!(loaded.caravans[0].dispatch_state, "hungry:0|water:2|foreign:1");
        assert!(loaded.next_trade_route_id > route_id);
        assert!(loaded.next_caravan_id > caravan_id);
    }

    #[test]
    fn overdue_full_destination_returns_cargo_and_frees_the_route() {
        let mut sim = trade_sim();
        sim.organisms[0].inv_stone = 3;
        assert!(establish_route(&mut sim, 0, 2));
        assert!(dispatch_caravan_on_route(&mut sim, 0));
        for organism in sim
            .organisms
            .iter_mut()
            .filter(|organism| organism.lineage_id == "hill")
        {
            organism.inv_food = u8::MAX;
        }

        let overdue = sim.caravans[0]
            .arrives_tick
            .saturating_add(STRANDED_CARAVAN_TICKS)
            .saturating_add(1);
        sim.tick_count = overdue.div_ceil(ROUTE_REFRESH_TICKS) * ROUTE_REFRESH_TICKS;
        tick(&mut sim);

        assert!(sim.caravans.is_empty());
        assert_eq!(sim.organisms[0].inv_stone, 3);
    }

    #[test]
    fn load_repair_rejects_unsafe_ids_points_and_per_route_overflow() {
        let mut sim = trade_sim();
        sim.tick_count = 10;
        assert!(establish_route(&mut sim, 0, 2));
        let valid_route = sim.trade_routes[0].clone();
        sim.trade_routes.push(TradeRoute {
            id: u32::MAX,
            lineage_a: "bad-a".into(),
            lineage_b: "bad-b".into(),
            a_center: [i32::MIN, 0],
            b_center: [i32::MAX, 0],
            ..TradeRoute::default()
        });
        sim.caravans = (1..=6)
            .map(|id| Caravan {
                id,
                route_id: valid_route.id,
                sender_lineage: "river".into(),
                receiver_lineage: "hill".into(),
                sender_org_id: sim.organisms[0].id.clone(),
                cargo: "wood".into(),
                amount: 1,
                unit_price: 1,
                departed_tick: 10,
                arrives_tick: 20,
                from: valid_route
                    .lineage_a
                    .eq("river")
                    .then_some(valid_route.a_center)
                    .unwrap_or(valid_route.b_center),
                to: valid_route
                    .lineage_a
                    .eq("hill")
                    .then_some(valid_route.a_center)
                    .unwrap_or(valid_route.b_center),
                dispatch_state: "state".repeat(600),
            })
            .collect();
        sim.next_trade_route_id = u32::MAX;
        sim.next_caravan_id = u32::MAX;

        repair_loaded_state(&mut sim);

        assert_eq!(sim.trade_routes.len(), 1);
        assert_eq!(sim.caravans.len(), MAX_CARAVANS_PER_ROUTE);
        assert!(sim
            .caravans
            .iter()
            .all(|caravan| caravan.dispatch_state.chars().count() <= 512));
        assert_eq!(sim.next_trade_route_id, valid_route.id + 1);
        assert_eq!(
            sim.next_caravan_id,
            sim.caravans.iter().map(|caravan| caravan.id).max().unwrap() + 1
        );
    }

    #[test]
    fn load_repair_drops_future_and_unbounded_caravan_clocks() {
        let mut sim = trade_sim();
        sim.tick_count = 100;
        assert!(establish_route(&mut sim, 0, 2));
        let route = sim.trade_routes[0].clone();
        let (from, to, receiver_lineage) = route_direction(&route, "river").unwrap();
        let sender_org_id = sim.organisms[0].id.clone();
        let caravan = |id, departed_tick, arrives_tick| Caravan {
            id,
            route_id: route.id,
            sender_lineage: "river".into(),
            receiver_lineage: receiver_lineage.clone(),
            sender_org_id: sender_org_id.clone(),
            cargo: "wood".into(),
            amount: 1,
            unit_price: 1,
            departed_tick,
            arrives_tick,
            from,
            to,
            dispatch_state: String::new(),
        };
        sim.caravans = vec![caravan(1, 50, 100), caravan(2, 101, 110), caravan(3, 0, u64::MAX)];

        repair_loaded_state(&mut sim);

        assert_eq!(
            sim.caravans.iter().map(|caravan| caravan.id).collect::<Vec<_>>(),
            vec![1]
        );
    }

    #[test]
    fn id_allocator_wraps_around_exhausting_imported_ids() {
        let used = HashSet::from([1, u32::MAX - 1]);
        let mut next = u32::MAX - 1;

        assert_eq!(allocate_available_id(&mut next, &used), Some(2));
        assert_eq!(next, 3);
    }
}
