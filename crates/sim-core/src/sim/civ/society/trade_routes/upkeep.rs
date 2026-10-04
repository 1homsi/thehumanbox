use super::*;

pub(super) fn mark_caravan_roads(sim: &mut Simulation) {
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

pub(super) fn refresh_route_centers(sim: &mut Simulation) {
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

pub(super) fn expire_stranded_caravans(sim: &mut Simulation) {
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
    let mut route_ids = HashSet::default();
    let mut route_pairs = HashSet::default();
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
    let mut caravan_ids = HashSet::default();
    let mut caravans_per_route = HashMap::<u32, usize>::default();
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
