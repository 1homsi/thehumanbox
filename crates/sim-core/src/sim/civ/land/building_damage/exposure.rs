/// Service lives were tuned against an 84-day year before the calendar was
/// unified with the four seasons (20 days). Wear keeps that pace, so ruins
/// arrive when they always did; only the calendar's names changed.
pub(crate) const BUILDING_WEAR_DAYS_PER_YEAR: u64 = 84;

use super::*;

pub(super) fn battle_damage(scale: BattleScale) -> f32 {
    // NOTE: this table is *not* monotonic in `BattleScale::min_participants`
    // (Skirmish 2, Raid 6, Siege 10, Battle 20, War 40 -> 0.001, 0.002,
    // 0.0075, 0.0045, 0.006), so a 10-strong siege does more building damage
    // per interval than a 40-strong war. `exposure_for` max'es over nearby
    // battles, so the siege value wins whenever one is active.
    //
    // Left as-is deliberately: sieges are the scale whose purpose is breaking
    // structures, so a higher per-building rate for fewer participants may
    // well be intended specialisation rather than a balance slip. Rescaling it
    // is a design call that needs its own balance pass, and
    // `siege_damage_reaches_a_besieged_building` pins the current value.
    // Left as is on purpose rather than silently "fixed".
    match scale {
        BattleScale::Skirmish => 0.001,
        BattleScale::Raid => 0.002,
        BattleScale::Siege => 0.0075,
        BattleScale::Battle => 0.0045,
        BattleScale::War => 0.006,
    }
}

pub(super) fn exposure_for(
    sim: &Simulation,
    building: &Building,
    fire_stations: &[(Option<&str>, i32, i32)],
) -> Option<Exposure> {
    let (width, height) = building.footprint();
    let mut strongest_fire = 0.0f32;
    let mut flooded = 0u32;
    let footprint_area = u32::from(width) * u32::from(height);
    for tile_y in building.y..building.y + i32::from(height) {
        for tile_x in building.x..building.x + i32::from(width) {
            match sim.grid.get(tile_x, tile_y) {
                Tile::Fire => {
                    strongest_fire = strongest_fire.max(sim.grid.fire_intensity(tile_x, tile_y).max(0.35));
                }
                // A home standing in a lake is as flooded as one in a puddle.
                Tile::Flooded | Tile::Water => flooded += 1,
                _ => {}
            }
        }
    }

    let protected_by_station = fire_stations.iter().any(|(owner, x, y)| {
        *owner == building.owner_lineage.as_deref()
            && (building.x - *x).abs() + (building.y - *y).abs() <= FIRE_STATION_RANGE
    });
    if strongest_fire > 0.0 {
        let protection = if protected_by_station { 0.35 } else { 1.0 };
        return Some(Exposure {
            amount: (0.030 * strongest_fire * protection).clamp(0.003, 0.04),
            cause: DamageCause::Fire,
        });
    }

    if flooded > 0 {
        return Some(Exposure {
            amount: (0.018 * flooded as f32 / footprint_area.max(1) as f32).max(0.004),
            cause: DamageCause::Flood,
        });
    }

    let center = (
        building.x + i32::from(width) / 2,
        building.y + i32::from(height) / 2,
    );
    if let Some(amount) = sim
        .battles
        .iter()
        .filter(|battle| battle.ended_tick.is_none())
        .filter_map(|battle| {
            let distance = (center.0 - battle.location.0).abs() + (center.1 - battle.location.1).abs();
            (distance <= 7).then_some(battle_damage(battle.scale))
        })
        .max_by(|a, b| a.total_cmp(b))
    {
        return Some(Exposure {
            amount,
            cause: DamageCause::Battle,
        });
    }

    // Storm exposure is sparse and deterministic, so a storm leaves a path of
    // damage instead of shaving health from every building in the world.
    if sim.weather.kind == 2
        && sim.weather.effective_intensity(sim.tick_count) > 0.55
        && (u64::from(building.id).wrapping_mul(17) + sim.tick_count / DAMAGE_TICK_INTERVAL)
            .is_multiple_of(11)
    {
        return Some(Exposure {
            amount: 0.006 * sim.weather.effective_intensity(sim.tick_count),
            cause: DamageCause::Storm,
        });
    }

    // Calendar-based wear is batched once a day, not once per organism or frame.
    // Repairs subtract wear, so a maintained building can outlive its nominal life.
    if sim.tick_count.is_multiple_of(crate::sim::cosmos::DAY_LENGTH)
        && sim.tick_count.saturating_sub(building.built_at_tick) >= crate::sim::cosmos::DAY_LENGTH
        && !building.is_ruined()
    {
        return Some(Exposure {
            amount: 1.0 / (building.kind.service_life_years() as f32 * BUILDING_WEAR_DAYS_PER_YEAR as f32),
            cause: DamageCause::Age,
        });
    }
    None
}
