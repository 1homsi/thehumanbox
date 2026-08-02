use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::simulation::Simulation;
use crate::organism::organism::Organism;
use crate::world::grid::{TrailKind, HEIGHT, WIDTH};
use crate::world::tiles::Tile;

pub const SUPPLY_CACHE_RESOURCE_CAP: u8 = 8;
pub const MAX_SUPPLY_CACHES: usize = 96;

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default)]
pub struct SupplyCache {
    pub x: i32,
    pub y: i32,
    pub lineage_id: String,
    pub food: u8,
    pub water: u8,
    pub fishing_weir: bool,
    pub created_tick: u64,
    pub last_used_tick: u64,
    pub last_produced_tick: u64,
    /// Accumulated structural damage. A value of 100 disables withdrawals,
    /// deposits, and weir production until an owner repairs the cache.
    pub damage: u8,
    pub last_damage_tick: Option<u64>,
    pub last_repair_tick: Option<u64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CachedSupply {
    Food,
    Water,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DepositResult {
    pub created: bool,
    pub amount: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CacheRaidOutcome {
    Stolen(CachedSupply),
    Intercepted,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CacheSabotageOutcome {
    Damaged,
    Intercepted,
}

impl SupplyCache {
    pub fn operational(&self) -> bool {
        self.damage < 100
    }

    pub fn amount(&self, supply: CachedSupply) -> u8 {
        match supply {
            CachedSupply::Food => self.food,
            CachedSupply::Water => self.water,
        }
    }

    fn amount_mut(&mut self, supply: CachedSupply) -> &mut u8 {
        match supply {
            CachedSupply::Food => &mut self.food,
            CachedSupply::Water => &mut self.water,
        }
    }
}

/// Imported worlds are untrusted local data. Keep cache counts bounded, drop
/// out-of-world or ownerless entries, clamp quantities, and deterministically
/// keep the newest entry when a hand-edited save duplicates a tile.
pub fn repair_supply_caches(caches: &mut Vec<SupplyCache>) {
    caches.retain(|cache| {
        cache.x > 0
            && cache.y > 0
            && cache.x < WIDTH as i32 - 1
            && cache.y < HEIGHT as i32 - 1
            && !cache.lineage_id.trim().is_empty()
    });
    for cache in caches.iter_mut() {
        cache.food = cache.food.min(SUPPLY_CACHE_RESOURCE_CAP);
        cache.water = cache.water.min(SUPPLY_CACHE_RESOURCE_CAP);
        cache.damage = cache.damage.min(100);
    }
    caches.sort_by(|left, right| {
        right
            .last_used_tick
            .cmp(&left.last_used_tick)
            .then_with(|| right.created_tick.cmp(&left.created_tick))
            .then_with(|| left.y.cmp(&right.y))
            .then_with(|| left.x.cmp(&right.x))
    });
    let mut occupied = HashSet::with_capacity(caches.len());
    caches.retain(|cache| occupied.insert((cache.x, cache.y)));
    caches.truncate(MAX_SUPPLY_CACHES);
}

impl Simulation {
    fn water_near_cache(&self, x: i32, y: i32) -> bool {
        (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| self.grid.get(x + dx, y + dy) == Tile::Water))
    }

    pub fn can_deposit_cached_supply(&self, idx: usize, x: i32, y: i32, supply: CachedSupply) -> bool {
        let Some(org) = self.organisms.get(idx).filter(|org| org.alive) else {
            return false;
        };
        let carried = match supply {
            CachedSupply::Food => org.inv_food,
            CachedSupply::Water => org.inv_water,
        };
        if carried == 0 {
            return false;
        }
        match self
            .supply_caches
            .iter()
            .find(|cache| cache.x == x && cache.y == y)
        {
            Some(cache) => {
                cache.lineage_id == org.lineage_id
                    && cache.operational()
                    && cache.amount(supply) < SUPPLY_CACHE_RESOURCE_CAP
            }
            None => {
                org.inv_wood > 0
                    && self.supply_caches.len() < MAX_SUPPLY_CACHES
                    && matches!(
                        self.grid.get(x, y),
                        Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash
                    )
                    && self.grid.structure_at(x, y) < 0.10
                    && !self.buildings.iter().any(|building| building.contains(x, y))
            }
        }
    }

    pub fn deposit_cached_supply(
        &mut self,
        idx: usize,
        x: i32,
        y: i32,
        supply: CachedSupply,
    ) -> Option<DepositResult> {
        if !self.can_deposit_cached_supply(idx, x, y, supply) {
            return None;
        }
        let lineage_id = self.organisms[idx].lineage_id.clone();
        let existing = self
            .supply_caches
            .iter()
            .position(|cache| cache.x == x && cache.y == y);
        let created = existing.is_none();
        let cache_index = if let Some(cache_index) = existing {
            cache_index
        } else {
            self.organisms[idx].inv_wood -= 1;
            self.supply_caches.push(SupplyCache {
                x,
                y,
                lineage_id,
                created_tick: self.tick_count,
                last_used_tick: self.tick_count,
                ..SupplyCache::default()
            });
            self.supply_caches.len() - 1
        };

        match supply {
            CachedSupply::Food => self.organisms[idx].inv_food -= 1,
            CachedSupply::Water => self.organisms[idx].inv_water -= 1,
        }
        let amount = {
            let cache = &mut self.supply_caches[cache_index];
            let next_amount = {
                let amount = cache.amount_mut(supply);
                *amount = amount.saturating_add(1).min(SUPPLY_CACHE_RESOURCE_CAP);
                *amount
            };
            cache.last_used_tick = self.tick_count;
            next_amount
        };

        if created || self.grid.structure_at(x, y) < 0.16 {
            *self.grid.structure_at_mut(x, y) = 0.16;
        }
        self.active_structure_tiles.insert((x, y));
        self.grid.leave_trail(x, y, TrailKind::Path, 2.2);
        match supply {
            CachedSupply::Food => self.grid.leave_trail(x, y, TrailKind::Food, 4.0),
            CachedSupply::Water => self.grid.leave_trail(x, y, TrailKind::Water, 4.0),
        }
        self.supply_cache_state_revision = self.supply_cache_state_revision.wrapping_add(1);
        let memory_strength = self.organisms[idx].traits.memory_strength;
        match supply {
            CachedSupply::Food => {
                Organism::remember(&mut self.organisms[idx].food_memory, x, y, 1.0, memory_strength)
            }
            CachedSupply::Water => {
                Organism::remember(&mut self.organisms[idx].water_memory, x, y, 1.0, memory_strength)
            }
        }
        Some(DepositResult { created, amount })
    }

    pub fn can_build_fishing_weir(&self, idx: usize, x: i32, y: i32) -> bool {
        let Some(org) = self.organisms.get(idx).filter(|org| org.alive) else {
            return false;
        };
        org.inv_wood >= 2
            && self.supply_caches.len() < MAX_SUPPLY_CACHES
            && self
                .supply_caches
                .iter()
                .all(|cache| cache.x != x || cache.y != y)
            && matches!(self.grid.get(x, y), Tile::Grass | Tile::Sand | Tile::Snow)
            && self.water_near_cache(x, y)
            && self.grid.structure_at(x, y) < 0.10
            && !self.buildings.iter().any(|building| building.contains(x, y))
    }

    pub fn build_fishing_weir(&mut self, idx: usize, x: i32, y: i32) -> bool {
        if !self.can_build_fishing_weir(idx, x, y) {
            return false;
        }
        self.organisms[idx].inv_wood -= 2;
        self.supply_caches.push(SupplyCache {
            x,
            y,
            lineage_id: self.organisms[idx].lineage_id.clone(),
            fishing_weir: true,
            created_tick: self.tick_count,
            last_used_tick: self.tick_count,
            last_produced_tick: self.tick_count,
            ..SupplyCache::default()
        });
        *self.grid.structure_at_mut(x, y) = 0.22;
        self.active_structure_tiles.insert((x, y));
        self.grid.leave_trail(x, y, TrailKind::Path, 2.4);
        self.grid.leave_trail(x, y, TrailKind::Water, 3.0);
        self.supply_cache_state_revision = self.supply_cache_state_revision.wrapping_add(1);
        true
    }

    /// Fishing weirs produce slowly and only while their shoreline still
    /// exists. Output goes into the same bounded cache people already know how
    /// to revisit, so the structure cannot conjure food directly into an actor.
    pub(crate) fn tick_supply_caches(&mut self) {
        const MAINTENANCE_TICKS: u64 = 120;
        const WEIR_PRODUCTION_TICKS: u64 = 600;
        if self.tick_count.is_multiple_of(MAINTENANCE_TICKS) {
            self.tick_supply_cache_damage_and_repairs();
        }
        if !self.tick_count.is_multiple_of(WEIR_PRODUCTION_TICKS) {
            return;
        }
        let productive: Vec<usize> = self
            .supply_caches
            .iter()
            .enumerate()
            .filter(|(_, cache)| {
                cache.fishing_weir
                    && cache.operational()
                    && cache.food < SUPPLY_CACHE_RESOURCE_CAP
                    && self.tick_count.saturating_sub(cache.last_produced_tick) >= WEIR_PRODUCTION_TICKS
                    && self.water_near_cache(cache.x, cache.y)
            })
            .map(|(index, _)| index)
            .collect();
        if productive.is_empty() {
            return;
        }
        for index in productive {
            let cache = &mut self.supply_caches[index];
            cache.food += 1;
            cache.last_produced_tick = self.tick_count;
            self.grid.leave_trail(cache.x, cache.y, TrailKind::Food, 4.0);
        }
        self.supply_cache_state_revision = self.supply_cache_state_revision.wrapping_add(1);
    }

    /// Move at most one needed ration of each kind from the nearest friendly
    /// cache into carried reserves. The existing reserve-use system then eats
    /// or drinks it, keeping need recovery and Q-learning feedback canonical.
    pub(crate) fn take_needed_cached_supplies(&mut self, idx: usize) -> (bool, bool) {
        let Some(org) = self.organisms.get(idx).filter(|org| org.alive) else {
            return (false, false);
        };
        let need_food = org.energy < 0.34 && org.inv_food == 0;
        let need_water = org.hydration < 0.34 && org.inv_water == 0;
        if (!need_food && !need_water) || org.carry_room() == 0 {
            return (false, false);
        }
        let lineage_id = org.lineage_id.clone();
        let (org_x, org_y) = (org.x as i32, org.y as i32);
        let mut candidates: Vec<usize> = self
            .supply_caches
            .iter()
            .enumerate()
            .filter(|(_, cache)| {
                cache.lineage_id == lineage_id
                    && cache.operational()
                    && (cache.x - org_x).abs() + (cache.y - org_y).abs() <= 3
                    && ((need_food && cache.food > 0) || (need_water && cache.water > 0))
            })
            .map(|(index, _)| index)
            .collect();
        candidates.sort_unstable_by_key(|&index| {
            let cache = &self.supply_caches[index];
            (
                (cache.x - org_x).abs() + (cache.y - org_y).abs(),
                cache.created_tick,
                index,
            )
        });

        let mut took_food = false;
        let mut took_water = false;
        for cache_index in candidates {
            let room = self.organisms[idx].carry_room();
            if room == 0 {
                break;
            }
            let cache = &mut self.supply_caches[cache_index];
            if need_food && !took_food && cache.food > 0 {
                cache.food -= 1;
                self.organisms[idx].inv_food += 1;
                took_food = true;
                cache.last_used_tick = self.tick_count;
            }
            if need_water && !took_water && cache.water > 0 && self.organisms[idx].carry_room() > 0 {
                cache.water -= 1;
                self.organisms[idx].inv_water += 1;
                took_water = true;
                cache.last_used_tick = self.tick_count;
            }
            if took_food && took_water {
                break;
            }
        }
        if took_food || took_water {
            self.supply_cache_state_revision = self.supply_cache_state_revision.wrapping_add(1);
        }
        (took_food, took_water)
    }

    pub fn can_raid_supply_cache(&self, idx: usize, x: i32, y: i32) -> bool {
        let Some(actor) = self.organisms.get(idx).filter(|actor| actor.alive) else {
            return false;
        };
        actor.carry_room() > 0
            && self.supply_caches.iter().any(|cache| {
                cache.operational()
                    && cache.lineage_id != actor.lineage_id
                    && actor.attitude_toward(&cache.lineage_id) < -0.20
                    && (cache.x - x).abs() + (cache.y - y).abs() <= 3
                    && (cache.food > 0 || cache.water > 0)
            })
    }

    pub fn can_sabotage_supply_cache(&self, idx: usize, x: i32, y: i32) -> bool {
        let Some(actor) = self.organisms.get(idx).filter(|actor| actor.alive) else {
            return false;
        };
        self.supply_caches.iter().any(|cache| {
            cache.operational()
                && cache.lineage_id != actor.lineage_id
                && actor.attitude_toward(&cache.lineage_id) < -0.20
                && (cache.x - x).abs() + (cache.y - y).abs() <= 3
                && (cache.food > 0 || cache.water > 0 || cache.fishing_weir)
        })
    }

    /// Spoil one stored ration and damage the hostile cache. Sabotage yields
    /// no inventory to the actor and therefore cannot duplicate resources.
    pub fn sabotage_supply_cache(&mut self, idx: usize, x: i32, y: i32) -> Option<CacheSabotageOutcome> {
        if !self.can_sabotage_supply_cache(idx, x, y) {
            return None;
        }
        let actor = &self.organisms[idx];
        let mut candidates: Vec<usize> = self
            .supply_caches
            .iter()
            .enumerate()
            .filter(|(_, cache)| {
                cache.operational()
                    && cache.lineage_id != actor.lineage_id
                    && actor.attitude_toward(&cache.lineage_id) < -0.20
                    && (cache.x - x).abs() + (cache.y - y).abs() <= 3
                    && (cache.food > 0 || cache.water > 0 || cache.fishing_weir)
            })
            .map(|(index, _)| index)
            .collect();
        candidates.sort_unstable_by_key(|&index| {
            let cache = &self.supply_caches[index];
            (
                (cache.x - x).abs() + (cache.y - y).abs(),
                cache.created_tick,
                index,
            )
        });
        let cache_index = candidates[0];
        let (cache_x, cache_y, owner) = {
            let cache = &self.supply_caches[cache_index];
            (cache.x, cache.y, cache.lineage_id.clone())
        };
        if crate::sim::actions::warfare::stand_guard::active_guard(self, &owner, cache_x, cache_y).is_some() {
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.02).max(0.0);
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.04).min(1.0);
            return Some(CacheSabotageOutcome::Intercepted);
        }
        let cache = &mut self.supply_caches[cache_index];
        if cache.food > 0 {
            cache.food -= 1;
        } else if cache.water > 0 {
            cache.water -= 1;
        }
        cache.damage = cache.damage.saturating_add(20).min(100);
        cache.last_damage_tick = Some(self.tick_count);
        cache.last_used_tick = self.tick_count;
        self.supply_cache_state_revision = self.supply_cache_state_revision.wrapping_add(1);
        crate::sim::actions::warfare::intercept_raid::mark_recent_attack(
            self, idx, &owner, cache_x, cache_y, None,
        );
        Some(CacheSabotageOutcome::Damaged)
    }

    /// Transfer one real ration from a hostile cache. A nearby, occupied
    /// fortification intercepts the raid; otherwise the raid also damages the
    /// structure, making repeated attacks a material threat rather than an
    /// infinite source of trail-based food.
    pub fn raid_supply_cache(&mut self, idx: usize, x: i32, y: i32) -> Option<CacheRaidOutcome> {
        if !self.can_raid_supply_cache(idx, x, y) {
            return None;
        }
        let actor_lineage = self.organisms[idx].lineage_id.clone();
        let mut candidates: Vec<usize> = self
            .supply_caches
            .iter()
            .enumerate()
            .filter(|(_, cache)| {
                cache.operational()
                    && cache.lineage_id != actor_lineage
                    && self.organisms[idx].attitude_toward(&cache.lineage_id) < -0.20
                    && (cache.x - x).abs() + (cache.y - y).abs() <= 3
                    && (cache.food > 0 || cache.water > 0)
            })
            .map(|(index, _)| index)
            .collect();
        candidates.sort_unstable_by_key(|&index| {
            let cache = &self.supply_caches[index];
            (
                (cache.x - x).abs() + (cache.y - y).abs(),
                cache.created_tick,
                index,
            )
        });
        let cache_index = candidates[0];
        let (cache_x, cache_y, owner) = {
            let cache = &self.supply_caches[cache_index];
            (cache.x, cache.y, cache.lineage_id.clone())
        };
        let assigned_guard =
            crate::sim::actions::warfare::stand_guard::active_guard(self, &owner, cache_x, cache_y).is_some();
        let fortified = self.field_fortifications.iter().any(|fortification| {
            fortification.lineage_id == owner
                && (fortification.x - cache_x).abs() + (fortification.y - cache_y).abs() <= 3
        });
        let defended = self.organisms.iter().any(|organism| {
            organism.alive
                && organism.lineage_id == owner
                && (organism.x as i32 - cache_x).abs() + (organism.y as i32 - cache_y).abs() <= 6
        });
        if assigned_guard || fortified && defended {
            self.organisms[idx].energy = (self.organisms[idx].energy - 0.025).max(0.0);
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.04).min(1.0);
            return Some(CacheRaidOutcome::Intercepted);
        }

        let steal_water = self.supply_caches[cache_index].water > 0
            && (self.supply_caches[cache_index].food == 0
                || self.organisms[idx].hydration < self.organisms[idx].energy);
        let supply = if steal_water {
            CachedSupply::Water
        } else {
            CachedSupply::Food
        };
        {
            let cache = &mut self.supply_caches[cache_index];
            *cache.amount_mut(supply) -= 1;
            cache.damage = cache.damage.saturating_add(12).min(100);
            cache.last_damage_tick = Some(self.tick_count);
            cache.last_used_tick = self.tick_count;
        }
        match supply {
            CachedSupply::Food => self.organisms[idx].inv_food += 1,
            CachedSupply::Water => self.organisms[idx].inv_water += 1,
        }
        self.grid.leave_trail(cache_x, cache_y, TrailKind::Path, 4.0);
        self.supply_cache_state_revision = self.supply_cache_state_revision.wrapping_add(1);
        crate::sim::actions::warfare::intercept_raid::mark_recent_attack(
            self,
            idx,
            &owner,
            cache_x,
            cache_y,
            Some(supply),
        );
        Some(CacheRaidOutcome::Stolen(supply))
    }

