use std::collections::HashMap;

use crate::sim::civ::economy::{PriceTable, Trade, currency_unit_for_era};
use crate::sim::civ::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

const BARTER_RADIUS: f32 = 3.0;
const TRADE_LOG_CAP: usize = 200;

pub fn tick_economy(sim: &mut Simulation, tick: u64) {
    if tick == 0 {
        return;
    }
    if tick % 240 == 0 {
        pay_wages(sim, tick);
    }
    if tick % 180 == 0 {
        run_barter(sim, tick);
    }
    if tick % 220 == 0 {
        run_currency_trade(sim, tick);
    }
    if tick % 1200 == 0 {
        update_wealth_labels(sim);
    }
}

fn pay_wages(sim: &mut Simulation, _tick: u64) {
    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        let Some(name) = org.specialty.as_deref() else {
            continue;
        };
        let w = wage_for(name);
        if w == 0 {
            continue;
        }
        org.wealth = org.wealth.saturating_add(w);
    }
}

fn wage_for(name: &str) -> u32 {
    match name {
        "farmer" | "hunter" | "miner" => 1,
        "smith" | "builder" | "weaver" | "baker" | "carpenter" | "mason" | "brewer" => 2,
        "merchant" | "sailor" => 3,
        "healer" | "priest" | "artist" | "scribe" | "scholar" => 2,
        "engineer" | "teacher" | "soldier" => 4,
        "doctor" | "lawyer" | "banker" | "officer" => 6,
        "pilot" | "journalist" | "actor" | "athlete" | "politician" => 8,
        "programmer" => 12,
        _ => 0,
    }
}

fn surplus(food: u8, water: u8, wood: u8, stone: u8) -> Option<(&'static str, u8)> {
    if food >= 3 {
        return Some(("food", food));
    }
    if water >= 3 {
        return Some(("water", water));
    }
    if wood >= 3 {
        return Some(("wood", wood));
    }
    if stone >= 3 {
        return Some(("stone", stone));
    }
    None
}

fn lacks(food: u8, water: u8, wood: u8, stone: u8, kind: &str) -> bool {
    match kind {
        "food" => food == 0,
        "water" => water == 0,
        "wood" => wood == 0,
        "stone" => stone == 0,
        _ => false,
    }
}

fn give(org_idx: usize, kind: &str, n: u8, sim: &mut Simulation) {
    let o = &mut sim.organisms[org_idx];
    match kind {
        "food" => o.inv_food = o.inv_food.saturating_sub(n),
        "water" => o.inv_water = o.inv_water.saturating_sub(n),
        "wood" => o.inv_wood = o.inv_wood.saturating_sub(n),
        "stone" => o.inv_stone = o.inv_stone.saturating_sub(n),
        _ => {}
    }
}

fn take(org_idx: usize, kind: &str, n: u8, sim: &mut Simulation) {
    let o = &mut sim.organisms[org_idx];
    match kind {
        "food" => o.inv_food = o.inv_food.saturating_add(n),
        "water" => o.inv_water = o.inv_water.saturating_add(n),
        "wood" => o.inv_wood = o.inv_wood.saturating_add(n),
        "stone" => o.inv_stone = o.inv_stone.saturating_add(n),
        _ => {}
    }
}

