// THROWAWAY PROBE (not to be committed): which float command first makes the saved
// state fail to parse, and which field holds the null.
use sim_core::sim::persistence::SaveState;
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

fn payload(name: &str, v: &str, r: &str) -> String {
    format!(
        r#"{{"cmd":"{name}","x":{v},"y":{v},"ax":{v},"ay":{v},"bx":{v},"by":{v},"radius":{r},"count":3,"lineage":"Lascii0","kind":"road","tile":"grass","biome":"sand","what":"food","level":"normal","phase":"noon","strategy":"hunt","duration_ticks":300,"era":"stone","name":"Mira","id":"nobody","active":true}}"#
    )
}

fn parse_ok(sim: &Simulation) -> Result<(), String> {
    let text = serde_json::to_string(&sim.to_save_state()).unwrap();
    match serde_json::from_str::<SaveState>(&text) {
        Ok(_) => Ok(()),
        Err(e) => {
            let col = e.column();
            let lo = col.saturating_sub(260);
            let hi = (col + 40).min(text.len());
            Err(format!("{} :: ...{}...", e, &text[lo..hi]))
        }
    }
}

#[test]
fn probe_each_float_command_alone() {
    std::panic::set_hook(Box::new(|_| {}));
    let vals = ["1e39", "-1e39", "0.0", "1e-30", "5000.0", "99999.0"];
    let rs = ["1e39", "0.0", "-3.0", "1e30"];
    let mut bad = Vec::new();
    for name in NAMES {
        let mut sim = Simulation::new(42);
        for _ in 0..50 {
            sim.tick();
        }
        for (i, v) in vals.iter().enumerate() {
            let r = rs[i % rs.len()];
            let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                sim.apply_command_json(&payload(name, v, r));
            }));
        }
        if let Err(msg) = parse_ok(&sim) {
            println!("BAD cmd={} :: {}", name, &msg[..msg.len().min(160)]);
            bad.push(*name);
        }
    }
    println!("BAD LIST: {:?}", bad);
}
