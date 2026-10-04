//! Viewport and incremental state, spatial queries.

use super::*;

#[test]
fn viewport_state_includes_all_alive_when_viewport_spans_world() {
    // VP_W = WIDTH and VP_H = HEIGHT, so the in_view filter must
    // never drop entities just because the centroid is off-center.
    // (Previously a centroid-centered AABB could slide past the
    // world edge and silently exclude orgs / animals on the far
    // side. That caused "animals not showing" reports.)
    let mut sim = Simulation::new(19);
    sim.tick_count = 2;
    let near_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[near_idx].x = 10.0;
    sim.organisms[near_idx].y = 10.0;
    let near_id = sim.organisms[near_idx].id.clone();

    let far_idx = sim
        .organisms
        .iter()
        .enumerate()
        .find(|(i, o)| *i != near_idx && o.alive)
        .map(|(i, _)| i)
        .unwrap();
    sim.organisms[far_idx].x = (WIDTH - 10) as f32;
    sim.organisms[far_idx].y = (HEIGHT - 10) as f32;
    let far_id = sim.organisms[far_idx].id.clone();

    let state = sim.state_json_at(10, 10);
    let ids: Vec<String> = state["organisms_hot"]["ids"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|v| v.as_str().map(|s| s.to_string()))
        .collect();

    assert!(ids.contains(&near_id), "centroid-local org must ship");
    assert!(
        ids.contains(&far_id),
        "with full-world viewport, the far-corner org must also ship"
    );
    assert_eq!(state["organisms_complete"], false);
    assert!(
        state.get("organisms").is_none(),
        "deltas should not carry the AoS organisms array"
    );
}

#[test]
fn incremental_state_omits_cold_world_metadata() {
    let mut sim = Simulation::new(29);
    sim.tick_count = 2;

    let state = sim.state_json_at(10, 10);
    let obj = state.as_object().unwrap();

    for key in [
        "events",
        "history",
        "story_history",
        "pop_history",
        "tribal_relations",
        "lineage_sizes",
        "lineage_names",
        "current_era",
        "sex_words",
    ] {
        assert!(
            !obj.contains_key(key),
            "incremental frame unexpectedly included cold key {key}",
        );
    }
}

#[test]
fn full_state_keeps_cold_world_metadata() {
    let mut sim = Simulation::new(31);
    sim.tick_count = 2;

    let state = sim.state_json();
    let obj = state.as_object().unwrap();

    for key in [
        "events",
        "history",
        "story_history",
        "pop_history",
        "tribal_relations",
        "lineage_sizes",
        "lineage_names",
        "current_era",
        "sex_words",
    ] {
        assert!(obj.contains_key(key), "full frame omitted cold key {key}");
    }
}

#[test]
fn current_position_spatial_query_excludes_far_organisms() {
    let mut sim = Simulation::new(23);
    let center_idx = sim.organisms.iter().position(|o| o.alive).unwrap();
    sim.organisms[center_idx].x = 20.0;
    sim.organisms[center_idx].y = 20.0;

    let near_idx = sim
        .organisms
        .iter()
        .enumerate()
        .find(|(i, o)| *i != center_idx && o.alive)
        .map(|(i, _)| i)
        .unwrap();
    sim.organisms[near_idx].x = 24.0;
    sim.organisms[near_idx].y = 20.0;

    let far_idx = sim
        .organisms
        .iter()
        .enumerate()
        .find(|(i, o)| *i != center_idx && *i != near_idx && o.alive)
        .map(|(i, _)| i)
        .unwrap();
    sim.organisms[far_idx].x = 80.0;
    sim.organisms[far_idx].y = 80.0;

    let nearby = sim.current_nearby_organisms(20, 20, 6);
    assert!(nearby.contains(&center_idx));
    assert!(nearby.contains(&near_idx));
    assert!(!nearby.contains(&far_idx));
}