    fn tick_supply_cache_damage_and_repairs(&mut self) {
        let tick = self.tick_count;
        let mut changed = false;
        for cache_index in 0..self.supply_caches.len() {
            let (x, y, owner, prior_damage) = {
                let cache = &self.supply_caches[cache_index];
                (cache.x, cache.y, cache.lineage_id.clone(), cache.damage)
            };
            let exposure = match self.grid.get(x, y) {
                Tile::Fire => 45,
                Tile::Flooded => 22,
                _ if self.weather.kind >= 2
                    && (x as i64 * 31 + y as i64 * 17 + (tick / 120) as i64).rem_euclid(5) == 0 =>
                {
                    8
                }
                _ => 0,
            };
            if exposure > 0 {
                let cache = &mut self.supply_caches[cache_index];
                cache.damage = cache.damage.saturating_add(exposure).min(100);
                cache.last_damage_tick = Some(tick);
                if matches!(self.grid.get(x, y), Tile::Fire | Tile::Flooded) && cache.food > 0 {
                    cache.food -= 1;
                }
                changed |= cache.damage != prior_damage;
                continue;
            }
            if prior_damage == 0 {
                continue;
            }
            let repairer = self.organisms.iter().position(|organism| {
                organism.alive
                    && organism.lineage_id == owner
                    && organism.inv_wood > 0
                    && (organism.x as i32 - x).abs() + (organism.y as i32 - y).abs() <= 6
            });
            if let Some(repairer) = repairer {
                self.organisms[repairer].inv_wood -= 1;
                let cache = &mut self.supply_caches[cache_index];
                cache.damage = cache.damage.saturating_sub(30);
                cache.last_repair_tick = Some(tick);
                changed = true;
            }
        }
        if changed {
            self.supply_cache_state_revision = self.supply_cache_state_revision.wrapping_add(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn living_founder(sim: &Simulation) -> usize {
        sim.organisms.iter().position(|organism| organism.alive).unwrap()
    }

    #[test]
    fn imported_cache_repair_clamps_deduplicates_and_bounds() {
        let mut caches: Vec<SupplyCache> = (0..MAX_SUPPLY_CACHES + 8)
            .map(|index| SupplyCache {
                x: 10 + index as i32,
                y: 10,
                lineage_id: "lineage".into(),
                food: u8::MAX,
                water: u8::MAX,
                fishing_weir: false,
                created_tick: index as u64,
                last_used_tick: index as u64,
                last_produced_tick: index as u64,
                damage: 0,
                last_damage_tick: None,
                last_repair_tick: None,
            })
            .collect();
        caches.push(SupplyCache {
            x: 20,
            y: 10,
            lineage_id: "lineage".into(),
            created_tick: 999,
            last_used_tick: 999,
            food: 2,
            ..SupplyCache::default()
        });
        caches.push(SupplyCache {
            x: -5,
            y: 10,
            lineage_id: "lineage".into(),
            ..SupplyCache::default()
        });

        repair_supply_caches(&mut caches);

        assert_eq!(caches.len(), MAX_SUPPLY_CACHES);
        assert_eq!(
            caches
                .iter()
                .filter(|cache| (cache.x, cache.y) == (20, 10))
                .count(),
            1
        );
        assert_eq!(
            caches
                .iter()
                .find(|cache| (cache.x, cache.y) == (20, 10))
                .unwrap()
                .food,
            2
        );
        assert!(
            caches
                .iter()
                .all(|cache| cache.food <= SUPPLY_CACHE_RESOURCE_CAP
                    && cache.water <= SUPPLY_CACHE_RESOURCE_CAP)
        );
    }

    #[test]
    fn hostile_raid_transfers_one_real_ration_and_damages_cache() {
        let mut sim = Simulation::new(0xCA4E);
        let actor = living_founder(&sim);
        let (x, y) = (sim.organisms[actor].x as i32, sim.organisms[actor].y as i32);
        sim.organisms[actor].inv_food = 0;
        sim.organisms[actor].inv_water = 0;
        sim.organisms[actor]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: "rivals".into(),
            food: 2,
            water: 0,
            ..SupplyCache::default()
        });

        assert_eq!(
            sim.raid_supply_cache(actor, x, y),
            Some(CacheRaidOutcome::Stolen(CachedSupply::Food))
        );
        assert_eq!(sim.organisms[actor].inv_food, 1);
        assert_eq!(sim.supply_caches[0].food, 1);
        assert_eq!(sim.supply_caches[0].damage, 12);
        assert_eq!(sim.supply_caches[0].last_damage_tick, Some(sim.tick_count));
    }

    #[test]
    fn food_trails_and_friendly_supplies_cannot_be_converted_into_raid_loot() {
        let mut sim = Simulation::new(0xFA1E);
        let actor = living_founder(&sim);
        let lineage = sim.organisms[actor].lineage_id.clone();
        let (x, y) = (sim.organisms[actor].x as i32, sim.organisms[actor].y as i32);
        sim.organisms[actor].inv_food = 0;
        sim.grid.leave_trail(x, y, TrailKind::Food, 8.0);
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: lineage,
            food: 3,
            ..SupplyCache::default()
        });

