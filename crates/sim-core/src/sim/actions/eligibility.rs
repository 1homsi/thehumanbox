use super::*;

#[derive(Clone, Copy)]
pub(super) struct EligibilityContext {
    pub(super) kin_near: bool,
    pub(super) kin_count: usize,
    pub(super) stranger_near: bool,
    pub(super) near_water: bool,
    pub(super) near_rock: bool,
    pub(super) near_fire: bool,
    pub(super) near_home: bool,
    pub(super) wild_land: bool,
    pub(super) has_food: bool,
    pub(super) has_carried_food: bool,
    pub(super) has_materials: bool,
    pub(super) has_wood: bool,
    pub(super) has_stone: bool,
}

impl EligibilityContext {
    /// Look around `(ix, iy)` for what the gates ask about. Leaves the
    /// organisms within the six-tile query in `nearby` for the caller.
    pub(super) fn gather(
        sim: &Simulation,
        idx: usize,
        ix: i32,
        iy: i32,
        spatial: &crate::sim::spatial::SpatialIndex,
        nearby: &mut Vec<usize>,
    ) -> Self {
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
        Self {
            kin_near,
            kin_count,
            stranger_near,
            near_water,
            near_rock,
            near_fire,
            near_home: (org.home_x - org.x).abs() + (org.home_y - org.y).abs() <= 10.0,
            wild_land: matches!(
                tile,
                Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash
            ),
            has_food: org.inv_food > 0 || matches!(tile, Tile::Food),
            has_carried_food: org.inv_food > 0,
            has_materials: org.inv_wood > 0 || org.inv_stone > 0,
            has_wood: org.inv_wood > 0,
            has_stone: org.inv_stone > 0,
        }
    }
}

pub(super) fn stable_action_phase(id: &str, tick: u64) -> usize {
    let hash = id.bytes().fold(2_166_136_261u32, |hash, byte| {
        (hash ^ u32::from(byte)).wrapping_mul(16_777_619)
    });
    (u64::from(hash) + tick / 30) as usize
}

pub(super) fn extend_rotating_candidates(actions: &mut Vec<usize>, candidates: &[usize], phase: usize) {
    let len = candidates.len();
    if len == 0 {
        return;
    }
    let take = ACTIONS_PER_BAND.min(len);
    let offset = phase % len;
    for step in 0..take {
        actions.push(candidates[(offset + step) % len]);
    }
}

pub(super) const ACTION_FAMILY_WIDTH: usize = 60;

pub(super) const ACTION_FAMILY_COUNT: usize =
    crate::organism::organism::ACTION_ID_SPACE.div_ceil(ACTION_FAMILY_WIDTH);

pub(super) fn mark_eligible_family_band(families: &mut [u64; ACTION_FAMILY_COUNT], start: usize, end: usize) {
    let family = start / ACTION_FAMILY_WIDTH;
    debug_assert_eq!(family, end / ACTION_FAMILY_WIDTH);
    let width = end - start + 1;
    debug_assert!(width <= ACTION_FAMILY_WIDTH);
    families[family] |= ((1u64 << width) - 1) << (start % ACTION_FAMILY_WIDTH);
}

pub(super) fn extend_rotating_family_masks(
    actions: &mut Vec<usize>,
    families: &[u64; ACTION_FAMILY_COUNT],
    phase: usize,
) {
    let mut candidates = [0usize; ACTION_FAMILY_WIDTH];
    for (family, &mask) in families.iter().enumerate() {
        let mut remaining = mask;
        let mut len = 0;
        while remaining != 0 {
            candidates[len] = family * ACTION_FAMILY_WIDTH + remaining.trailing_zeros() as usize;
            len += 1;
            remaining &= remaining - 1;
        }
        extend_rotating_candidates(actions, &candidates[..len], phase);
    }
}

