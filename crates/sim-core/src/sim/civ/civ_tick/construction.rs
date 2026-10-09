use super::*;

pub(super) const FUNCTIONAL_BUILDINGS_CAP: usize = 1200;

pub(super) const BUILDINGS_SOFT_CAP: usize = 1500;

pub(super) const RUIN_RETENTION_TICKS: u64 = 1_200;

/// Ticks between building passes (see `tick_buildings_construct`).
pub(super) const BUILD_PASS_TICKS: u64 = 240;

pub(super) const REPAIR_GRACE_TICKS: u64 = 600;

pub(super) const BASELINE_MAX_BUILDING_REQUIREMENT: usize = 450;

pub(super) const CONSTRUCTION_WORKER_REACH: f32 = 18.0;

pub(super) fn construction_population_requirement(base: usize, population_limit: usize) -> usize {
    // Building thresholds were originally authored for a single lineage that
    // could grow to 450 people. A local world intentionally protects multiple
    // lineages, so scale that secondary gate to the largest sustainable
    // lineage share. Era/discovery requirements remain unchanged.
    let lineage_capacity =
        natural_lineage_limit(population_limit).clamp(1, BASELINE_MAX_BUILDING_REQUIREMENT);
    // Preserve authored pacing wherever it is achievable. Only gates above
    // the expected lineage ceiling are lowered; proportional compression
    // would make classical cities appear in settlements of just 3 people.
    base.min(lineage_capacity)
}

pub(super) fn construction_cost_available(sim: &Simulation, lineage: &str, kind: BuildingKind) -> bool {
    lineage_can_afford_construction(sim, lineage, kind)
}

pub(super) fn reserve_construction_cost(sim: &mut Simulation, lineage: &str, kind: BuildingKind) -> bool {
    if !construction_cost_available(sim, lineage, kind) {
        return false;
    }
    let cost = kind.construction_cost();

    let mut wood_left = u32::from(cost.wood);
    let mut stone_left = u32::from(cost.stone);
    let mut wealth_left = cost.wealth;
    for org in sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id == lineage)
    {
        let wood = wood_left.min(u32::from(org.inv_wood));
        org.inv_wood -= wood as u8;
        wood_left -= wood;

        let stone = stone_left.min(u32::from(org.inv_stone));
        org.inv_stone -= stone as u8;
        stone_left -= stone;

        let wealth = wealth_left.min(org.wealth);
        org.wealth -= wealth;
        wealth_left -= wealth;
        if wood_left == 0 && stone_left == 0 && wealth_left == 0 {
            break;
        }
    }
    debug_assert_eq!((wood_left, stone_left, wealth_left), (0, 0, 0));
    true
}

/// Uses the same pooled-lineage accounting as construction reservation, but
/// without mutating inventory. Action selection can therefore avoid offering
/// a project that its effect would immediately reject for missing inputs.
pub(crate) fn lineage_can_afford_construction(sim: &Simulation, lineage: &str, kind: BuildingKind) -> bool {
    let cost = kind.construction_cost();
    let (wood, stone, wealth) = sim
        .organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage)
        .fold((0u32, 0u32, 0u64), |(wood, stone, wealth), org| {
            (
                wood + u32::from(org.inv_wood),
                stone + u32::from(org.inv_stone),
                wealth + u64::from(org.wealth),
            )
        });
    wood >= u32::from(cost.wood) && stone >= u32::from(cost.stone) && wealth >= u64::from(cost.wealth)
}

pub(super) fn building_footprints_overlap(
    a_x: i32,
    a_y: i32,
    a_width: u8,
    a_height: u8,
    b_x: i32,
    b_y: i32,
    b_width: u8,
    b_height: u8,
) -> bool {
    a_x < b_x + i32::from(b_width)
        && a_x + i32::from(a_width) > b_x
        && a_y < b_y + i32::from(b_height)
        && a_y + i32::from(a_height) > b_y
}

