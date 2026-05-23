use std::collections::HashMap;

use crate::sim::civ::economy::{PriceTable, Trade, TRADABLE_TOOLS, currency_unit_for_era};
use crate::sim::civ::era::Era;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

const BARTER_RADIUS: f32 = 3.0;
const TRADE_LOG_CAP: usize = 500;

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
    let shop_anchors: Vec<(f32, f32, &'static str, Option<String>)> = sim
        .buildings
        .iter()
        .filter_map(|b| {
            let kind = match b.kind {
                crate::sim::tech::buildings::BuildingKind::Forge => "forge",
                crate::sim::tech::buildings::BuildingKind::Workshop => "workshop",
                crate::sim::tech::buildings::BuildingKind::Bakery => "bakery",
                crate::sim::tech::buildings::BuildingKind::Mill => "mill",
                crate::sim::tech::buildings::BuildingKind::Windmill => "mill",
                crate::sim::tech::buildings::BuildingKind::Watermill => "mill",
                crate::sim::tech::buildings::BuildingKind::Inn => "inn",
                crate::sim::tech::buildings::BuildingKind::Bank => "bank",
                _ => return None,
            };
            Some((b.x as f32 + 0.5, b.y as f32 + 0.5, kind, b.owner_lineage.clone()))
        })
        .collect();

    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        let Some(name) = org.specialty.as_deref() else {
            continue;
        };
        let base = wage_for(name);
        if base == 0 {
            continue;
        }
        let bonus = shop_bonus_for(name, org, &shop_anchors);
        org.wealth = org.wealth.saturating_add(base + bonus);
    }
}