#[cfg(test)]
pub(super) fn qualifies(org: &crate::organism::organism::Organism, requirement: Qualification) -> bool {
    let mut active_gates = 0;
    let mut passed_gates = 0;

    if !requirement.discoveries.is_empty() {
        active_gates += 1;
        let has_discoveries = if requirement.all_discoveries {
            requirement
                .discoveries
                .iter()
                .all(|discovery| org.discoveries.contains(*discovery))
        } else {
            requirement
                .discoveries
                .iter()
                .any(|discovery| org.discoveries.contains(*discovery))
        };
        passed_gates += usize::from(has_discoveries);
    }

    if requirement.any_specialty || !requirement.specialties.is_empty() || requirement.leader {
        active_gates += 1;
        let has_specialty = org.specialty.as_deref().is_some_and(|specialty| {
            requirement.any_specialty || requirement.specialties.contains(&specialty)
        }) || (requirement.leader && org.is_leader);
        passed_gates += usize::from(has_specialty);
    }

    if requirement.min_literacy > 0.0 {
        active_gates += 1;
        passed_gates += usize::from(org.literacy >= requirement.min_literacy);
    }

    match requirement.mode {
        QualificationMode::All => passed_gates == active_gates,
        QualificationMode::Any => passed_gates > 0 || active_gates == 0,
    }
}

pub(super) fn workspace_matches(kind: BuildingKind, workspace: Workspace) -> bool {
    use BuildingKind as BK;
    match workspace {
        Workspace::Any => true,
        Workspace::Education => kind.function() == BuildingFunction::Education,
        Workspace::Trade => kind.function() == BuildingFunction::Trade,
        Workspace::Industry => kind.function() == BuildingFunction::Industry,
        Workspace::Worship => kind.function() == BuildingFunction::Worship,
        Workspace::Civic => kind.function() == BuildingFunction::Civic,
        Workspace::Military => kind.function() == BuildingFunction::Military,
        Workspace::Transport => matches!(
            kind,
            BK::TrainStation
                | BK::Airport
                | BK::Port
                | BK::Dock
                | BK::Marina
                | BK::BusStop
                | BK::Spaceport
                | BK::OrbitalLift
                | BK::Hyperloop
                | BK::Maglev
        ),
        Workspace::Healthcare => kind.function() == BuildingFunction::Healthcare,
        Workspace::Recreation => kind.function() == BuildingFunction::Recreation,
        Workspace::Research => matches!(
            kind,
            BK::University
                | BK::Library
                | BK::Observatory
                | BK::ResearchLab
                | BK::Datacenter
                | BK::Cryolab
                | BK::NeuralHub
                | BK::AiCore
        ),
        Workspace::Cafe => matches!(kind, BK::Cafe | BK::Restaurant | BK::Bakery | BK::FoodCart),
        Workspace::Fashion => matches!(
            kind,
            BK::Tailor | BK::ClothingShop | BK::Cobbler | BK::Jeweler | BK::Studio
        ),
        Workspace::Butchery => matches!(kind, BK::Butcher | BK::Fishmonger | BK::Cheesemonger),
        Workspace::Brewery => matches!(kind, BK::Brewery | BK::Tavern | BK::Inn | BK::Vineyard),
        Workspace::Workshop => matches!(kind, BK::Workshop | BK::GuildHall),
        Workspace::Forge => matches!(kind, BK::Forge | BK::Smithy | BK::Goldsmith),
        Workspace::Textile => matches!(kind, BK::Workshop | BK::Tailor | BK::ClothingShop),
        Workspace::Arts => matches!(kind, BK::Workshop | BK::Studio | BK::ArtGallery),
        Workspace::Writing => matches!(kind, BK::Workshop | BK::Scribe | BK::Library | BK::BookStore),
        Workspace::Craft => matches!(kind, BK::Workshop | BK::Forge | BK::Smithy | BK::GuildHall),
        Workspace::Jewelry => matches!(kind, BK::Forge | BK::Smithy | BK::Goldsmith | BK::Jeweler),
        Workspace::Technical => {
            kind.function() == BuildingFunction::Industry
                || matches!(
                    kind,
                    BK::University
                        | BK::Library
                        | BK::Observatory
                        | BK::ResearchLab
                        | BK::Datacenter
                        | BK::Cryolab
                        | BK::NeuralHub
                        | BK::AiCore
                )
        }
        Workspace::Postal => matches!(kind, BK::PostOffice | BK::Scribe | BK::CityHall),
    }
}

