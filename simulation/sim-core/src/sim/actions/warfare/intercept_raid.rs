use super::super::ctx::ActionCtx;
use crate::sim::simulation::Simulation;
use crate::sim::survival_resources::{CachedSupply, SUPPLY_CACHE_RESOURCE_CAP};

const RAID_TRACE_PREFIX: &str = "recent_infrastructure_raid:";
const RAID_TRACE_TICKS: u64 = 180;

#[derive(Clone, Debug, PartialEq, Eq)]
struct RaidTrace {
    attribute: String,
    target_lineage: String,
    tick: u64,
    x: i32,
    y: i32,
    loot: Option<CachedSupply>,
}

fn parse_trace(attribute: &str) -> Option<RaidTrace> {
    let payload = attribute.strip_prefix(RAID_TRACE_PREFIX)?;
    let mut parts = payload.rsplitn(5, ':');
    let loot = match parts.next()? {
        "food" => Some(CachedSupply::Food),
        "water" => Some(CachedSupply::Water),
        "none" => None,
        _ => return None,
    };
    let y = parts.next()?.parse().ok()?;
    let x = parts.next()?.parse().ok()?;
    let tick = parts.next()?.parse().ok()?;
    let target_lineage = parts.next()?.to_string();
    (!target_lineage.is_empty()).then(|| RaidTrace {
        attribute: attribute.to_string(),
        target_lineage,
        tick,
        x,
        y,
        loot,
    })
}

pub fn mark_recent_attack(
    sim: &mut Simulation,
    attacker: usize,
    target_lineage: &str,
    x: i32,
    y: i32,
    loot: Option<CachedSupply>,
) {
    let Some(attacker) = sim.organisms.get_mut(attacker) else {
        return;
    };
    attacker
        .attributes
        .retain(|attribute| !attribute.starts_with(RAID_TRACE_PREFIX));
    let loot = match loot {
        Some(CachedSupply::Food) => "food",
        Some(CachedSupply::Water) => "water",
        None => "none",
    };
    attacker.attributes.insert(format!(
        "{RAID_TRACE_PREFIX}{target_lineage}:{}:{x}:{y}:{loot}",
        sim.tick_count
    ));
}

fn recent_trace_for(sim: &Simulation, raider: usize, defender_lineage: &str) -> Option<RaidTrace> {
    sim.organisms
        .get(raider)?
        .attributes
        .iter()
        .find_map(|attribute| {
            let trace = parse_trace(attribute)?;
            (trace.target_lineage == defender_lineage
                && trace.tick <= sim.tick_count
                && sim.tick_count.saturating_sub(trace.tick) <= RAID_TRACE_TICKS)
                .then_some(trace)
        })
}

fn target(sim: &Simulation, idx: usize) -> Option<(usize, RaidTrace)> {
    let defender = sim.organisms.get(idx).filter(|defender| {
        defender.alive
            && defender.age_stage().can_combat()
            && defender.energy > 0.20
            && defender.health > 0.30
    })?;
    let mut candidates: Vec<(usize, RaidTrace)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(index, raider)| {
            *index != idx
                && raider.alive
                && raider.lineage_id != defender.lineage_id
                && (raider.x - defender.x).abs() + (raider.y - defender.y).abs() <= 6.0
        })
        .filter_map(|(index, _)| {
            recent_trace_for(sim, index, &defender.lineage_id).map(|trace| (index, trace))
        })
        .collect();
    candidates.sort_unstable_by(|left, right| {
        right
            .1
            .tick
            .cmp(&left.1.tick)
            .then_with(|| {
                let left_raider = &sim.organisms[left.0];
                let right_raider = &sim.organisms[right.0];
                let left_distance = (left_raider.x - defender.x).abs() + (left_raider.y - defender.y).abs();
                let right_distance =
                    (right_raider.x - defender.x).abs() + (right_raider.y - defender.y).abs();
                left_distance.total_cmp(&right_distance)
            })
            .then_with(|| left.0.cmp(&right.0))
    });
    candidates.into_iter().next()
}

pub fn can_apply(sim: &Simulation, idx: usize) -> bool {
    target(sim, idx).is_some()
}

