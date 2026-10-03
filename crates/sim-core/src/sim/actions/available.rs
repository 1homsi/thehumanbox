use super::*;

pub fn available_actions(
    sim: &Simulation,
    idx: usize,
    ix: i32,
    iy: i32,
    spatial: &crate::sim::spatial::SpatialIndex,
) -> Vec<usize> {
    let mut actions = Vec::with_capacity(256);
    let mut nearby = Vec::with_capacity(16);
    available_actions_into(sim, idx, ix, iy, spatial, &mut actions, &mut nearby);
    actions
}

/// Reuse both eligibility buffers while processing the population in a tick.
/// The candidate order is significant to action selection, so this shares the
/// same construction path as the allocating convenience function above.
pub fn available_actions_into(
    sim: &Simulation,
    idx: usize,
    ix: i32,
    iy: i32,
    spatial: &crate::sim::spatial::SpatialIndex,
    actions: &mut Vec<usize>,
    nearby: &mut Vec<usize>,
) {
    let org = &sim.organisms[idx];
    let tile = sim.grid.get(ix, iy);
    let (sx, sy) = (org.x, org.y);
    let lid = &org.lineage_id;

    spatial.query_into(sx as i32, sy as i32, 6, nearby);
    let mut kin_near = false;
    let mut kin_count = 0;
    let mut stranger_near = false;
    for &i in nearby.iter() {
        if i == idx {
            continue;
        }
        let o = &sim.organisms[i];
        if !o.alive || (o.x - sx).abs() + (o.y - sy).abs() > 6.0 {
            continue;
        }
        if o.lineage_id == *lid {
            kin_near = true;
            kin_count += 1;
        } else {
            stranger_near = true;
        }
    }
    let any_near = kin_near || stranger_near;
    let has_mats = org.inv_wood > 0 || org.inv_stone > 0;
    let has_food = org.inv_food > 0 || matches!(tile, Tile::Food);
    let near_water =
        (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Water)));
    let near_rock = [
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (1, -1),
        (-1, 1),
        (1, 1),
    ]
    .iter()
    .any(|&(dx, dy)| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Rock | Tile::Mineral));
    let near_fire = (-2i32..=2).any(|dx| {
        (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Fire | Tile::Campfire))
    });
    let near_home = (org.home_x - org.x).abs() + (org.home_y - org.y).abs() <= 10.0;
    let needs_low = org.energy < 0.5 || org.hydration < 0.5;

    actions.clear();
    let a = actions;

    a.extend(0..=25);

    a.extend(26..=38);

    if has_mats || near_rock || near_water {
        a.extend(39..=50);
        a.extend(166..=180);
    }

    if org.energy > 0.30 {
        a.extend(51..=65);
        a.extend(151..=165);
    }

    a.push(66);
    a.push(69);
    a.extend(71..=79);
    a.extend(126..=140);

    if any_near {
        a.extend(80..=89);
    }

    if stranger_near || kin_near {
        a.extend(90..=95);
        a.extend(181..=190);
    }

    a.extend(100..=101);
    if stranger_near {
        a.extend([96, 97, 98, 99, 102, 103, 104, 105, 106].iter().copied());
    }
    a.extend(191..=200);

    a.extend(107..=116);
    a.extend(221..=225);

    a.extend(117..=125);
    a.extend(211..=220);

    if has_food {
        a.extend(141..=150);
    }

    a.extend(201..=210);

    if any_near {
        a.extend(226..=245);
    }

    a.extend(246..=260);

    if kin_near {
        a.extend(261..=275);
    }

    if any_near || org.inv_food > 0 || org.inv_wood > 0 {
        a.extend(276..=295);
    }

    // Governance/diplomacy 296-315. Half of them (declare_war,
    // sign_treaty, grant_citizenship, establish_borders) actually need
    // a stranger nearby; gating only on kin_near made them
    // unreachable unless kin and stranger happened to be in the same
    // 6-tile bubble. Open the mask to either condition.
    if kin_near || stranger_near {
        a.extend(296..=315);
    }

    a.extend(316..=335);

    if matches!(tile, Tile::Food | Tile::Grass) || has_food || needs_low {
        a.extend(336..=355);
    }

    a.extend(356..=370);

    a.extend(371..=385);

    // Coarse pre-filter only. Every band in 436..=455 lives in
    // `BASE_ACTION_BANDS`, which the loop at the end of this function walks
    // separately and adds whenever `band_is_eligible` approves it — so this
    // mask cannot make a band unreachable, and widening it (e.g. to
    // `kin_near || stranger_near`) is a no-op. Left as `kin_near` to match its
    // neighbours; `stranger_gated_actions_in_the_436_range_are_reachable_without_kin`
    // guards the authority that actually decides.
    if kin_near {
        a.extend(436..=455);
    }

    if org.is_elder || org.health < 0.40 || kin_near {
        a.extend(486..=500);
    }

    if kin_near {
        a.extend(521..=535);
    }

    a.extend(536..=537);
    let era = sim.era(lid);
    let context = EligibilityContext {
        kin_near,
        kin_count,
        stranger_near,
        near_water,
        near_rock,
        near_fire,
        near_home,
        wild_land: matches!(
            tile,
            Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash
        ),
        has_food,
        has_carried_food: org.inv_food > 0,
        has_materials: has_mats,
        has_wood: org.inv_wood > 0,
        has_stone: org.inv_stone > 0,
    };
    let phase = stable_action_phase(&org.id, sim.tick_count);
    let mut semantically_eligible = ActionSet::new();
    let mut place_cache = LocalPlaceCache::new();
    let tables = resolved::tables();
    let gate = tables.org_gate(org);
    for resolved in &tables.base {
        let band = resolved.band;
        if band_is_eligible(sim, idx, ix, iy, resolved, era, context, &gate, &mut place_cache) {
            a.extend(band.start..=band.end);
            semantically_eligible.insert_range(band.start, band.end);
        }
    }
    let mut eligible_by_family = [0u64; ACTION_FAMILY_COUNT];
    for resolved in tables.banded.iter().chain(&tables.registered) {
        let band = resolved.band;
        if band_is_eligible(sim, idx, ix, iy, resolved, era, context, &gate, &mut place_cache) {
            semantically_eligible.insert_range(band.start, band.end);
            mark_eligible_family_band(&mut eligible_by_family, band.start, band.end);
        }
    }
    extend_rotating_family_masks(a, &eligible_by_family, phase);

    // A dead organism is turned down for every action by the trade-route check.
    let actor_alive = org.alive;
    let mut seen = ActionSet::new();
    a.retain(|action| {
        let action = *action;
        // Cheap, selective checks first: the context checks below can be costly,
        // and most candidates fail the semantic one.
        let context_check = CONTEXT_CHECKED[action];
        actor_alive
            && !(context_check && action_output_at_capacity(org, action))
            && (!action_requires_semantic_validation(action) || semantically_eligible.contains(action))
            && (!context_check
                || (agriculture::action_is_possible(sim, idx, action, ix, iy, near_water)
                    && religion_expanded::action_is_possible(sim, idx, action, nearby, sim.tick_count)
                    && relationships_deep::action_is_possible(sim, idx, action, nearby)
                    && crate::sim::civ::trade_routes::action_is_possible(sim, idx, action, nearby)
                    && (action != 2704 || crate::sim::civ::trade_routes::can_dispatch_caravan(sim, idx))))
            && registry::is_possible(sim, idx, action, ix, iy)
            && seen.insert(action)
    });
}

/// The ids that the per-module checks in the filter above can turn down; every
/// other id passes all of them, so they are not called for it. A table lookup
/// replaces what used to be four jump-table calls per candidate. When one of
/// those modules starts judging a new id, add it here (the test
/// `ids_without_a_context_check_pass_every_context_check` catches a miss).
pub(super) const CONTEXT_CHECKED: [bool; crate::organism::organism::ACTION_ID_SPACE] = {
    let mut table = [false; crate::organism::organism::ACTION_ID_SPACE];
    let mut action = 0;
    while action < table.len() {
        table[action] = matches!(action, 38 | 287..=289 | 336..=355 | 456..=469 | 473 | 474 | 2220 | 2221 | 2704)
            || butchery::output_key(action).is_some();
        action += 1;
    }
    table
};