fn run_barter(sim: &mut Simulation, tick: u64) {
    let snapshot: Vec<(usize, f32, f32, String, u8, u8, u8, u8, bool)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.age > 220)
        .map(|(i, o)| {
            (
                i,
                o.x,
                o.y,
                o.lineage_id.clone(),
                o.inv_food,
                o.inv_water,
                o.inv_wood,
                o.inv_stone,
                o.discoveries.contains("barter"),
            )
        })
        .collect();

    let mut pairs_done: Vec<(usize, usize)> = Vec::new();
    for i in 0..snapshot.len() {
        let (ai, ax, ay, alid, af, aw, awd, ast, _) = &snapshot[i];
        let asur = match surplus(*af, *aw, *awd, *ast) {
            Some(s) => s,
            None => continue,
        };
        for j in (i + 1)..snapshot.len() {
            let (bi, bx, by, blid, bf, bw, bwd, bst, _) = &snapshot[j];
            if alid != blid {
                continue;
            }
            let d = (ax - bx).abs() + (ay - by).abs();
            if d > BARTER_RADIUS {
                continue;
            }
            if !lacks(*bf, *bw, *bwd, *bst, asur.0) {
                continue;
            }
            let bsur = match surplus(*bf, *bw, *bwd, *bst) {
                Some(s) => s,
                None => continue,
            };
            if !lacks(*af, *aw, *awd, *ast, bsur.0) {
                continue;
            }
            if bsur.0 == asur.0 {
                continue;
            }
            pairs_done.push((*ai, *bi));
            pairs_done.push((*bi, *ai));
            break;
        }
    }

    for (ai, bi) in pairs_done.iter().step_by(2) {
        let (ai, bi) = (*ai, *bi);
        let a = &sim.organisms[ai];
        let b = &sim.organisms[bi];
        let asur = match surplus(a.inv_food, a.inv_water, a.inv_wood, a.inv_stone) {
            Some(s) => s,
            None => continue,
        };
        let bsur = match surplus(b.inv_food, b.inv_water, b.inv_wood, b.inv_stone) {
            Some(s) => s,
            None => continue,
        };
        let aname = a.name.clone();
        let bname = b.name.clone();
        let lid = a.lineage_id.clone();
        give(ai, asur.0, 1, sim);
        take(bi, asur.0, 1, sim);
        give(bi, bsur.0, 1, sim);
        take(ai, bsur.0, 1, sim);
        let mut first_barter = false;
        if !sim.organisms[ai].discoveries.contains("barter") {
            sim.organisms[ai].discoveries.insert("barter".to_string());
            first_barter = true;
        }
        if !sim.organisms[bi].discoveries.contains("barter") {
            sim.organisms[bi].discoveries.insert("barter".to_string());
            first_barter = true;
        }
        let detail = format!("{} traded {} for {} with {}", aname, asur.0, bsur.0, bname);
        push_event(&mut sim.events, tick, "trade", &aname, &detail);
        if first_barter {
            push_event(
                &mut sim.events,
                tick,
                "build",
                &lid,
                &format!("the people of {} learned to barter", lid_short(&lid)),
            );
        }
    }
}