pub(crate) fn construction_site_is_valid(sim: &Simulation, kind: BuildingKind, x: i32, y: i32) -> bool {
    use crate::world::grid::{HEIGHT, WIDTH};
    use crate::world::tiles::Tile;

    let (width, height) = kind.footprint();
    if x < 0 || y < 0 || x + i32::from(width) > WIDTH as i32 || y + i32::from(height) > HEIGHT as i32 {
        return false;
    }

    if kind == BuildingKind::Bridge {
        // A bridge spans a four-tile horizontal channel: dry land anchors
        // both ends, while at least one interior tile must actually be water.
        // Water is invalid for every other construction kind.
        let valid_anchor = |tile| {
            matches!(
                tile,
                Tile::Grass | Tile::Food | Tile::Ash | Tile::Scorched | Tile::Snow | Tile::Sand
            )
        };
        if height != 1
            || width < 3
            || !valid_anchor(sim.grid.get(x, y))
            || !valid_anchor(sim.grid.get(x + i32::from(width) - 1, y))
        {
            return false;
        }
        let mut crosses_water = false;
        for tile_x in x + 1..x + i32::from(width) - 1 {
            match sim.grid.get(tile_x, y) {
                Tile::Water => crosses_water = true,
                tile if valid_anchor(tile) => {}
                _ => return false,
            }
        }
        if !crosses_water {
            return false;
        }
    } else {
        for tile_y in y..y + i32::from(height) {
            for tile_x in x..x + i32::from(width) {
                if matches!(
                    sim.grid.get(tile_x, tile_y),
                    Tile::Void | Tile::Water | Tile::Fire | Tile::Campfire | Tile::Hut | Tile::Flooded
                ) {
                    return false;
                }
            }
        }
    }
    !sim.buildings.iter().any(|building| {
        !building.decorative
            && building_footprints_overlap(
                x,
                y,
                width,
                height,
                building.x,
                building.y,
                building.footprint().0,
                building.footprint().1,
            )
    })
}

pub(super) fn apply_completed_building_effect(sim: &mut Simulation, kind: BuildingKind, x: i32, y: i32) {
    use crate::world::grid::{TrailKind, WorldGrid};
    use crate::world::tiles::Tile;

    match kind {
        BuildingKind::Well => {
            // Groundwater is a completed well's effect, not a free side
            // effect of selecting the action that opened its project.
            sim.grid.set(x, y, Tile::Water);
            sim.grid.depth[WorldGrid::idx(x, y)] = 0.0;
        }
        BuildingKind::Bridge => {
            let (width, height) = kind.footprint();
            for tile_y in y..y + i32::from(height) {
                for tile_x in x..x + i32::from(width) {
                    if matches!(sim.grid.get(tile_x, tile_y), Tile::Water | Tile::Flooded) {
                        // Sand is walkable, nonflammable, and cannot regrow
                        // food. The Building entity supplies the bridge visual;
                        // the terrain conversion supplies actual traversal.
                        sim.grid.set(tile_x, tile_y, Tile::Sand);
                        sim.grid.fertility[WorldGrid::idx(tile_x, tile_y)] = 0.0;
                    }
                    // Depth is mutable independently of the tile enum. Keep
                    // the complete footprint traversable after hydrology or
                    // loading an older save regenerated its depth layer.
                    sim.grid.depth[WorldGrid::idx(tile_x, tile_y)] = 0.0;
                    sim.grid.leave_trail(tile_x, tile_y, TrailKind::Path, 5.0);
                }
            }
        }
        _ => {}
    }
}

/// Reasserts the terrain contract of completed infrastructure after mutable
/// hydrology has run or a save has been imported. Collect first so applying an
/// effect can mutably borrow the simulation without aliasing `buildings`.
pub(crate) fn reconcile_operational_infrastructure(sim: &mut Simulation) {
    let infrastructure: Vec<_> = sim
        .buildings
        .iter()
        .filter(|building| {
            building.is_operational() && matches!(building.kind, BuildingKind::Well | BuildingKind::Bridge)
        })
        .map(|building| (building.kind, building.x, building.y))
        .collect();
    for (kind, x, y) in infrastructure {
        apply_completed_building_effect(sim, kind, x, y);
    }
}

pub(super) fn can_work_on_construction(org: &crate::organism::organism::Organism) -> bool {
    org.alive && org.age_stage() == AgeStage::Adult && org.energy > 0.20 && org.health > 0.25
}

pub(super) fn construction_site_has_reachable_worker(
    sim: &Simulation,
    lineage: &str,
    x: i32,
    y: i32,
) -> bool {
    sim.organisms.iter().any(|org| {
        org.lineage_id == lineage
            && can_work_on_construction(org)
            && (org.x - x as f32).abs() + (org.y - y as f32).abs() <= CONSTRUCTION_WORKER_REACH
    })
}