#[cfg(test)]
pub(super) fn near_complete_workspace(
    sim: &Simulation,
    lineage: &str,
    ix: i32,
    iy: i32,
    workspace: Workspace,
) -> bool {
    sim.buildings.iter().any(|building| {
        if !building.is_operational()
            || !workspace_matches(building.kind, workspace)
            || building
                .owner_lineage
                .as_deref()
                .is_some_and(|owner| owner != lineage)
        {
            return false;
        }
        let (width, height) = building.footprint();
        let nearest_x = ix.clamp(building.x, building.x + i32::from(width) - 1);
        let nearest_y = iy.clamp(building.y, building.y + i32::from(height) - 1);
        (nearest_x - ix).abs() + (nearest_y - iy).abs() <= 8
    })
}

#[cfg(test)]
pub(super) fn near_hut(sim: &Simulation, lineage: &str, ix: i32, iy: i32) -> bool {
    (-1..=1).any(|dx| (-1..=1).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Hut)))
        || sim.buildings.iter().any(|building| {
            if !building.is_operational()
                || building.kind != BuildingKind::Hut
                || building
                    .owner_lineage
                    .as_deref()
                    .is_some_and(|owner| owner != lineage)
            {
                return false;
            }
            let (width, height) = building.footprint();
            let nearest_x = ix.clamp(building.x, building.x + i32::from(width) - 1);
            let nearest_y = iy.clamp(building.y, building.y + i32::from(height) - 1);
            (nearest_x - ix).abs() + (nearest_y - iy).abs() <= 1
        })
}

pub(super) struct LocalPlaceSnapshot {
    pub(super) workspaces: u32,
    pub(super) building_hut: bool,
}

pub(super) fn local_place_snapshot(sim: &Simulation, lineage: &str, ix: i32, iy: i32) -> LocalPlaceSnapshot {
    let mut snapshot = LocalPlaceSnapshot {
        workspaces: 0,
        building_hut: false,
    };
    // Only buildings within 8 tiles count, so only those near the index cells
    // around here are looked at.
    sim.buildings.any_near(ix, iy, 8, |building| {
        if !building.is_operational() {
            return false;
        }
        let (width, height) = building.footprint();
        let nearest_x = ix.clamp(building.x, building.x + i32::from(width) - 1);
        let nearest_y = iy.clamp(building.y, building.y + i32::from(height) - 1);
        let distance = (nearest_x - ix).abs() + (nearest_y - iy).abs();
        if distance > 8
            || building
                .owner_lineage
                .as_deref()
                .is_some_and(|owner| owner != lineage)
        {
            return false;
        }
        if distance <= 1 && building.kind == BuildingKind::Hut {
            snapshot.building_hut = true;
        }
        for workspace in ALL_WORKSPACES {
            if workspace_matches(building.kind, workspace) {
                snapshot.workspaces |= 1 << (workspace as u32);
            }
        }
        false
    });
    snapshot
}

/// The scan of every building this replaced, kept to check the index against.
#[cfg(test)]
pub(super) fn local_place_snapshot_reference(
    sim: &Simulation,
    lineage: &str,
    ix: i32,
    iy: i32,
) -> LocalPlaceSnapshot {
    let mut snapshot = LocalPlaceSnapshot {
        workspaces: 0,
        building_hut: false,
    };
    for building in &sim.buildings {
        if !building.is_operational() {
            continue;
        }
        let (width, height) = building.footprint();
        let nearest_x = ix.clamp(building.x, building.x + i32::from(width) - 1);
        let nearest_y = iy.clamp(building.y, building.y + i32::from(height) - 1);
        let distance = (nearest_x - ix).abs() + (nearest_y - iy).abs();
        if distance > 8
            || building
                .owner_lineage
                .as_deref()
                .is_some_and(|owner| owner != lineage)
        {
            continue;
        }
        if distance <= 1 && building.kind == BuildingKind::Hut {
            snapshot.building_hut = true;
        }
        for workspace in ALL_WORKSPACES {
            if workspace_matches(building.kind, workspace) {
                snapshot.workspaces |= 1 << (workspace as u32);
            }
        }
    }
    snapshot
}

/// An eligibility calculation holds `sim` immutably, so one nearby-building
/// pass can serve all workspace and hut gates. The next calculation creates a
/// fresh snapshot after any world changes.
pub(super) struct LocalPlaceCache {
    pub(super) snapshot: Option<LocalPlaceSnapshot>,
    pub(super) hut: Option<bool>,
}

