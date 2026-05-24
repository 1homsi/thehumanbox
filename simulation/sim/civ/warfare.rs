use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::era::Era;
use crate::sim::world_events::push_event;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CombatStyle {
    Brawl,
    Spear,
    Sword,
    Pike,
    Musket,
    Rifle,
    Modern,
}

impl CombatStyle {
    pub fn era_unlock(self) -> Era {
        match self {
            CombatStyle::Brawl => Era::PreStone,
            CombatStyle::Spear => Era::Stone,
            CombatStyle::Sword => Era::Bronze,
            CombatStyle::Pike => Era::Medieval,
            CombatStyle::Musket => Era::Renaissance,
            CombatStyle::Rifle => Era::Industrial,
            CombatStyle::Modern => Era::Modern,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            CombatStyle::Brawl => "brawl",
            CombatStyle::Spear => "spear",
            CombatStyle::Sword => "sword",
            CombatStyle::Pike => "pike",
            CombatStyle::Musket => "musket",
            CombatStyle::Rifle => "rifle",
            CombatStyle::Modern => "modern",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BattleScale {
    Skirmish,
    Raid,
    Siege,
    Battle,
    War,
}

impl BattleScale {
    pub fn min_participants(self) -> usize {
        match self {
            BattleScale::Skirmish => 2,
            BattleScale::Raid => 6,
            BattleScale::Siege => 10,
            BattleScale::Battle => 20,
            BattleScale::War => 40,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            BattleScale::Skirmish => "skirmish",
            BattleScale::Raid => "raid",
            BattleScale::Siege => "siege",
            BattleScale::Battle => "battle",
            BattleScale::War => "war",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BattleOutcome {
    AttackerVictory,
    DefenderVictory,
    Stalemate,
}

impl BattleOutcome {
    pub fn name(self) -> &'static str {
        match self {
            BattleOutcome::AttackerVictory => "attacker_victory",
            BattleOutcome::DefenderVictory => "defender_victory",
            BattleOutcome::Stalemate => "stalemate",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Battle {
    pub id: String,
    pub attackers: Vec<String>,
    pub defenders: Vec<String>,
    pub attacker_orgs: Vec<String>,
    pub defender_orgs: Vec<String>,
    pub scale: BattleScale,
    pub location: (i32, i32),
    pub started_tick: u64,
    pub ended_tick: Option<u64>,
    pub casualties_a: u32,
    pub casualties_d: u32,
    pub outcome: Option<BattleOutcome>,
    pub initial_a: u32,
    pub initial_d: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TreatyKind {
    NonAggression,
    Alliance,
    Trade,
    Defensive,
    Vassalage,
}

impl TreatyKind {
    pub fn name(self) -> &'static str {
        match self {
            TreatyKind::NonAggression => "non_aggression",
            TreatyKind::Alliance => "alliance",
            TreatyKind::Trade => "trade",
            TreatyKind::Defensive => "defensive",
            TreatyKind::Vassalage => "vassalage",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Treaty {
    pub lineage_a: String,
    pub lineage_b: String,
    pub kind: TreatyKind,
    pub signed_tick: u64,
    pub expires_tick: u64,
}

pub fn pick_combat_style(era: Era, has_gun: bool) -> CombatStyle {
    let order = [
        CombatStyle::Modern,
        CombatStyle::Rifle,
        CombatStyle::Musket,
        CombatStyle::Pike,
        CombatStyle::Sword,
        CombatStyle::Spear,
        CombatStyle::Brawl,
    ];
    for s in order.iter().copied() {
        if !has_gun && matches!(s, CombatStyle::Musket | CombatStyle::Rifle | CombatStyle::Modern) {
            continue;
        }
        if era >= s.era_unlock() {
            return s;
        }
    }
    CombatStyle::Brawl
}

pub fn damage_multiplier(style: CombatStyle) -> f32 {
    match style {
        CombatStyle::Brawl => 1.0,
        CombatStyle::Spear => 1.4,
        CombatStyle::Sword => 1.8,
        CombatStyle::Pike => 2.0,
        CombatStyle::Musket => 3.0,
        CombatStyle::Rifle => 4.5,
        CombatStyle::Modern => 6.0,
    }
}

pub fn has_active_treaty(treaties: &[Treaty], a: &str, b: &str, tick: u64) -> bool {
    treaties.iter().any(|t| {
        t.expires_tick > tick
            && ((t.lineage_a == a && t.lineage_b == b) || (t.lineage_a == b && t.lineage_b == a))
    })
}

pub fn treaty_attitude_bonus(kind: TreatyKind) -> f32 {
    match kind {
        TreatyKind::Alliance => 0.4,
        TreatyKind::Defensive => 0.25,
        TreatyKind::Trade => 0.15,
        TreatyKind::NonAggression => 0.05,
        TreatyKind::Vassalage => -0.10,
    }
}

pub fn scale_for_participants(n: usize) -> BattleScale {
    if n >= BattleScale::War.min_participants() { BattleScale::War }
    else if n >= BattleScale::Battle.min_participants() { BattleScale::Battle }
    else if n >= BattleScale::Siege.min_participants() { BattleScale::Siege }
    else if n >= BattleScale::Raid.min_participants() { BattleScale::Raid }
    else { BattleScale::Skirmish }
}

pub const MAX_BATTLE_TICKS: u64 = 200;
pub const STRENGTH_BREAK_FRAC: f32 = 0.30;
pub const RAID_CHECK_INTERVAL: u64 = 240;
pub const RAID_ATTITUDE_THRESHOLD: f32 = -0.45;
pub const RAID_MIN_POP: usize = 8;

pub fn try_spawn_raids(
    tick: u64,
    rng: &mut rand_chacha::ChaCha8Rng,
    organisms: &[crate::organism::organism::Organism],
    territory: &HashMap<String, HashSet<(i32, i32)>>,
    treaties: &[Treaty],
    active_battles: &[Battle],
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
) -> Vec<Battle> {
    use rand::Rng;
    let mut out = Vec::new();
    if tick % RAID_CHECK_INTERVAL != 0 { return out; }

    let mut pop_per_lineage: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, o) in organisms.iter().enumerate() {
        if !o.alive { continue; }
        pop_per_lineage.entry(o.lineage_id.clone()).or_default().push(i);
    }

    let mut already_engaged: HashSet<String> = HashSet::new();
    for b in active_battles {
        if b.ended_tick.is_some() { continue; }
        for l in b.attackers.iter().chain(b.defenders.iter()) {
            already_engaged.insert(l.clone());
        }
    }

    let lineage_ids: Vec<String> = pop_per_lineage.keys().cloned().collect();
    for a_lid in &lineage_ids {
        let a_pop = pop_per_lineage.get(a_lid).map(|v| v.len()).unwrap_or(0);
        if a_pop < RAID_MIN_POP { continue; }
        if already_engaged.contains(a_lid) { continue; }

        let attacker_org = pop_per_lineage[a_lid].iter()
            .find_map(|&i| if organisms[i].alive { Some(&organisms[i]) } else { None });
        let attacker_org = match attacker_org { Some(o) => o, None => continue };

        let mut candidates: Vec<(String, f32)> = attacker_org.lineage_attitudes.iter()
            .filter(|(lid, att)| {
                **att <= RAID_ATTITUDE_THRESHOLD
                    && pop_per_lineage.get(*lid).map(|v| v.len()).unwrap_or(0) >= RAID_MIN_POP
                    && !already_engaged.contains(*lid)
                    && !has_active_treaty(treaties, a_lid, lid, tick)
                    && *lid != a_lid
            })
            .map(|(lid, att)| (lid.clone(), *att))
            .collect();
        if candidates.is_empty() { continue; }

        candidates.sort_by(|x, y| x.1.partial_cmp(&y.1).unwrap_or(std::cmp::Ordering::Equal));
        let (b_lid, _) = candidates.remove(0);

        if rng.random::<f32>() > 0.35 { continue; }

        let a_centroid = lineage_centroid(organisms, a_lid);
        let b_centroid = lineage_centroid(organisms, &b_lid);
        let (ax, ay) = a_centroid;
        let (bx, by) = b_centroid;
        let loc = ((ax + bx) / 2, (ay + by) / 2);

        let n_per_side = 3 + (rng.random::<u32>() % 3) as usize;
        let attacker_orgs = pick_combatants(organisms, &pop_per_lineage, a_lid, n_per_side, loc, rng);
        let defender_orgs = pick_combatants(organisms, &pop_per_lineage, &b_lid, n_per_side, loc, rng);
        if attacker_orgs.is_empty() || defender_orgs.is_empty() { continue; }

        let id = format!("battle_{}_{}_{}", tick, a_lid, b_lid);
        let initial_a = attacker_orgs.len() as u32;
        let initial_d = defender_orgs.len() as u32;
        let battle = Battle {
            id: id.clone(),
            attackers: vec![a_lid.clone()],
            defenders: vec![b_lid.clone()],
            attacker_orgs,
            defender_orgs,
            scale: BattleScale::Raid,
            location: loc,
            started_tick: tick,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a,
            initial_d,
        };
        already_engaged.insert(a_lid.clone());
        already_engaged.insert(b_lid.clone());
        push_event(events, tick, "raid_started", a_lid, &format!("raid against {} at ({},{})", b_lid, loc.0, loc.1));
        push_event(events, tick, "battle_began", &id, &format!("{} attacks {} ({})", a_lid, b_lid, BattleScale::Raid.name()));
        out.push(battle);
    }
    out
}

fn lineage_centroid(organisms: &[crate::organism::organism::Organism], lid: &str) -> (i32, i32) {
    let mut sx = 0.0f32;
    let mut sy = 0.0f32;
    let mut n = 0.0f32;
    for o in organisms {
        if !o.alive || o.lineage_id != lid { continue; }
        sx += o.x;
        sy += o.y;
        n += 1.0;
    }
    if n < 0.5 { (0, 0) } else { ((sx / n) as i32, (sy / n) as i32) }
}

fn pick_combatants(
    organisms: &[crate::organism::organism::Organism],
    pop_per_lineage: &HashMap<String, Vec<usize>>,
    lid: &str,
    n: usize,
    near: (i32, i32),
    rng: &mut rand_chacha::ChaCha8Rng,
) -> Vec<String> {
    use rand::seq::SliceRandom;
    let mut ids: Vec<(String, f32)> = match pop_per_lineage.get(lid) {
        Some(v) => v.iter()
            .filter(|&&i| organisms[i].alive && organisms[i].age >= 12)
            .map(|&i| {
                let dx = organisms[i].x - near.0 as f32;
                let dy = organisms[i].y - near.1 as f32;
                (organisms[i].id.clone(), (dx * dx + dy * dy).sqrt())
            })
            .collect(),
        None => return Vec::new(),
    };
    ids.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    let take = n.min(ids.len()).max(0);
    let mut chosen: Vec<String> = ids.into_iter().take(take * 2).map(|(s, _)| s).collect();
    chosen.shuffle(rng);
    chosen.truncate(take);
    chosen
}

pub fn tick_battles(
    tick: u64,
    rng: &mut rand_chacha::ChaCha8Rng,
    battles: &mut Vec<Battle>,
    treaties: &mut Vec<Treaty>,
    organisms: &mut [crate::organism::organism::Organism],
    structure_tiles: &HashSet<(i32, i32)>,
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    history_combat_deaths: &mut u64,
    lineage_eras: &HashMap<String, Era>,
) {
    use rand::Rng;
    let mut signed: Vec<(String, String, TreatyKind)> = Vec::new();
    for battle in battles.iter_mut() {
        if battle.ended_tick.is_some() { continue; }

        let att_alive: Vec<usize> = battle.attacker_orgs.iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .collect();
        let def_alive: Vec<usize> = battle.defender_orgs.iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .collect();

        let near_struct = battle.location;
        let defender_wall_bonus = nearby_defensive_structure(structure_tiles, near_struct);

        let att_era = battle.attackers.first()
            .and_then(|lid| lineage_eras.get(lid).copied())
            .unwrap_or(Era::PreStone);
        let def_era = battle.defenders.first()
            .and_then(|lid| lineage_eras.get(lid).copied())
            .unwrap_or(Era::PreStone);
        let att_style = pick_combat_style(att_era, att_era >= Era::Renaissance);
        let def_style = pick_combat_style(def_era, def_era >= Era::Renaissance);

        let pairs = att_alive.len().min(def_alive.len()).max(1);
        let base_dmg = 0.06f32;

        for k in 0..att_alive.len() {
            let ai = att_alive[k];
            if k >= pairs { break; }
            let di = def_alive[k % def_alive.len()];
            let a_bonus = soldier_bonus(&organisms[ai]);
            let d_bonus = soldier_bonus(&organisms[di]);
            let a_dmg = base_dmg * damage_multiplier(att_style) * (1.0 + a_bonus) * (0.7 + rng.random::<f32>() * 0.6);
            let d_dmg = base_dmg * damage_multiplier(def_style) * (1.0 + d_bonus) * (0.7 + rng.random::<f32>() * 0.6) * if defender_wall_bonus { 1.5 } else { 1.0 };

            organisms[di].health = (organisms[di].health - a_dmg).max(0.0);
            if organisms[di].health <= 0.0 && organisms[di].alive {
                organisms[di].alive = false;
                battle.casualties_d += 1;
                *history_combat_deaths += 1;
            }
            organisms[ai].health = (organisms[ai].health - d_dmg).max(0.0);
            if organisms[ai].health <= 0.0 && organisms[ai].alive {
                organisms[ai].alive = false;
                battle.casualties_a += 1;
                *history_combat_deaths += 1;
            }
        }

        let att_now = battle.attacker_orgs.iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive).count() as f32;
        let def_now = battle.defender_orgs.iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive).count() as f32;
        let a_frac = att_now / battle.initial_a.max(1) as f32;
        let d_frac = def_now / battle.initial_d.max(1) as f32;
        let elapsed = tick.saturating_sub(battle.started_tick);

        let timed_out = elapsed >= MAX_BATTLE_TICKS;
        let a_broken = a_frac < STRENGTH_BREAK_FRAC;
        let d_broken = d_frac < STRENGTH_BREAK_FRAC;
        if a_broken || d_broken || timed_out {
            let outcome = if a_broken && d_broken { BattleOutcome::Stalemate }
                else if d_broken { BattleOutcome::AttackerVictory }
                else if a_broken { BattleOutcome::DefenderVictory }
                else if a_frac > d_frac { BattleOutcome::AttackerVictory }
                else if d_frac > a_frac { BattleOutcome::DefenderVictory }
                else { BattleOutcome::Stalemate };
            battle.ended_tick = Some(tick);
            battle.outcome = Some(outcome);

            let a_lid = battle.attackers.first().cloned().unwrap_or_default();
            let b_lid = battle.defenders.first().cloned().unwrap_or_default();
            push_event(events, tick, "battle_ended", &battle.id,
                &format!("{} vs {}: {} (cas {}/{})", a_lid, b_lid, outcome.name(),
                    battle.casualties_a, battle.casualties_d));

            let loser = match outcome {
                BattleOutcome::AttackerVictory => Some((b_lid.clone(), a_lid.clone())),
                BattleOutcome::DefenderVictory => Some((a_lid.clone(), b_lid.clone())),
                BattleOutcome::Stalemate => None,
            };
            if let Some((loser_lid, winner_lid)) = loser {
                let dominance = if outcome == BattleOutcome::AttackerVictory { a_frac } else { d_frac };
                let kind = if dominance > 0.75 && rng.random::<f32>() < 0.35 {
                    TreatyKind::Vassalage
                } else if rng.random::<f32>() < 0.5 {
                    TreatyKind::NonAggression
                } else {
                    TreatyKind::Trade
                };
                signed.push((loser_lid, winner_lid, kind));
            }
        }
    }

    for (a, b, kind) in signed {
        let expires = tick + 2000 + (rng.random::<u64>() % 4000);
        let treaty = Treaty {
            lineage_a: a.clone(),
            lineage_b: b.clone(),
            kind,
            signed_tick: tick,
            expires_tick: expires,
        };
        let bonus = treaty_attitude_bonus(kind);
        for o in organisms.iter_mut() {
            if !o.alive { continue; }
            if o.lineage_id == a { o.update_attitude(&b, bonus); }
            else if o.lineage_id == b { o.update_attitude(&a, bonus); }
        }
        push_event(events, tick, "treaty_signed", &a,
            &format!("{} signs {} with {}", a, kind.name(), b));
        if matches!(kind, TreatyKind::Vassalage) {
            push_event(events, tick, "vassal_state", &a,
                &format!("{} becomes vassal of {}", a, b));
        }
        treaties.push(treaty);
    }

    treaties.retain(|t| t.expires_tick > tick);

    let mut active_finished: Vec<usize> = Vec::new();
    for (i, b) in battles.iter().enumerate() {
        if b.ended_tick.is_some() { active_finished.push(i); }
    }
    if battles.len() > 50 {
        let to_remove = battles.len() - 50;
        let mut removed = 0;
        let mut i = 0;
        while i < battles.len() && removed < to_remove {
            if battles[i].ended_tick.is_some() {
                battles.remove(i);
                removed += 1;
            } else {
                i += 1;
            }
        }
    }
    let _ = active_finished;
}

fn organism_index(organisms: &[crate::organism::organism::Organism], id: &str) -> Option<usize> {
    organisms.iter().position(|o| o.id == id)
}

fn soldier_bonus(_o: &crate::organism::organism::Organism) -> f32 {
    0.0
}

fn nearby_defensive_structure(structure_tiles: &HashSet<(i32, i32)>, loc: (i32, i32)) -> bool {
    for dx in -3..=3 {
        for dy in -3..=3 {
            if structure_tiles.contains(&(loc.0 + dx, loc.1 + dy)) { return true; }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combat_style_progression() {
        assert_eq!(pick_combat_style(Era::PreStone, false), CombatStyle::Brawl);
        assert_eq!(pick_combat_style(Era::Stone, false), CombatStyle::Spear);
        assert_eq!(pick_combat_style(Era::Bronze, false), CombatStyle::Sword);
        assert_eq!(pick_combat_style(Era::Medieval, false), CombatStyle::Pike);
        assert_eq!(pick_combat_style(Era::Renaissance, true), CombatStyle::Musket);
        assert_eq!(pick_combat_style(Era::Industrial, true), CombatStyle::Rifle);
        assert_eq!(pick_combat_style(Era::Modern, true), CombatStyle::Modern);
    }

    #[test]
    fn damage_multipliers_monotonic() {
        assert!(damage_multiplier(CombatStyle::Brawl) < damage_multiplier(CombatStyle::Spear));
        assert!(damage_multiplier(CombatStyle::Spear) < damage_multiplier(CombatStyle::Sword));
        assert!(damage_multiplier(CombatStyle::Sword) < damage_multiplier(CombatStyle::Pike));
        assert!(damage_multiplier(CombatStyle::Pike) < damage_multiplier(CombatStyle::Musket));
        assert!(damage_multiplier(CombatStyle::Musket) < damage_multiplier(CombatStyle::Rifle));
        assert!(damage_multiplier(CombatStyle::Rifle) < damage_multiplier(CombatStyle::Modern));
    }

    #[test]
    fn scale_thresholds() {
        assert!(matches!(scale_for_participants(2), BattleScale::Skirmish));
        assert!(matches!(scale_for_participants(6), BattleScale::Raid));
        assert!(matches!(scale_for_participants(10), BattleScale::Siege));
        assert!(matches!(scale_for_participants(20), BattleScale::Battle));
        assert!(matches!(scale_for_participants(40), BattleScale::War));
    }
}