// Automatic settlements leave a lane between structures. Exact player/action
// placement still uses the strict footprint check; connected infrastructure
// such as walls and bridges must remain possible.
pub(super) fn automatic_site_has_clearance(sim: &Simulation, kind: BuildingKind, x: i32, y: i32) -> bool {
    if matches!(
        kind,
        BuildingKind::Bridge | BuildingKind::Wall | BuildingKind::Gate | BuildingKind::Aqueduct
    ) {
        return true;
    }
    let (w, h) = kind.footprint();
    !sim.buildings.iter().filter(|b| !b.decorative).any(|b| {
        let (bw, bh) = b.footprint();
        building_footprints_overlap(x - 1, y - 2, w + 2, h + 4, b.x, b.y, bw, bh)
    })
}

pub(super) fn find_construction_site(
    sim: &Simulation,
    lineage: &str,
    kind: BuildingKind,
    preferred_x: i32,
    preferred_y: i32,
) -> Option<(i32, i32)> {
    if construction_site_is_valid(sim, kind, preferred_x, preferred_y)
        && automatic_site_has_clearance(sim, kind, preferred_x, preferred_y)
        && construction_site_has_reachable_worker(sim, lineage, preferred_x, preferred_y)
    {
        return Some((preferred_x, preferred_y));
    }
    // Automatic plans use a preferred settlement offset. Search a compact
    // ring around it so water or another structure delays only this site,
    // rather than charging resources or permanently blocking construction.
    for radius in 1i32..=12 {
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                let x = preferred_x + dx;
                let y = preferred_y + dy;
                if construction_site_is_valid(sim, kind, x, y)
                    && automatic_site_has_clearance(sim, kind, x, y)
                    && construction_site_has_reachable_worker(sim, lineage, x, y)
                {
                    return Some((x, y));
                }
            }
        }
    }
    None
}

pub(super) fn start_building_at_valid_site(
    sim: &mut Simulation,
    lineage: &str,
    kind: BuildingKind,
    site_x: i32,
    site_y: i32,
) -> bool {
    if !construction_site_is_valid(sim, kind, site_x, site_y)
        || !construction_site_has_reachable_worker(sim, lineage, site_x, site_y)
        || !construction_cost_available(sim, lineage, kind)
    {
        return false;
    }
    let functional_count = sim
        .buildings
        .iter()
        .filter(|building| !building.decorative)
        .count();
    if functional_count >= FUNCTIONAL_BUILDINGS_CAP {
        let needed = functional_count - FUNCTIONAL_BUILDINGS_CAP + 1;
        if abandoned_ruin_candidates(sim).len() < needed {
            return false;
        }
        prune_abandoned_ruins(sim, needed);
    }
    if sim
        .buildings
        .iter()
        .filter(|building| !building.decorative)
        .count()
        >= FUNCTIONAL_BUILDINGS_CAP
    {
        return false;
    }
    if !reserve_construction_cost(sim, lineage, kind) {
        return false;
    }
    let (site_width, site_height) = kind.footprint();
    sim.buildings.retain(|building| {
        !building.decorative
            || !building_footprints_overlap(
                site_x,
                site_y,
                site_width,
                site_height,
                building.x,
                building.y,
                building.footprint().0,
                building.footprint().1,
            )
    });
    let id = sim.next_building_id;
    sim.next_building_id += 1;
    sim.buildings.push(Building::new(
        id,
        kind,
        site_x,
        site_y,
        Some(lineage.to_string()),
        sim.tick_count,
    ));
    sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    let cost = kind.construction_cost();
    push_event(
        &mut sim.events,
        sim.tick_count,
        "construction_started",
        lineage,
        &format!(
            "started a {} using {} wood, {} stone, and {} wealth",
            kind.name(),
            cost.wood,
            cost.stone,
            cost.wealth
        ),
    );
    true
}

/// Opens a construction project at an exact, player-selected site.
///
/// Action-driven construction must never silently move a project or consume
/// materials for a blocked footprint. Validation and worker availability are
/// therefore checked before the lineage's pooled cost is reserved.
pub(crate) fn try_start_building_at(
    sim: &mut Simulation,
    lineage: &str,
    kind: BuildingKind,
    x: i32,
    y: i32,
) -> bool {
    start_building_at_valid_site(sim, lineage, kind, x, y)
}

