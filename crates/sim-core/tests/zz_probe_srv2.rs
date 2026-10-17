// THROWAWAY PROBE (not to be committed): fire every command with extreme values,
// tick, save, reload. Reports panics per command and whether the save round-trips.
use sim_core::sim::persistence::{write_save_to_disk, SaveState};
use sim_core::sim::simulation::Simulation;

const NAMES: &[&str] = &[
    "spawn", "family", "teleport", "heal_one", "place_boat", "place_building", "gift", "hail",
    "set_difficulty", "teach_nearby", "mutate", "curse", "merge_tribes", "split_tribe", "cure_tribe",
    "guardian", "clear_region", "rain_patch", "eclipse", "aurora", "heat_wave", "freeze",
    "bless_river", "bless_forest", "tribe_gift", "migrate_tribe", "trade_gift", "era_tribe", "talent",
    "comet", "nuke", "set_time_of_day", "make_leader", "smite", "heal", "paint", "ignite", "weather",
    "drought", "outbreak", "spawn_animal", "sunshine", "long_life", "courage", "poison", "bless",
    "inspire", "earthquake", "war", "peace", "meteor", "harvest", "cure", "arm", "bounty", "douse",
    "ward", "teach", "revive", "banish", "blight", "frenzy", "flood", "blizzard", "thunder", "plant",
    "rename_tribe", "paint_biome", "volcano", "meteor_shower", "love", "rename_person", "marry", "road",
    "demolish", "repair", "tame", "gale", "wildfire", "locusts", "tsunami", "tornado", "restore", "guide",
];

fn payloads() -> Vec<String> {
    let mode = std::env::var("PROBE_MODE").unwrap_or_else(|_| "all".into());
    let fvals: [f64; 6] = [1e39, -1e39, 0.0, 1e-30, 5000.0, 99999.0];
    let fr: [f64; 4] = [1e39, 0.0, -3.0, 1e30];
    let ivals: [i64; 6] = [i32::MAX as i64, i32::MIN as i64, 100000, -100000, 0, 63];
    let ir: [i64; 4] = [i32::MAX as i64, -1, 0, 400];
    let mut out = Vec::new();
    for name in NAMES {
        for (i, v) in fvals.iter().enumerate().filter(|_| mode == "all" || mode == "float") {
            let r = fr[i % fr.len()];
            out.push(format!(
                r#"{{"cmd":"{name}","x":{v:e},"y":{v:e},"ax":{v:e},"ay":{v:e},"bx":{v:e},"by":{v:e},"radius":{r:e},"count":3,"lineage":"Lascii0","kind":"road","tile":"grass","biome":"sand","what":"food","level":"normal","phase":"noon","strategy":"hunt","duration_ticks":300,"era":"stone","name":"Mira","id":"nobody","active":true}}"#
            ));
        }
        for (i, v) in ivals.iter().enumerate().filter(|_| mode == "all" || mode == "int") {
            let r = ir[i % ir.len()];
            out.push(format!(
                r#"{{"cmd":"{name}","x":{v},"y":{v},"ax":{v},"ay":{v},"bx":{v},"by":{v},"radius":{r},"count":3,"lineage":"Lascii0","kind":"road","tile":"grass","biome":"sand","what":"food","level":"normal","phase":"noon","strategy":"hunt","duration_ticks":300,"era":"stone","name":"Mira","id":"nobody","active":true}}"#
            ));
        }
    }
    out
}

#[test]
fn probe_extreme_commands_then_save_roundtrip() {
    std::panic::set_hook(Box::new(|_| {}));
    let mut sim = Simulation::new(42);
    for _ in 0..50 {
        sim.tick();
    }
    let baseline = std::env::var("PROBE_MODE").map(|m| m == "none").unwrap_or(false);
    let mut panics: Vec<(String, String)> = Vec::new();
    if baseline { /* no commands */ }
    let plist = payloads();
    println!("payloads: {}", plist.len());
    for p in plist {
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            sim.apply_command_json(&p);
        }));
        if let Err(e) = res {
            let msg = e
                .downcast_ref::<String>()
                .cloned()
                .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_default();
            panics.push((p.clone(), msg));
        }
    }
    // Some ticks after the storm, catching panics.
    let tick_res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        for _ in 0..30 {
            sim.tick();
        }
    }));
    let _ = std::panic::take_hook();
    let dir = std::env::temp_dir().join("thb_probe_srv2");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("world.save");
    let path_s = path.to_string_lossy().to_string();
    let state = sim.to_save_state();
    let write = write_save_to_disk(&state, &path_s);
    let tick_before = sim.tick_count;
    println!("apply panics: {}", panics.len());
    let mut seen = std::collections::BTreeSet::new();
    for (p, m) in &panics {
        let key = m.chars().take(120).collect::<String>();
        if seen.insert(key.clone()) {
            println!("PANIC [{}] <- {}", key, &p[..p.len().min(160)]);
        }
    }
    println!("tick storm result ok={}", tick_res.is_ok());
    println!("write result: {:?}", write);
    let text = std::fs::read_to_string(&path_s).unwrap();
    println!("save bytes={} null_tokens={}", text.len(), text.matches(":null").count() + text.matches("[null").count() + text.matches(",null").count());
    match serde_json::from_str::<SaveState>(&text) {
        Ok(_) => println!("direct parse OK"),
        Err(e) => println!("direct parse ERR: {} (line {} col {})", e, e.line(), e.column()),
    }
    let loaded = Simulation::load_or_new(42, &path_s);
    let backups: Vec<_> = std::fs::read_dir(&dir)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    println!("files after load: {:?}", backups);
    println!("roundtrip: tick_before={} loaded_tick={}", tick_before, loaded.tick_count);
}