impl LocalPlaceCache {
    pub(super) fn new() -> Self {
        Self {
            snapshot: None,
            hut: None,
        }
    }

    #[cfg(test)]
    pub(super) fn workspace(
        &mut self,
        sim: &Simulation,
        lineage: &str,
        ix: i32,
        iy: i32,
        workspace: Workspace,
    ) -> bool {
        self.snapshot
            .get_or_insert_with(|| local_place_snapshot(sim, lineage, ix, iy))
            .workspaces
            & (1 << (workspace as u32))
            != 0
    }

    /// The workspace kinds within reach, as a bit mask.
    pub(super) fn workspaces(&mut self, sim: &Simulation, lineage: &str, ix: i32, iy: i32) -> u32 {
        self.snapshot
            .get_or_insert_with(|| local_place_snapshot(sim, lineage, ix, iy))
            .workspaces
    }

    pub(super) fn hut(&mut self, sim: &Simulation, lineage: &str, ix: i32, iy: i32) -> bool {
        *self.hut.get_or_insert_with(|| {
            (-1..=1).any(|dx| (-1..=1).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Hut)))
                || self
                    .snapshot
                    .get_or_insert_with(|| local_place_snapshot(sim, lineage, ix, iy))
                    .building_hut
        })
    }
}

#[cfg(test)]
pub(super) fn band_is_eligible_reference(
    sim: &Simulation,
    idx: usize,
    ix: i32,
    iy: i32,
    resolved: &ResolvedBand,
    era: Era,
    context: EligibilityContext,
    gate: &OrgGate,
    place_cache: &mut LocalPlaceCache,
) -> bool {
    let band = &resolved.band;
    let org = &sim.organisms[idx];
    if era < band.min_era {
        return false;
    }

    // All gates must pass, so the order does not change the result; the
    // cheap ones run first.
    if !gate.age_ok(band.age) {
        return false;
    }

    let social_ok = match band.social {
        SocialGate::None => true,
        SocialGate::Anyone => context.kin_near || context.stranger_near,
        SocialGate::Kin => context.kin_near,
        SocialGate::KinCount(count) => context.kin_count >= usize::from(count),
        SocialGate::Stranger => context.stranger_near,
        SocialGate::KinAndStranger => context.kin_near && context.stranger_near,
    };
    if !social_ok {
        return false;
    }

    if !resolved.passes(gate) {
        return false;
    }

    let place_ok = match band.place {
        PlaceGate::Anywhere => true,
        PlaceGate::BuildableLand => matches!(sim.grid.get(ix, iy), Tile::Grass | Tile::Sand | Tile::Snow),
        PlaceGate::Home => context.near_home,
        PlaceGate::WildLand => context.wild_land,
        PlaceGate::Water => context.near_water,
        PlaceGate::BridgeSite => {
            crate::sim::civ_tick::construction_site_is_valid(sim, BuildingKind::Bridge, ix, iy)
        }
        PlaceGate::Rock => context.near_rock,
        PlaceGate::Fire => context.near_fire,
        PlaceGate::Hut => matches!(sim.grid.get(ix, iy), Tile::Hut),
        PlaceGate::NearHut => place_cache.hut(sim, &org.lineage_id, ix, iy),
        PlaceGate::HutOrRock => matches!(sim.grid.get(ix, iy), Tile::Hut) || context.near_rock,
        PlaceGate::Workspace(workspace) => place_cache.workspace(sim, &org.lineage_id, ix, iy, workspace),
        PlaceGate::FireAndWorkspace(workspace) => {
            context.near_fire && place_cache.workspace(sim, &org.lineage_id, ix, iy, workspace)
        }
        PlaceGate::ExperimentWorkspace(workspace) => {
            (context.near_fire || context.near_water)
                && place_cache.workspace(sim, &org.lineage_id, ix, iy, workspace)
        }
        PlaceGate::HomeAndWater => context.near_home && context.near_water,
    };
    if !place_ok {
        return false;
    }

    match band.resource {
        ResourceGate::None => true,
        ResourceGate::Food => context.has_food,
        ResourceGate::CarriedFood => context.has_carried_food,
        ResourceGate::Materials => context.has_materials,
        ResourceGate::BridgeMaterials => {
            crate::sim::civ_tick::lineage_can_afford_construction(sim, &org.lineage_id, BuildingKind::Bridge)
        }
        ResourceGate::TradeGoods => context.has_carried_food || context.has_materials || org.wealth > 0,
        ResourceGate::Wealth => org.wealth > 0,
        ResourceGate::Wood => context.has_wood,
        ResourceGate::WoodAndStone => context.has_wood && context.has_stone,
        ResourceGate::Stone => context.has_stone,
        ResourceGate::Metalworking => context.has_stone && org.wealth > 0,
    }
}

