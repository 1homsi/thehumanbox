use std::collections::{BTreeMap, HashMap};

use crate::sim::buildings::BuildingFunction;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

pub const TIER_NAMES: [&str; 6] = ["wilderness", "camp", "hamlet", "village", "town", "city"];

// A settlement must satisfy all three dimensions. Population alone cannot
// turn an unhoused crowd into a city, and one oversized structure cannot turn
// a nearly empty lineage into one either.
const POPULATION_REQUIREMENTS: [usize; 6] = [0, 1, 4, 8, 15, 25];
const BUILDING_REQUIREMENTS: [usize; 6] = [0, 1, 2, 4, 8, 12];
const SCORE_REQUIREMENTS: [u32; 6] = [0, 8, 24, 56, 120, 240];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SettlementSnapshot {
    pub lineage_id: String,
    pub name: String,
    pub tier: u8,
    pub tier_name: &'static str,
    pub center: [i32; 2],
    pub population: usize,
    pub building_count: usize,
    /// Raw capacity across all completed, functional buildings.
    pub capacity: u32,
    /// Population plus category-weighted capacity and a modest building-count
    /// contribution. Housing is weighted most strongly; civic and industry
    /// capacity are the next strongest foundations of durable settlement.
    pub score: u32,
}

#[derive(Default)]
struct SettlementAccumulator {
    population: usize,
    building_count: usize,
    capacity: u32,
    weighted_capacity: u32,
    x_sum: f64,
    y_sum: f64,
    center_weight: u32,
}

fn capacity_weight(function: BuildingFunction) -> u32 {
    match function {
        BuildingFunction::Housing => 3,
        BuildingFunction::Civic | BuildingFunction::Industry => 2,
        _ => 1,
    }
}

fn tier_for(population: usize, building_count: usize, score: u32) -> u8 {
    let mut tier = 0u8;
    for candidate in 1..TIER_NAMES.len() {
        if population >= POPULATION_REQUIREMENTS[candidate]
            && building_count >= BUILDING_REQUIREMENTS[candidate]
            && score >= SCORE_REQUIREMENTS[candidate]
        {
            tier = candidate as u8;
        }
    }
    tier
}

/// Build one deterministic, authoritative census from current residents and
/// operational lineage-owned buildings. Decorative props, unfinished sites,
/// unowned buildings, and structures belonging to extinct lineages contribute
/// nothing. BTreeMap keeps wire ordering stable across runs and save reloads.
pub fn snapshots(sim: &Simulation) -> Vec<SettlementSnapshot> {
    let mut by_lineage: BTreeMap<String, SettlementAccumulator> = BTreeMap::new();

    for resident in sim.organisms.iter().filter(|org| org.alive) {
        let entry = by_lineage.entry(resident.lineage_id.clone()).or_default();
        entry.population += 1;
        // Residents anchor the center more strongly than a single small
        // building, while major completed buildings still pull it toward the
        // physical settlement below.
        entry.x_sum += f64::from(resident.x) * 2.0;
        entry.y_sum += f64::from(resident.y) * 2.0;
        entry.center_weight += 2;
    }

    for building in sim.buildings.iter().filter(|building| building.is_operational()) {
        let Some(lineage_id) = building.owner_lineage.as_deref() else {
            continue;
        };
        let Some(entry) = by_lineage.get_mut(lineage_id) else {
            // A dead lineage's ruins remain world history, not a live
            // settlement or a stale client/sidebar entry.
            continue;
        };
        let capacity = u32::from(building.kind.capacity());
        entry.building_count += 1;
        entry.capacity = entry.capacity.saturating_add(capacity);
        entry.weighted_capacity = entry
            .weighted_capacity
            .saturating_add(capacity.saturating_mul(capacity_weight(building.function())));

        let (width, height) = building.footprint();
        let center_x = building.x as f64 + (f64::from(width) - 1.0) * 0.5;
        let center_y = building.y as f64 + (f64::from(height) - 1.0) * 0.5;
        let building_weight = 1 + capacity.div_ceil(4).min(8);
        entry.x_sum += center_x * f64::from(building_weight);
        entry.y_sum += center_y * f64::from(building_weight);
        entry.center_weight += building_weight;
    }

    by_lineage
        .into_iter()
        .map(|(lineage_id, entry)| {
            let score = (entry.population as u32)
                .saturating_mul(2)
                .saturating_add(entry.weighted_capacity)
                .saturating_add((entry.building_count as u32).saturating_mul(2));
            let tier = tier_for(entry.population, entry.building_count, score);
            let center = if entry.center_weight == 0 {
                [0, 0]
            } else {
                [
                    (entry.x_sum / f64::from(entry.center_weight)).round() as i32,
                    (entry.y_sum / f64::from(entry.center_weight)).round() as i32,
                ]
            };
            let name = sim
                .lineage_names
                .get(&lineage_id)
                .cloned()
                .unwrap_or_else(|| lineage_id.clone());
            SettlementSnapshot {
                lineage_id,
                name,
                tier,
                tier_name: TIER_NAMES[tier as usize],
                center,
                population: entry.population,
                building_count: entry.building_count,
                capacity: entry.capacity,
                score,
            }
        })
        .collect()
}

