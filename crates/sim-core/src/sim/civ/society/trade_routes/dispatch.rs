use super::*;

pub(super) fn cargo_candidate(sim: &Simulation, actor_idx: usize) -> Option<(String, u32)> {
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

pub(super) fn consume_cargo(sim: &mut Simulation, actor_idx: usize, cargo: &str, amount: u32) -> bool {
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

pub(super) fn route_direction(
    route: &TradeRoute,
    sender_lineage: &str,
) -> Option<([i32; 2], [i32; 2], String)> {
    if route.lineage_a == sender_lineage {
        Some((route.a_center, route.b_center, route.lineage_b.clone()))
    } else if route.lineage_b == sender_lineage {
        Some((route.b_center, route.a_center, route.lineage_a.clone()))
    } else {
        None
    }
}

pub(super) fn dispatch_route_index(
    sim: &Simulation,
    actor_idx: usize,
    partner_lineage: Option<&str>,
) -> Option<usize> {
    let actor = sim.organisms.get(actor_idx).filter(|organism| organism.alive)?;
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

pub(super) fn dispatch_caravan_on_route_index(
    sim: &mut Simulation,
    actor_idx: usize,
    route_index: usize,
) -> bool {
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
    let unit_price = PriceTable::for_era(era).price_for(era, &cargo).clamp(1, 100);
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
