use super::*;

pub(super) fn cargo_room(sim: &Simulation, organism_idx: usize, cargo: &str) -> u32 {
    let organism = &sim.organisms[organism_idx];
    match cargo {
        "food" | "water" | "wood" | "stone" => organism.carry_room(),
        land if is_land_good(land) => organism.land_good_room(land),
        tool => u32::from(u8::MAX.saturating_sub(organism.tools.get(tool).copied().unwrap_or(0))),
    }
}

pub(super) fn add_cargo(sim: &mut Simulation, organism_idx: usize, cargo: &str, amount: u32) -> u32 {
    let room = cargo_room(sim, organism_idx, cargo);
    let accepted = amount.min(room).min(u32::from(u8::MAX));
    if accepted == 0 {
        return 0;
    }
    let accepted_u8 = accepted as u8;
    let organism = &mut sim.organisms[organism_idx];
    if is_land_good(cargo) {
        return u32::from(organism.add_land_good(cargo, accepted_u8));
    }
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

pub(super) fn ordered_recipients(
    sim: &Simulation,
    lineage_id: &str,
    destination: [i32; 2],
    cargo: &str,
) -> Vec<usize> {
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

pub(super) fn closest_sender(sim: &Simulation, caravan: &Caravan) -> Option<usize> {
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

pub(super) fn deliver_caravan(sim: &mut Simulation, caravan_id: u32) -> bool {
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

    if paid > 0 {
        *sim.trade_income
            .entry(caravan.sender_lineage.clone())
            .or_insert(0) += u64::from(paid);
    }

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
    let mut first_arrival = false;
    if completed {
        sim.caravans.remove(caravan_index);
        if let Some(route) = sim
            .trade_routes
            .iter_mut()
            .find(|route| route.id == caravan.route_id)
        {
            first_arrival = route.deliveries == 0;
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
    if first_arrival {
        // The chronicle's news view shows this once per route: the first time
        // two tribes' caravans have really reached each other.
        let sender_name = sim
            .lineage_names
            .get(&caravan.sender_lineage)
            .cloned()
            .unwrap_or_else(|| caravan.sender_lineage.clone());
        push_event(
            &mut sim.events,
            sim.tick_count,
            "trade_route",
            &sender_name,
            &format!(
                "the first caravan from {sender_name} reached {receiver_name}, bringing {delivered} {}",
                caravan.cargo
            ),
        );
    }
    true
}

pub(super) fn deliver_due_for_lineage(
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

pub(super) fn can_receive_due_for_lineage(sim: &Simulation, lineage_id: &str) -> bool {
    sim.caravans.iter().any(|caravan| {
        caravan.receiver_lineage == lineage_id
            && caravan.arrives_tick <= sim.tick_count
            && !ordered_recipients(sim, lineage_id, caravan.to, &caravan.cargo).is_empty()
    })
}
