// THROWAWAY PROBE (not to be committed): does save -> load -> keep running match a continuous run?
use sim_core::sim::persistence::SaveState;
use sim_core::sim::simulation::Simulation;

fn diff_keys(a: &serde_json::Value, b: &serde_json::Value) -> Vec<String> {
    let (serde_json::Value::Object(ma), serde_json::Value::Object(mb)) = (a, b) else {
        return vec!["<root not object>".into()];
    };
    let mut out = Vec::new();
    for (k, va) in ma {
        match mb.get(k) {
            Some(vb) if vb == va => {}
            Some(_) => out.push(k.clone()),
            None => out.push(format!("{k} (missing)")),
        }
    }
    for k in mb.keys() {
        if !ma.contains_key(k) {
            out.push(format!("{k} (extra)"));
        }
    }
    out
}

#[test]
fn probe_reload_equivalence() {
    let mut a = Simulation::new(42);
    for _ in 0..400 {
        a.tick();
    }
    let seed = a.world_seed;
    let text = serde_json::to_string(&a.to_save_state()).unwrap();
    let state: SaveState = serde_json::from_str(&text).unwrap();
    let mut b = Simulation::from_save(seed, state);

    let a0 = serde_json::to_value(a.to_save_state()).unwrap();
    let b0 = serde_json::to_value(b.to_save_state()).unwrap();
    println!("IMMEDIATE after reload, differing keys: {:?}", diff_keys(&a0, &b0));

    for _ in 0..300 {
        a.tick();
        b.tick();
    }
    let a1 = serde_json::to_value(a.to_save_state()).unwrap();
    let b1 = serde_json::to_value(b.to_save_state()).unwrap();
    println!("AFTER 300 ticks, differing keys: {:?}", diff_keys(&a1, &b1));
    println!("ticks a={} b={}", a.tick_count, b.tick_count);
}
