use super::*;
use serde_json::json;

fn legacy_save() -> SaveState {
    let bytes = include_bytes!("../../../../tests/fixtures/world-600x300.json.gz");
    let reader = flate2::read::GzDecoder::new(bytes.as_slice());
    serde_json::from_reader(reader).expect("real 600x300 save")
}

#[test]
fn legacy_generator_recovers_the_original_unsaved_terrain() {
    let state = legacy_save();
    let old = WorldGrid::new_sized::<600, 300>(42, true);
    assert_eq!(state.grid.tiles, old.tiles);
    assert_eq!(state.grid.biome, old.biome);
    assert_eq!(state.grid.depth, old.depth);
    assert_eq!(state.grid.fertility, old.fertility);
}

#[test]
fn old_world_preserves_every_grid_layer_and_coordinate() {
    let mut s = legacy_save();
    // Add later-game records to the real fixture, including indexed and nested positions.
    let mut v = serde_json::to_value(&s).unwrap();
    v["organisms"][0]["home_x"] = json!(12.5);
    v["organisms"][0]["home_y"] = json!(24.5);
    for name in ["food_memory", "water_memory", "danger_memory"] {
        v["organisms"][0][name] = json!({"12,24": 0.75});
    }
    v["organisms"][0]["last_area_cell"] = json!([12, 24]);
    v["organisms"][0]["wander_target"] = json!([12, 24]);
    v["organisms"][0]["journey"] = json!({"target":[12,24],"description":"home","expires_at":900});
    v["animals"][0]["pen"] = json!([12, 24]);
    v["carcasses"] = json!([{"x":12.5,"y":24.5,"kind":1,"age":2,"picked":0}]);
    v["wards"] = json!([{"x":12.5,"y":24.5,"radius":5.0,"cast":0,"until":900}]);
    v["buildings"] = json!([{"id":1,"kind":"Hut","x":12,"y":24,"owner_lineage":null,"occupants":[],"built_at_tick":0,"condition":0.5}]);
    v["farms"] = json!([{"id":1,"x":12,"y":24,"owner_lineage":"a","crop":"Wheat","planted_tick":0,"ready_tick":900,"harvested":false}]);
    v["vehicles"] = json!([{"id":1,"kind":"Boat","owner_lineage":"a","x":12,"y":24,"occupants":[],"cargo":0,"route":[[12,24]],"harbour":[12,24],"bound_for":[12,24],"ferry":{"a":[12,24],"b":[12,24]}}]);
    v["water_use"] = json!([{"x":12,"y":24,"count":7}]);
    v["field_fortifications"] = json!([{"x":12,"y":24,"lineage_id":"a"}]);
    v["prayers"]["active"] =
        json!([{"id":1,"lineage":"a","kind":"rain","x":12,"y":24,"created":0,"expires":900}]);
    v["territory"] = json!({"a":[[12,24]]});
    v["lineage_homes"] = json!({"a":[12,24,30]});
    v["lineage_centroid_history"] = json!({"a":[[99,12,24]]});
    v["drought"]["dried_tiles"] = json!([[12, 24]]);
    v["flood_tiles"] = json!([[12, 24, 900]]);
    v["plantings"] = json!({"14412":{"kind":"crop","growth":2,"ripe":false}});
    v["artworks"] = json!([{"id":1,"kind":"Painting","creator_id":"a","creator_name":"A","location":[12,24],"tick":0,"title":"A"}]);
    v["festivals"] = json!([{"id":1,"lineage_id":"a","name":"A","kind":"Harvest","start_tick":0,"duration_ticks":900,"center":[12,24]}]);
    v["battles"] = json!([{"id":"a","attackers":[],"defenders":[],"attacker_orgs":[],"defender_orgs":[],"scale":"Skirmish","location":[12,24],"started_tick":0,"ended_tick":null,"casualties_a":0,"casualties_d":0,"outcome":null,"initial_a":0,"initial_d":0}]);
    v["outbreaks"] =
        json!([{"kind":"Plague","epicenter":[12,24],"started_tick":0,"affected_count":1,"deaths":0}]);
    v["trade_routes"] = json!([{"a_center":[12,24],"b_center":[12,24]}]);
    v["caravans"] = json!([{"from":[12,24],"to":[12,24]}]);
    v["village_roads"] = json!([{"lineage":"a","from":[12,24],"to":[12,24]}]);
    v["rail_lines"] = json!([{"id":1,"lineage":"a","a":[12,24],"b":[12,24],"path":[[12,24]]}]);
    v["cart_grain"] = json!([{"lineage":"a","at":[12,24],"grain":7}]);
    v["town_plazas"] = json!([{"lineage":"a","center":[12,24],"streets":[[12,24]]}]);
    v["grid"]["placed_volcanoes"] = json!([{"x":12,"y":24,"r":5}]);
    s = serde_json::from_value(v).expect("enriched fixture");
    for layer in [
        &mut s.grid.fire,
        &mut s.grid.food_trail,
        &mut s.grid.water_trail,
        &mut s.grid.path_trail,
        &mut s.grid.structure,
        &mut s.grid.fertility,
        &mut s.grid.hazard,
        &mut s.grid.pressure,
    ] {
        for (i, value) in layer.iter_mut().enumerate() {
            *value = (i % 997) as f32 / 997.0;
        }
    }
    for (i, value) in s.grid.road.iter_mut().enumerate() {
        *value = (i % 5) as u8;
    }
    s.grid.elevation = (0..600 * 300).map(|i| (i % 1000) as f32 / 1000.0).collect();
    s.grid.temperature = (0..600 * 300).map(|i| (i % 60) as f32 - 20.0).collect();
    s.grid.volcanoes = Some(vec![crate::world::grid::Volcano { x: 12, y: 24, r: 6 }]);
    s.grid.pool_centers = Some(vec![(12, 24)]);
    let before = serde_json::to_value(&s).unwrap();
    resize::centre_old_world(&mut s, 42);
    let after = serde_json::to_value(&s).unwrap();
    for layer in [
        "tiles",
        "depth",
        "biome",
        "fire",
        "food_trail",
        "water_trail",
        "path_trail",
        "structure",
        "fertility",
        "hazard",
        "pressure",
        "road",
        "elevation",
        "temperature",
    ] {
        let a = before["grid"][layer].as_array().unwrap();
        let b = after["grid"][layer].as_array().unwrap();
        assert_eq!(b.len(), WIDTH * HEIGHT, "{layer}");
        for y in 0..300 {
            assert_eq!(
                &a[y * 600..(y + 1) * 600],
                &b[(y + 50) * WIDTH + 100..(y + 50) * WIDTH + 700],
                "{layer} row {y}"
            );
        }
    }
    for collection in [
        "organisms",
        "animals",
        "carcasses",
        "wards",
        "buildings",
        "farms",
        "vehicles",
        "water_use",
        "field_fortifications",
    ] {
        for (a, b) in before[collection]
            .as_array()
            .unwrap()
            .iter()
            .zip(after[collection].as_array().unwrap())
        {
            assert_eq!(
                b["x"].as_f64().unwrap(),
                a["x"].as_f64().unwrap() + 100.0,
                "{collection}"
            );
            assert_eq!(
                b["y"].as_f64().unwrap(),
                a["y"].as_f64().unwrap() + 50.0,
                "{collection}"
            );
        }
    }
    for path in [
        "/organisms/0/last_area_cell",
        "/organisms/0/wander_target",
        "/organisms/0/journey/target",
        "/animals/0/pen",
        "/vehicles/0/route/0",
        "/vehicles/0/harbour",
        "/vehicles/0/bound_for",
        "/vehicles/0/ferry/a",
        "/vehicles/0/ferry/b",
        "/territory/a/0",
        "/drought/dried_tiles/0",
        "/artworks/0/location",
        "/festivals/0/center",
        "/battles/0/location",
        "/outbreaks/0/epicenter",
        "/trade_routes/0/a_center",
        "/trade_routes/0/b_center",
        "/caravans/0/from",
        "/caravans/0/to",
        "/village_roads/0/from",
        "/village_roads/0/to",
        "/rail_lines/0/a",
        "/rail_lines/0/b",
        "/rail_lines/0/path/0",
        "/cart_grain/0/at",
        "/town_plazas/0/center",
        "/town_plazas/0/streets/0",
    ] {
        assert_eq!(after.pointer(path).unwrap(), &json!([112, 74]), "{path}");
    }
    assert_eq!(after["organisms"][0]["home_x"], json!(112.5));
    assert_eq!(after["organisms"][0]["home_y"], json!(74.5));
    for name in ["food_memory", "water_memory", "danger_memory"] {
        assert_eq!(after["organisms"][0][name], json!({"112,74":0.75}));
    }
    assert_eq!(after["lineage_homes"]["a"], json!([112, 74, 30]));
    assert_eq!(after["lineage_centroid_history"]["a"][0], json!([99, 112, 74]));
    assert_eq!(after["flood_tiles"][0], json!([112, 74, 900]));
    assert_eq!(after["prayers"]["active"][0]["x"], json!(112));
    assert_eq!(after["prayers"]["active"][0]["y"], json!(74));
    assert_eq!(
        after["grid"]["placed_volcanoes"][0],
        json!({"x":112,"y":74,"r":5})
    );
    assert_eq!(after["grid"]["volcanoes"][0], json!({"x":112,"y":74,"r":6}));
    assert_eq!(after["grid"]["pool_centers"][0], json!([112, 74]));
    assert_eq!(
        s.plantings.keys().copied().collect::<Vec<_>>(),
        vec![(74 * WIDTH + 112) as u32]
    );
}

