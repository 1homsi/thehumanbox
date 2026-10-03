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

pub(super) fn band_is_eligible(
    sim: &Simulation,
    idx: usize,
    ix: i32,
    iy: i32,
    band: ActionBand,
    era: Era,
    context: EligibilityContext,
    place_cache: &mut LocalPlaceCache,
) -> bool {
    let org = &sim.organisms[idx];
    if era < band.min_era {
        return false;
    }

    // Cheap gates run first; `qualifies` hashes discovery names, and this
    // runs for every action band of every organism each tick. All gates must
    // pass, so the order does not change the result.
    let stage = org.age_stage();
    let age_ok = match band.age {
        AgeGate::Child => matches!(stage, AgeStage::Infant | AgeStage::Child),
        AgeGate::TeenOrOlder => matches!(stage, AgeStage::Teen | AgeStage::Adult | AgeStage::Elder),
        AgeGate::AdultOrElder => matches!(stage, AgeStage::Adult | AgeStage::Elder),
        AgeGate::Elder => stage == AgeStage::Elder || org.is_elder,
    };
    if !age_ok {
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

    if !qualifies(org, band.qualification) {
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
    spatial.query_into(org.x as i32, org.y as i32, 6, &mut nearby);
    let mut kin_near = false;
    let mut kin_count = 0;
    let mut stranger_near = false;
    for other_index in nearby {
        if other_index == idx {
            continue;
        }
        let other = &sim.organisms[other_index];
        if !other.alive || (other.x - org.x).abs() + (other.y - org.y).abs() > 6.0 {
            continue;
        }
        if other.lineage_id == org.lineage_id {
            kin_near = true;
            kin_count += 1;
        } else {
            stranger_near = true;
        }
    }

    let tile = sim.grid.get(ix, iy);
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
    let context = EligibilityContext {
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
    };
    let era = sim.era(&org.lineage_id);
    let mut place_cache = LocalPlaceCache::new();

    BASE_ACTION_BANDS
        .iter()
        .chain(ACTION_BANDS)
        .copied()
        .find(|band| {
            (band.start..=band.end).contains(&action)
                && band_is_eligible(sim, idx, ix, iy, *band, era, context, &mut place_cache)
        })
}
