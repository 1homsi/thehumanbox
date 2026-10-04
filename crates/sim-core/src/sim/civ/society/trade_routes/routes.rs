use super::*;

pub(super) fn canonical_endpoints(
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

pub(super) fn allocate_available_id(next: &mut u32, used: &HashSet<u32>) -> Option<u32> {
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

pub(super) fn valid_world_point([x, y]: [i32; 2]) -> bool {
    x >= 0 && y >= 0 && x < WIDTH as i32 && y < HEIGHT as i32
}

pub(super) fn manhattan_distance(first: [i32; 2], second: [i32; 2]) -> u64 {
    u64::from(first[0].abs_diff(second[0])) + u64::from(first[1].abs_diff(second[1]))
}

pub(super) fn settlement_endpoints(
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
