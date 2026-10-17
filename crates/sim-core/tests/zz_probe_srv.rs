// THROWAWAY PROBE (not to be committed): does a non-ASCII lineage from the
// client's `spawn` command panic the tick loop?
use sim_core::sim::simulation::Simulation;

fn run(lineage: &str, ticks: u32) -> Result<u32, String> {
    let lineage = lineage.to_string();
    std::panic::catch_unwind(move || {
        let mut sim = Simulation::new(42);
        let body = serde_json::json!({
            "cmd": "spawn", "x": 100.0, "y": 100.0, "count": 50, "lineage": lineage
        })
        .to_string();
        assert!(sim.apply_command_json(&body), "spawn applied");
        // Also a second, ASCII-lineage crowd next to it so there are rival lineages to gift to.
        let body2 = serde_json::json!({
            "cmd": "spawn", "x": 104.0, "y": 100.0, "count": 50, "lineage": "Lascii"
        })
        .to_string();
        assert!(sim.apply_command_json(&body2));
        for t in 0..ticks {
            sim.tick();
            let _ = t;
        }
        sim.tick_count as u32
    })
    .map_err(|e| {
        e.downcast_ref::<String>()
            .cloned()
            .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
            .unwrap_or_else(|| "non-string panic".into())
    })
}

#[test]
fn probe_ascii_lineage_control() {
    let r = run("Lascii0", 1500);
    println!("ASCII control: {:?}", r);
    assert!(r.is_ok());
}

#[test]
fn probe_cjk_lineage() {
    let r = run("日本語", 1500);
    println!("CJK lineage: {:?}", r);
    assert!(r.is_ok(), "panicked: {:?}", r);
}
