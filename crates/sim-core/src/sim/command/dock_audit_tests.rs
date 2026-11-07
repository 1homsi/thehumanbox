//! The dock audit: every command a dock tool sends parses, applies on a lived-in world, and changes it.
//!
//! `dock_commands.json` is every tool's command as `apps/web/src/simulation/sandbox.ts` builds it (at
//! (0, 0) with the default brush); `apps/web/src/simulation/dock-commands.test.ts` fails when the two
//! drift apart. Each command is moved onto a spot where its tool has something to act on (a crowd, a
//! lake, a fire, two tribes) and replayed on a fresh copy of the same world.

use crate::organism::animal::AnimalKind;
use crate::organism::organism::Sex;
use crate::sim::simulation::Simulation;
use crate::world::grid::WorldGrid;
use crate::world::tiles::Tile;
use serde_json::{json, Value};

const DOCK_COMMANDS: &str = include_str!("dock_commands.json");

/// FNV-1a 64 of the world's save, to tell whether a command changed anything.
fn digest(sim: &Simulation) -> u64 {
    let bytes = serde_json::to_vec(&sim.to_save_state()).expect("save serializes");
    bytes.iter().fold(0xcbf2_9ce4_8422_2325u64, |h, &b| {
        (h ^ u64::from(b)).wrapping_mul(0x0000_0100_0000_01b3)
    })
}

/// Where the staged world keeps the things the tools act on.
#[derive(Clone, Copy)]
struct Stage {
    /// The middle of the biggest crowd.
    crowd: (f32, f32),
    /// A small lake beside it, and the water at its near shore.
    lake: (f32, f32),
    shore: (f32, f32),
    /// The wooded ground nearest the crowd.
    wood: (f32, f32),
    /// A burning tile beside it.
    fire: (f32, f32),
    /// An unpartnered man and woman of the crowd's tribe.
    man: (f32, f32),
    woman: (f32, f32),
    /// A person of a second tribe that settled beside the crowd.
    other: (f32, f32),
    /// The damaged building nearest the crowd.
    building: (f32, f32),
}

fn alive_near(sim: &Simulation, x: f32, y: f32, r: f32) -> usize {
    sim.organisms
        .iter()
        .filter(|o| o.alive && (o.x - x).hypot(o.y - y) <= r)
        .count()
}