/// Bits describing the situation an organism is in, one per condition a band
/// can require. A band's requirement is a mask of these (`GateReq::ctx`), so
/// checking it is a single AND.
pub(super) mod ctx {
    pub(in crate::sim::actions) const KIN: u32 = 1 << 0;
    pub(in crate::sim::actions) const STRANGER: u32 = 1 << 1;
    pub(in crate::sim::actions) const ANYONE: u32 = 1 << 2;
    pub(in crate::sim::actions) const KIN_AND_STRANGER: u32 = 1 << 3;
    pub(in crate::sim::actions) const NEAR_WATER: u32 = 1 << 4;
    pub(in crate::sim::actions) const NEAR_ROCK: u32 = 1 << 5;
    pub(in crate::sim::actions) const NEAR_FIRE: u32 = 1 << 6;
    pub(in crate::sim::actions) const NEAR_HOME: u32 = 1 << 7;
    pub(in crate::sim::actions) const WILD_LAND: u32 = 1 << 8;
    pub(in crate::sim::actions) const HAS_FOOD: u32 = 1 << 9;
    pub(in crate::sim::actions) const HAS_CARRIED_FOOD: u32 = 1 << 10;
    pub(in crate::sim::actions) const HAS_MATERIALS: u32 = 1 << 11;
    pub(in crate::sim::actions) const HAS_TRADE_GOODS: u32 = 1 << 12;
    pub(in crate::sim::actions) const HAS_WEALTH: u32 = 1 << 13;
    pub(in crate::sim::actions) const HAS_WOOD: u32 = 1 << 14;
    pub(in crate::sim::actions) const HAS_WOOD_AND_STONE: u32 = 1 << 15;
    pub(in crate::sim::actions) const HAS_STONE: u32 = 1 << 16;
    pub(in crate::sim::actions) const HAS_METALWORKING_INPUTS: u32 = 1 << 17;
    pub(in crate::sim::actions) const TILE_BUILDABLE: u32 = 1 << 18;
    pub(in crate::sim::actions) const TILE_HUT: u32 = 1 << 19;
    pub(in crate::sim::actions) const HUT_OR_ROCK: u32 = 1 << 20;
    pub(in crate::sim::actions) const HOME_AND_WATER: u32 = 1 << 21;
    pub(in crate::sim::actions) const FIRE_OR_WATER: u32 = 1 << 22;
    /// Bits 23.. say "at least n kin nearby", for n in 1..=MAX_KIN_COUNT_GATE.
    const KIN_COUNT_BASE: u32 = 23;
    pub(in crate::sim::actions) const MAX_KIN_COUNT_GATE: u8 = 8;

    pub(in crate::sim::actions) fn kin_count_at_least(count: u8) -> u32 {
        assert!(
            (1..=MAX_KIN_COUNT_GATE).contains(&count),
            "KinCount({count}) is outside what the gate bits cover"
        );
        1 << (KIN_COUNT_BASE + u32::from(count) - 1)
    }
}

