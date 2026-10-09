use super::action_set::range_bits;
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
    let lid = &org.lineage_id;

    let context = EligibilityContext::gather(sim, idx, ix, iy, spatial, nearby);
    let EligibilityContext {
        kin_near,
        stranger_near,
        near_water,
        has_food,
        has_materials: has_mats,
        ..
    } = context;
    let any_near = kin_near || stranger_near;
    let needs_low = org.energy < 0.5 || org.hydration < 0.5;
    let near_rock = context.near_rock;

    actions.clear();
    let a = actions;
    let mut plan = Plan::new();

    plan.range(0, 25);

    plan.range(26, 38);

    if has_mats || near_rock || near_water {
        plan.range(39, 50);
        plan.range(166, 180);
    }

    if org.energy > 0.30 {
        plan.range(51, 65);
        plan.range(151, 165);
    }

    plan.range(66, 66);
    plan.range(69, 69);
    plan.range(71, 79);
    plan.range(126, 140);

    if any_near {
        plan.range(80, 89);
    }

    if stranger_near || kin_near {
        plan.range(90, 95);
        plan.range(181, 190);
    }

    plan.range(100, 101);
    if stranger_near {
        for id in [96, 97, 98, 99, 102, 103, 104, 105, 106] {
            plan.range(id, id);
        }
    }
    plan.range(191, 200);

    plan.range(107, 116);
    plan.range(221, 225);

    plan.range(117, 125);
    plan.range(211, 220);

    if has_food {
        plan.range(141, 150);
    }

    plan.range(201, 210);

    if any_near {
        plan.range(226, 245);
    }

    plan.range(246, 260);

    if kin_near {
        plan.range(261, 275);
    }

    if any_near || org.inv_food > 0 || org.inv_wood > 0 {
        plan.range(276, 295);
    }

    // Governance/diplomacy 296-315. Half of them (declare_war,
    // sign_treaty, grant_citizenship, establish_borders) actually need
    // a stranger nearby; gating only on kin_near made them
    // unreachable unless kin and stranger happened to be in the same
    // 6-tile bubble. Open the mask to either condition.
    if kin_near || stranger_near {
        plan.range(296, 315);
    }

    plan.range(316, 335);

    if matches!(tile, Tile::Food | Tile::Grass) || has_food || needs_low {
        plan.range(336, 355);
    }

    plan.range(356, 370);

    plan.range(371, 385);

    // Coarse pre-filter only. Every band in 436..=455 lives in
    // `BASE_ACTION_BANDS`, which the loop at the end of this function walks
    // separately and adds whenever `band_is_eligible` approves it — so this
    // mask cannot make a band unreachable, and widening it (e.g. to
    // `kin_near || stranger_near`) is a no-op. Left as `kin_near` to match its
    // neighbours; `stranger_gated_actions_in_the_436_range_are_reachable_without_kin`
    // guards the authority that actually decides.
    if kin_near {
        plan.range(436, 455);
    }

    if org.is_elder || org.health < 0.40 || kin_near {
        plan.range(486, 500);
    }

    if kin_near {
        plan.range(521, 535);
    }

    plan.range(536, 537);
    let era = sim.era(lid);
    let phase = stable_action_phase(&org.id, sim.tick_count);
    let mut semantically_eligible = ActionSet::new();
    let mut place_cache = LocalPlaceCache::new();
    let tables = resolved::tables();
    let gate = tables.org_gate(org);
    let bits = ctx_bits(sim, idx, ix, iy, &context);
    // Which bands the era, age and qualification gates let through changes only
    // when something about the organism that those gates read does, so it is
    // worked out then and remembered per organism slot; the bands still left
    // are asked about the situation, in the same order as before.
    let band_count = tables.band_count();
    assert!(
        band_count <= MAX_BAND_WORDS * 64,
        "more bands than the pass mask holds"
    );
    let mut pass_mask = [0u64; MAX_BAND_WORDS];
    let key = tables.gate_key(&gate, era);
    GATE_PASSES.with_borrow_mut(|slots| {
        if slots.len() <= idx {
            slots.resize_with(idx + 1, || None);
        }
        let slot = &mut slots[idx];
        match slot {
            Some((cached_key, cached)) if *cached_key == key => pass_mask = *cached,
            _ => {
                tables.org_pass_mask(&gate, era, &mut pass_mask);
                *slot = Some((key, pass_mask));
            }
        }
    });
    let base_bands = tables.base.len();
    let mut eligible_by_family = [0u64; ACTION_FAMILY_COUNT];
    for (word, &passing) in pass_mask.iter().enumerate() {
        let mut passing = passing;
        while passing != 0 {
            let index = word * 64 + passing.trailing_zeros() as usize;
            passing &= passing - 1;
            let resolved = tables.band(index);
            if !band_is_eligible_in_place(sim, ix, iy, resolved, bits, &mut place_cache, lid) {
                continue;
            }
            let band = resolved.band;
            semantically_eligible.insert_range(band.start, band.end);
            if index < base_bands {
                plan.range(band.start, band.end);
            } else {
                mark_eligible_family_band(&mut eligible_by_family, band.start, band.end);
            }
        }
    }
    plan_rotating_family_masks(&mut plan, &eligible_by_family, phase);

    // A dead organism is turned down for every action by the trade-route check.
    if !org.alive {
        return;
    }
    // Walk the candidate ranges in the order they were offered, keeping an id
    // when every check passes and it has not been kept already. Most ids are
    // turned down by the semantic gate, so that and the "already kept" test are
    // applied to a whole word of ids at once, and only the survivors are looked
    // at one by one; the ones the per-module checks can judge are checked then.
    let tables = filter_tables();
    let eligible = semantically_eligible.words();
    let mut seen = ActionSet::new();
    let seen_words = seen.words_mut();
    for &(start, end) in plan.iter() {
        let (start, end) = (usize::from(start), usize::from(end));
        for word in start / 64..=end / 64 {
            let mut candidates =
                range_bits(word, start, end) & !seen_words[word] & (!tables.semantic[word] | eligible[word]);
            while candidates != 0 {
                let bit = candidates.trailing_zeros() as usize;
                candidates &= candidates - 1;
                let action = word * 64 + bit;
                if tables.judged[word] >> bit & 1 == 1
                    && !action_passes_judges(sim, idx, action, ix, iy, near_water, nearby)
                {
                    continue;
                }
                seen_words[word] |= 1 << bit;
                a.push(action);
            }
        }
    }
}

