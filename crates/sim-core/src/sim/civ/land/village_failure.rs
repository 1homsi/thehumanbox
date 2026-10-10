//! Crop failure. A blight, a swarm of locusts, a flood or a dry spell ruins a tribe's village
//! fields: a ruined field keeps its place and stands dead until it is due, then it is brought in
//! with nothing to show for it. Grain in a granary spoils too: a blight or a flood halves it,
//! a swarm empties it. A granary left empty after a failure, with people going hungry, is a
//! famine, and the chronicle names it.
//!
//! Nothing here draws random numbers: the dry-spell roll is a hash of the plot and the pass, so
//! the same seed still gives the same world.

use std::collections::BTreeMap;

use crate::sim::civ::land::village_fields::{water_within, Tribe, SOW_STEP};
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;

/// Share of unwatered growing fields a dry spell ruins in each village pass, in percent.
const DRY_WILT_PERCENT: u64 = 35;
/// Ticks a spoiled granary stays a famine warning before it is forgotten.
const FAMINE_WINDOW: u64 = 6_000;

/// What struck the fields.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Blow {
    Blight,
    Locusts,
    Flood,
}

impl Blow {
    fn name(self) -> &'static str {
        match self {
            Blow::Blight => "a blight",
            Blow::Locusts => "the locusts",
            Blow::Flood => "a flood",
        }
    }
}

fn near(points: &[(i32, i32)], x: i32, y: i32, reach: i32) -> bool {
    points
        .iter()
        .any(|&(px, py)| (px - x).abs().max((py - y).abs()) <= reach)
}

/// Ruins the living village fields within `reach` tiles of any of `points`, and spoils the grain
/// of every granary there: a blight or a flood halves it, a swarm empties it. Returns the number
/// of fields ruined. Fields already ruined, and fallow ground, are left as they are.
pub(crate) fn ruin(sim: &mut Simulation, points: &[(i32, i32)], reach: i32, blow: Blow) -> usize {
    let now = sim.tick_count;
    let mut fields: BTreeMap<String, usize> = BTreeMap::new();
    for f in sim.farms.iter_mut() {
        if f.withered || f.harvested || !near(points, f.x, f.y, reach) {
            continue;
        }
        f.withered = true;
        *fields.entry(f.owner_lineage.clone()).or_insert(0) += 1;
    }
    let mut grain: BTreeMap<String, bool> = BTreeMap::new();
    for b in sim.buildings.iter_mut() {
        if b.kind != BuildingKind::Granary || !near(points, b.x, b.y, reach) {
            continue;
        }
        let Some(owner) = b.owner_lineage.clone() else {
            continue;
        };
        match blow {
            Blow::Locusts => b.stock = 0,
            Blow::Blight | Blow::Flood => b.stock /= 2,
        }
        b.spoiled_tick = Some(now);
        grain.insert(owner, true);
    }
    let ruined: usize = fields.values().sum();
    let mut owners: Vec<String> = fields.keys().cloned().collect();
    for owner in grain.keys() {
        if !owners.contains(owner) {
            owners.push(owner.clone());
        }
    }
    owners.sort();
    for owner in owners {
        let name = sim
            .lineage_names
            .get(&owner)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        let n = fields.get(&owner).copied().unwrap_or(0);
        let what = match (n, grain.contains_key(&owner)) {
            (0, _) => format!("{} spoiled its stored grain", blow.name()),
            (n, true) => format!("{} ruined {n} fields and spoiled the stores", blow.name()),
            (n, false) => format!("{} ruined {n} fields", blow.name()),
        };
        push_event(&mut sim.events, now, "danger", &name, &what);
    }
    ruined
}

/// In a dry spell, the growing fields that no water reaches wilt: each pass rolls a fixed share
/// of them, so a field by a river or a ditch lives through the drought.
pub(crate) fn dry_spell(sim: &mut Simulation, tribe: &Tribe) {
    if !sim.drought.active {
        return;
    }
    let now = sim.tick_count;
    let pass = now / SOW_STEP;
    let plots: Vec<(usize, i32, i32, u32)> = sim
        .farms
        .iter()
        .enumerate()
        .filter(|(_, f)| f.owner_lineage == tribe.lineage && !f.harvested && !f.withered && !f.is_mature(now))
        .map(|(i, f)| (i, f.x, f.y, f.id))
        .collect();
    let mut wilted = 0usize;
    for (i, x, y, id) in plots {
        if water_within(sim, x, y, 2) {
            continue;
        }
        let roll = ((id as u64).wrapping_mul(2_654_435_761).wrapping_add(pass)) % 100;
        if roll < DRY_WILT_PERCENT {
            sim.farms[i].withered = true;
            wilted += 1;
        }
    }
    if wilted == 0 {
        return;
    }
    for b in sim.buildings.iter_mut() {
        if b.kind == BuildingKind::Granary && b.owner_lineage.as_deref() == Some(tribe.lineage.as_str()) {
            b.spoiled_tick = Some(now);
        }
    }
    if wilted >= 2 {
        let name = sim
            .lineage_names
            .get(&tribe.lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string());
        push_event(
            &mut sim.events,
            now,
            "danger",
            &name,
            &format!("a dry spell withered {wilted} fields the water does not reach"),
        );
    }
}

/// A famine: a tribe's granary is empty after a failure and at least half its people have no food.
/// The warning is spent when the chronicle names it.
pub(crate) fn famine(sim: &mut Simulation, tribe: &Tribe) {
    let now = sim.tick_count;
    let Some(idx) = sim.buildings.iter().position(|b| {
        b.kind == BuildingKind::Granary
            && b.is_operational()
            && b.owner_lineage.as_deref() == Some(tribe.lineage.as_str())
            && b.stock == 0
            && b.spoiled_tick.is_some()
    }) else {
        return;
    };
    let since = sim.buildings[idx].spoiled_tick.unwrap_or(now);
    if now.saturating_sub(since) > FAMINE_WINDOW {
        sim.buildings[idx].spoiled_tick = None;
        return;
    }
    let hungry = tribe
        .members
        .iter()
        .filter(|&&i| sim.organisms[i].alive && sim.organisms[i].inv_food == 0)
        .count();
    if tribe.members.is_empty() || hungry * 2 < tribe.members.len() {
        return;
    }
    sim.buildings[idx].spoiled_tick = None;
    let name = sim
        .lineage_names
        .get(&tribe.lineage)
        .cloned()
        .unwrap_or_else(|| "a tribe".to_string());
    push_event(
        &mut sim.events,
        now,
        "life",
        &name,
        &format!("famine: the stores are empty and {hungry} people go hungry"),
    );
}

#[cfg(test)]
#[path = "village_failure_tests.rs"]
mod tests;