/// Every `ctx` bit that holds for this organism here and now.
pub(super) fn ctx_bits(sim: &Simulation, idx: usize, ix: i32, iy: i32, context: &EligibilityContext) -> u32 {
    use ctx::*;
    let org = &sim.organisms[idx];
    let tile = sim.grid.get(ix, iy);
    let mut bits = 0;
    let mut set = |condition: bool, bit: u32| {
        if condition {
            bits |= bit;
        }
    };
    set(context.kin_near, KIN);
    set(context.stranger_near, STRANGER);
    set(context.kin_near || context.stranger_near, ANYONE);
    set(context.kin_near && context.stranger_near, KIN_AND_STRANGER);
    set(context.near_water, NEAR_WATER);
    set(context.near_rock, NEAR_ROCK);
    set(context.near_fire, NEAR_FIRE);
    set(context.near_home, NEAR_HOME);
    set(context.wild_land, WILD_LAND);
    set(context.has_food, HAS_FOOD);
    set(context.has_carried_food, HAS_CARRIED_FOOD);
    set(context.has_materials, HAS_MATERIALS);
    set(
        context.has_carried_food || context.has_materials || org.wealth > 0,
        HAS_TRADE_GOODS,
    );
    set(org.wealth > 0, HAS_WEALTH);
    set(context.has_wood, HAS_WOOD);
    set(context.has_wood && context.has_stone, HAS_WOOD_AND_STONE);
    set(context.has_stone, HAS_STONE);
    set(context.has_stone && org.wealth > 0, HAS_METALWORKING_INPUTS);
    set(
        matches!(tile, Tile::Grass | Tile::Sand | Tile::Snow),
        TILE_BUILDABLE,
    );
    set(matches!(tile, Tile::Hut), TILE_HUT);
    set(matches!(tile, Tile::Hut) || context.near_rock, HUT_OR_ROCK);
    set(context.near_home && context.near_water, HOME_AND_WATER);
    set(context.near_fire || context.near_water, FIRE_OR_WATER);
    for count in 1..=MAX_KIN_COUNT_GATE {
        set(context.kin_count >= usize::from(count), kin_count_at_least(count));
    }
    bits
}

/// Whether `resolved` is open to this organism. Same answer as
/// `band_is_eligible_reference`, reached with a few mask tests instead of a
/// match per gate: everything that is a plain condition was folded into
/// `bits`; the building scan and the bridge checks run only for bands that
/// get that far.
pub(super) fn band_is_eligible(
    sim: &Simulation,
    ix: i32,
    iy: i32,
    resolved: &ResolvedBand,
    era: Era,
    bits: u32,
    gate: &OrgGate,
    place_cache: &mut LocalPlaceCache,
    lineage: &str,
) -> bool {
    let band = &resolved.band;
    if era < band.min_era || !gate.age_ok(band.age) || resolved.req.ctx & !bits != 0 || !resolved.passes(gate)
    {
        return false;
    }
    if resolved.req.workspaces != 0
        && resolved.req.workspaces & !place_cache.workspaces(sim, lineage, ix, iy) != 0
    {
        return false;
    }
    let lazy = resolved.req.lazy;
    if lazy == 0 {
        return true;
    }
    (lazy & LAZY_NEAR_HUT == 0 || place_cache.hut(sim, lineage, ix, iy))
        && (lazy & LAZY_BRIDGE_SITE == 0
            || crate::sim::civ_tick::construction_site_is_valid(sim, BuildingKind::Bridge, ix, iy))
        && (lazy & LAZY_BRIDGE_MATERIALS == 0
            || crate::sim::civ_tick::lineage_can_afford_construction(sim, lineage, BuildingKind::Bridge))
}

pub(super) fn eligible_band_for_action(
    sim: &Simulation,
    idx: usize,
    action: usize,
    ix: i32,
    iy: i32,
    spatial: &crate::sim::spatial::SpatialIndex,
) -> Option<ActionBand> {
    let org = &sim.organisms[idx];
    if action_output_at_capacity(org, action) {
        return None;
    }
    let mut nearby = Vec::with_capacity(16);
    let context = EligibilityContext::gather(sim, idx, ix, iy, spatial, &mut nearby);
    let bits = ctx_bits(sim, idx, ix, iy, &context);
    let era = sim.era(&org.lineage_id);
    let mut place_cache = LocalPlaceCache::new();

    let tables = resolved::tables();
    let gate = tables.org_gate(org);
    tables
        .base
        .iter()
        .chain(&tables.banded)
        .chain(&tables.registered)
        .find(|resolved| {
            (resolved.band.start..=resolved.band.end).contains(&action)
                && band_is_eligible(
                    sim,
                    ix,
                    iy,
                    resolved,
                    era,
                    bits,
                    &gate,
                    &mut place_cache,
                    &org.lineage_id,
                )
        })
        .map(|resolved| resolved.band)
}