fn recover_loot(sim: &mut Simulation, defender: usize, raider: usize, trace: &RaidTrace) -> bool {
    let Some(supply) = trace.loot else {
        return false;
    };
    let raider_has_loot = match supply {
        CachedSupply::Food => sim.organisms[raider].inv_food > 0,
        CachedSupply::Water => sim.organisms[raider].inv_water > 0,
    };
    if !raider_has_loot {
        return false;
    }
    let defender_lineage = sim.organisms[defender].lineage_id.clone();
    let mut caches: Vec<usize> = sim
        .supply_caches
        .iter()
        .enumerate()
        .filter(|(_, cache)| {
            cache.lineage_id == defender_lineage
                && cache.operational()
                && cache.amount(supply) < SUPPLY_CACHE_RESOURCE_CAP
                && (cache.x - trace.x).abs() + (cache.y - trace.y).abs() <= 6
        })
        .map(|(index, _)| index)
        .collect();
    caches.sort_unstable_by_key(|&index| {
        let cache = &sim.supply_caches[index];
        ((cache.x - trace.x).abs() + (cache.y - trace.y).abs(), index)
    });
    if let Some(cache_index) = caches.first().copied() {
        match supply {
            CachedSupply::Food => {
                sim.organisms[raider].inv_food -= 1;
                sim.supply_caches[cache_index].food += 1;
            }
            CachedSupply::Water => {
                sim.organisms[raider].inv_water -= 1;
                sim.supply_caches[cache_index].water += 1;
            }
        }
        sim.supply_caches[cache_index].last_used_tick = sim.tick_count;
        sim.supply_cache_state_revision = sim.supply_cache_state_revision.wrapping_add(1);
        return true;
    }
    if sim.organisms[defender].carry_room() == 0 {
        return false;
    }
    match supply {
        CachedSupply::Food => {
            sim.organisms[raider].inv_food -= 1;
            sim.organisms[defender].inv_food += 1;
        }
        CachedSupply::Water => {
            sim.organisms[raider].inv_water -= 1;
            sim.organisms[defender].inv_water += 1;
        }
    }
    true
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let Some((raider, trace)) = target(ctx.sim, ctx.idx) else {
        return 0.0;
    };
    ctx.sim.organisms[raider].attributes.remove(&trace.attribute);
    let recovered = recover_loot(ctx.sim, ctx.idx, raider, &trace);
    ctx.sim.organisms[raider].health = (ctx.sim.organisms[raider].health - 0.05).max(0.0);
    ctx.sim.organisms[raider].energy = (ctx.sim.organisms[raider].energy - 0.05).max(0.0);
    ctx.sim.organisms[raider].fear_level = (ctx.sim.organisms[raider].fear_level + 0.08).min(1.0);
    ctx.org_mut().energy = (ctx.org().energy - 0.03).max(0.0);
    ctx.think(if recovered {
        "catching a raider and recovering supplies"
    } else {
        "catching a fleeing raider"
    });
    ctx.discover("defense", "intercepted a real raid");
    ctx.event(
        "war",
        if recovered {
            "caught a raider and returned stolen supplies"
        } else {
            "caught a raider before they escaped"
        },
    );
    if recovered {
        0.020
    } else {
        0.014
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::actions::try_apply;
    use crate::sim::spatial::SpatialIndex;
    use crate::sim::survival_resources::{CacheRaidOutcome, SupplyCache};

    fn raid_world() -> (Simulation, usize, usize, i32, i32) {
        let mut sim = Simulation::new(0x1A7E2CE97);
        let attacker = sim.organisms.iter().position(|organism| organism.alive).unwrap();
        let defender = sim
            .organisms
            .iter()
            .position(|organism| organism.alive && organism.id != sim.organisms[attacker].id)
            .unwrap();
        let (x, y) = (sim.organisms[attacker].x as i32, sim.organisms[attacker].y as i32);
        sim.organisms[attacker].inv_food = 0;
        sim.organisms[attacker].inv_water = 0;
        sim.organisms[attacker]
            .lineage_attitudes
            .insert("defenders".into(), -0.8);
        sim.organisms[defender].lineage_id = "defenders".into();
        sim.organisms[defender].x = (x + 2) as f32;
        sim.organisms[defender].y = y as f32;
        sim.organisms[defender].age = sim.organisms[defender].max_age / 2;
        sim.organisms[defender].energy = 0.80;
        sim.organisms[defender].health = 0.80;
        sim.supply_caches.push(SupplyCache {
            x: x + 1,
            y,
            lineage_id: "defenders".into(),
            food: 2,
            ..SupplyCache::default()
        });
        (sim, attacker, defender, x, y)
    }

    #[test]
    fn interception_returns_exact_stolen_ration_and_consumes_trace_once() {
        let (mut sim, attacker, defender, x, y) = raid_world();
        assert_eq!(
            sim.raid_supply_cache(attacker, x, y),
            Some(CacheRaidOutcome::Stolen(CachedSupply::Food))
        );
        assert_eq!(sim.supply_caches[0].food, 1);
        assert_eq!(sim.organisms[attacker].inv_food, 1);
        assert!(can_apply(&sim, defender));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let (defender_x, defender_y) = (sim.organisms[defender].x as i32, sim.organisms[defender].y as i32);

        let result = try_apply(&mut sim, defender, 199, defender_x, defender_y, &spatial);

        assert!(result.is_some_and(|reward| reward > 0.0));
        assert_eq!(sim.supply_caches[0].food, 2);
        assert_eq!(sim.organisms[attacker].inv_food, 0);
        assert!(!can_apply(&sim, defender));
        assert!(try_apply(&mut sim, defender, 199, x + 2, y, &spatial).is_none());
    }

    #[test]
    fn raid_trace_survives_reload_then_expires_at_bounded_age() {
        let (mut sim, attacker, defender, x, y) = raid_world();
        mark_recent_attack(
            &mut sim,
            attacker,
            "defenders",
            x + 1,
            y,
            Some(CachedSupply::Food),
        );
        let json = serde_json::to_string(&sim.to_save_state()).unwrap();
        let state: crate::sim::persistence::SaveState = serde_json::from_str(&json).unwrap();
        let mut loaded = Simulation::from_save(0x1A7E2CE97, state);
        let loaded_defender = loaded
            .organisms
            .iter()
            .position(|organism| organism.id == sim.organisms[defender].id)
            .unwrap();

        assert!(can_apply(&loaded, loaded_defender));
        loaded.tick_count = sim.tick_count + RAID_TRACE_TICKS + 1;
        assert!(!can_apply(&loaded, loaded_defender));
    }

    #[test]
    fn nearby_foreigner_without_real_raid_trace_cannot_be_intercepted() {
        let (sim, _, defender, _, _) = raid_world();
        assert!(!can_apply(&sim, defender));
    }

    #[test]
    fn future_dated_imported_trace_never_enables_interception() {
        let (mut sim, attacker, defender, x, y) = raid_world();
        sim.organisms[attacker].attributes.insert(format!(
            "{RAID_TRACE_PREFIX}defenders:{}:{}:{}:food",
            sim.tick_count + 10_000,
            x,
            y
        ));
        assert!(!can_apply(&sim, defender));
    }
}
