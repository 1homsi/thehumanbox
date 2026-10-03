//! Which actions are offered: candidate lists, band masks, place cache, rotation.
use super::*;

#[test]
fn local_place_cache_matches_building_checks_and_refreshes_after_world_changes() {
    let mut sim = Simulation::new(0xcace);
    let lineage = sim.organisms[0].lineage_id.clone();
    let (x, y) = (sim.organisms[0].x as i32, sim.organisms[0].y as i32);
    sim.buildings.clear();

    for (id, kind, dx, owner, condition, decorative) in [
        (1, BuildingKind::Market, 1, Some(lineage.clone()), 1.0, false),
        (2, BuildingKind::Library, 7, None, 1.0, false),
        (3, BuildingKind::Hut, 2, Some(lineage.clone()), 1.0, false),
        (4, BuildingKind::Hospital, 3, Some("other".into()), 1.0, false),
        (5, BuildingKind::Forge, 4, Some(lineage.clone()), 0.5, false),
        (6, BuildingKind::Cafe, 2, Some(lineage.clone()), 1.0, true),
    ] {
        let mut building = Building::new(id, kind, x + dx, y, owner, 0);
        building.condition = condition;
        building.decorative = decorative;
        sim.buildings.push(building);
    }

    let workspaces = [
        Workspace::Any,
        Workspace::Education,
        Workspace::Trade,
        Workspace::Industry,
        Workspace::Worship,
        Workspace::Civic,
        Workspace::Military,
        Workspace::Transport,
        Workspace::Healthcare,
        Workspace::Recreation,
        Workspace::Research,
        Workspace::Cafe,
        Workspace::Fashion,
        Workspace::Butchery,
        Workspace::Brewery,
        Workspace::Workshop,
        Workspace::Forge,
        Workspace::Textile,
        Workspace::Arts,
        Workspace::Writing,
        Workspace::Craft,
        Workspace::Jewelry,
        Workspace::Technical,
        Workspace::Postal,
    ];
    assert_eq!(workspaces.len(), WORKSPACE_KIND_COUNT);
    for (index, &workspace) in workspaces.iter().enumerate() {
        assert_eq!(workspace as usize, index);
    }
    for (query_x, query_y, query_lineage) in [
        (x, y, lineage.as_str()),
        (x + 35, y + 35, lineage.as_str()),
        (x, y, "other"),
    ] {
        let mut cache = LocalPlaceCache::new();
        for workspace in workspaces {
            let expected = near_complete_workspace(&sim, query_lineage, query_x, query_y, workspace);
            assert_eq!(
                cache.workspace(&sim, query_lineage, query_x, query_y, workspace),
                expected
            );
            assert_eq!(
                cache.workspace(&sim, query_lineage, query_x, query_y, workspace),
                expected
            );
        }
        assert_eq!(
            cache.hut(&sim, query_lineage, query_x, query_y),
            near_hut(&sim, query_lineage, query_x, query_y)
        );
    }

    sim.buildings.clear();
    let mut market = Building::new(7, BuildingKind::Market, x + 1, y, Some(lineage.clone()), 0);
    market.condition = 1.0;
    sim.buildings.push(market);
    assert!(LocalPlaceCache::new().workspace(&sim, &lineage, x, y, Workspace::Trade));
    sim.buildings[0].damage = 1.0;
    assert!(!LocalPlaceCache::new().workspace(&sim, &lineage, x, y, Workspace::Trade));

    let (remote_x, remote_y) = (x + 35, y + 35);
    for dx in -1..=1 {
        for dy in -1..=1 {
            sim.grid.set(remote_x + dx, remote_y + dy, Tile::Grass);
        }
    }
    let mut old_cache = LocalPlaceCache::new();
    assert!(!old_cache.hut(&sim, &lineage, remote_x, remote_y));
    sim.grid.set(remote_x, remote_y, Tile::Hut);
    assert!(!old_cache.hut(&sim, &lineage, remote_x, remote_y));
    assert!(LocalPlaceCache::new().hut(&sim, &lineage, remote_x, remote_y));
}

