use std::collections::{HashMap, HashSet};

use crate::sim::civ::economy::{
    currency_unit_for_era, military_issue_for_era, PriceTable, Trade, MILITARY_EQUIPMENT_COST, TRADABLE_TOOLS,
};
use crate::sim::civ::era::Era;
use crate::sim::civ::government::LawKind;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

const BARTER_RADIUS: f32 = 3.0;
const TRADE_LOG_CAP: usize = 500;

pub fn tick_economy(sim: &mut Simulation, tick: u64) {
    if tick == 0 {
        return;
    }
    if tick.is_multiple_of(240) {
        run_fiscal_cycle(sim, tick);
    }
    if tick.is_multiple_of(180) {
        run_barter(sim, tick);
    }
    if tick.is_multiple_of(220) {
        run_currency_trade(sim, tick);
    }
    if tick.is_multiple_of(1200) {
        update_wealth_labels(sim);
    }
}

#[derive(Clone)]
struct FiscalPolicy {
    tax_rate: f32,
    education: bool,
    healthcare: bool,
    safety_net: bool,
    military_service: bool,
    era: Era,
}

fn run_fiscal_cycle(sim: &mut Simulation, tick: u64) {
    // Administrators can remit current receipts early through the collection
    // action. Anything still pending is carried into the treasury here before
    // the next payroll, so a lineage without an available administrator never
    // loses lawfully withheld revenue.
    let pending_lineages: Vec<String> = sim.governments.keys().cloned().collect();
    for lineage in pending_lineages {
        remit_pending_income_taxes(sim, &lineage);
    }

    let shop_anchors: Vec<(f32, f32, &'static str, Option<String>)> = sim
        .buildings
        .iter()
        .filter(|b| b.is_operational())
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

    // Private income is created only when an organism produced something or
    // worked at a completed workplace. Public-service income is paid from a
    // lineage treasury below, so money no longer appears twice from two
    // unrelated wage ticks.
    let mut earned = vec![0u32; sim.organisms.len()];
    for (idx, org) in sim.organisms.iter_mut().enumerate() {
        if !org.alive {
            continue;
        }
        let Some(name) = org.specialty.clone() else {
            continue;
        };
        let base = wage_for(&name);
        if base == 0 {
            continue;
        }
        let income = claim_productive_income(&name, org, &shop_anchors, base);
        if income > 0 {
            org.wealth = org.wealth.saturating_add(income);
            earned[idx] = income;
        }
    }

    let policies: HashMap<String, FiscalPolicy> = sim
        .governments
        .iter()
        .map(|(lid, government)| {
            (
                lid.clone(),
                FiscalPolicy {
                    tax_rate: government.effective_tax_rate(),
                    education: government.has_law(LawKind::Education),
                    healthcare: government.has_law(LawKind::Healthcare),
                    safety_net: government.has_law(LawKind::SafetyNet),
                    military_service: government.has_law(LawKind::MilitaryService),
                    era: sim.lineage_eras.get(lid).copied().unwrap_or(Era::PreStone),
                },
            )
        })
        .collect();

    // Assess tax across the lineage's whole payroll. Rounding every one-coin
    // wage upward would turn a 2-20% tax law into a 100% tax on subsistence
    // workers. Pooling first preserves the enacted rate while still letting
    // early governments collect from a broad productive population.
    let collected = collect_income_taxes(sim, &policies, &earned, tick);
    for (lid, amount) in collected {
        if let Some(government) = sim.governments.get_mut(&lid) {
            government.tax_receipts_pending = government.tax_receipts_pending.saturating_add(amount);
        }
    }

    fund_public_services(sim, &policies, tick);
}

/// Move rate-assessed payroll withholding into the public treasury.
///
/// Citizen wealth is deliberately untouched here: `collect_income_taxes`
/// already withheld exactly the enacted share from newly earned income. This
/// makes administration useful without allowing repeated actions to tax the
/// same accumulated savings again.
pub(crate) fn remit_pending_income_taxes(sim: &mut Simulation, lineage: &str) -> u64 {
    let Some(government) = sim.governments.get_mut(lineage) else {
        return 0;
    };
    let amount = std::mem::take(&mut government.tax_receipts_pending);
    government.treasury = government.treasury.saturating_add(amount);
    amount
}

fn collect_income_taxes(
    sim: &mut Simulation,
    policies: &HashMap<String, FiscalPolicy>,
    earned: &[u32],
    tick: u64,
) -> HashMap<String, u64> {
    let mut contributors: HashMap<String, Vec<usize>> = HashMap::new();
    for (idx, org) in sim.organisms.iter().enumerate() {
        if org.alive
            && earned.get(idx).copied().unwrap_or(0) > 0
            && policies
                .get(&org.lineage_id)
                .is_some_and(|policy| policy.tax_rate > 0.0)
        {
            contributors.entry(org.lineage_id.clone()).or_default().push(idx);
        }
    }

    let mut collected = HashMap::new();
    for (lineage, mut members) in contributors {
        let rate = policies[&lineage].tax_rate;
        let total_income: u64 = members.iter().map(|index| u64::from(earned[*index])).sum();
        let target = ((total_income as f64 * f64::from(rate)).floor() as u64).min(total_income);
        if target == 0 {
            continue;
        }

        // Rotate equal fractional assessments each fiscal cycle so the same
        // low-wage worker is not always the one who contributes the remainder.
        let member_count = members.len();
        members.rotate_left(((tick / 240) as usize) % member_count);
        members.sort_by(|a, b| {
            let a_fraction = earned[*a] as f32 * rate - (earned[*a] as f32 * rate).floor();
            let b_fraction = earned[*b] as f32 * rate - (earned[*b] as f32 * rate).floor();
            b_fraction.total_cmp(&a_fraction)
        });

        let mut paid = 0u64;
        for &index in &members {
            let base = ((earned[index] as f32 * rate).floor() as u32).min(sim.organisms[index].wealth);
            sim.organisms[index].wealth -= base;
            paid += u64::from(base);
        }
        let mut remainder = target.saturating_sub(paid);
        for &index in &members {
            if remainder == 0 {
                break;
            }
            if sim.organisms[index].wealth > 0 {
                sim.organisms[index].wealth -= 1;
                paid += 1;
                remainder -= 1;
            }
        }
        if paid > 0 {
            collected.insert(lineage, paid);
        }
    }
    collected
}

fn claim_productive_income(
    specialty: &str,
    org: &mut crate::organism::organism::Organism,
    anchors: &[(f32, f32, &'static str, Option<String>)],
    base: u32,
) -> u32 {
    // These roles are paid from taxation only when the relevant institution
    // exists. Treating them as private output would mint their salary twice.
    if matches!(
        specialty,
        "healer" | "doctor" | "teacher" | "scholar" | "soldier" | "officer" | "politician"
    ) {
        return 0;
    }

    // A private wage represents a sale. Consume the sold unit so one berry or
    // stone cannot mint income forever merely by remaining in inventory.
    let gathered_output = match specialty {
        "farmer" | "hunter" if org.inv_food >= 3 => {
            org.inv_food -= 1;
            true
        }
        "miner" | "mason" if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        "builder" | "carpenter" if org.inv_wood > 0 => {
            org.inv_wood -= 1;
            true
        }
        "builder" | "carpenter" if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        "sailor" if org.inv_food >= 3 => {
            org.inv_food -= 1;
            true
        }
        "sailor" if org.inv_water >= 3 => {
            org.inv_water -= 1;
            true
        }
        _ => false,
    };
    let workplace_output = shop_bonus_for(specialty, org, anchors) > 0;
    if workplace_output {
        // Workshop and service income represents labor rather than a raw-good
        // sale. Charging energy makes the output part of the organism's real
        // activity budget instead of a free proximity stipend.
        org.energy = (org.energy - 0.012).max(0.0);
    }
    if gathered_output || workplace_output {
        base + u32::from(workplace_output) * base
    } else {
        0
    }
}

fn fund_public_services(sim: &mut Simulation, policies: &HashMap<String, FiscalPolicy>, tick: u64) {
    let mut spent: HashMap<String, u64> = HashMap::new();
    let mut funded_education: HashSet<String> = HashSet::new();
    let mut funded_healthcare: HashSet<String> = HashSet::new();
    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        let Some(policy) = policies.get(&org.lineage_id) else {
            continue;
        };
        let already_spent = spent.get(&org.lineage_id).copied().unwrap_or(0);
        let available = sim
            .governments
            .get(&org.lineage_id)
            .map(|g| g.treasury.saturating_sub(already_spent))
            .unwrap_or(0);
        let specialty = org.specialty.as_deref().unwrap_or("");

        let wage = if policy.education && matches!(specialty, "teacher" | "scholar") && available >= 2 {
            funded_education.insert(org.lineage_id.clone());
            2
        } else if policy.healthcare && matches!(specialty, "healer" | "doctor") && available >= 3 {
            funded_healthcare.insert(org.lineage_id.clone());
            3
        } else if policy.military_service && matches!(specialty, "soldier" | "officer") && available >= 3 {
            let military_wage = if specialty == "officer" { 5 } else { 3 };
            let weapon = military_issue_for_era(policy.era);
            if available >= MILITARY_EQUIPMENT_COST + military_wage && !org.has_tool(weapon) {
                org.tools.insert(weapon.to_string(), 1);
                *spent.entry(org.lineage_id.clone()).or_default() += MILITARY_EQUIPMENT_COST;
            }
            military_wage
        } else if policy.safety_net && org.wealth <= 1 && org.age > 180 && available >= 1 {
            1
        } else {
            0
        };

        let already_spent = spent.get(&org.lineage_id).copied().unwrap_or(0);
        let available = sim
            .governments
            .get(&org.lineage_id)
            .map(|g| g.treasury.saturating_sub(already_spent))
            .unwrap_or(0);
        let paid = wage.min(available);
        if paid > 0 {
            org.wealth = org.wealth.saturating_add(paid as u32);
            *spent.entry(org.lineage_id.clone()).or_default() += paid;
        }
    }

    // A funded teacher or clinician serves their community, not merely
    // themselves. Benefits are deliberately gradual so institutions matter
    // across generations without instantly erasing hardship.
    for org in sim.organisms.iter_mut().filter(|org| org.alive) {
        if funded_education.contains(&org.lineage_id) && org.age > 120 {
            org.literacy = (org.literacy + 0.0025).min(1.0);
        }
        if funded_healthcare.contains(&org.lineage_id) {
            org.health = (org.health + 0.015).min(1.0);
            org.infection = (org.infection - 0.012).max(0.0);
        }
    }

    for (lid, government) in sim.governments.iter_mut() {
        government.conscription = policies.get(lid).is_some_and(|policy| policy.military_service);
        government.treasury = government
            .treasury
            .saturating_sub(spent.get(lid).copied().unwrap_or(0));
    }

    if tick.is_multiple_of(2400) {
        for (lid, amount) in spent.iter().filter(|(_, amount)| **amount > 0) {
            push_event(
                &mut sim.events,
                tick,
                "government_spending",
                lid,
                &format!(
                    "{} invested {} from its treasury in public services",
                    lid_short(lid),
                    amount
                ),
            );
        }
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

fn surplus(food: u8, water: u8, wood: u8, stone: u8, tools: &HashMap<String, u8>) -> Option<(String, u8)> {
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

fn lacks(food: u8, water: u8, wood: u8, stone: u8, tools: &HashMap<String, u8>, kind: &str) -> bool {
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
            let cap = if cross_lineage {
                BARTER_RADIUS * 0.6
            } else {
                BARTER_RADIUS
            };
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
            let cap = if cross_lineage {
                BARTER_RADIUS * 0.6
            } else {
                BARTER_RADIUS
            };
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::government::{Government, GovernmentKind, Law};

    #[test]
    fn gathered_output_is_required_for_private_income() {
        let mut sim = Simulation::new(71);
        let org = sim.organisms.iter_mut().find(|org| org.alive).unwrap();
        org.specialty = Some("farmer".into());
        org.inv_food = 0;
        assert_eq!(claim_productive_income("farmer", org, &[], 1), 0);
        org.inv_food = 1;
        assert_eq!(claim_productive_income("farmer", org, &[], 1), 0);
        assert_eq!(org.inv_food, 1, "subsistence food must not be sold");
        org.inv_food = 3;
        assert_eq!(claim_productive_income("farmer", org, &[], 1), 1);
        assert_eq!(org.inv_food, 2, "only the surplus food unit should be sold");
        assert_eq!(
            claim_productive_income("farmer", org, &[], 1),
            0,
            "the same food unit cannot pay a second wage"
        );
    }

    #[test]
    fn tax_law_withholds_only_the_enacted_share_of_new_income_and_remits_once() {
        let mut sim = Simulation::new(72);
        for org in &mut sim.organisms {
            org.alive = false;
        }
        for org in sim.organisms.iter_mut().take(5) {
            org.alive = true;
            org.lineage_id = "taxed".into();
            org.specialty = Some("farmer".into());
            org.inv_food = 3;
            org.wealth = 100;
        }

        let mut government = Government::new("taxed".into(), GovernmentKind::Republic, 1);
        government.tax_rate = 0.2;
        government.laws.push(Law {
            kind: LawKind::Taxation,
            enacted_tick: 1,
        });
        sim.governments.insert("taxed".into(), government);

        run_fiscal_cycle(&mut sim, 240);

        assert_eq!(
            sim.organisms.iter().take(5).map(|org| org.wealth).sum::<u32>(),
            504,
            "a 20% tax should withhold one of five new one-coin wages without touching savings"
        );
        assert_eq!(sim.governments["taxed"].treasury, 0);
        assert_eq!(sim.governments["taxed"].tax_receipts_pending, 1);

        run_fiscal_cycle(&mut sim, 480);

        assert_eq!(
            sim.organisms.iter().take(5).map(|org| org.wealth).sum::<u32>(),
            504
        );
        assert_eq!(sim.governments["taxed"].treasury, 1);
        assert_eq!(sim.governments["taxed"].tax_receipts_pending, 0);
        assert_eq!(remit_pending_income_taxes(&mut sim, "taxed"), 0);
        assert_eq!(sim.governments["taxed"].treasury, 1);
    }

    #[test]
    fn military_equipment_tracks_era() {
        assert_eq!(military_issue_for_era(Era::Stone), "spear");
        assert_eq!(military_issue_for_era(Era::Renaissance), "musket");
        assert_eq!(military_issue_for_era(Era::Industrial), "rifle");
    }

    #[test]
    fn military_law_turns_treasury_funds_into_equipment_and_pay() {
        let mut sim = Simulation::new(73);
        for org in &mut sim.organisms {
            org.alive = false;
        }
        let soldier = &mut sim.organisms[0];
        soldier.alive = true;
        soldier.lineage_id = "guard".into();
        soldier.specialty = Some("soldier".into());
        soldier.wealth = 0;

        let mut government = Government::new("guard".into(), GovernmentKind::Republic, 1);
        government.treasury = 10;
        government.laws.push(Law {
            kind: LawKind::MilitaryService,
            enacted_tick: 1,
        });
        sim.governments.insert("guard".into(), government);
        sim.lineage_eras.insert("guard".into(), Era::Industrial);

        run_fiscal_cycle(&mut sim, 240);

        assert!(sim.organisms[0].has_tool("rifle"));
        assert_eq!(sim.organisms[0].wealth, 3);
        assert_eq!(sim.governments["guard"].treasury, 3);
        assert!(sim.governments["guard"].conscription);
    }
}