fn run_currency_trade(sim: &mut Simulation, tick: u64) {
    let era_map = sim.lineage_eras.clone();
    let snapshot: Vec<(usize, f32, f32, String, u8, u8, u8, u8, u32, Era, bool, bool)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.age > 400)
        .map(|(i, o)| {
            let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::PreStone);
            (
                i,
                o.x,
                o.y,
                o.lineage_id.clone(),
                o.inv_food,
                o.inv_water,
                o.inv_wood,
                o.inv_stone,
                o.wealth,
                era,
                o.discoveries.contains("barter"),
                o.discoveries.contains("currency"),
            )
        })
        .collect();

    let mut deals: Vec<(usize, usize, &'static str, u32)> = Vec::new();
    for i in 0..snapshot.len() {
        let (si, sx, sy, slid, sf, sw, swd, sst, _, sera, sbarter, _) = &snapshot[i];
        if *sera < Era::Bronze {
            continue;
        }
        if !sbarter {
            continue;
        }
        let prices = PriceTable::for_era(*sera);
        let (good, price): (&'static str, u32) = if *sf >= 3 {
            ("food", prices.food)
        } else if *swd >= 3 {
            ("wood", prices.wood)
        } else if *sst >= 3 {
            ("stone", prices.stone)
        } else if *sw >= 4 {
            ("water", prices.water)
        } else {
            continue;
        };
        if price == 0 {
            continue;
        }
        for j in 0..snapshot.len() {
            if i == j {
                continue;
            }
            let (bi, bx, by, blid, bf, bw, bwd, bst, bwealth, bera, _, _) = &snapshot[j];
            if slid != blid {
                continue;
            }
            if *bera < Era::Bronze {
                continue;
            }
            if *bwealth < price {
                continue;
            }
            let d = (sx - bx).abs() + (sy - by).abs();
            if d > BARTER_RADIUS {
                continue;
            }
            let wants = match good {
                "food" => *bf <= 1,
                "water" => *bw <= 1,
                "wood" => *bwd <= 1,
                "stone" => *bst <= 1,
                _ => false,
            };
            if !wants {
                continue;
            }
            deals.push((*si, *bi, good, price));
            break;
        }
    }

    for (si, bi, good, price) in deals {
        if !sim.organisms[si].alive || !sim.organisms[bi].alive {
            continue;
        }
        if sim.organisms[bi].wealth < price {
            continue;
        }
        give(si, good, 1, sim);
        take(bi, good, 1, sim);
        sim.organisms[bi].wealth = sim.organisms[bi].wealth.saturating_sub(price);
        sim.organisms[si].wealth = sim.organisms[si].wealth.saturating_add(price);
        let seller_name = sim.organisms[si].name.clone();
        let buyer_name = sim.organisms[bi].name.clone();
        let buyer_id = sim.organisms[bi].id.clone();
        let seller_id = sim.organisms[si].id.clone();
        let lid = sim.organisms[si].lineage_id.clone();
        let mut first_currency = false;
        if !sim.organisms[si].discoveries.contains("currency") {
            sim.organisms[si].discoveries.insert("currency".to_string());
            first_currency = true;
        }
        if !sim.organisms[bi].discoveries.contains("currency") {
            sim.organisms[bi].discoveries.insert("currency".to_string());
            first_currency = true;
        }
        sim.trades.push_back(Trade {
            tick,
            buyer_id,
            seller_id,
            good: good.to_string(),
            amount: 1,
            price,
        });
        while sim.trades.len() > TRADE_LOG_CAP {
            sim.trades.pop_front();
        }
        let era = era_map.get(&lid).copied().unwrap_or(Era::Bronze);
        let unit = currency_unit_for_era(era);
        let detail = format!(
            "{} sold {} to {} for {} {}",
            seller_name, good, buyer_name, price, unit
        );
        push_event(&mut sim.events, tick, "trade", &seller_name, &detail);
        if first_currency {
            push_event(
                &mut sim.events,
                tick,
                "build",
                &lid,
                &format!("the people of {} began using {}", lid_short(&lid), unit),
            );
        }
    }
}

fn update_wealth_labels(sim: &mut Simulation) {
    let mut by_lineage: HashMap<String, Vec<(usize, u32)>> = HashMap::new();
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        by_lineage
            .entry(o.lineage_id.clone())
            .or_default()
            .push((i, o.wealth));
    }
    for (_, mut entries) in by_lineage {
        if entries.len() < 4 {
            for (i, _) in entries {
                sim.organisms[i].discoveries.remove("rich");
                sim.organisms[i].discoveries.remove("poor");
            }
            continue;
        }
        entries.sort_by_key(|(_, w)| *w);
        let n = entries.len();
        let q1 = n / 4;
        let q3 = (n * 3) / 4;
        for (k, (i, _)) in entries.iter().enumerate() {
            let o = &mut sim.organisms[*i];
            o.discoveries.remove("rich");
            o.discoveries.remove("poor");
            if k < q1 && n >= 6 {
                o.discoveries.insert("poor".to_string());
            } else if k >= q3 && n >= 6 {
                o.discoveries.insert("rich".to_string());
            }
        }
    }
}

fn lid_short(lid: &str) -> &str {
    if lid.len() > 6 {
        &lid[..6]
    } else {
        lid
    }
}
