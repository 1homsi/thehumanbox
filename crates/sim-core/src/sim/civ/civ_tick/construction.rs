use super::*;
use crate::math::DetMath;

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

/// Wood and stone an open-air market of stalls costs. A lineage that has not
/// reached the iron age raises stalls on its plaza, not a market hall.
pub(super) const STALL_MARKET_WOOD: u16 = 6;
pub(super) const STALL_MARKET_STONE: u16 = 2;
/// Labour an open-air market takes: about a house's, not a market hall's.
pub(super) const STALL_MARKET_LABOR: u16 = 16;

/// What a project of `kind` costs the lineage now. Before the iron age a market
/// is the cheap open-air kind; from the iron age it costs the full market hall.
pub(super) fn project_cost(
    sim: &Simulation,
    lineage: &str,
    kind: BuildingKind,
) -> crate::sim::buildings::ConstructionCost {
    let cost = kind.construction_cost();
    if kind == BuildingKind::Market && lineage_era(sim, lineage) < BuildingKind::Market.era_unlock() {
        return crate::sim::buildings::ConstructionCost {
            wood: STALL_MARKET_WOOD,
            stone: STALL_MARKET_STONE,
            labor: STALL_MARKET_LABOR,
            ..cost
        };
    }
    cost
}

pub(super) fn reserve_construction_cost(sim: &mut Simulation, lineage: &str, kind: BuildingKind) -> bool {
    if !construction_cost_available(sim, lineage, kind) {
        return false;
    }
    let cost = project_cost(sim, lineage, kind);

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
    let cost = project_cost(sim, lineage, kind);
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
    let (width, height) = kind.footprint();
    construction_terrain_is_valid(sim, kind, x, y)
        && !sim.buildings.iter().any(|building| {
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

/// The ground part of `construction_site_is_valid`: bounds and terrain, not the
/// buildings already standing there.
fn construction_terrain_is_valid(sim: &Simulation, kind: BuildingKind, x: i32, y: i32) -> bool {
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
    true
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
fn clearance_exempt(kind: BuildingKind) -> bool {
    matches!(
        kind,
        BuildingKind::Bridge | BuildingKind::Wall | BuildingKind::Gate | BuildingKind::Aqueduct
    )
}

/// The clearance rule for one site, as the reference the site search is
/// tested against. The search applies the same rule through `SiteSearch`.
#[cfg(test)]
pub(super) fn automatic_site_has_clearance(sim: &Simulation, kind: BuildingKind, x: i32, y: i32) -> bool {
    if clearance_exempt(kind) {
        return true;
    }
    let (w, h) = kind.footprint();
    !sim.buildings.iter().filter(|b| !b.decorative).any(|b| {
        let (bw, bh) = b.footprint();
        building_footprints_overlap(x - 1, y - 2, w + 2, h + 4, b.x, b.y, bw, bh)
    })
}

/// Ring radius, in tiles, that a site search covers around its preferred point.
pub(super) const SITE_SEARCH_RADIUS: i32 = 12;

/// Tiles the occupancy window extends past the search ring on every side. It
/// covers the clearance lane too (one tile west, two north, and the far edge of
/// the footprint plus the lane), so each candidate's tests stay inside it.
const SITE_WINDOW_MARGIN: i32 = 16;

/// The buildings and workers a site search tests, gathered once per search.
/// Each candidate then reads a few cells of the window instead of scanning
/// every building once for overlap and again for clearance. The tests are the
/// same as `construction_site_is_valid`, `automatic_site_has_clearance` and
/// `construction_site_has_reachable_worker`, so each tile gets the same answer.
struct SiteSearch<'a> {
    sim: &'a Simulation,
    kind: BuildingKind,
    width: u8,
    height: u8,
    window_x: i32,
    window_y: i32,
    window_width: i32,
    window_height: i32,
    /// Cells covered by a standing non-decorative building, inside the window.
    occupied: Vec<bool>,
    /// Cells a town keeps open (its plaza and streets), inside the window.
    reserved: Vec<bool>,
    /// Positions of the lineage's workers who can work on a site.
    workers: Vec<(f32, f32)>,
}

impl<'a> SiteSearch<'a> {
    fn new(
        sim: &'a Simulation,
        lineage: &str,
        kind: BuildingKind,
        preferred_x: i32,
        preferred_y: i32,
    ) -> Self {
        let (width, height) = kind.footprint();
        let window_x = preferred_x - SITE_WINDOW_MARGIN;
        let window_y = preferred_y - SITE_WINDOW_MARGIN;
        let window_width = 2 * SITE_WINDOW_MARGIN + i32::from(width) + 4;
        let window_height = 2 * SITE_WINDOW_MARGIN + i32::from(height) + 4;
        let mut occupied = vec![false; (window_width * window_height) as usize];
        for building in sim.buildings.iter().filter(|building| !building.decorative) {
            let (building_width, building_height) = building.footprint();
            let left = building.x.max(window_x);
            let top = building.y.max(window_y);
            let right = (building.x + i32::from(building_width)).min(window_x + window_width);
            let bottom = (building.y + i32::from(building_height)).min(window_y + window_height);
            for y in top..bottom {
                for x in left..right {
                    occupied[((y - window_y) * window_width + (x - window_x)) as usize] = true;
                }
            }
        }
        let mut reserved = vec![false; occupied.len()];
        for town in &sim.town_plazas {
            let tiles = town.reserved_tiles();
            for (x, y) in tiles {
                if (window_x..window_x + window_width).contains(&x)
                    && (window_y..window_y + window_height).contains(&y)
                {
                    reserved[((y - window_y) * window_width + (x - window_x)) as usize] = true;
                }
            }
        }
        let workers = sim
            .organisms
            .iter()
            .filter(|org| org.lineage_id == lineage && can_work_on_construction(org))
            .map(|org| (org.x, org.y))
            .collect();
        Self {
            sim,
            kind,
            width,
            height,
            window_x,
            window_y,
            window_width,
            window_height,
            occupied,
            reserved,
            workers,
        }
    }

    /// Whether a `width` by `height` footprint at (x, y) overlaps a standing
    /// building. A rectangle that leaves the window falls back to the scan.
    fn touches_building(&self, x: i32, y: i32, width: u8, height: u8) -> bool {
        let (w, h) = (i32::from(width), i32::from(height));
        let inside = x >= self.window_x
            && y >= self.window_y
            && x + w <= self.window_x + self.window_width
            && y + h <= self.window_y + self.window_height;
        if !inside {
            return self.sim.buildings.iter().any(|building| {
                !building.decorative && {
                    let (building_width, building_height) = building.footprint();
                    building_footprints_overlap(
                        x,
                        y,
                        width,
                        height,
                        building.x,
                        building.y,
                        building_width,
                        building_height,
                    )
                }
            });
        }
        (y..y + h).any(|cy| {
            let row = (cy - self.window_y) * self.window_width - self.window_x;
            (x..x + w).any(|cx| self.occupied[(row + cx) as usize])
        })
    }

    /// Whether a footprint at (x, y) covers a tile a town keeps open.
    fn touches_reserved(&self, x: i32, y: i32, width: u8, height: u8) -> bool {
        (y..y + i32::from(height)).any(|cy| {
            (x..x + i32::from(width)).any(|cx| {
                let (wx, wy) = (cx - self.window_x, cy - self.window_y);
                if (0..self.window_width).contains(&wx) && (0..self.window_height).contains(&wy) {
                    self.reserved[(wy * self.window_width + wx) as usize]
                } else {
                    super::town::town_reserved(self.sim, cx, cy)
                }
            })
        })
    }

    /// Whether the search would start this kind at (x, y).
    fn accepts(&self, x: i32, y: i32) -> bool {
        construction_terrain_is_valid(self.sim, self.kind, x, y)
            && !self.touches_building(x, y, self.width, self.height)
            && !self.touches_reserved(x, y, self.width, self.height)
            && (clearance_exempt(self.kind)
                || !self.touches_building(x - 1, y - 2, self.width + 2, self.height + 4))
            && self.workers.iter().any(|&(worker_x, worker_y)| {
                (worker_x - x as f32).abs() + (worker_y - y as f32).abs() <= CONSTRUCTION_WORKER_REACH
            })
    }
}

pub(super) fn find_construction_site(
    sim: &Simulation,
    lineage: &str,
    kind: BuildingKind,
    preferred_x: i32,
    preferred_y: i32,
) -> Option<(i32, i32)> {
    let search = SiteSearch::new(sim, lineage, kind, preferred_x, preferred_y);
    if search.accepts(preferred_x, preferred_y) {
        return Some((preferred_x, preferred_y));
    }
    // Automatic plans use a preferred settlement offset. Search a compact
    // ring around it so water or another structure delays only this site,
    // rather than charging resources or permanently blocking construction.
    for radius in 1i32..=SITE_SEARCH_RADIUS {
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                let x = preferred_x + dx;
                let y = preferred_y + dy;
                if search.accepts(x, y) {
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
    let cost = project_cost(sim, lineage, kind);
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

/// Average wealth per person at which a tribe counts as rich enough for a
/// manor. A person starts with five, and furnishing a home from a cupboard
/// up to a four-poster bed already asks for more than eight.
pub(super) const MANOR_WEALTH_PER_PERSON: u32 = 8;
/// A manor houses twelve, so a tribe raises one per this many people and its
/// homes stay mostly houses.
pub(super) const PEOPLE_PER_MANOR: usize = 24;

/// True when a tribe is rich enough, and large enough, to raise a manor
/// (the home of its richest families) rather than the houses and huts of
/// the rest. Poorer tribes keep to the cheaper homes.
pub(crate) fn wants_manor(sim: &Simulation, lineage: &str, era: Era, population: usize) -> bool {
    if era < BuildingKind::Manor.era_unlock() || population < PEOPLE_PER_MANOR {
        return false;
    }
    let (wealth, people) = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lineage)
        .fold((0u64, 0u64), |(wealth, people), o| {
            (wealth + u64::from(o.wealth), people + 1)
        });
    if people == 0 || wealth < people * u64::from(MANOR_WEALTH_PER_PERSON) {
        return false;
    }
    // Manors standing or under way, so projects in progress count toward the limit.
    let manors = sim
        .buildings
        .iter()
        .filter(|b| !b.decorative && !b.is_ruined() && b.kind == BuildingKind::Manor)
        .filter(|b| b.owner_lineage.as_deref() == Some(lineage))
        .count();
    manors * PEOPLE_PER_MANOR < population && construction_cost_available(sim, lineage, BuildingKind::Manor)
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
    if wants_manor(sim, lineage, era, population) {
        return Some(Manor);
    }
    [Apartment, TownHouse, House, Hut]
        .into_iter()
        .find(|kind| era >= kind.era_unlock() && construction_cost_available(sim, lineage, *kind))
}

/// True when a tribe whose era has houses cannot yet pay for one, so the next
/// home it raises is a hut (two people) rather than a house (four). The stone
/// fetch then starts, so the house comes sooner.
pub(super) fn home_waits_for_house(sim: &Simulation, lineage: &str, era: Era) -> bool {
    use BuildingKind::*;
    if era < House.era_unlock() {
        return false;
    }
    let other_home_affordable = [Apartment, TownHouse, House]
        .into_iter()
        .any(|kind| era >= kind.era_unlock() && construction_cost_available(sim, lineage, kind));
    !other_home_affordable
}

/// Most fences one construction pass adds to a palisade.
pub(super) const PALISADE_FENCES_PER_PASS: usize = 6;
/// The palisade stands between these distances from the tribe's centre.
const PALISADE_MIN_RADIUS: f32 = 6.0;
const PALISADE_MAX_RADIUS: f32 = 12.0;

/// The tiles of the ring of `radius` round (cx, cy), in angle order. A tile is
/// on the ring when its centre lies within half a tile of the circle, so the
/// fences of a whole ring touch one another all the way round.
pub(super) fn palisade_ring(cx: i32, cy: i32, radius: f32) -> Vec<(i32, i32)> {
    let reach = radius.ceil() as i32 + 1;
    let mut tiles: Vec<(i32, i32)> = (-reach..=reach)
        .flat_map(|dy| (-reach..=reach).map(move |dx| (dx, dy)))
        .filter(|&(dx, dy)| (((dx * dx + dy * dy) as f32).sqrt() - radius).abs() < 0.5)
        .map(|(dx, dy)| (cx + dx, cy + dy))
        .collect();
    let angle = |&(x, y): &(i32, i32)| ((y - cy) as f32).det_atan2((x - cx) as f32);
    tiles.sort_by(|a, b| angle(a).total_cmp(&angle(b)));
    tiles
}

/// The radius a tribe's palisade stands on. A tribe with fences keeps the ring
/// it has; one without takes the reach of its homes plus a tile, so the wall
/// stands round the town rather than through it.
pub(super) fn palisade_radius(sim: &Simulation, lineage: &str, cx: i32, cy: i32) -> f32 {
    let dist = |b: &Building| (((b.x - cx).pow(2) + (b.y - cy).pow(2)) as f32).sqrt();
    let owned = || {
        sim.buildings
            .iter()
            .filter(|b| !b.decorative && b.owner_lineage.as_deref() == Some(lineage))
    };
    let fences: Vec<f32> = owned().filter(|b| is_palisade_piece(b.kind)).map(dist).collect();
    let radius = if fences.is_empty() {
        owned().map(dist).fold(0.0, f32::max) + 1.0
    } else {
        fences.iter().sum::<f32>() / fences.len() as f32
    };
    radius.clamp(PALISADE_MIN_RADIUS, PALISADE_MAX_RADIUS)
}

/// The pieces a palisade is built from: fences, and once a tribe has stone and
/// the bronze age, walls with gates across its roads and towers at the points.
pub(super) fn is_palisade_piece(kind: BuildingKind) -> bool {
    matches!(
        kind,
        BuildingKind::Fence | BuildingKind::Wall | BuildingKind::Gate | BuildingKind::Tower
    )
}

/// Towers a palisade stands at the four cardinal points of its ring.
const PALISADE_TOWERS: usize = 4;

/// Starts a tribe's palisade on its ring and returns how many pieces it
/// started. A tile a home, a road or the water already holds is skipped, so the
/// wall runs round the buildings instead of being scattered wherever a site
/// happens to be free. A tribe in the bronze age with stone raises stone walls,
/// a gate on each road that crosses the ring and a few towers, and upgrades the
/// fences it already has to walls.
pub(super) fn raise_palisade(sim: &mut Simulation, lineage: &str) -> usize {
    let (cx, cy) = lineage_center(sim, lineage);
    if (cx, cy) == (0, 0) {
        return 0;
    }
    let radius = palisade_radius(sim, lineage, cx, cy);
    let ring = palisade_ring(cx, cy, radius);
    let stone_walls = lineage_era(sim, lineage) >= BuildingKind::Wall.era_unlock();
    let mut started = 0;
    if stone_walls {
        started += raise_towers(sim, lineage, &ring);
    }
    // Tiles a building covers, looked up once, so a tile a home already holds
    // costs a set lookup rather than a scan of every building.
    let mut covered: HashSet<(i32, i32)> = HashSet::default();
    for building in sim.buildings.iter().filter(|b| !b.decorative) {
        let (width, height) = building.footprint();
        for dy in 0..i32::from(height) {
            for dx in 0..i32::from(width) {
                covered.insert((building.x + dx, building.y + dy));
            }
        }
    }
    for (x, y) in ring {
        if started >= PALISADE_FENCES_PER_PASS {
            break;
        }
        let on_road = stone_walls && sim.grid.road_at(x, y) != crate::world::grid::ROAD_NONE;
        let desired = if on_road {
            BuildingKind::Gate
        } else if stone_walls {
            BuildingKind::Wall
        } else {
            BuildingKind::Fence
        };
        let fence = sim.buildings.iter().position(|b| {
            b.kind == BuildingKind::Fence
                && b.x == x
                && b.y == y
                && b.owner_lineage.as_deref() == Some(lineage)
        });
        if let Some(index) = fence {
            // An old fence becomes stone, once the tribe can pay for the piece.
            if desired != BuildingKind::Fence
                && construction_cost_available(sim, lineage, desired)
                && construction_site_has_reachable_worker(sim, lineage, x, y)
            {
                sim.buildings.remove(index);
                if start_building_at_valid_site(sim, lineage, desired, x, y) {
                    started += 1;
                }
            }
            continue;
        }
        if !covered.contains(&(x, y))
            && construction_site_is_valid(sim, desired, x, y)
            && start_building_at_valid_site(sim, lineage, desired, x, y)
        {
            started += 1;
        }
    }
    started
}

/// Starts a palisade's towers, one at each cardinal point of the ring that has
/// no tower near it, and returns how many it started. A tower is two tiles
/// square, so the fences, walls and gates its footprint holds give way to it
/// once the tribe can pay for the tower.
fn raise_towers(sim: &mut Simulation, lineage: &str, ring: &[(i32, i32)]) -> usize {
    let standing = sim
        .buildings
        .iter()
        .filter(|b| {
            !b.decorative && b.kind == BuildingKind::Tower && b.owner_lineage.as_deref() == Some(lineage)
        })
        .count();
    if ring.is_empty() || standing >= PALISADE_TOWERS {
        return 0;
    }
    let mut started = 0;
    for point in 0..PALISADE_TOWERS {
        // The nearest ring tile from the cardinal point whose tower footprint
        // holds no road, so a gate on a road never has its tower standing on it.
        let base = point * ring.len() / PALISADE_TOWERS;
        let (tower_w, tower_h) = BuildingKind::Tower.footprint();
        let (x, y) = (0..ring.len())
            .map(|k| ring[(base + k) % ring.len()])
            .find(|&(x, y)| {
                (0..i32::from(tower_h)).all(|dy| {
                    (0..i32::from(tower_w))
                        .all(|dx| sim.grid.road_at(x + dx, y + dy) == crate::world::grid::ROAD_NONE)
                })
            })
            .unwrap_or(ring[base]);
        let towered = sim.buildings.iter().any(|b| {
            b.kind == BuildingKind::Tower
                && b.owner_lineage.as_deref() == Some(lineage)
                && (b.x - x).abs() <= 3
                && (b.y - y).abs() <= 3
        });
        if towered
            || !construction_cost_available(sim, lineage, BuildingKind::Tower)
            || !construction_site_has_reachable_worker(sim, lineage, x, y)
        {
            continue;
        }
        let (width, height) = BuildingKind::Tower.footprint();
        let blockers: Vec<usize> = sim
            .buildings
            .iter()
            .enumerate()
            .filter(|(_, b)| {
                is_palisade_piece(b.kind) && b.owner_lineage.as_deref() == Some(lineage) && {
                    let (bw, bh) = b.footprint();
                    building_footprints_overlap(x, y, width, height, b.x, b.y, bw, bh)
                }
            })
            .map(|(i, _)| i)
            .collect();
        for &index in blockers.iter().rev() {
            sim.buildings.remove(index);
        }
        if start_building_at_valid_site(sim, lineage, BuildingKind::Tower, x, y) {
            started += 1;
        }
    }
    started
}

/// How long after a battle a tribe still counts as at war, so its palisade
/// stands between one construction pass and the next (passes run every 240 ticks).
pub(super) const WAR_MEMORY_TICKS: u64 = 600;

/// True while a battle a tribe takes part in is being fought, or ended within
/// `WAR_MEMORY_TICKS`.
pub(super) fn at_war(sim: &Simulation, lineage: &str) -> bool {
    sim.battles.iter().any(|battle| {
        let last_fought = battle.ended_tick.unwrap_or(sim.tick_count);
        last_fought + WAR_MEMORY_TICKS >= sim.tick_count
            && (battle.attackers.iter().any(|l| l == lineage)
                || battle.defenders.iter().any(|l| l == lineage))
    })
}

pub(super) fn tick_buildings_construct(sim: &mut Simulation) {
    super::town::tick_town_plazas(sim);
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
        // A tribe at war raises its palisade before anything else, outside the
        // project limit: fences are cheap and a battle's defence bonus counts them.
        if functional_slots > 0 && at_war(sim, &lid) {
            functional_slots = functional_slots.saturating_sub(raise_palisade(sim, &lid));
        }
        // Finish a manageable number of projects before reserving more land
        // and materials. Children and exhausted residents are not a workforce.
        let workers = sim
            .organisms
            .iter()
            .filter(|o| o.lineage_id == lid && can_work_on_construction(o))
            .count();
        let project_limit = workers.div_ceil(6).clamp(1, 3);
        relocate_stalled_projects(sim, &lid);
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
        // A town's market goes ahead of the project queue, so a town busy with homes
        // still raises the market on its plaza. Its people fetch the stone while they wait.
        if super::town::town_market_wanted(sim, &lid, era, pop) {
            if workers > 0 && functional_slots > 0 && super::town::town_market_due(sim, &lid, era, pop) {
                let anchors = super::town::civic_anchors(sim, &lid, BuildingKind::Market);
                for (cx, cy) in anchors {
                    if try_start_building_with(
                        sim,
                        &lid,
                        BuildingKind::Market,
                        cx,
                        cy,
                        &mut FailedSites::default(),
                    ) {
                        functional_slots -= 1;
                        break;
                    }
                }
            }
            if lineage_stone(sim, &lid) < u32::from(project_cost(sim, &lid, BuildingKind::Market).stone) {
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
        // A tribe waiting on stone for its next house fetches it too.
        let mut stone_short = home_waits_for_house(sim, &lid, era)
            && lineage_stone(sim, &lid) < u32::from(BuildingKind::House.construction_cost().stone);
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
                        let center = lineage_center(sim, &lid);
                        let (cx, cy) = super::town::placement_point(sim, &lid, kind, center, (0, 0));
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
                    let center = lineage_center(sim, &lid);
                    let (cx, cy) = super::town::placement_point(sim, &lid, kind, center, (0, 0));
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
                    && u32::from(project_cost(sim, &lid, kind).stone) > lineage_stone(sim, &lid)
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
                let center = lineage_center(sim, &lid);
                if center == (0, 0) {
                    break;
                }
                let offset_x = (sim.next_building_id as i32 * 3) % 16 - 8;
                let offset_y = (sim.next_building_id as i32 * 5) % 14 - 7;
                let (cx, cy) = super::town::placement_point(sim, &lid, kind, center, (offset_x, offset_y));
                if try_start_building_with(sim, &lid, kind, cx, cy, &mut failed_sites) {
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
            // A stall market a lineage raised before the iron age takes the stall's labour.
            let stall = building.kind == BuildingKind::Market
                && sim.lineage_eras.get(owner).copied().unwrap_or(Era::PreStone)
                    < BuildingKind::Market.era_unlock();
            let labor = if stall {
                f32::from(STALL_MARKET_LABOR)
            } else {
                f32::from(building.kind.construction_cost().labor)
            };
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

/// Moves a tribe's unfinished projects that no worker can reach to a site near
/// the tribe's present centre. A project keeps the materials and labour it has.
/// Before this, a site its builders had walked away from kept counting against
/// the lineage's project limit, so a tribe whose projects were all stranded
/// could never start another one.
pub(super) fn relocate_stalled_projects(sim: &mut Simulation, lineage: &str) {
    let (cx, cy) = lineage_center(sim, lineage);
    if (cx, cy) == (0, 0) {
        return;
    }
    let stalled: Vec<usize> = sim
        .buildings
        .iter()
        .enumerate()
        .filter(|(_, b)| {
            !b.decorative
                && !b.is_complete()
                && b.owner_lineage.as_deref() == Some(lineage)
                && !sim.organisms.iter().any(|org| {
                    org.lineage_id == lineage
                        && can_work_on_construction(org)
                        && (org.x - b.x as f32).abs() + (org.y - b.y as f32).abs()
                            <= CONSTRUCTION_WORKER_REACH
                })
        })
        .map(|(index, _)| index)
        .collect();
    for index in stalled {
        let kind = sim.buildings[index].kind;
        let Some((x, y)) = find_construction_site(sim, lineage, kind, cx, cy) else {
            continue;
        };
        let building = &mut sim.buildings[index];
        building.x = x;
        building.y = y;
        sim.building_state_revision = sim.building_state_revision.wrapping_add(1);
    }
}

pub(super) fn is_research_building(kind: BuildingKind) -> bool {
    use BuildingKind::*;
    matches!(
        kind,
        School | Library | Observatory | University | Datacenter | ResearchLab
    )
}

#[cfg(test)]
mod palisade_tests {
    use super::*;
    use crate::sim::civ::society::warfare::{Battle, BattleScale};

    fn battle(attackers: &[&str], defenders: &[&str], ended: Option<u64>) -> Battle {
        Battle {
            id: "b".into(),
            attackers: attackers.iter().map(|s| s.to_string()).collect(),
            defenders: defenders.iter().map(|s| s.to_string()).collect(),
            attacker_orgs: Vec::new(),
            defender_orgs: Vec::new(),
            scale: BattleScale::Skirmish,
            location: (0, 0),
            started_tick: 1,
            ended_tick: ended,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 1,
            initial_d: 1,
        }
    }

    fn sim_with_battles(battles: Vec<Battle>) -> Simulation {
        let mut sim = Simulation::new(1);
        sim.battles = battles;
        sim
    }

    #[test]
    fn the_palisade_ring_is_a_closed_wall_of_touching_tiles() {
        let ring = palisade_ring(100, 100, 7.0);
        assert!(
            (40..=48).contains(&ring.len()),
            "{} tiles on the ring",
            ring.len()
        );
        for &(x, y) in &ring {
            let d = (((x - 100).pow(2) + (y - 100).pow(2)) as f32).sqrt();
            assert!((d - 7.0).abs() < 0.5, "tile at distance {d}");
        }
        // Taken in angle order, every tile touches the next, the last touching the first.
        for i in 0..ring.len() {
            let (a, b) = (ring[i], ring[(i + 1) % ring.len()]);
            assert!(
                (a.0 - b.0).abs() <= 1 && (a.1 - b.1).abs() <= 1,
                "gap between {a:?} and {b:?}"
            );
        }
    }

    fn clansman(id: usize, x: f32, y: f32) -> crate::organism::organism::Organism {
        use crate::organism::{organism::Organism, traits::Traits};
        let mut org = Organism::new(
            format!("clan-{id}"),
            "Clansman".into(),
            x,
            y,
            0,
            String::new(),
            "clan".into(),
            20_000,
            Traits::default(),
        );
        org.alive = true;
        org.age = 10_000;
        org.energy = 0.8;
        org.loneliness = 0.85;
        org.inv_wood = 20;
        org.inv_stone = 20;
        org
    }

    /// A bronze-age clan at war with stone, a road running east and west through its ring.
    fn stone_clan_sim() -> Simulation {
        use crate::world::grid::ROAD_TRACK;
        use crate::world::tiles::Tile;
        let mut sim = Simulation::new(0x57_0E);
        sim.organisms.clear();
        sim.buildings.clear();
        for y in 30..=70 {
            for x in 30..=70 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        for x in 30..=70 {
            sim.grid.road[crate::world::grid::WorldGrid::idx(x, 49)] = ROAD_TRACK;
        }
        for i in 0..12 {
            sim.organisms
                .push(clansman(i, 48.0 + (i % 4) as f32, 48.0 + (i / 4) as f32));
        }
        for org in sim.organisms.iter_mut() {
            org.inv_wood = 40;
        }
        sim.battles.push(battle(&["clan"], &["raiders"], None));
        sim.lineage_eras.insert("clan".into(), Era::Stone);
        sim
    }

    fn palisade_count(sim: &Simulation, kind: BuildingKind) -> usize {
        sim.buildings
            .iter()
            .filter(|b| b.kind == kind && b.owner_lineage.as_deref() == Some("clan"))
            .count()
    }

    #[test]
    fn a_bronze_tribe_at_war_builds_stone_walls_with_gates_and_towers() {
        let mut sim = stone_clan_sim();
        // Stone age first: the ring is fences.
        for _ in 0..8 {
            tick_buildings_construct(&mut sim);
            for b in sim.buildings.iter_mut() {
                b.condition = 1.0;
            }
        }
        assert!(
            palisade_count(&sim, BuildingKind::Fence) > 0,
            "the stone-age ring is fences"
        );
        assert_eq!(palisade_count(&sim, BuildingKind::Wall), 0);
        // Bronze age: the fences become walls, the road crossings gates, and towers stand at the points.
        sim.lineage_eras.insert("clan".into(), Era::Bronze);
        for _ in 0..60 {
            tick_buildings_construct(&mut sim);
            for b in sim.buildings.iter_mut() {
                b.condition = 1.0;
            }
        }
        assert!(
            palisade_count(&sim, BuildingKind::Wall) >= 10,
            "walls stand on the ring"
        );
        assert!(
            palisade_count(&sim, BuildingKind::Gate) >= 2,
            "the road through the ring has gates"
        );
        assert_eq!(
            palisade_count(&sim, BuildingKind::Tower),
            PALISADE_TOWERS,
            "four towers"
        );
        assert!(
            palisade_count(&sim, BuildingKind::Fence) < 4,
            "old fences were upgraded to walls, {} fences left",
            palisade_count(&sim, BuildingKind::Fence)
        );
    }

    #[test]
    fn a_tribe_at_war_fences_a_ring_round_its_homes() {
        use crate::world::tiles::Tile;
        let mut sim = Simulation::new(0x9A11);
        sim.organisms.clear();
        sim.buildings.clear();
        for y in 30..=70 {
            for x in 30..=70 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        // Homes stand on and about the ring a palisade would take, as they do in a grown town.
        let homes = [
            (46, 46),
            (54, 46),
            (46, 54),
            (54, 54),
            (50, 42),
            (50, 58),
            (49, 44),
            (55, 49),
            (45, 50),
            (53, 56),
            (44, 46),
            (56, 53),
        ];
        for (id, (x, y)) in homes.into_iter().enumerate() {
            let hut = Building::new(id as u32 + 1, BuildingKind::Hut, x, y, Some("clan".into()), 0);
            sim.buildings.push(hut);
        }
        for i in 0..12 {
            sim.organisms
                .push(clansman(i, 48.0 + (i % 4) as f32, 48.0 + (i / 4) as f32));
        }
        sim.battles.push(battle(&["clan"], &["raiders"], None));
        for _ in 0..40 {
            tick_buildings_construct(&mut sim);
        }
        let fences: Vec<(i32, i32)> = sim
            .buildings
            .iter()
            .filter(|b| b.kind == BuildingKind::Fence)
            .map(|b| (b.x, b.y))
            .collect();
        // A ring round a town of this size is about 2 pi r tiles long.
        assert!(fences.len() >= 40, "only {} fences stand", fences.len());
        // Fences surround the centre: no direction is left open by more than 45 degrees.
        let mut angles: Vec<f32> = fences
            .iter()
            .map(|&(x, y)| ((y - 49) as f32).atan2((x - 49) as f32))
            .collect();
        angles.sort_by(|a, b| a.total_cmp(b));
        let mut widest = angles[0] + std::f32::consts::TAU - angles[angles.len() - 1];
        for pair in angles.windows(2) {
            widest = widest.max(pair[1] - pair[0]);
        }
        assert!(
            widest < std::f32::consts::FRAC_PI_4,
            "the widest gap is {widest} radians"
        );
    }

    #[test]
    fn a_tribe_is_at_war_while_it_fights_and_for_a_while_after() {
        let battles = vec![
            battle(&["river"], &["hill"], None),
            battle(&["sea"], &["lake"], Some(950)),
            battle(&["old"], &["ruin"], Some(100)),
        ];
        let mut sim = sim_with_battles(battles);
        sim.tick_count = 1000;
        assert!(at_war(&sim, "river"));
        assert!(at_war(&sim, "hill"));
        // A battle that ended recently keeps its tribes at war a while; an old one does not.
        assert!(at_war(&sim, "sea"));
        assert!(!at_war(&sim, "old"));
        assert!(!at_war(&sim, "forest"));
    }
}
