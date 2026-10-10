use super::*;
use crate::sim::buildings::{Building, BuildingKind};

fn completed_hut(id: u32, lineage_id: &str, x: i32, y: i32) -> Building {
    let mut building = Building::new(id, BuildingKind::Hut, x, y, Some(lineage_id.into()), 1);
    building.condition = 1.0;
    building
}

fn trade_sim() -> Simulation {
    let mut sim = Simulation::new(0x7ADE);
    // Both tribes are in the Bronze age, so their trade is paid in coin (the Stone age barters).
    sim.lineage_eras
        .insert("river".into(), crate::sim::era::Era::Bronze);
    sim.lineage_eras
        .insert("hill".into(), crate::sim::era::Era::Bronze);
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
fn the_tribe_that_sells_earns_the_coin_and_keeps_it_across_a_reload() {
    let mut sim = neighbouring_trade_sim();
    sim.organisms[0].specialty = Some("merchant".into());
    sim.organisms[1].inv_food = 5;
    open_merchant_routes(&mut sim);
    run_merchant_caravans(&mut sim);
    assert_eq!(sim.caravans.len(), 1);
    assert!(
        sim.trade_income.is_empty(),
        "nothing is earned until the goods arrive"
    );

    sim.tick_count = sim.caravans[0].arrives_tick;
    assert!(receive_due_for_lineage(&mut sim, "hill"));
    let earned = sim.trade_income.get("river").copied().unwrap_or(0);
    assert!(earned > 0, "the river tribe sold food and was paid for it");
    assert!(!sim.trade_income.contains_key("hill"), "the buyer earns nothing");

    let loaded = Simulation::from_save(sim.world_seed, sim.to_save_state());
    assert_eq!(loaded.trade_income.get("river").copied(), Some(earned));
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

#[test]
fn a_merchant_carries_a_land_good_the_other_tribe_lacks() {
    let mut sim = neighbouring_trade_sim();
    sim.organisms[0].specialty = Some("merchant".into());
    // The river tribe makes clay in the marsh; the hill tribe has none.
    sim.organisms[1].add_land_good("clay", 4);
    open_merchant_routes(&mut sim);

    run_merchant_caravans(&mut sim);
    assert_eq!(sim.caravans.len(), 1);
    let caravan = &sim.caravans[0];
    assert_eq!(caravan.cargo, "clay", "clay is the good the tribe has to spare");
    assert_eq!(caravan.amount, MERCHANT_LOAD);
    assert!(caravan.unit_price >= 1, "clay has a price");
    assert_eq!(
        sim.organisms[1].land_good_count("clay"),
        1,
        "the donor gives clay away, keeping none back"
    );
    assert_eq!(
        sim.organisms[0].land_good_count("clay"),
        0,
        "the merchant carries it off"
    );

    sim.tick_count = sim.caravans[0].arrives_tick;
    assert!(receive_due_for_lineage(&mut sim, "hill"));
    let received: u32 = sim
        .organisms
        .iter()
        .filter(|organism| organism.lineage_id == "hill")
        .map(|organism| u32::from(organism.land_good_count("clay")))
        .sum();
    assert_eq!(received, MERCHANT_LOAD, "the hill tribe receives the clay");
}

#[test]
fn land_goods_are_held_up_to_the_cap_per_person() {
    let mut organism = trade_sim().organisms.swap_remove(0);
    assert_eq!(organism.add_land_good("salt", 5), 5);
    assert_eq!(organism.add_land_good("salt", 9), 3, "the cap is eight per good");
    assert_eq!(organism.land_good_count("salt"), 8);
    assert!(organism.take_land_good("salt", 8));
    assert_eq!(organism.land_good_count("salt"), 0);
    assert!(!organism.take_land_good("salt", 1));
}

#[test]
fn staples_go_before_land_goods_when_both_are_spare() {
    let mut sim = neighbouring_trade_sim();
    sim.organisms[0].specialty = Some("merchant".into());
    // The river tribe has food and clay to spare; the hill tribe lacks both.
    sim.organisms[1].inv_food = 6;
    sim.organisms[1].add_land_good("clay", 6);
    open_merchant_routes(&mut sim);

    run_merchant_caravans(&mut sim);
    assert_eq!(sim.caravans.len(), 1);
    assert_eq!(
        sim.caravans[0].cargo, "food",
        "a staple takes the caravan before a land good"
    );
    assert_eq!(
        sim.organisms[1].land_good_count("clay"),
        6,
        "the clay stays at home this time"
    );
}

/// A battle between two tribes that is still on.
fn ongoing_battle(a: &str, b: &str) -> crate::sim::civ::warfare::Battle {
    use crate::sim::civ::warfare::{Battle, BattleScale};
    Battle {
        id: "war".into(),
        attackers: vec![a.into()],
        defenders: vec![b.into()],
        attacker_orgs: Vec::new(),
        defender_orgs: Vec::new(),
        scale: BattleScale::Raid,
        location: (0, 0),
        started_tick: 0,
        ended_tick: None,
        casualties_a: 0,
        casualties_d: 0,
        outcome: None,
        initial_a: 0,
        initial_d: 0,
    }
}

#[test]
fn a_trade_agreement_halves_the_wait_between_caravans() {
    use crate::sim::civ::warfare::{establish_treaty, TreatyKind};
    let mut sim = neighbouring_trade_sim();
    sim.organisms[0].specialty = Some("merchant".into());
    open_merchant_routes(&mut sim);
    assert!(establish_treaty(
        &mut sim.treaties,
        &mut sim.organisms,
        "river",
        "hill",
        TreatyKind::Trade,
        0,
        100_000,
    ));
    sim.tick_count = 1_000;
    sim.organisms[1].inv_food = 5;
    run_merchant_caravans(&mut sim);
    assert_eq!(sim.caravans.len(), 1);
    sim.caravans.clear();

    sim.tick_count += CARAVAN_INTERVAL_TICKS / 2;
    sim.organisms[1].inv_food = 5;
    run_merchant_caravans(&mut sim);
    assert_eq!(
        sim.caravans.len(),
        1,
        "a tribe under a trade agreement sends again sooner"
    );
}

#[test]
fn a_war_stops_caravans_and_raids_the_ones_on_the_road() {
    let mut sim = neighbouring_trade_sim();
    sim.organisms[0].specialty = Some("merchant".into());
    sim.organisms[1].inv_food = 5;
    open_merchant_routes(&mut sim);
    sim.battles.push(ongoing_battle("river", "hill"));

    run_merchant_caravans(&mut sim);
    assert!(
        sim.caravans.is_empty(),
        "no caravan leaves while the two tribes are at war"
    );

    sim.battles.clear();
    run_merchant_caravans(&mut sim);
    assert_eq!(sim.caravans.len(), 1, "the road opens again once the war is over");
    let departed = sim.caravans[0].departed_tick;
    sim.caravans[0].arrives_tick = departed + 1_000;
    sim.battles.push(ongoing_battle("river", "hill"));
    for _ in 0..200 {
        sim.tick_count += MERCHANT_DISPATCH_SCAN_TICKS;
        raid_embargoed_caravans(&mut sim);
        if sim.caravans.is_empty() {
            break;
        }
    }
    assert!(
        sim.caravans.is_empty(),
        "bandits seize a caravan on a road closed by war"
    );
    assert!(sim
        .events
        .iter()
        .any(|event| event.etype == "trade" && event.detail.contains("bandits in the war")));
}

#[test]
fn a_road_stays_closed_for_a_while_after_the_last_battle_so_the_barrier_can_be_seen() {
    let mut sim = neighbouring_trade_sim();
    sim.tick_count = 5_000;
    let mut battle = ongoing_battle("river", "hill");
    battle.ended_tick = Some(4_950);
    sim.battles.push(battle);
    assert!(
        route_is_embargoed(&sim, "river", "hill"),
        "a battle that ended 50 ticks ago still closes the road"
    );
    assert!(!route_is_embargoed(&sim, "river", "river"));

    sim.tick_count = 4_950 + WAR_ROAD_TICKS;
    assert!(
        !route_is_embargoed(&sim, "river", "hill"),
        "the road reopens once the window after the last battle has passed"
    );
}

#[test]
fn before_money_a_tribe_is_paid_in_food_and_no_coin_changes_hands() {
    let mut sim = neighbouring_trade_sim();
    sim.lineage_eras
        .insert("river".into(), crate::sim::era::Era::Stone);
    sim.organisms[0].specialty = Some("merchant".into());
    sim.organisms[1].inv_food = 5;
    open_merchant_routes(&mut sim);
    run_merchant_caravans(&mut sim);
    sim.tick_count = sim.caravans[0].arrives_tick;
    // The buyers want food but hold some of their own to give in exchange.
    for organism in sim.organisms.iter_mut().filter(|o| o.lineage_id == "hill") {
        organism.inv_food = 0;
        organism.inv_stone = 3;
        organism.wealth = 0;
    }
    assert!(receive_due_for_lineage(&mut sim, "hill"));
    assert!(sim.trade_income.is_empty(), "no coin is earned before money");
    assert!(
        sim.trade_barter.get("river").copied().unwrap_or(0) > 0,
        "the river tribe was paid in food"
    );
    assert!(
        !sim.trade_barter.contains_key("hill"),
        "the buyer gives food and gets none back"
    );
}

#[test]
fn a_tribe_holding_most_of_one_land_good_becomes_known_for_it() {
    use super::specialty::{update_specialties, SPECIALTY_TICKS};
    let mut sim = trade_sim();
    sim.organisms[0].add_land_good("ore", 8);
    sim.organisms[1].add_land_good("ore", 8);
    sim.tick_count = SPECIALTY_TICKS;
    update_specialties(&mut sim);
    assert_eq!(specialty_good_of(&sim, "river"), Some("ore"));
    assert_eq!(
        specialty_good_of(&sim, "hill"),
        None,
        "a tribe with no land goods has no specialty"
    );
    assert!(
        sim.events
            .iter()
            .any(|event| event.etype == "trade" && event.detail.contains("mining town")),
        "the chronicle names the new specialty"
    );

    for index in 0..2 {
        assert!(sim.organisms[index].take_land_good("ore", 8));
        sim.organisms[index].add_land_good("salt", 8);
    }
    sim.tick_count = 2 * SPECIALTY_TICKS;
    update_specialties(&mut sim);
    assert_eq!(
        specialty_good_of(&sim, "river"),
        Some("salt"),
        "a tribe that comes to hold mostly another good changes its specialty"
    );
}

#[test]
fn a_market_day_brings_coin_to_a_tribe_with_a_working_market() {
    use super::market::{market_days, MARKET_DAY_TICKS};
    let mut sim = Simulation::new(0x7ADE);
    for (index, organism) in sim.organisms.iter_mut().enumerate() {
        organism.alive = true;
        organism.lineage_id = if index < 8 { "river" } else { "hill" }.into();
    }
    let mut market = Building::new(1, BuildingKind::Market, 100, 100, Some("river".into()), 1);
    market.condition = 1.0;
    sim.buildings.clear();
    sim.buildings.push(market);

    sim.tick_count = MARKET_DAY_TICKS;
    market_days(&mut sim);
    assert_eq!(
        sim.trade_income.get("river"),
        Some(&1),
        "a market day brings in coin for the tribe that holds the market"
    );
    assert!(
        !sim.trade_income.contains_key("hill"),
        "a tribe without a market takes nothing on a market day"
    );

    sim.tick_count = MARKET_DAY_TICKS + 1;
    market_days(&mut sim);
    assert_eq!(
        sim.trade_income.get("river"),
        Some(&1),
        "no market day between market days"
    );

    for index in 5..8 {
        sim.organisms[index].alive = false;
    }
    sim.tick_count = 2 * MARKET_DAY_TICKS;
    market_days(&mut sim);
    assert_eq!(
        sim.trade_income.get("river"),
        Some(&1),
        "a tribe with too few people left takes nothing on its market day"
    );

    for index in 5..8 {
        sim.organisms[index].alive = true;
    }
    sim.tick_count = 4 * MARKET_DAY_TICKS;
    market_days(&mut sim);
    assert_eq!(sim.trade_income.get("river"), Some(&2));
    assert!(
        sim.events
            .iter()
            .any(|event| event.etype == "trade" && event.detail.contains("market day")),
        "every fourth market day is named in the chronicle"
    );
}