/// The ids whose candidacy needs more than the semantic gate, as bit words,
/// and the ids that gate applies to.
struct FilterTables {
    semantic: [u64; action_set::WORDS],
    judged: [u64; action_set::WORDS],
}

fn filter_tables() -> &'static FilterTables {
    static TABLES: std::sync::OnceLock<FilterTables> = std::sync::OnceLock::new();
    TABLES.get_or_init(|| {
        let mut tables = FilterTables {
            semantic: [0; action_set::WORDS],
            judged: [0; action_set::WORDS],
        };
        for action in 0..crate::organism::organism::ACTION_ID_SPACE {
            if action_requires_semantic_validation(action) {
                tables.semantic[action / 64] |= 1 << (action % 64);
            }
            if CONTEXT_CHECKED[action] || registry::find(action).is_some() {
                tables.judged[action / 64] |= 1 << (action % 64);
            }
        }
        tables
    })
}

/// The checks only some ids need: output caps, the per-module context checks
/// and a registered action's own `possible`.
fn action_passes_judges(
    sim: &Simulation,
    idx: usize,
    action: usize,
    ix: i32,
    iy: i32,
    near_water: bool,
    nearby: &[usize],
) -> bool {
    let org = &sim.organisms[idx];
    let context_check = CONTEXT_CHECKED[action];
    !(context_check && action_output_at_capacity(org, action))
        && (!context_check
            || (agriculture::action_is_possible(sim, idx, action, ix, iy, near_water)
                && religion_expanded::action_is_possible(sim, idx, action, nearby, sim.tick_count)
                && relationships_deep::action_is_possible(sim, idx, action, nearby)
                && crate::sim::civ::trade_routes::action_is_possible(sim, idx, action, nearby)
                && (action != 2704 || crate::sim::civ::trade_routes::can_dispatch_caravan(sim, idx))))
        && registry::is_possible(sim, idx, action, ix, iy)
}