pub(super) fn try_start_building(
    sim: &mut Simulation,
    lineage: &str,
    kind: BuildingKind,
    x: i32,
    y: i32,
) -> bool {
    try_start_building_with(sim, lineage, kind, x, y, &mut FailedSites::default())
}

/// Site searches that came up empty during one lineage's construction pass.
///
/// A failed search scans up to 625 tiles against every building and worker,
/// and a pass used to repeat it for each candidate kind. Every check except a
/// bridge's only gets stricter as the footprint grows, so a footprint that
/// covers a failed one around the same anchor fails too and can be skipped.
#[derive(Default)]
pub(super) struct FailedSites(Vec<(i32, i32, u8, u8, bool)>);

impl FailedSites {
    fn key(kind: BuildingKind, x: i32, y: i32) -> Option<(i32, i32, u8, u8, bool)> {
        if kind == BuildingKind::Bridge {
            return None;
        }
        let (w, h) = kind.footprint();
        let clearance_exempt = matches!(
            kind,
            BuildingKind::Wall | BuildingKind::Gate | BuildingKind::Aqueduct
        );
        Some((x, y, w, h, clearance_exempt))
    }

    fn covers(&self, kind: BuildingKind, x: i32, y: i32) -> bool {
        let Some((x, y, w, h, exempt)) = Self::key(kind, x, y) else {
            return false;
        };
        self.0
            .iter()
            .any(|&(fx, fy, fw, fh, fe)| fx == x && fy == y && fe == exempt && w >= fw && h >= fh)
    }
}

pub(super) fn try_start_building_with(
    sim: &mut Simulation,
    lineage: &str,
    kind: BuildingKind,
    x: i32,
    y: i32,
    failed: &mut FailedSites,
) -> bool {
    // Starting rejects a project the lineage cannot pay for, and the search
    // does not mutate, so checking cost first is the same decision without
    // the scan.
    if !construction_cost_available(sim, lineage, kind) || failed.covers(kind, x, y) {
        return false;
    }
    let Some((site_x, site_y)) = find_construction_site(sim, lineage, kind, x, y) else {
        failed.0.extend(FailedSites::key(kind, x, y));
        return false;
    };
    let started = start_building_at_valid_site(sim, lineage, kind, site_x, site_y);
    if started {
        // Starting can prune abandoned ruins and free land.
        failed.0.clear();
    }
    started
}

pub(super) fn housing_target(
    sim: &Simulation,
    lineage: &str,
    era: Era,
    population: usize,
) -> Option<BuildingKind> {
    use BuildingKind::*;
    let capacity: usize = sim.buildings.iter()
        .filter(|b| !b.decorative && !b.is_ruined() && b.owner_lineage.as_deref() == Some(lineage))
        .filter(|b| matches!(b.kind, Hut | House | Manor | TownHouse | Apartment | Skyscraper))
        // Reserved homes count too, so unfinished projects cannot cause a building flood.
        .map(|b| usize::from(b.kind.capacity())).sum();
    if capacity >= population {
        return None;
    }
    [Apartment, TownHouse, House, Hut]
        .into_iter()
        .find(|kind| era >= kind.era_unlock() && construction_cost_available(sim, lineage, *kind))
}