/// A world a few days old, with a lake, a fire, a hurt and a sick person, a fresh grave, beasts and a
/// second tribe next to its biggest crowd.
fn staged_world() -> (Simulation, Stage) {
    let mut sim = Simulation::new(11);
    for _ in 0..300 {
        sim.tick();
    }
    let crowd = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| (o.x, o.y))
        .max_by_key(|&(x, y)| alive_near(&sim, x, y, 6.0))
        .expect("someone is alive");
    let (cx, cy) = (crowd.0.round() as i32, crowd.1.round() as i32);
    // A lake to the east and a fire to the west.
    for dx in 7..=10 {
        for dy in -2..=2 {
            if WorldGrid::in_bounds(cx + dx, cy + dy) {
                sim.grid.set(cx + dx, cy + dy, Tile::Water);
            }
        }
    }
    let fire = (cx - 4, cy);
    sim.grid.set(fire.0, fire.1, Tile::Fire);
    *sim.grid.fire_intensity_mut(fire.0, fire.1) = 1.0;
    sim.physics.register_fire(fire.0, fire.1);
    // Someone hurt and someone sick in the crowd, and two who could marry.
    let near: Vec<usize> = (0..sim.organisms.len())
        .filter(|&i| {
            let o = &sim.organisms[i];
            o.alive && (o.x - crowd.0).hypot(o.y - crowd.1) <= 6.0
        })
        .collect();
    assert!(near.len() >= 5, "the crowd has a few people");
    sim.organisms[near[0]].health = 0.4;
    sim.organisms[near[1]].infection = 0.9;
    let lineage = sim.organisms[near[2]].lineage_id.clone();
    let (m, w) = (near[2], near[3]);
    for (i, sex) in [(m, Sex::Male), (w, Sex::Female)] {
        let o = &mut sim.organisms[i];
        o.sex = sex;
        // Grown, and well short of old age.
        o.age = o.max_age / 2;
        o.lineage_id = lineage.clone();
        o.partner_id = None;
        // Food to spare, for the tribe's trade gift.
        o.inv_food = o.inv_food.max(3);
    }
    // Clear the old partners' side of any marriage the two were in.
    let ids = [sim.organisms[m].id.clone(), sim.organisms[w].id.clone()];
    for o in sim.organisms.iter_mut() {
        if o.partner_id.as_ref().is_some_and(|p| ids.contains(p)) {
            o.partner_id = None;
        }
    }
    // A second tribe settles beside the crowd, and beasts prowl in it.
    let before = sim.organisms.len();
    assert!(sim.apply_command_json(&format!(
        r#"{{"cmd":"spawn","x":{},"y":{},"count":5}}"#,
        crowd.0 + 3.0,
        crowd.1 + 3.0
    )));
    for kind in [AnimalKind::Wolf, AnimalKind::Demon] {
        // Any land beast will do, turned into the one wanted and set down beside the crowd.
        let a = sim
            .animals
            .iter_mut()
            .find(|a| {
                a.alive
                    && !a.kind.aquatic()
                    && !a.kind.flies()
                    && !matches!(a.kind, AnimalKind::Wolf | AnimalKind::Demon)
            })
            .expect("the world has land animals");
        a.kind = kind;
        a.x = crowd.0 + 2.0;
        a.y = crowd.1 - 2.0;
    }
    // A road through the crowd, and the buildings around it damaged, for the tools that undo them.
    sim.apply_command_json(&format!(
        r#"{{"cmd":"road","x":{cx},"y":{cy},"radius":1,"kind":"road"}}"#
    ));
    for (dx, dy) in [
        (-8, 6),
        (8, 6),
        (-8, -6),
        (8, -6),
        (0, 9),
        (0, -9),
        (12, 0),
        (-12, 0),
    ] {
        let placed = sim.apply_command_json(&format!(
            r#"{{"cmd":"place_building","x":{},"y":{},"kind":"house"}}"#,
            cx + dx,
            cy + dy
        ));
        if placed {
            break;
        }
    }
    for b in sim.buildings.iter_mut().filter(|b| !b.decorative) {
        b.damage = b.damage.max(0.5);
    }
    let building = sim
        .buildings
        .iter()
        .filter(|b| !b.decorative)
        .map(|b| (b.x as f32, b.y as f32))
        .min_by(|a, b| {
            let da = (a.0 - crowd.0).hypot(a.1 - crowd.1);
            let db = (b.0 - crowd.0).hypot(b.1 - crowd.1);
            da.total_cmp(&db)
        })
        .unwrap_or(crowd);
    // One of the crowd has just died, for the revive tool.
    sim.organisms[near[4]].health = -1.0;
    sim.tick();
    let at = |i: usize| (sim.organisms[i].x, sim.organisms[i].y);
    // The tools are checked against what the world holds, not against where this seed happens to put it:
    // the wooded tile nearest the crowd, wherever its people settled.
    let wood = (0..=80)
        .flat_map(|r: i32| (-r..=r).flat_map(move |dy| (-r..=r).map(move |dx| (dx, dy, r))))
        .filter(|&(dx, dy, r)| dx.abs().max(dy.abs()) == r)
        .map(|(dx, dy, _)| (cx + dx, cy + dy))
        .find(|&(x, y)| WorldGrid::in_bounds(x, y) && sim.grid.biome_at(x, y).wooded())
        .map_or(crowd, |(x, y)| (x as f32, y as f32));
    let stage = Stage {
        crowd,
        lake: ((cx + 8) as f32, cy as f32),
        shore: ((cx + 7) as f32, cy as f32),
        wood,
        fire: (fire.0 as f32, fire.1 as f32),
        man: at(m),
        woman: at(w),
        other: at(before),
        building,
    };
    (sim, stage)
}