fn shop_bonus_for(
    specialty: &str,
    org: &crate::organism::organism::Organism,
    anchors: &[(f32, f32, &'static str, Option<String>)],
) -> u32 {
    let wanted: &[&str] = match specialty {
        "smith" => &["forge", "workshop"],
        "baker" => &["bakery"],
        "brewer" => &["inn"],
        "carpenter" | "builder" | "mason" => &["workshop", "mill"],
        "merchant" => &["inn", "bank"],
        "banker" => &["bank"],
        "miller" => &["mill"],
        _ => &[],
    };
    if wanted.is_empty() {
        return 0;
    }
    for (sx, sy, kind, lid) in anchors {
        if !wanted.contains(kind) {
            continue;
        }
        if let Some(lid) = lid {
            if lid != &org.lineage_id {
                continue;
            }
        }
        let d = (org.x - sx).abs() + (org.y - sy).abs();
        if d <= 8.0 {
            return wage_for(specialty);
        }
    }
    0
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

fn surplus(
    food: u8,
    water: u8,
    wood: u8,
    stone: u8,
    tools: &HashMap<String, u8>,
) -> Option<(String, u8)> {
    for k in TRADABLE_TOOLS {
        let c = tools.get(*k).copied().unwrap_or(0);
        if c >= 2 {
            return Some(((*k).to_string(), c));
        }
    }
    if food >= 3 {
        return Some(("food".into(), food));
    }
    if water >= 3 {
        return Some(("water".into(), water));
    }
    if wood >= 3 {
        return Some(("wood".into(), wood));
    }
    if stone >= 3 {
        return Some(("stone".into(), stone));
    }
    None
}

fn lacks(
    food: u8,
    water: u8,
    wood: u8,
    stone: u8,
    tools: &HashMap<String, u8>,
    kind: &str,
) -> bool {
    match kind {
        "food" => food == 0,
        "water" => water == 0,
        "wood" => wood == 0,
        "stone" => stone == 0,
        _ => tools.get(kind).copied().unwrap_or(0) == 0,
    }
}

fn give(org_idx: usize, kind: &str, n: u8, sim: &mut Simulation) {
    let o = &mut sim.organisms[org_idx];
    match kind {
        "food" => o.inv_food = o.inv_food.saturating_sub(n),
        "water" => o.inv_water = o.inv_water.saturating_sub(n),
        "wood" => o.inv_wood = o.inv_wood.saturating_sub(n),
        "stone" => o.inv_stone = o.inv_stone.saturating_sub(n),
        _ => {
            let cur = o.tools.get(kind).copied().unwrap_or(0);
            let next = cur.saturating_sub(n);
            if next == 0 {
                o.tools.remove(kind);
            } else {
                o.tools.insert(kind.into(), next);
            }
        }
    }
}

fn take(org_idx: usize, kind: &str, n: u8, sim: &mut Simulation) {
    let o = &mut sim.organisms[org_idx];
    match kind {
        "food" => o.inv_food = o.inv_food.saturating_add(n),
        "water" => o.inv_water = o.inv_water.saturating_add(n),
        "wood" => o.inv_wood = o.inv_wood.saturating_add(n),
        "stone" => o.inv_stone = o.inv_stone.saturating_add(n),
        _ => {
            let cur = o.tools.get(kind).copied().unwrap_or(0);
            let next = (cur as u32 + n as u32).min(8) as u8;
            o.tools.insert(kind.into(), next);
        }
    }
}

struct BarterRow {
    idx: usize,
    x: f32,
    y: f32,
    lid: String,
    food: u8,
    water: u8,
    wood: u8,
    stone: u8,
    tools: HashMap<String, u8>,
}

fn run_barter(sim: &mut Simulation, tick: u64) {
    let snapshot: Vec<BarterRow> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.age > 220)
        .map(|(i, o)| BarterRow {
            idx: i,
            x: o.x,
            y: o.y,
            lid: o.lineage_id.clone(),
            food: o.inv_food,
            water: o.inv_water,
            wood: o.inv_wood,
            stone: o.inv_stone,
            tools: o.tools.clone(),
        })
        .collect();

    let mut pairs_done: Vec<(usize, usize)> = Vec::new();
    for i in 0..snapshot.len() {
        let a = &snapshot[i];
        let asur = match surplus(a.food, a.water, a.wood, a.stone, &a.tools) {
            Some(s) => s,
            None => continue,
        };
        for j in (i + 1)..snapshot.len() {
            let b = &snapshot[j];
            let cross_lineage = a.lid != b.lid;
            let cap = if cross_lineage { BARTER_RADIUS * 0.6 } else { BARTER_RADIUS };
            let d = (a.x - b.x).abs() + (a.y - b.y).abs();
            if d > cap {
                continue;
            }
            if !lacks(b.food, b.water, b.wood, b.stone, &b.tools, &asur.0) {
                continue;
            }
            let bsur = match surplus(b.food, b.water, b.wood, b.stone, &b.tools) {
                Some(s) => s,
                None => continue,
            };
            if !lacks(a.food, a.water, a.wood, a.stone, &a.tools, &bsur.0) {
                continue;
            }
            if bsur.0 == asur.0 {
                continue;
            }
            pairs_done.push((a.idx, b.idx));
            pairs_done.push((b.idx, a.idx));
            break;
        }
    }

    for (ai, bi) in pairs_done.iter().step_by(2) {
        let (ai, bi) = (*ai, *bi);
        let a = &sim.organisms[ai];
        let b = &sim.organisms[bi];
        let asur = match surplus(a.inv_food, a.inv_water, a.inv_wood, a.inv_stone, &a.tools) {
            Some(s) => s,
            None => continue,
        };
        let bsur = match surplus(b.inv_food, b.inv_water, b.inv_wood, b.inv_stone, &b.tools) {
            Some(s) => s,
            None => continue,
        };
        let aname = a.name.clone();
        let bname = b.name.clone();
        let lid = a.lineage_id.clone();
        give(ai, &asur.0, 1, sim);
        take(bi, &asur.0, 1, sim);
        give(bi, &bsur.0, 1, sim);
        take(ai, &bsur.0, 1, sim);
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

struct CurrencyRow {
    idx: usize,
    x: f32,
    y: f32,
    lid: String,
    food: u8,
    water: u8,
    wood: u8,
    stone: u8,
    tools: HashMap<String, u8>,
    wealth: u32,
    era: Era,
    barter: bool,
}

fn pick_sell_good(row: &CurrencyRow, prices: &PriceTable) -> Option<(String, u32)> {
    for k in TRADABLE_TOOLS {
        let c = row.tools.get(*k).copied().unwrap_or(0);
        if c >= 2 {
            let p = prices.price_for(row.era, k);
            if p > 0 {
                return Some(((*k).to_string(), p));
            }
        }
    }
    if row.food >= 3 && prices.food > 0 {
        return Some(("food".into(), prices.food));
    }
    if row.wood >= 3 && prices.wood > 0 {
        return Some(("wood".into(), prices.wood));
    }
    if row.stone >= 3 && prices.stone > 0 {
        return Some(("stone".into(), prices.stone));
    }
    if row.water >= 4 && prices.water > 0 {
        return Some(("water".into(), prices.water));
    }
    None
}

fn run_currency_trade(sim: &mut Simulation, tick: u64) {
    let era_map = sim.lineage_eras.clone();
    let snapshot: Vec<CurrencyRow> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.age > 400)
        .map(|(i, o)| {
            let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::PreStone);
            CurrencyRow {
                idx: i,
                x: o.x,
                y: o.y,
                lid: o.lineage_id.clone(),
                food: o.inv_food,
                water: o.inv_water,
                wood: o.inv_wood,
                stone: o.inv_stone,
                tools: o.tools.clone(),
                wealth: o.wealth,
                era,
                barter: o.discoveries.contains("barter"),
            }
        })
        .collect();

    let mut deals: Vec<(usize, usize, String, u32)> = Vec::new();
    for i in 0..snapshot.len() {
        let s = &snapshot[i];
        if s.era < Era::Bronze || !s.barter {
            continue;
        }
        let prices = PriceTable::for_era(s.era);
        let (good, price) = match pick_sell_good(s, &prices) {
            Some(p) => p,
            None => continue,
        };
        for j in 0..snapshot.len() {
            if i == j {
                continue;
            }
            let b = &snapshot[j];
            let cross_lineage = s.lid != b.lid;
            if b.era < Era::Bronze || b.wealth < price {
                continue;
            }
            let cap = if cross_lineage { BARTER_RADIUS * 0.6 } else { BARTER_RADIUS };
            let d = (s.x - b.x).abs() + (s.y - b.y).abs();
            if d > cap {
                continue;
            }
            let wants = match good.as_str() {
                "food" => b.food <= 1,
                "water" => b.water <= 1,
                "wood" => b.wood <= 1,
                "stone" => b.stone <= 1,
                k => b.tools.get(k).copied().unwrap_or(0) == 0,
            };
            if !wants {
                continue;
            }
            deals.push((s.idx, b.idx, good.clone(), price));
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
        give(si, &good, 1, sim);
        take(bi, &good, 1, sim);
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
            good: good.clone(),
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