pub(crate) fn rebuild_tiers(sim: &mut Simulation) {
    sim.settlement_tiers = snapshots(sim)
        .into_iter()
        .map(|settlement| (settlement.lineage_id, settlement.tier))
        .collect();
}

/// Reconcile the persisted tier cache with the authoritative census and emit
/// transition events. Replacing the map, rather than mutating only rows seen in
/// this pass, is what removes extinct and imported stale lineages.
pub(crate) fn tick(sim: &mut Simulation) {
    let settlements = snapshots(sim);
    let previous = std::mem::take(&mut sim.settlement_tiers);
    let next: HashMap<String, u8> = settlements
        .iter()
        .map(|settlement| (settlement.lineage_id.clone(), settlement.tier))
        .collect();

    for settlement in &settlements {
        let old_tier = previous.get(&settlement.lineage_id).copied().unwrap_or(0);
        if settlement.tier > old_tier {
            let message = format!(
                "{}'s settlement grew from {} to {}",
                settlement.name,
                TIER_NAMES[usize::from(old_tier.min((TIER_NAMES.len() - 1) as u8))],
                settlement.tier_name
            );
            push_event(
                &mut sim.events,
                sim.tick_count,
                "build",
                &settlement.name,
                &message,
            );
        } else if settlement.tier < old_tier {
            let message = format!(
                "{}'s settlement declined from {} to {} after losing residents or buildings",
                settlement.name,
                TIER_NAMES[usize::from(old_tier.min((TIER_NAMES.len() - 1) as u8))],
                settlement.tier_name
            );
            push_event(
                &mut sim.events,
                sim.tick_count,
                "build",
                &settlement.name,
                &message,
            );
        }
    }

    let mut abandoned: Vec<(String, u8)> = previous
        .into_iter()
        .filter(|(lineage_id, tier)| *tier > 0 && !next.contains_key(lineage_id))
        .collect();
    abandoned.sort_by(|a, b| a.0.cmp(&b.0));
    for (lineage_id, old_tier) in abandoned {
        let name = sim.lineage_names.get(&lineage_id).cloned().unwrap_or(lineage_id);
        let message = format!(
            "{}'s {} was abandoned after its last residents disappeared",
            name,
            TIER_NAMES[usize::from(old_tier.min((TIER_NAMES.len() - 1) as u8))]
        );
        push_event(&mut sim.events, sim.tick_count, "build", &name, &message);
    }

    sim.settlement_tiers = next;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::buildings::{Building, BuildingKind};

    fn settlement_sim(population: usize) -> (Simulation, String) {
        let mut sim = Simulation::new(601);
        let lineage_id = "settlers".to_string();
        sim.lineage_names.clear();
        sim.lineage_names
            .insert(lineage_id.clone(), "River Folk".to_string());
        for (index, org) in sim.organisms.iter_mut().enumerate() {
            org.alive = index < population;
            if org.alive {
                org.lineage_id = lineage_id.clone();
                org.x = 100.0 + (index % 4) as f32;
                org.y = 120.0 + (index / 4) as f32;
                org.home_x = 101.0;
                org.home_y = 121.0;
            }
        }
        sim.buildings.clear();
        sim.settlement_tiers.clear();
        (sim, lineage_id)
    }

    fn add_building(sim: &mut Simulation, lineage_id: &str, kind: BuildingKind, complete: bool) {
        let id = sim.buildings.len() as u32 + 1;
        let mut building = Building::new(
            id,
            kind,
            100 + sim.buildings.len() as i32 * 3,
            120,
            Some(lineage_id.to_string()),
            sim.tick_count,
        );
        building.condition = if complete { 1.0 } else { 0.75 };
        sim.buildings.push(building);
    }

    #[test]
    fn incomplete_and_decorative_buildings_contribute_nothing() {
        let (mut sim, lineage_id) = settlement_sim(4);
        add_building(&mut sim, &lineage_id, BuildingKind::House, false);
        add_building(&mut sim, &lineage_id, BuildingKind::Hut, true);
        sim.buildings[1].decorative = true;

        let snapshot = snapshots(&sim).pop().unwrap();

        assert_eq!(snapshot.population, 4);
        assert_eq!(snapshot.building_count, 0);
        assert_eq!(snapshot.capacity, 0);
        assert_eq!(snapshot.tier_name, "wilderness");
    }

    #[test]
    fn completed_capacity_advances_a_settlement() {
        let (mut sim, lineage_id) = settlement_sim(4);
        add_building(&mut sim, &lineage_id, BuildingKind::House, true);
        tick(&mut sim);
        assert_eq!(sim.settlement_tiers.get(&lineage_id), Some(&1));

        add_building(&mut sim, &lineage_id, BuildingKind::Hut, true);
        tick(&mut sim);
        let snapshot = snapshots(&sim).pop().unwrap();
        assert_eq!(snapshot.tier_name, "hamlet");
        assert_eq!(snapshot.building_count, 2);
        assert_eq!(snapshot.capacity, 6);
        assert!(snapshot.score >= SCORE_REQUIREMENTS[2]);
        assert_eq!(sim.settlement_tiers.get(&lineage_id), Some(&2));
    }

    #[test]
    fn housing_civic_and_industry_capacity_receive_explicit_weights() {
        let score_for = |kind| {
            let (mut sim, lineage_id) = settlement_sim(4);
            add_building(&mut sim, &lineage_id, kind, true);
            snapshots(&sim).pop().unwrap().score
        };

        // All three small buildings have raw capacity four. Their settlement
        // value differs only because durable housing is weighted above
        // productive industry, which is weighted above an ordinary shop.
        assert!(score_for(BuildingKind::House) > score_for(BuildingKind::Forge));
        assert!(score_for(BuildingKind::Forge) > score_for(BuildingKind::Bakery));
        // CityHall and School both carry raw capacity twenty; civic capacity
        // deliberately contributes more strongly than an unweighted service.
        assert!(score_for(BuildingKind::CityHall) > score_for(BuildingKind::School));
    }

    #[test]
    fn destroyed_building_downgrades_the_authoritative_tier() {
        let (mut sim, lineage_id) = settlement_sim(4);
        add_building(&mut sim, &lineage_id, BuildingKind::House, true);
        add_building(&mut sim, &lineage_id, BuildingKind::Hut, true);
        tick(&mut sim);
        assert_eq!(sim.settlement_tiers.get(&lineage_id), Some(&2));

        sim.buildings[1].condition = 0.0;
        tick(&mut sim);

        let snapshot = snapshots(&sim).pop().unwrap();
        assert_eq!(snapshot.tier_name, "camp");
        assert_eq!(snapshot.building_count, 1);
        assert_eq!(sim.settlement_tiers.get(&lineage_id), Some(&1));
    }

    #[test]
    fn extinction_removes_current_and_stale_entries() {
        let (mut sim, lineage_id) = settlement_sim(4);
        add_building(&mut sim, &lineage_id, BuildingKind::House, true);
        sim.settlement_tiers.insert(lineage_id.clone(), 3);
        sim.settlement_tiers.insert("stale-import".to_string(), 4);
        for org in &mut sim.organisms {
            org.alive = false;
        }

        tick(&mut sim);

        assert!(snapshots(&sim).is_empty());
        assert!(sim.settlement_tiers.is_empty());
    }

    #[test]
    fn loading_rebuilds_the_cache_instead_of_trusting_stale_saved_tiers() {
        let (mut sim, lineage_id) = settlement_sim(4);
        add_building(&mut sim, &lineage_id, BuildingKind::House, true);
        add_building(&mut sim, &lineage_id, BuildingKind::Hut, true);
        sim.settlement_tiers.insert(lineage_id.clone(), 5);
        sim.settlement_tiers.insert("stale-save".to_string(), 4);

        let loaded = Simulation::from_save(601, sim.to_save_state());

        assert_eq!(loaded.settlement_tiers.len(), 1);
        assert_eq!(loaded.settlement_tiers.get(&lineage_id), Some(&2));
        assert!(!loaded.settlement_tiers.contains_key("stale-save"));
    }
}
