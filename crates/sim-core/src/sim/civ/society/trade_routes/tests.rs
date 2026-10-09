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
            from: if valid_route.lineage_a == "river" {
                valid_route.a_center
            } else {
                valid_route.b_center
            },
            to: if valid_route.lineage_a == "hill" {
                valid_route.a_center
            } else {
                valid_route.b_center
            },
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
    let used = HashSet::from_iter([1, u32::MAX - 1]);
    let mut next = u32::MAX - 1;

    assert_eq!(allocate_available_id(&mut next, &used), Some(2));
    assert_eq!(next, 3);
}

#[test]
fn snow_holds_caravans_back_on_the_road() {
    let mut sim = Simulation::new(0x5A0E);
    sim.caravans.clear();
    sim.caravans.push(Caravan {
        id: 1,
        route_id: 1,
        sender_lineage: "river".into(),
        receiver_lineage: "hill".into(),
        sender_org_id: "sender".into(),
        cargo: "wood".into(),
        amount: 1,
        unit_price: 1,
        departed_tick: 100,
        arrives_tick: 200,
        from: [10, 10],
        to: [40, 10],
        dispatch_state: String::new(),
    });
    sim.tick_count = 150;
    sim.weather.kind = 3;
    super::upkeep::slow_caravans_in_snow(&mut sim);
    assert_eq!(
        sim.caravans[0].arrives_tick, 201,
        "one tick of snow adds one tick of journey"
    );

    sim.weather.kind = 0;
    super::upkeep::slow_caravans_in_snow(&mut sim);
    assert_eq!(
        sim.caravans[0].arrives_tick, 201,
        "clear weather leaves the journey alone"
    );
}

/// Moves the hill tribe close enough to the river tribe for a merchant route.
fn neighbouring_trade_sim() -> Simulation {
    let mut sim = trade_sim();
    for (index, organism) in sim.organisms.iter_mut().enumerate() {
        if organism.lineage_id == "hill" {
            organism.x = 140.0 + (index % 2) as f32;
            organism.y = 110.0;
            organism.home_x = organism.x;
            organism.home_y = organism.y;
        }
    }
    sim.buildings.clear();
    sim.buildings.push(completed_hut(1, "river", 100, 100));
    sim.buildings.push(completed_hut(2, "hill", 140, 110));
    sim
}

#[test]
fn a_merchant_opens_a_route_and_loads_a_spare_good_from_their_tribe() {
    let mut sim = neighbouring_trade_sim();
    sim.organisms[0].specialty = Some("merchant".into());
    sim.organisms[1].inv_food = 5;

    open_merchant_routes(&mut sim);
    assert_eq!(
        sim.trade_routes.len(),
        1,
        "a merchant opens a route to a tribe nearby"
    );

    run_merchant_caravans(&mut sim);
    assert_eq!(sim.caravans.len(), 1);
    let caravan = &sim.caravans[0];
    assert_eq!(caravan.cargo, "food");
    assert_eq!(caravan.amount, MERCHANT_LOAD);
    // The receiving tribe has no food at all, so the Iron-age price for food (2) is doubled.
    assert_eq!(caravan.unit_price, 4, "scarcity doubles the price of the good");
    assert_eq!(caravan.sender_org_id, sim.organisms[0].id);
    assert_eq!(
        sim.organisms[1].inv_food, 2,
        "the donor keeps a reserve of two food"
    );
    assert_eq!(sim.organisms[0].inv_food, 0, "the merchant carries it away");

    run_merchant_caravans(&mut sim);
    assert_eq!(sim.caravans.len(), 1, "a route waits between caravans");

    let arrival = sim.caravans[0].arrives_tick;
    sim.tick_count = arrival;
    assert!(receive_due_for_lineage(&mut sim, "hill"));
    let first: Vec<_> = sim
        .events
        .iter()
        .filter(|event| event.etype == "trade_route")
        .collect();
    assert_eq!(first.len(), 1, "the first arrival on a route is chronicled once");
    assert!(first[0].news, "the first caravan is news");
    assert!(first[0]
        .detail
        .starts_with("the first caravan from River Folk reached Hill Folk"));
}

#[test]
fn no_caravan_leaves_without_a_merchant_or_a_spare_good() {
    let mut sim = neighbouring_trade_sim();
    sim.organisms[1].inv_food = 5;
    open_merchant_routes(&mut sim);
    assert!(sim.trade_routes.is_empty(), "no merchant, no route");

    sim.organisms[0].specialty = Some("merchant".into());
    open_merchant_routes(&mut sim);
    assert_eq!(sim.trade_routes.len(), 1);
    sim.organisms[1].inv_food = 1;
    run_merchant_caravans(&mut sim);
    assert!(sim.caravans.is_empty(), "one unit is the donor's own food");
}