pub(super) fn tick_buildings_construct(sim: &mut Simulation) {
    let functional_count = sim
        .buildings
        .iter()
        .filter(|building| !building.decorative)
        .count();
    let mut functional_slots = FUNCTIONAL_BUILDINGS_CAP.saturating_sub(functional_count);
    if functional_slots == 0 {
        let needed = functional_count - FUNCTIONAL_BUILDINGS_CAP + 1;
        if abandoned_ruin_candidates(sim).len() >= needed {
            // Reserve one logical slot. The selected project will perform the
            // actual eviction only after its site, worker, and pooled cost all
            // pass non-mutating validation.
            functional_slots = 1;
        }
    }
    if functional_slots == 0 {
        return;
    }
    // Sort before iterating: this loop consumes a shared `functional_slots`
    // budget and derives building offsets from `next_building_id`, so
    // `HashSet` order decided *which* lineage got the hospital. `std`
    // HashSet is randomly seeded per process, which broke seed
    // reproducibility.
    let mut alive_lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    alive_lineages.sort();
    alive_lineages.dedup();
    for lid in alive_lineages {
        if functional_slots == 0 {
            break;
        }
        let era = lineage_era(sim, &lid);
        let pop = lineage_pop(sim, &lid);
        if pop < 3 {
            continue;
        }
        // Finish a manageable number of projects before reserving more land
        // and materials. Children and exhausted residents are not a workforce.
        let workers = sim
            .organisms
            .iter()
            .filter(|o| o.lineage_id == lid && can_work_on_construction(o))
            .count();
        let project_limit = workers.div_ceil(6).clamp(1, 3);
        let pending = sim
            .buildings
            .iter()
            .filter(|b| !b.decorative && !b.is_complete() && b.owner_lineage.as_deref() == Some(lid.as_str()))
            .count();
        let available_projects = project_limit.saturating_sub(pending);
        // Labs come before everything: a stalled wonder or a run of huts must
        // not keep a tribe from the schools its sciences depend on, so the next
        // research building is started even when the town is busy.
        if workers > 0 && functional_slots > 0 {
            let owned: HashSet<BuildingKind> = sim
                .buildings
                .iter()
                .filter(|b| !b.decorative && b.owner_lineage.as_deref() == Some(&lid))
                .map(|b| b.kind)
                .collect();
            if let Some(kind) = research_target(era, pop, sim.population_limit(), &owned) {
                let (cx, cy) = lineage_center(sim, &lid);
                if (cx, cy) != (0, 0) {
                    let mut failed_sites = FailedSites::default();
                    let offset_x = (sim.next_building_id as i32 * 3) % 16 - 8;
                    let offset_y = (sim.next_building_id as i32 * 5) % 14 - 7;
                    if crate::sim::civ::vacancy::take_over_empty(sim, &lid, kind)
                        || try_start_building_with(
                            sim,
                            &lid,
                            kind,
                            cx + offset_x,
                            cy + offset_y,
                            &mut failed_sites,
                        )
                    {
                        functional_slots -= 1;
                        continue;
                    }
                }
            }
        }
        if workers == 0 || available_projects == 0 {
            continue;
        }
        let builds_this_pass = if pop >= 40 {
            3
        } else if pop >= 20 {
            2
        } else {
            1
        };
        let mut failed_sites = FailedSites::default();
        let mut existing: HashSet<BuildingKind> = sim
            .buildings
            .iter()
            .filter(|b| !b.decorative && b.owner_lineage.as_deref() == Some(&lid))
            .map(|b| b.kind)
            .collect();
        // Held and reserved craft or civic buildings, standing or not: a
        // project under way already counts toward what the tribe has.
        let mut craft_held: HashMap<BuildingKind, usize> = HashMap::default();
        for b in sim
            .buildings
            .iter()
            .filter(|b| !b.decorative && !b.is_ruined() && b.owner_lineage.as_deref() == Some(lid.as_str()))
        {
            *craft_held.entry(b.kind).or_insert(0) += 1;
        }
        let agriculture = sim
            .organisms
            .iter()
            .any(|o| o.alive && o.lineage_id == lid && o.discoveries.contains("agriculture"));
        // Set when a craft or civic project the tribe wants waits on stone it
        // does not hold. The lineage's people then fetch stone for the next pass.
        let mut stone_short = false;
        // A growing tribe is always a few homes short, so housing would take
        // every pass. After a home, the next pass goes to the craft or civic
        // building the tribe lacks, whenever it can pay for one.
        let newest_is_home = sim
            .buildings
            .iter()
            .filter(|b| !b.decorative && b.owner_lineage.as_deref() == Some(lid.as_str()))
            .max_by_key(|b| b.id)
            .is_some_and(|b| {
                matches!(
                    b.kind,
                    BuildingKind::Hut
                        | BuildingKind::House
                        | BuildingKind::TownHouse
                        | BuildingKind::Apartment
                )
            });
        for project_index in 0..builds_this_pass.min(available_projects) {
            if functional_slots == 0 {
                break;
            }
            let mut considered = existing.clone();
            let mut started = None;
            if project_index == 0 {
                // A tribe of six raises its workshop before its next home: craft
                // work needs one, and housing would otherwise always come first.
                if let Some(kind) = first_workshop_target(era, pop, &existing) {
                    let (cx, cy) = lineage_center(sim, &lid);
                    if (cx, cy) != (0, 0)
                        && try_start_building_with(sim, &lid, kind, cx, cy, &mut failed_sites)
                    {
                        started = Some(kind);
                    }
                }
                let craft_turn = newest_is_home
                    && most_lacking_craft(era, pop, agriculture, &craft_held, &considered)
                        .is_some_and(|kind| construction_cost_available(sim, &lid, kind));
                if let Some(kind) =
                    housing_target(sim, &lid, era, pop).filter(|_| started.is_none() && !craft_turn)
                {
                    // Move into a home a vanished tribe left before raising one.
                    if !crate::sim::civ::vacancy::move_into_empty_home(sim, &lid) {
                        let (cx, cy) = lineage_center(sim, &lid);
                        if try_start_building_with(sim, &lid, kind, cx, cy, &mut failed_sites) {
                            started = Some(kind);
                        }
                    }
                }
            }
            // A devout tribe honours the gods who answered it before anything else.
            if started.is_none() {
                if let Some(kind) = devout_target(sim, &lid, era, pop, &considered) {
                    considered.insert(kind);
                    let (cx, cy) = lineage_center(sim, &lid);
                    if crate::sim::civ::vacancy::take_over_empty(sim, &lid, kind)
                        || ((cx, cy) != (0, 0)
                            && try_start_building_with(sim, &lid, kind, cx, cy, &mut failed_sites))
                    {
                        started = Some(kind);
                    }
                }
            }
            while started.is_none() {
                // The craft or civic building the tribe lacks most comes before
                // the rest of the wishlist; a project it cannot pay for yet
                // leaves the stone it needs on the lineage's wants.
                let craft = most_lacking_craft(era, pop, agriculture, &craft_held, &considered);
                let Some(kind) =
                    craft.or_else(|| next_target_building(era, pop, sim.population_limit(), &considered))
                else {
                    break;
                };
                if craft == Some(kind)
                    && !construction_cost_available(sim, &lid, kind)
                    && u32::from(kind.construction_cost().stone) > lineage_stone(sim, &lid)
                {
                    stone_short = true;
                }
                // Existing civic projects retain their era and population gates.
                considered.insert(kind);
                // A vanished tribe's empty hall nearby serves as well as a new one.
                if crate::sim::civ::vacancy::take_over_empty(sim, &lid, kind) {
                    started = Some(kind);
                    break;
                }
                let (cx, cy) = lineage_center(sim, &lid);
                if cx == 0 && cy == 0 {
                    break;
                }
                let offset_x = (sim.next_building_id as i32 * 3) % 16 - 8;
                let offset_y = (sim.next_building_id as i32 * 5) % 14 - 7;
                if try_start_building_with(sim, &lid, kind, cx + offset_x, cy + offset_y, &mut failed_sites) {
                    started = Some(kind);
                    break;
                }
            }
            let Some(kind) = started else { break };
            existing.insert(kind);
            if CRAFT_CIVIC.iter().any(|need| need.kind == kind) {
                *craft_held.entry(kind).or_insert(0) += 1;
            }
            functional_slots -= 1;
        }
        if stone_short {
            let until = sim.tick_count + BUILD_PASS_TICKS;
            for org in sim
                .organisms
                .iter_mut()
                .filter(|org| org.alive && org.lineage_id == lid)
            {
                org.fetch_stone_until = until;
            }
        }
    }
    cap_buildings(sim);
}