/// Words in the per-organism mask of bands the organism gates let through.
const MAX_BAND_WORDS: usize = 32;

/// The gate state a pass mask was built for, and the mask.
type GatePass = (resolved::GateKey, [u64; MAX_BAND_WORDS]);

thread_local! {
    /// By organism slot.
    static GATE_PASSES: std::cell::RefCell<Vec<Option<GatePass>>> =
        const { std::cell::RefCell::new(Vec::new()) };
}

/// Candidate ids as inclusive ranges, in the order they are offered.
struct Plan(Vec<(u16, u16)>);

impl Plan {
    fn new() -> Self {
        Plan(Vec::with_capacity(96))
    }

    fn range(&mut self, start: usize, end: usize) {
        self.0.push((start as u16, end as u16));
    }

    fn iter(&self) -> std::slice::Iter<'_, (u16, u16)> {
        self.0.iter()
    }
}

/// `extend_rotating_family_masks` for a plan: the same rotation, as unit ranges.
fn plan_rotating_family_masks(plan: &mut Plan, families: &[u64; ACTION_FAMILY_COUNT], phase: u64) {
    let mut candidates = [0usize; ACTION_FAMILY_WIDTH];
    for (family, &mask) in families.iter().enumerate() {
        let mut remaining = mask;
        let mut len = 0;
        while remaining != 0 {
            candidates[len] = family * ACTION_FAMILY_WIDTH + remaining.trailing_zeros() as usize;
            len += 1;
            remaining &= remaining - 1;
        }
        if len == 0 {
            continue;
        }
        let take = ACTIONS_PER_BAND.min(len);
        let offset = (phase % len as u64) as usize;
        for step in 0..take {
            let id = candidates[(offset + step) % len];
            plan.range(id, id);
        }
    }
}

/// The candidate list built id by id and filtered with `retain`, kept to check
/// the range-based construction against.
#[cfg(test)]
pub(super) fn available_actions_into_reference(
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
    let lid = &org.lineage_id;

    let context = EligibilityContext::gather(sim, idx, ix, iy, spatial, nearby);
    let EligibilityContext {
        kin_near,
        stranger_near,
        near_water,
        has_food,
        has_materials: has_mats,
        ..
    } = context;
    let any_near = kin_near || stranger_near;
    let needs_low = org.energy < 0.5 || org.hydration < 0.5;
    let near_rock = context.near_rock;

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
    let phase = stable_action_phase(&org.id, sim.tick_count);
    let mut semantically_eligible = ActionSet::new();
    let mut place_cache = LocalPlaceCache::new();
    let tables = resolved::tables();
    let gate = tables.org_gate(org);
    let bits = ctx_bits(sim, idx, ix, iy, &context);
    for resolved in &tables.base {
        let band = resolved.band;
        if band_is_eligible(sim, ix, iy, resolved, era, bits, &gate, &mut place_cache, lid) {
            a.extend(band.start..=band.end);
            semantically_eligible.insert_range(band.start, band.end);
        }
    }
    let mut eligible_by_family = [0u64; ACTION_FAMILY_COUNT];
    for resolved in tables.banded.iter().chain(&tables.registered) {
        let band = resolved.band;
        if band_is_eligible(sim, ix, iy, resolved, era, bits, &gate, &mut place_cache, lid) {
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