#[test]
fn reused_action_buffers_match_fresh_results_across_context_changes() {
    let mut sim = Simulation::new(0xa110);
    let idx = 0;
    let lineage = sim.organisms[idx].lineage_id.clone();
    let mut actions = Vec::new();
    let mut nearby = Vec::new();

    for (phase, era, tile) in [
        (0, Era::PreStone, Tile::Grass),
        (30, Era::Stone, Tile::Water),
        (60, Era::Modern, Tile::Rock),
        (90, Era::Information, Tile::Food),
    ] {
        sim.tick_count = phase;
        sim.lineage_eras.insert(lineage.clone(), era);
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.grid.set(x, y, tile);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let expected = available_actions(&sim, idx, x, y, &spatial);

        actions.push(usize::MAX);
        nearby.push(usize::MAX);
        available_actions_into(&sim, idx, x, y, &spatial, &mut actions, &mut nearby);
        assert_eq!(actions, expected, "action order changed at phase {phase}");
        assert!(!nearby.contains(&usize::MAX));
    }
}

#[test]
fn semantic_validation_lookup_matches_band_tables() {
    let legacy = |action: usize| {
        action >= 540
            || BASE_ACTION_BANDS
                .iter()
                .any(|band| (band.start..=band.end).contains(&action))
    };
    for action in (0..=u16::MAX as usize).chain([usize::MAX]) {
        assert_eq!(
            action_requires_semantic_validation(action),
            legacy(action),
            "lookup diverges from band tables at action {action}"
        );
    }
}

#[test]
fn rotating_family_sample_stays_bounded_and_eventually_exposes_every_action() {
    let candidates: Vec<usize> = (1200..=1249).collect();
    let mut seen = rustc_hash::FxHashSet::default();
    for phase in 0..candidates.len() {
        let mut actions = Vec::new();
        extend_rotating_candidates(&mut actions, &candidates, phase);
        assert_eq!(actions.len(), ACTIONS_PER_BAND);
        seen.extend(actions);
    }
    assert_eq!(seen.len(), candidates.len());
}

#[test]
fn compact_family_masks_preserve_sorted_unique_rotation() {
    for stride in [1, 3, 7] {
        let mut families = [0u64; ACTION_FAMILY_COUNT];
        let mut reference = std::collections::BTreeMap::<usize, Vec<usize>>::new();
        for (index, band) in ACTION_BANDS.iter().enumerate() {
            if index % stride != 0 {
                continue;
            }
            mark_eligible_family_band(&mut families, band.start, band.end);
            reference
                .entry(band.start / ACTION_FAMILY_WIDTH)
                .or_default()
                .extend(band.start..=band.end);
        }
        for candidates in reference.values_mut() {
            candidates.sort_unstable();
            candidates.dedup();
        }
        for phase in [0, 1, 17, 59, 101, 4095] {
            let mut expected = Vec::new();
            for candidates in reference.values() {
                extend_rotating_candidates(&mut expected, candidates, phase);
            }
            let mut actual = Vec::new();
            extend_rotating_family_masks(&mut actual, &families, phase);
            assert_eq!(actual, expected, "stride {stride}, phase {phase}");
        }
    }
}

#[test]
fn qualification_requires_every_active_dimension() {
    let mut sim = Simulation::new(15);
    let org = &mut sim.organisms[0];
    let requirement = qualification(&["electricity"], &["engineer"], 0.5);

    org.discoveries.insert("electricity".to_string());
    assert!(!qualifies(org, requirement));
    org.specialty = Some("engineer".to_string());
    assert!(!qualifies(org, requirement));
    org.literacy = 0.5;
    assert!(qualifies(org, requirement));

    let alternative = qualification_any(&["electricity"], &["engineer"], 0.5);
    org.specialty = None;
    org.literacy = 0.0;
    assert!(qualifies(org, alternative));
}

#[test]
fn semantic_base_ranges_have_exactly_one_requirement_for_every_action() {
    for action in [67, 68, 70]
        .into_iter()
        .chain(39..=50)
        .chain(166..=180)
        .chain(276..=315)
        .chain(336..=355)
        .chain(386..=435)
        .chain(436..=455)
        .chain(456..=485)
        .chain(501..=520)
        .chain(536..=537)
    {
        let matches = BASE_ACTION_BANDS
            .iter()
            .filter(|band| (band.start..=band.end).contains(&action))
            .count();
        assert_eq!(matches, 1, "action {action} must have one semantic gate");
    }

    for action in 540..=589 {
        let matches = ACTION_BANDS
            .iter()
            .filter(|band| (band.start..=band.end).contains(&action))
            .count();
        assert_eq!(matches, 1, "domestic action {action} must have one semantic gate");
    }
}