        assert!(!sim.can_raid_supply_cache(actor, x, y));
        assert_eq!(sim.raid_supply_cache(actor, x, y), None);
        assert_eq!(sim.organisms[actor].inv_food, 0);
        assert_eq!(sim.supply_caches[0].food, 3);
    }

    #[test]
    fn sabotage_spoils_real_hostile_cache_without_rewarding_actor() {
        let mut sim = Simulation::new(0x5AB07A6E);
        let actor = living_founder(&sim);
        let (x, y) = (sim.organisms[actor].x as i32, sim.organisms[actor].y as i32);
        sim.organisms[actor]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        let food_before = sim.organisms[actor].inv_food;
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: "rivals".into(),
            food: 2,
            ..SupplyCache::default()
        });

        assert_eq!(
            sim.sabotage_supply_cache(actor, x, y),
            Some(CacheSabotageOutcome::Damaged)
        );
        assert_eq!(sim.supply_caches[0].food, 1);
        assert_eq!(sim.supply_caches[0].damage, 20);
        assert_eq!(sim.organisms[actor].inv_food, food_before);
    }

    #[test]
    fn assigned_guard_prevents_cache_sabotage_without_spoilage() {
        let mut sim = Simulation::new(0x5AB06A4D);
        let attacker = living_founder(&sim);
        let guard = sim
            .organisms
            .iter()
            .position(|organism| organism.alive && organism.id != sim.organisms[attacker].id)
            .unwrap();
        let (x, y) = (sim.organisms[attacker].x as i32, sim.organisms[attacker].y as i32);
        sim.organisms[attacker]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        sim.organisms[guard].lineage_id = "rivals".into();
        sim.organisms[guard].x = (x + 1) as f32;
        sim.organisms[guard].y = y as f32;
        sim.organisms[guard].directive = format!("guard_area:{}:{}", x + 1, y);
        sim.organisms[guard].directive_until = sim.tick_count + 100;
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: "rivals".into(),
            food: 2,
            ..SupplyCache::default()
        });

        assert_eq!(
            sim.sabotage_supply_cache(attacker, x, y),
            Some(CacheSabotageOutcome::Intercepted)
        );
        assert_eq!(sim.supply_caches[0].food, 2);
        assert_eq!(sim.supply_caches[0].damage, 0);
    }

    #[test]
    fn occupied_fortification_intercepts_cache_raid() {
        use crate::sim::warfare::FieldFortification;

        let mut sim = Simulation::new(0xF047);
        let actor = living_founder(&sim);
        let defender = sim
            .organisms
            .iter()
            .position(|organism| organism.alive && organism.id != sim.organisms[actor].id)
            .unwrap();
        let (x, y) = (sim.organisms[actor].x as i32, sim.organisms[actor].y as i32);
        sim.organisms[actor]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        sim.organisms[defender].lineage_id = "rivals".into();
        sim.organisms[defender].x = (x + 1) as f32;
        sim.organisms[defender].y = y as f32;
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: "rivals".into(),
            food: 2,
            ..SupplyCache::default()
        });
        sim.field_fortifications.push(FieldFortification {
            x: x + 1,
            y,
            lineage_id: "rivals".into(),
        });

        assert_eq!(
            sim.raid_supply_cache(actor, x, y),
            Some(CacheRaidOutcome::Intercepted)
        );
        assert_eq!(sim.supply_caches[0].food, 2);
        assert_eq!(sim.supply_caches[0].damage, 0);
    }

    #[test]
    fn assigned_guard_intercepts_cache_raid_without_a_fortification() {
        let mut sim = Simulation::new(0x6A4DED);
        let attacker = living_founder(&sim);
        let defender = sim
            .organisms
            .iter()
            .position(|organism| organism.alive && organism.id != sim.organisms[attacker].id)
            .unwrap();
        let (x, y) = (sim.organisms[attacker].x as i32, sim.organisms[attacker].y as i32);
        sim.organisms[attacker]
            .lineage_attitudes
            .insert("rivals".into(), -0.8);
        sim.organisms[defender].lineage_id = "rivals".into();
        sim.organisms[defender].x = (x + 1) as f32;
        sim.organisms[defender].y = y as f32;
        sim.organisms[defender].directive = format!("guard_area:{}:{}", x + 1, y);
        sim.organisms[defender].directive_until = sim.tick_count + 100;
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: "rivals".into(),
            food: 2,
            ..SupplyCache::default()
        });

        assert_eq!(
            sim.raid_supply_cache(attacker, x, y),
            Some(CacheRaidOutcome::Intercepted)
        );
        assert_eq!(sim.supply_caches[0].food, 2);
        assert_eq!(sim.supply_caches[0].damage, 0);
    }

    #[test]
    fn flood_spoils_cache_and_owner_spends_wood_to_repair_it() {
        let mut sim = Simulation::new(0xDA4A6E);
        let owner = living_founder(&sim);
        let lineage = sim.organisms[owner].lineage_id.clone();
        let (x, y) = (sim.organisms[owner].x as i32, sim.organisms[owner].y as i32);
        sim.organisms[owner].inv_wood = 1;
        sim.supply_caches.push(SupplyCache {
            x,
            y,
            lineage_id: lineage,
            food: 2,
            fishing_weir: true,
            ..SupplyCache::default()
        });
        sim.grid.set(x, y, Tile::Flooded);
        sim.tick_count = 120;

        sim.tick_supply_caches();
        assert_eq!(sim.supply_caches[0].damage, 22);
        assert_eq!(sim.supply_caches[0].food, 1);
        assert_eq!(sim.organisms[owner].inv_wood, 1);

        sim.grid.set(x, y, Tile::Grass);
        sim.tick_count = 240;
        sim.tick_supply_caches();
        assert_eq!(sim.supply_caches[0].damage, 0);
        assert_eq!(sim.supply_caches[0].last_repair_tick, Some(240));
        assert_eq!(sim.organisms[owner].inv_wood, 0);
    }
}