#[test]
fn real_old_save_loads_on_the_same_terrain_and_stays_centred_on_reload() {
    let state = legacy_save();
    let old_tiles = state.grid.tiles.clone();
    let people: Vec<_> = state.organisms.iter().map(|o| (o.x, o.y)).collect();
    let animals: Vec<_> = state.animals.iter().map(|a| (a.x, a.y)).collect();
    let mut sim = Simulation::from_save(42, state);
    for ((x, y), o) in people.iter().zip(&sim.organisms) {
        assert_eq!((o.x, o.y), (x + 100.0, y + 50.0));
        assert_eq!(
            sim.grid.get(o.x as i32, o.y as i32) as i8,
            old_tiles[*y as usize * 600 + *x as usize]
        );
        assert_eq!((o.prev_x, o.prev_y), (o.x, o.y));
    }
    for ((x, y), a) in animals.iter().zip(&sim.animals) {
        assert_eq!((a.x, a.y), (x + 100.0, y + 50.0));
        assert_eq!(
            sim.grid.get(a.x as i32, a.y as i32) as i8,
            old_tiles[*y as usize * 600 + *x as usize]
        );
    }
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            if !(100..700).contains(&x) || !(50..350).contains(&y) {
                assert_eq!(sim.grid.tiles[y * WIDTH + x], Tile::Water as i8);
                assert_eq!(sim.grid.depth[y * WIDTH + x], 1.0);
            }
        }
    }
    let saved = sim.to_save_state();
    let reloaded = Simulation::from_save(42, saved);
    assert_eq!(sim.grid.tiles, reloaded.grid.tiles);
    assert_eq!(sim.grid.elevation, reloaded.grid.elevation);
    assert_eq!(sim.grid.temperature, reloaded.grid.temperature);
    assert_eq!(sim.grid.pool_centers, reloaded.grid.pool_centers);
    assert_eq!(sim.grid.volcanoes, reloaded.grid.volcanoes);
    for (a, b) in sim.organisms.iter().zip(&reloaded.organisms) {
        assert_eq!((a.x, a.y), (b.x, b.y));
    }
    // Rebuilt indexes and the physics fire list must be usable immediately.
    sim.tick();
}
