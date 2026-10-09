use super::*;
use crate::math::DetMath;

pub(super) fn apply_damage(sim: &mut Simulation) -> HashSet<usize> {
    let fire_stations: Vec<(Option<&str>, i32, i32)> = sim
        .buildings
        .iter()
        .filter(|building| building.is_operational() && building.kind == BuildingKind::FireStation)
        .map(|building| (building.owner_lineage.as_deref(), building.x, building.y))
        .collect();
    let exposures: Vec<(usize, Exposure)> = sim
        .buildings
        .iter()
        .enumerate()
        .filter(|(_, building)| {
            building.is_complete() && !building.decorative && supports_damage(building.kind)
        })
        .filter_map(|(index, building)| {
            exposure_for(sim, building, &fire_stations).map(|exposure| (index, exposure))
        })
        .collect();

    let mut exposed = HashSet::default();
    let mut ruined_events = Vec::new();
    for (index, exposure) in exposures {
        exposed.insert(index);
        let building = &mut sim.buildings[index];
        let was_ruined = building.is_ruined();
        building.damage = (building.damage_fraction() + exposure.amount).min(1.0);
        building.last_damage_tick = Some(sim.tick_count);
        if !was_ruined && building.damage_fraction() >= 1.0 {
            building.ruined_at_tick = Some(sim.tick_count);
            ruined_events.push((
                building
                    .owner_lineage
                    .clone()
                    .unwrap_or_else(|| "world".to_string()),
                building.kind,
                building.x,
                building.y,
                exposure.cause,
            ));
        }
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }

    for (lineage, kind, x, y, cause) in ruined_events {
        announce_ruin(sim, lineage, kind, x, y, cause);
    }
    exposed
}

pub(super) fn announce_ruin(
    sim: &mut Simulation,
    lineage: String,
    kind: BuildingKind,
    x: i32,
    y: i32,
    cause: DamageCause,
) {
    push_event(
        &mut sim.events,
        sim.tick_count,
        "building_ruined",
        &lineage,
        &format!("{} at ({},{}) was ruined by {}", kind.name(), x, y, cause.label()),
    );
    let lineage_name = sim.lineage_names.get(&lineage).cloned().unwrap_or(lineage);
    sim.headlines.push_back((
        sim.tick_count,
        format!(
            "\u{1F525} A {} of the {} fell to {}.",
            kind.name(),
            lineage_name,
            cause.label()
        ),
    ));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
}

/// A disaster landing on the world: every completed building with any part
/// of its footprint within `radius` of (x, y) takes `core` damage at the
/// centre, falling to `edge` at the rim. Returns how many were hit.
pub(crate) fn strike_buildings(
    sim: &mut Simulation,
    x: i32,
    y: i32,
    radius: f32,
    core: f32,
    edge: f32,
    cause: DamageCause,
) -> usize {
    let tick = sim.tick_count;
    let r = radius.max(0.5);
    let mut hit = 0;
    let mut ruined = Vec::new();
    for building in sim.buildings.iter_mut() {
        if !building.is_complete() || building.decorative || !supports_damage(building.kind) {
            continue;
        }
        let (nx, ny) = building.closest_footprint_tile(x, y);
        let d = ((nx - x) as f32).det_hypot((ny - y) as f32);
        if d > r {
            continue;
        }
        let was_ruined = building.is_ruined();
        let amount = edge + (core - edge) * (1.0 - d / r);
        building.damage = (building.damage_fraction() + amount).min(1.0);
        building.last_damage_tick = Some(tick);
        if !was_ruined && building.damage_fraction() >= 1.0 {
            building.ruined_at_tick = Some(tick);
            let (fw, fh) = building.footprint();
            ruined.push((
                building
                    .owner_lineage
                    .clone()
                    .unwrap_or_else(|| "world".to_string()),
                building.kind,
                (building.x, building.y, i32::from(fw), i32::from(fh)),
                building.occupants.clone(),
            ));
        }
        hit += 1;
    }
    if hit > 0 {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    for (lineage, kind, (bx, by, fw, fh), occupants) in ruined {
        // Whoever was inside is hurt; the household loses its home.
        for o in sim.organisms.iter_mut().filter(|o| o.alive) {
            let (ox, oy) = (o.x as i32, o.y as i32);
            let inside = ox >= bx && ox < bx + fw && oy >= by && oy < by + fh;
            if inside {
                o.health = (o.health - 0.35).max(0.05);
                o.mark_harm(crate::organism::organism::Harm::Disaster, sim.tick_count);
                o.fear_level = (o.fear_level + 0.4).min(1.0);
            }
            if inside || occupants.contains(&o.id) {
                o.hope = (o.hope - 0.15).max(0.0);
                o.think("our home was destroyed", tick);
            }
        }
        announce_ruin(sim, lineage, kind, bx, by, cause);
    }
    hit
}

/// Earthquake god tool: shakes buildings near (x, y), worst at the centre.
pub(crate) fn quake_damage(sim: &mut Simulation, x: i32, y: i32, radius: i32) -> usize {
    strike_buildings(sim, x, y, radius as f32, 0.8, 0.35, DamageCause::Quake)
}

pub(crate) fn tick_building_damage(sim: &mut Simulation) {
    if sim.tick_count == 0 || !sim.tick_count.is_multiple_of(DAMAGE_TICK_INTERVAL) {
        return;
    }
    // Repairing is a short activity animation derived from timestamps rather
    // than a persisted toggle. Publish the exact cadence where it expires so
    // hot/incremental clients do not retain a stale rebuilding state until the
    // next periodic full snapshot.
    let repair_activity_expired = sim.buildings.iter().any(|building| {
        building.is_complete()
            && !building.decorative
            && building.is_damaged()
            && building.last_repair_tick.is_some_and(|repair_tick| {
                repair_tick >= building.last_damage_tick.unwrap_or(0)
                    && sim.tick_count.saturating_sub(repair_tick) > REPAIR_ACTIVITY_TICKS
                    && sim.tick_count.saturating_sub(repair_tick)
                        <= REPAIR_ACTIVITY_TICKS + DAMAGE_TICK_INTERVAL
            })
    });
    if repair_activity_expired {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    let exposed = apply_damage(sim);
    if sim.tick_count % REPAIR_TICK_INTERVAL == REPAIR_TICK_OFFSET {
        apply_repairs(sim, &exposed);
    }
}