/// Stone held across a lineage's living members, the pool construction draws on.
pub(super) fn lineage_stone(sim: &Simulation, lineage: &str) -> u32 {
    sim.organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage)
        .map(|org| u32::from(org.inv_stone))
        .sum()
}

pub(super) fn is_wonder(kind: BuildingKind) -> bool {
    use BuildingKind::*;
    matches!(
        kind,
        Cathedral | Castle | Pyramid | Ziggurat | Coliseum | University | Observatory | Stadium | Museum
    )
}

pub(super) fn abandoned_ruin_candidates(sim: &Simulation) -> Vec<(u64, u32, usize)> {
    let now = sim.tick_count;
    let living_lineages: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|organism| organism.alive)
        .map(|organism| organism.lineage_id.clone())
        .collect();
    let mut candidates: Vec<(u64, u32, usize)> = sim
        .buildings
        .iter()
        .enumerate()
        .filter_map(|(index, building)| {
            if !building.is_ruined() || is_wonder(building.kind) {
                return None;
            }
            let owner_abandoned = building
                .owner_lineage
                .as_ref()
                .is_none_or(|owner| !living_lineages.contains(owner));
            let ruin_origin = building
                .ruined_at_tick
                .or(building.last_damage_tick)
                .unwrap_or(building.built_at_tick);
            let old_enough = now.saturating_sub(ruin_origin) >= RUIN_RETENTION_TICKS;
            let recently_repaired = building
                .last_repair_tick
                .is_some_and(|repair_tick| now.saturating_sub(repair_tick) <= REPAIR_GRACE_TICKS);
            (owner_abandoned && old_enough && !recently_repaired).then_some((ruin_origin, building.id, index))
        })
        .collect();
    candidates.sort_unstable();
    candidates
}