/// Moves a command onto the places its tool is meant for. Returns the spots to try, best first.
fn targets(tool: &str, cmd: &Value, s: &Stage) -> Vec<Value> {
    let at = |(x, y): (f32, f32)| {
        let mut c = cmd.clone();
        // Commands that take whole tiles get whole numbers.
        let tile = c["x"].is_i64() || c["x"].is_u64();
        if tile {
            c["x"] = json!(x.round() as i32);
            c["y"] = json!(y.round() as i32);
        } else {
            c["x"] = json!(x);
            c["y"] = json!(y);
        }
        c
    };
    if cmd.get("ax").is_some() {
        let (a, b) = match tool {
            "marry" => (s.man, s.woman),
            // The man is of the crowd's tribe and has food to spare.
            "trade_gift" => (s.man, s.other),
            _ => (s.crowd, s.other),
        };
        let mut c = cmd.clone();
        c["ax"] = json!(a.0);
        c["ay"] = json!(a.1);
        c["bx"] = json!(b.0);
        c["by"] = json!(b.1);
        return vec![c];
    }
    if cmd.get("x").is_none() {
        return vec![cmd.clone()];
    }
    let primary = match tool {
        // A boat is set down on water beside land.
        "boat" => s.shore,
        "bless_forest" => s.wood,
        "frost" | "bless_river" | "tsunami" => s.lake,
        "douse" | "rain_patch" => s.fire,
        "repair" => s.building,
        _ => s.crowd,
    };
    // Open ground around the crowd, for tools that need a free footprint or a particular ground.
    let mut spots = vec![primary];
    for r in [6.0f32, 12.0, 20.0, 30.0] {
        for k in 0..8 {
            let a = k as f32 * std::f32::consts::FRAC_PI_4;
            spots.push((s.crowd.0 + a.cos() * r, s.crowd.1 + a.sin() * r));
        }
    }
    spots.into_iter().map(at).collect()
}

/// Tools that may land and still change nothing, with why.
const MAY_DO_NOTHING: &[(&str, &str)] = &[("clear", "clearing a sky that is already clear changes nothing")];

#[test]
fn every_dock_command_applies_and_changes_the_world() {
    let entries: Vec<Value> = serde_json::from_str(DOCK_COMMANDS).expect("dock_commands.json reads");
    let (base, stage) = staged_world();
    let fresh = || Simulation::from_save(11, base.to_save_state());
    let base_digest = digest(&fresh());
    let mut failures = Vec::new();
    let mut table = String::new();
    for entry in &entries {
        let tool = entry["tool"].as_str().unwrap();
        let cmd = &entry["cmd"];
        // The first spot's result, unless a later spot works.
        let mut result = None;
        for (tries, target) in targets(tool, cmd, &stage).into_iter().enumerate() {
            let mut sim = fresh();
            let outcome = sim.apply_command_json_reported(&target.to_string());
            let changed = digest(&sim) != base_digest;
            let worked = outcome.applied && changed;
            if worked || result.is_none() {
                result = Some((outcome.applied, outcome.code, outcome.count, changed, tries));
            }
            if worked {
                break;
            }
        }
        let (applied, code, count, changed, tries) = result.expect("every tool has a target");
        table.push_str(&format!(
            "{tool:<16} applied={applied:<5} changed={changed:<5} code={code}({count}) tries={}\n",
            tries + 1
        ));
        let excused = MAY_DO_NOTHING.iter().any(|(t, _)| *t == tool);
        if !(applied && changed) && !excused {
            failures.push(tool.to_string());
        }
    }
    println!("{table}");
    assert!(
        failures.is_empty(),
        "tools that did nothing: {failures:?}\n{table}"
    );
}