/// `CONTEXT_CHECKED` lets the candidate filter skip the per-module checks for
/// most ids. This holds it to that promise on a world that has been lived in.
#[test]
fn ids_without_a_context_check_pass_every_context_check() {
    let mut sim = Simulation::new(0xc0de);
    for round in 0..4 {
        for _ in 0..150 {
            sim.tick();
        }
        for idx in 0..sim.organisms.len() {
            let org = &sim.organisms[idx];
            if !org.alive {
                continue;
            }
            let (ix, iy) = (org.x as i32, org.y as i32);
            for action in (0..crate::organism::organism::ACTION_ID_SPACE)
                .filter(|a| !super::available::CONTEXT_CHECKED[*a])
            {
                assert!(
                    !action_output_at_capacity(org, action),
                    "capacity, action {action}"
                );
                assert!(
                    agriculture::action_is_possible(&sim, idx, action, ix, iy, true)
                        && agriculture::action_is_possible(&sim, idx, action, ix, iy, false),
                    "agriculture, action {action}, round {round}"
                );
                assert!(
                    religion_expanded::action_is_possible(&sim, idx, action, &[], sim.tick_count),
                    "religion, action {action}, round {round}"
                );
                assert!(
                    relationships_deep::action_is_possible(&sim, idx, action, &[]),
                    "relationships, action {action}, round {round}"
                );
                assert!(
                    crate::sim::civ::trade_routes::action_is_possible(&sim, idx, action, &[]),
                    "trade routes, action {action}, round {round}"
                );
            }
        }
    }
}

/// The mask-based band gate must open and close exactly where the original
/// gate-by-gate check did, for organisms in every kind of situation.
#[test]
fn band_gate_masks_agree_with_the_gate_by_gate_check() {
    use crate::sim::civ::progress::eras::LADDER;
    let mut sim = Simulation::new(0xba5e);
    let mut state = 0x9e37_79b9_7f4a_7c15u64;
    let mut next = move |modulus: u64| {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state % modulus
    };
    let mut compared = 0usize;
    let mut open = 0usize;
    for round in 0..6 {
        for _ in 0..200 {
            sim.tick();
        }
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        for idx in 0..sim.organisms.len().min(40) {
            if !sim.organisms[idx].alive {
                continue;
            }
            for variation in 0..6 {
                {
                    let org = &mut sim.organisms[idx];
                    if variation > 0 {
                        org.inv_food = next(3) as u8;
                        org.inv_wood = next(3) as u8;
                        org.inv_stone = next(3) as u8;
                        org.wealth = next(2) as u32 * next(50) as u32;
                        org.is_leader = next(4) == 0;
                        org.literacy = next(101) as f32 / 100.0;
                        org.x = (next(560) + 20) as f32;
                        org.y = (next(260) + 20) as f32;
                        org.home_x = org.x + (next(30) as f32 - 15.0);
                        org.home_y = org.y + (next(30) as f32 - 15.0);
                    }
                }
                let lineage = sim.organisms[idx].lineage_id.clone();
                sim.lineage_eras
                    .insert(lineage.clone(), LADDER[next(LADDER.len() as u64) as usize]);
                let (ix, iy) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
                let mut nearby = Vec::new();
                let context = EligibilityContext::gather(&sim, idx, ix, iy, &spatial, &mut nearby);
                let bits = ctx_bits(&sim, idx, ix, iy, &context);
                let era = sim.era(&lineage);
                let tables = resolved::tables();
                let gate = tables.org_gate(&sim.organisms[idx]);
                let mut fast_cache = LocalPlaceCache::new();
                let mut reference_cache = LocalPlaceCache::new();
                for band in tables.base.iter().chain(&tables.banded).chain(&tables.registered) {
                    let fast =
                        band_is_eligible(&sim, ix, iy, band, era, bits, &gate, &mut fast_cache, &lineage);
                    let reference = band_is_eligible_reference(
                        &sim,
                        idx,
                        ix,
                        iy,
                        band,
                        era,
                        context,
                        &gate,
                        &mut reference_cache,
                    );
                    assert_eq!(
                        fast, reference,
                        "round {round}, organism {idx}, variation {variation}, band {}..={}",
                        band.band.start, band.band.end
                    );
                    compared += 1;
                    open += usize::from(fast);
                }
            }
        }
    }
    assert!(
        compared > 50_000 && open > 1_000,
        "compared {compared}, open {open}"
    );
}