pub(super) fn prune_abandoned_ruins(sim: &mut Simulation, limit: usize) -> usize {
    if limit == 0 {
        return 0;
    }
    let remove_indices: HashSet<usize> = abandoned_ruin_candidates(sim)
        .into_iter()
        .take(limit)
        .map(|(_, _, index)| index)
        .collect();
    let initial_len = sim.buildings.len();
    let mut index = 0usize;
    sim.buildings.retain(|_| {
        let keep = !remove_indices.contains(&index);
        index += 1;
        keep
    });
    let removed = initial_len.saturating_sub(sim.buildings.len());
    if removed > 0 {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    removed
}

pub(super) fn cap_buildings(sim: &mut Simulation) {
    let mut excess = sim.buildings.len().saturating_sub(BUILDINGS_SOFT_CAP);
    if excess == 0 {
        return;
    }
    let initial_len = sim.buildings.len();

    // Ambient props are disposable rendering detail. Functional buildings
    // and wonders represent civilization progress, so a busy old world must
    // never silently erase them just because newer scenery was scattered.
    sim.buildings.retain(|building| {
        if excess > 0 && building.decorative {
            excess -= 1;
            false
        } else {
            true
        }
    });
    let scenery_removed = initial_len.saturating_sub(sim.buildings.len());
    if scenery_removed > 0 {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    excess = sim.buildings.len().saturating_sub(BUILDINGS_SOFT_CAP);
    if excess > 0 {
        prune_abandoned_ruins(sim, excess);
    }
}

pub(super) fn tick_building_progress(sim: &mut Simulation) {
    if sim.buildings.is_empty() {
        return;
    }
    #[derive(Clone, Copy)]
    struct Worker {
        index: usize,
        x: f32,
        y: f32,
        effort: f32,
    }

    let mut completed: Vec<(String, BuildingKind, i32, i32)> = Vec::new();
    let mut approaches = Vec::new();
    let mut working = Vec::new();
    let building_changed = {
        let organisms = &sim.organisms;
        let mut by_lineage: HashMap<&str, Vec<Worker>> = HashMap::default();
        for (index, org) in organisms.iter().enumerate() {
            if !can_work_on_construction(org) {
                continue;
            }
            let skill = match org.specialty.as_deref() {
                Some("builder" | "carpenter" | "mason" | "engineer") => 1.75,
                Some("smith" | "miner") => 1.30,
                _ => 1.0,
            };
            by_lineage
                .entry(org.lineage_id.as_str())
                .or_default()
                .push(Worker {
                    index,
                    x: org.x,
                    y: org.y,
                    effort: skill * (0.5 + org.energy.clamp(0.0, 1.0) * 0.5),
                });
        }

        let mut assigned = HashSet::default();
        let mut building_changed = false;
        // Schools and laboratories get their crews first: handing hands out
        // in build order left the newest research project with no one while
        // older huts and wonders kept every worker, and a tribe without a lab
        // never learns anything past the Industrial age.
        let mut order: Vec<usize> = (0..sim.buildings.len()).collect();
        order.sort_by_key(|&i| (!is_research_building(sim.buildings[i].kind), i));
        for building_index in order {
            let building = &mut sim.buildings[building_index];
            if building.is_complete() || building.decorative {
                continue;
            }
            building.occupants.clear();
            let Some(owner) = building.owner_lineage.as_deref() else {
                continue;
            };
            let Some(lineage_workers) = by_lineage.get(owner) else {
                continue;
            };
            let bx = building.x as f32;
            let by = building.y as f32;
            let mut nearby: Vec<(f32, Worker)> = lineage_workers
                .iter()
                .copied()
                .filter(|worker| !assigned.contains(&worker.index))
                .filter_map(|worker| {
                    let distance = (worker.x - bx).abs() + (worker.y - by).abs();
                    // The same reach is enforced before materials are charged,
                    // so a fallback site cannot create a permanently stalled
                    // project beyond every worker's travel range.
                    (distance <= CONSTRUCTION_WORKER_REACH).then_some((distance / worker.effort, worker))
                })
                .collect();
            nearby.sort_by(|(score_a, worker_a), (score_b, worker_b)| {
                score_a
                    .total_cmp(score_b)
                    .then_with(|| worker_a.index.cmp(&worker_b.index))
            });

            let crew_capacity = building.kind.construction_crew_capacity();
            let crew: Vec<Worker> = nearby
                .into_iter()
                .take(crew_capacity)
                .map(|(_, worker)| worker)
                .collect();
            if crew.is_empty() {
                continue;
            }
            let mut effort = 0.0;
            for worker in &crew {
                assigned.insert(worker.index);
                let (width, height) = building.footprint();
                let distance = (worker.x - worker.x.clamp(bx, bx + f32::from(width) - 1.0)).abs()
                    + (worker.y - worker.y.clamp(by, by + f32::from(height) - 1.0)).abs();
                if distance > 3.0 {
                    let target = [
                        (building.x - 1, building.y),
                        (building.x, building.y - 1),
                        (building.x + i32::from(width), building.y),
                        (building.x, building.y + i32::from(height)),
                    ]
                    .into_iter()
                    .find(|&(x, y)| sim.grid.get(x, y).walkable());
                    if let Some(target) = target {
                        approaches.push((worker.index, target, building.kind));
                    }
                    continue;
                }
                effort += worker.effort;
                working.push((worker.index, building.kind));
                building.occupants.push(organisms[worker.index].id.clone());
            }
            if effort == 0.0 {
                continue;
            }
            let labor = f32::from(building.kind.construction_cost().labor);
            building.condition = (building.condition + effort / labor).min(1.0);
            building_changed = true;
            if building.is_complete() {
                building.built_at_tick = sim.tick_count;
                building.occupants.clear();
                completed.push((owner.to_string(), building.kind, building.x, building.y));
            }
        }
        building_changed
    };

    if building_changed {
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
    for (worker_index, target, kind) in approaches {
        let worker = &mut sim.organisms[worker_index];
        if worker.journey.as_ref().is_none_or(|j| j.target != target) {
            worker.begin_journey(
                target,
                &format!("going to build a {}", kind.name()),
                sim.tick_count,
            );
        }
    }
    for (worker_index, kind) in working {
        let worker = &mut sim.organisms[worker_index];
        worker.energy = (worker.energy - 0.006).max(0.0);
        worker.thought = format!("building a {}", kind.name());
    }
    for (lineage, kind, x, y) in completed {
        // Construction knowledge is earned only when the project becomes
        // operational. Share the canonical building discovery across the
        // owning lineage so an unfinished action cannot unlock technology and
        // the knowledge does not disappear with a single builder.
        for org in sim
            .organisms
            .iter_mut()
            .filter(|org| org.alive && org.lineage_id == lineage)
        {
            org.discover(kind.name());
            for alias in kind.completion_discovery_aliases() {
                org.discover(alias);
            }
        }
        apply_completed_building_effect(sim, kind, x, y);
        push_event(
            &mut sim.events,
            sim.tick_count,
            "built",
            &lineage,
            &format!("completed a {}", kind.name()),
        );
        if is_wonder(kind) {
            let lineage_name = sim.lineage_names.get(&lineage).cloned().unwrap_or(lineage);
            sim.headlines.push_back((
                sim.tick_count,
                format!(
                    "\u{1F3DB}\u{FE0F} The {} completed a {} — a wonder of their age.",
                    lineage_name,
                    kind.name()
                ),
            ));
            while sim.headlines.len() > 80 {
                sim.headlines.pop_front();
            }
        }
    }
}

pub(super) fn is_research_building(kind: BuildingKind) -> bool {
    use BuildingKind::*;
    matches!(
        kind,
        School | Library | Observatory | University | Datacenter | ResearchLab
    )
}
