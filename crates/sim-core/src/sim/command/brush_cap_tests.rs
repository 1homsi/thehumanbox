use super::MAX_BRUSH_RADIUS;
use crate::sim::simulation::Simulation;
use serde_json::{json, Value};
use std::time::{Duration, Instant};

const DOCK_COMMANDS: &str = include_str!("dock_commands.json");

const BUDGET: Duration = Duration::from_millis(1500);

#[test]
fn every_brush_power_at_the_largest_size_applies_and_ticks_within_budget() {
    let mut base = Simulation::new(11);
    base.tick_n(300);
    let (cx, cy) = base
        .organisms
        .iter()
        .find(|o| o.alive)
        .map(|o| (o.x, o.y))
        .expect("someone alive");
    let entries: Vec<Value> = serde_json::from_str(DOCK_COMMANDS).expect("dock_commands.json reads");
    let mut table = String::new();
    let mut over = Vec::new();
    let mut checked = 0;
    for entry in &entries {
        let tool = entry["tool"].as_str().unwrap_or("?");
        let mut cmd = entry["cmd"].clone();
        let Some(radius) = cmd.get("radius") else {
            continue;
        };
        cmd["radius"] = if radius.is_f64() {
            json!(MAX_BRUSH_RADIUS as f64)
        } else {
            json!(MAX_BRUSH_RADIUS)
        };
        if cmd.get("x").is_some() {
            let whole = cmd["x"].is_i64() || cmd["x"].is_u64();
            cmd["x"] = if whole {
                json!(cx.round() as i32)
            } else {
                json!(cx)
            };
            cmd["y"] = if whole {
                json!(cy.round() as i32)
            } else {
                json!(cy)
            };
        }
        let mut sim = Simulation::from_save(11, base.to_save_state());
        let started = Instant::now();
        let outcome = sim.apply_command_json_reported(&cmd.to_string());
        let applied = started.elapsed();
        let started = Instant::now();
        sim.tick();
        let ticked = started.elapsed();
        table.push_str(&format!(
            "{tool:<18} {:<8} {:>5} apply {:>7.2} ms  next tick {:>7.2} ms\n",
            outcome.code,
            outcome.count,
            applied.as_secs_f64() * 1e3,
            ticked.as_secs_f64() * 1e3
        ));
        if applied > BUDGET || ticked > BUDGET {
            over.push(tool.to_string());
        }
        checked += 1;
    }
    println!("{table}");
    assert!(checked > 30, "only {checked} brush tools found");
    assert!(
        over.is_empty(),
        "over budget at radius {MAX_BRUSH_RADIUS}: {over:?}\n{table}"
    );
}
