use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

use super::era::Era;
use super::government::{Government, LawKind};
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;

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

/// A temporary, lineage-owned fighting position created in the field. This is
/// separate from permanent buildings so digging in can matter without
/// pretending a complete wall was constructed instantly.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldFortification {
    pub x: i32,
    pub y: i32,
    pub lineage_id: String,
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

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
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
    if a.is_empty() || b.is_empty() || a == b {
        return false;
    }
    treaties.iter().any(|t| {
        t.signed_tick <= tick
            && t.expires_tick > tick
            && ((t.lineage_a == a && t.lineage_b == b) || (t.lineage_a == b && t.lineage_b == a))
    })
}

pub fn has_active_battle_between(battles: &[Battle], lineage_a: &str, lineage_b: &str) -> bool {
    if lineage_a.is_empty() || lineage_b.is_empty() || lineage_a == lineage_b {
        return false;
    }
    battles.iter().any(|battle| {
        battle.ended_tick.is_none()
            && ((battle.attackers.iter().any(|lineage| lineage == lineage_a)
                && battle.defenders.iter().any(|lineage| lineage == lineage_b))
                || (battle.attackers.iter().any(|lineage| lineage == lineage_b)
                    && battle.defenders.iter().any(|lineage| lineage == lineage_a)))
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

fn treaty_matches_lineages(treaty: &Treaty, lineage_a: &str, lineage_b: &str) -> bool {
    (treaty.lineage_a == lineage_a && treaty.lineage_b == lineage_b)
        || (treaty.lineage_a == lineage_b && treaty.lineage_b == lineage_a)
}

fn treaty_pair(treaty: &Treaty) -> (&str, &str) {
    if treaty.lineage_a <= treaty.lineage_b {
        (&treaty.lineage_a, &treaty.lineage_b)
    } else {
        (&treaty.lineage_b, &treaty.lineage_a)
    }
}

fn treaty_kind_priority(kind: TreatyKind) -> u8 {
    match kind {
        TreatyKind::NonAggression => 1,
        TreatyKind::Trade => 2,
        TreatyKind::Defensive => 3,
        TreatyKind::Alliance => 4,
        TreatyKind::Vassalage => 5,
    }
}

/// Remove inactive or malformed agreements and deterministically retain one
/// current agreement per unordered lineage pair. The most recently signed
/// record wins; expiry, kind priority, and stored orientation break malformed
/// import ties without changing the direction of vassalage records.
///
/// Returns the number of removed records so direct autonomous, post-battle,
/// and load callers can report or test repairs without reimplementing them.
pub fn consolidate_treaties(treaties: &mut Vec<Treaty>, tick: u64) -> usize {
    let before = treaties.len();
    treaties.retain(|treaty| {
        !treaty.lineage_a.is_empty()
            && !treaty.lineage_b.is_empty()
            && treaty.lineage_a != treaty.lineage_b
            && treaty.signed_tick <= tick
            && treaty.signed_tick < treaty.expires_tick
            && treaty.expires_tick > tick
    });
    treaties.sort_by(|left, right| {
        let left_pair = treaty_pair(left);
        let right_pair = treaty_pair(right);
        left_pair
            .0
            .cmp(right_pair.0)
            .then_with(|| left_pair.1.cmp(right_pair.1))
            .then_with(|| right.signed_tick.cmp(&left.signed_tick))
            .then_with(|| right.expires_tick.cmp(&left.expires_tick))
            .then_with(|| treaty_kind_priority(right.kind).cmp(&treaty_kind_priority(left.kind)))
            .then_with(|| left.lineage_a.cmp(&right.lineage_a))
            .then_with(|| left.lineage_b.cmp(&right.lineage_b))
    });

    let mut consolidated: Vec<Treaty> = Vec::with_capacity(treaties.len());
    for treaty in treaties.drain(..) {
        if consolidated
            .last()
            .is_some_and(|previous| treaty_matches_lineages(previous, &treaty.lineage_a, &treaty.lineage_b))
        {
            continue;
        }
        consolidated.push(treaty);
    }
    *treaties = consolidated;
    before.saturating_sub(treaties.len())
}

fn update_reciprocal_lineage_attitudes(
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    delta: f32,
) {
    for organism in organisms.iter_mut().filter(|organism| organism.alive) {
        if organism.lineage_id == lineage_a {
            organism.update_attitude(lineage_b, delta);
        } else if organism.lineage_id == lineage_b {
            organism.update_attitude(lineage_a, delta);
        }
    }
}

fn cap_reciprocal_lineage_attitudes(
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    maximum: f32,
) {
    for organism in organisms.iter_mut().filter(|organism| organism.alive) {
        let other = if organism.lineage_id == lineage_a {
            lineage_b
        } else if organism.lineage_id == lineage_b {
            lineage_a
        } else {
            continue;
        };
        let current = organism.attitude_toward(other);
        if current > maximum {
            organism.update_attitude(other, maximum - current);
        }
    }
}

/// Create or renew the one active treaty between a pair of lineages.
///
/// The simulation treats any active treaty as a conflict gate, so duplicate
/// records could accidentally extend or stack diplomacy in surprising ways.
/// Consolidating the pair here gives actions and autonomous diplomacy the same
/// stable invariant: at most one active treaty per lineage pair.
pub fn establish_treaty(
    treaties: &mut Vec<Treaty>,
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    kind: TreatyKind,
    signed_tick: u64,
    expires_tick: u64,
) -> bool {
    if lineage_a.is_empty() || lineage_b.is_empty() || lineage_a == lineage_b || expires_tick <= signed_tick {
        return false;
    }

    let active_same_kind_expiry = treaties
        .iter()
        .filter(|treaty| {
            treaty_matches_lineages(treaty, lineage_a, lineage_b)
                && treaty.kind == kind
                && treaty.signed_tick <= signed_tick
                && treaty.expires_tick > signed_tick
        })
        .map(|treaty| treaty.expires_tick)
        .max();
    consolidate_treaties(treaties, signed_tick);
    treaties.retain(|treaty| !treaty_matches_lineages(treaty, lineage_a, lineage_b));
    treaties.push(Treaty {
        lineage_a: lineage_a.to_string(),
        lineage_b: lineage_b.to_string(),
        kind,
        signed_tick,
        expires_tick: active_same_kind_expiry
            .map(|existing_expiry| existing_expiry.max(expires_tick))
            .unwrap_or(expires_tick),
    });
    consolidate_treaties(treaties, signed_tick);
    if active_same_kind_expiry.is_none() {
        update_reciprocal_lineage_attitudes(organisms, lineage_a, lineage_b, treaty_attitude_bonus(kind));
    }
    true
}

/// Break active agreements between two lineages and make the declaration of
/// war known to both populations rather than only to the declaring actor.
pub fn declare_hostilities(
    treaties: &mut Vec<Treaty>,
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    tick: u64,
    attitude_penalty: f32,
) -> usize {
    if lineage_a.is_empty() || lineage_b.is_empty() || lineage_a == lineage_b {
        return 0;
    }

    consolidate_treaties(treaties, tick);
    let before = treaties.len();
    treaties.retain(|treaty| !treaty_matches_lineages(treaty, lineage_a, lineage_b));
    let invalidated = before - treaties.len();
    cap_reciprocal_lineage_attitudes(organisms, lineage_a, lineage_b, -attitude_penalty.abs());
    invalidated
}

pub fn scale_for_participants(n: usize) -> BattleScale {
    if n >= BattleScale::War.min_participants() {
        BattleScale::War
    } else if n >= BattleScale::Battle.min_participants() {
        BattleScale::Battle
    } else if n >= BattleScale::Siege.min_participants() {
        BattleScale::Siege
    } else if n >= BattleScale::Raid.min_participants() {
        BattleScale::Raid
    } else {
        BattleScale::Skirmish
    }
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
    _territory: &HashMap<String, HashSet<(i32, i32)>>,
    treaties: &[Treaty],
    active_battles: &[Battle],
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
) -> Vec<Battle> {
    use rand::RngExt;
    let mut out = Vec::new();
    if !tick.is_multiple_of(RAID_CHECK_INTERVAL) {
        return out;
    }

    let mut pop_per_lineage: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, o) in organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        pop_per_lineage.entry(o.lineage_id.clone()).or_default().push(i);
    }

    let mut already_engaged: HashSet<String> = HashSet::new();
    for b in active_battles {
        if b.ended_tick.is_some() {
            continue;
        }
        for l in b.attackers.iter().chain(b.defenders.iter()) {
            already_engaged.insert(l.clone());
        }
    }

    let lineage_ids: Vec<String> = pop_per_lineage.keys().cloned().collect();
    for a_lid in &lineage_ids {
        let a_pop = pop_per_lineage.get(a_lid).map(|v| v.len()).unwrap_or(0);
        if a_pop < RAID_MIN_POP {
            continue;
        }
        if already_engaged.contains(a_lid) {
            continue;
        }

        let attacker_org = pop_per_lineage[a_lid].iter().find_map(|&i| {
            if organisms[i].alive {
                Some(&organisms[i])
            } else {
                None
            }
        });
        let attacker_org = match attacker_org {
            Some(o) => o,
            None => continue,
        };

        let mut candidates: Vec<(String, f32)> = attacker_org
            .lineage_attitudes
            .iter()
            .filter(|(lid, att)| {
                **att <= RAID_ATTITUDE_THRESHOLD
                    && pop_per_lineage.get(*lid).map(|v| v.len()).unwrap_or(0) >= RAID_MIN_POP
                    && !already_engaged.contains(*lid)
                    && !has_active_treaty(treaties, a_lid, lid, tick)
                    && *lid != a_lid
            })
            .map(|(lid, att)| (lid.clone(), *att))
            .collect();
        if candidates.is_empty() {
            continue;
        }

        candidates.sort_by(|x, y| x.1.partial_cmp(&y.1).unwrap_or(std::cmp::Ordering::Equal));
        let (b_lid, _) = candidates.remove(0);

        if rng.random::<f32>() > 0.35 {
            continue;
        }

        let a_centroid = lineage_centroid(organisms, a_lid);
        let b_centroid = lineage_centroid(organisms, &b_lid);
        let (ax, ay) = a_centroid;
        let (bx, by) = b_centroid;
        let loc = ((ax + bx) / 2, (ay + by) / 2);

        let n_per_side = 3 + (rng.random::<u32>() % 3) as usize;
        let attacker_orgs = pick_combatants(organisms, &pop_per_lineage, a_lid, n_per_side, loc, rng);
        let defender_orgs = pick_combatants(organisms, &pop_per_lineage, &b_lid, n_per_side, loc, rng);
        if attacker_orgs.is_empty() || defender_orgs.is_empty() {
            continue;
        }

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
        push_event(
            events,
            tick,
            "raid_started",
            a_lid,
            &format!("raid against {} at ({},{})", b_lid, loc.0, loc.1),
        );
        push_event(
            events,
            tick,
            "battle_began",
            &id,
            &format!("{} attacks {} ({})", a_lid, b_lid, BattleScale::Raid.name()),
        );
        out.push(battle);
    }
    out
}

pub const BORDER_WAR_CHECK_INTERVAL: u64 = 480;
pub const BORDER_WAR_ATTITUDE_THRESHOLD: f32 = -0.20;
pub const BORDER_WAR_MIN_POP: usize = 18;
pub const BORDER_WAR_BORDER_OVERLAP_MIN: usize = 6;

pub fn try_spawn_border_wars(
    tick: u64,
    rng: &mut rand_chacha::ChaCha8Rng,
    organisms: &[crate::organism::organism::Organism],
    territory: &HashMap<String, HashSet<(i32, i32)>>,
    treaties: &[Treaty],
    active_battles: &[Battle],
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
) -> Vec<Battle> {
    use rand::RngExt;
    let mut out = Vec::new();
    if tick == 0 || !tick.is_multiple_of(BORDER_WAR_CHECK_INTERVAL) {
        return out;
    }

    let mut pop_per_lineage: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, o) in organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        pop_per_lineage.entry(o.lineage_id.clone()).or_default().push(i);
    }

    let mut already_engaged: HashSet<String> = HashSet::new();
    for b in active_battles {
        if b.ended_tick.is_some() {
            continue;
        }
        for l in b.attackers.iter().chain(b.defenders.iter()) {
            already_engaged.insert(l.clone());
        }
    }

    let lineages: Vec<&String> = pop_per_lineage.keys().collect();
    for i in 0..lineages.len() {
        let a_lid = lineages[i];
        let a_pop = pop_per_lineage.get(a_lid).map(|v| v.len()).unwrap_or(0);
        if a_pop < BORDER_WAR_MIN_POP || already_engaged.contains(a_lid) {
            continue;
        }
        let Some(a_terr) = territory.get(a_lid) else {
            continue;
        };
        if a_terr.is_empty() {
            continue;
        }
        let attacker_sample = pop_per_lineage[a_lid].iter().find_map(|&oi| {
            if organisms[oi].alive {
                Some(&organisms[oi])
            } else {
                None
            }
        });
        let Some(attacker_sample) = attacker_sample else {
            continue;
        };

        for j in (i + 1)..lineages.len() {
            let b_lid = lineages[j];
            if already_engaged.contains(b_lid) {
                continue;
            }
            if has_active_treaty(treaties, a_lid, b_lid, tick) {
                continue;
            }
            let b_pop = pop_per_lineage.get(b_lid).map(|v| v.len()).unwrap_or(0);
            if b_pop < BORDER_WAR_MIN_POP {
                continue;
            }
            let Some(b_terr) = territory.get(b_lid) else {
                continue;
            };
            if b_terr.is_empty() {
                continue;
            }
            let att_ab = attacker_sample
                .lineage_attitudes
                .get(b_lid)
                .copied()
                .unwrap_or(0.0);
            if att_ab > BORDER_WAR_ATTITUDE_THRESHOLD {
                continue;
            }
            let mut overlap = 0usize;
            for (x, y) in a_terr.iter() {
                for (dx, dy) in [(-1i32, 0), (1, 0), (0, -1), (0, 1), (0, 0)] {
                    if b_terr.contains(&(x + dx, y + dy)) {
                        overlap += 1;
                        break;
                    }
                }
                if overlap >= BORDER_WAR_BORDER_OVERLAP_MIN {
                    break;
                }
            }
            if overlap < BORDER_WAR_BORDER_OVERLAP_MIN {
                continue;
            }
            if rng.random::<f32>() > 0.55 {
                continue;
            }
            let (ax, ay) = lineage_centroid(organisms, a_lid);
            let (bx, by) = lineage_centroid(organisms, b_lid);
            let loc = ((ax + bx) / 2, (ay + by) / 2);
            let n_per_side = (8 + (rng.random::<u32>() % 6) as usize)
                .min(a_pop / 2)
                .min(b_pop / 2);
            let attacker_orgs = pick_combatants(organisms, &pop_per_lineage, a_lid, n_per_side, loc, rng);
            let defender_orgs = pick_combatants(organisms, &pop_per_lineage, b_lid, n_per_side, loc, rng);
            if attacker_orgs.is_empty() || defender_orgs.is_empty() {
                continue;
            }
            let total = attacker_orgs.len() + defender_orgs.len();
            let scale = scale_for_participants(total);
            let id = format!("border_war_{}_{}_{}", tick, a_lid, b_lid);
            let initial_a = attacker_orgs.len() as u32;
            let initial_d = defender_orgs.len() as u32;
            out.push(Battle {
                id: id.clone(),
                attackers: vec![a_lid.clone()],
                defenders: vec![b_lid.clone()],
                attacker_orgs,
                defender_orgs,
                scale,
                location: loc,
                started_tick: tick,
                ended_tick: None,
                casualties_a: 0,
                casualties_d: 0,
                outcome: None,
                initial_a,
                initial_d,
            });
            already_engaged.insert(a_lid.clone());
            already_engaged.insert(b_lid.clone());
            push_event(
                events,
                tick,
                "war_declared",
                a_lid,
                &format!(
                    "{} declared {} on {} over the border at ({},{})",
                    a_lid,
                    scale.name(),
                    b_lid,
                    loc.0,
                    loc.1
                ),
            );
            push_event(
                events,
                tick,
                "battle_began",
                &id,
                &format!(
                    "{} attacks {} ({}, {} v {})",
                    a_lid,
                    b_lid,
                    scale.name(),
                    initial_a,
                    initial_d
                ),
            );
            break;
        }
    }
    out
}

fn lineage_centroid(organisms: &[crate::organism::organism::Organism], lid: &str) -> (i32, i32) {
    let mut sx = 0.0f32;
    let mut sy = 0.0f32;
    let mut n = 0.0f32;
    for o in organisms {
        if !o.alive || o.lineage_id != lid {
            continue;
        }
        sx += o.x;
        sy += o.y;
        n += 1.0;
    }
    if n < 0.5 {
        (0, 0)
    } else {
        ((sx / n) as i32, (sy / n) as i32)
    }
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
        Some(v) => v
            .iter()
            .filter(|&&i| organisms[i].alive && organisms[i].age_stage().can_combat())
            .map(|&i| {
                let dx = organisms[i].x - near.0 as f32;
                let dy = organisms[i].y - near.1 as f32;
                (organisms[i].id.clone(), (dx * dx + dy * dy).sqrt())
            })
            .collect(),
        None => return Vec::new(),
    };
    ids.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    let take = n.min(ids.len());
    let mut chosen: Vec<String> = ids.into_iter().take(take * 2).map(|(s, _)| s).collect();
    chosen.shuffle(rng);
    chosen.truncate(take);
    chosen
}

pub struct BattleInstitutions<'a> {
    pub lineage_eras: &'a HashMap<String, Era>,
    pub governments: &'a HashMap<String, Government>,
    pub buildings: &'a [Building],
    pub field_fortifications: &'a [FieldFortification],
    pub grid: &'a WorldGrid,
}

pub fn tick_battles(
    tick: u64,
    rng: &mut rand_chacha::ChaCha8Rng,
    battles: &mut Vec<Battle>,
    treaties: &mut Vec<Treaty>,
    organisms: &mut [crate::organism::organism::Organism],
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
    history_combat_deaths: &mut u64,
    institutions: BattleInstitutions<'_>,
) {
    use rand::RngExt;
    let mut signed: Vec<(String, String, TreatyKind)> = Vec::new();
    for battle in battles.iter_mut() {
        if battle.ended_tick.is_some() {
            continue;
        }

        let att_alive: Vec<usize> = battle
            .attacker_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .collect();
        let def_alive: Vec<usize> = battle
            .defender_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .collect();

        let defender_wall_bonus =
            nearby_operational_defense(institutions.buildings, &battle.defenders, battle.location)
                || nearby_field_fortification(
                    institutions.field_fortifications,
                    &battle.defenders,
                    battle.location,
                    institutions.grid,
                );

        let att_era = battle
            .attackers
            .first()
            .and_then(|lid| institutions.lineage_eras.get(lid).copied())
            .unwrap_or(Era::PreStone);
        let def_era = battle
            .defenders
            .first()
            .and_then(|lid| institutions.lineage_eras.get(lid).copied())
            .unwrap_or(Era::PreStone);
        let att_policy_bonus = battle
            .attackers
            .first()
            .map(|lid| military_policy_bonus(institutions.governments.get(lid)))
            .unwrap_or(0.0);
        let def_policy_bonus = battle
            .defenders
            .first()
            .map(|lid| military_policy_bonus(institutions.governments.get(lid)))
            .unwrap_or(0.0);

        let base_dmg = 0.06f32;

        // A combatant can die to fire, illness, or another system between
        // battle ticks. Resolve the empty side below instead of indexing an
        // empty force while trying to manufacture one combat pair.
        let pairs = att_alive.len().min(def_alive.len());
        for k in 0..pairs {
            let ai = att_alive[k];
            let di = def_alive[k % def_alive.len()];
            let att_style = combat_style_for(&organisms[ai], att_era);
            let def_style = combat_style_for(&organisms[di], def_era);
            let a_bonus = soldier_bonus(&organisms[ai]) + att_policy_bonus;
            let d_bonus = soldier_bonus(&organisms[di]) + def_policy_bonus;
            let a_dmg =
                base_dmg * damage_multiplier(att_style) * (1.0 + a_bonus) * (0.7 + rng.random::<f32>() * 0.6);
            let d_dmg = base_dmg
                * damage_multiplier(def_style)
                * (1.0 + d_bonus)
                * (0.7 + rng.random::<f32>() * 0.6)
                * if defender_wall_bonus { 1.5 } else { 1.0 };

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

        let att_now = battle
            .attacker_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .count() as f32;
        let def_now = battle
            .defender_orgs
            .iter()
            .filter_map(|id| organism_index(organisms, id))
            .filter(|&i| organisms[i].alive)
            .count() as f32;
        let a_frac = att_now / battle.initial_a.max(1) as f32;
        let d_frac = def_now / battle.initial_d.max(1) as f32;
        let elapsed = tick.saturating_sub(battle.started_tick);

        let timed_out = elapsed >= MAX_BATTLE_TICKS;
        let a_broken = a_frac < STRENGTH_BREAK_FRAC;
        let d_broken = d_frac < STRENGTH_BREAK_FRAC;
        if a_broken || d_broken || timed_out {
            let outcome = if a_broken && d_broken {
                BattleOutcome::Stalemate
            } else if d_broken {
                BattleOutcome::AttackerVictory
            } else if a_broken {
                BattleOutcome::DefenderVictory
            } else if a_frac > d_frac {
                BattleOutcome::AttackerVictory
            } else if d_frac > a_frac {
                BattleOutcome::DefenderVictory
            } else {
                BattleOutcome::Stalemate
            };
            battle.ended_tick = Some(tick);
            battle.outcome = Some(outcome);

            let a_lid = battle.attackers.first().cloned().unwrap_or_default();
            let b_lid = battle.defenders.first().cloned().unwrap_or_default();
            push_event(
                events,
                tick,
                "battle_ended",
                &battle.id,
                &format!(
                    "{} vs {}: {} (cas {}/{})",
                    a_lid,
                    b_lid,
                    outcome.name(),
                    battle.casualties_a,
                    battle.casualties_d
                ),
            );

            let loser = match outcome {
                BattleOutcome::AttackerVictory => Some((b_lid.clone(), a_lid.clone())),
                BattleOutcome::DefenderVictory => Some((a_lid.clone(), b_lid.clone())),
                BattleOutcome::Stalemate => None,
            };
            if let Some((loser_lid, winner_lid)) = loser {
                let dominance = if outcome == BattleOutcome::AttackerVictory {
                    a_frac
                } else {
                    d_frac
                };
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
        let expires = tick.saturating_add(2000 + (rng.random::<u64>() % 4000));
        if !establish_treaty(treaties, organisms, &a, &b, kind, tick, expires) {
            continue;
        }
        push_event(
            events,
            tick,
            "treaty_signed",
            &a,
            &format!("{} signs {} with {}", a, kind.name(), b),
        );
        if matches!(kind, TreatyKind::Vassalage) {
            push_event(
                events,
                tick,
                "vassal_state",
                &a,
                &format!("{} becomes vassal of {}", a, b),
            );
        }
    }

    consolidate_treaties(treaties, tick);

    let mut active_finished: Vec<usize> = Vec::new();
    for (i, b) in battles.iter().enumerate() {
        if b.ended_tick.is_some() {
            active_finished.push(i);
        }
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

fn combat_style_for(org: &crate::organism::organism::Organism, era: Era) -> CombatStyle {
    if org.has_tool("rifle") {
        if era >= Era::Modern {
            CombatStyle::Modern
        } else {
            CombatStyle::Rifle
        }
    } else if org.has_tool("musket") {
        CombatStyle::Musket
    } else if org.has_tool("sword") || org.has_tool("iron_sword") || org.has_tool("bow") {
        CombatStyle::Sword
    } else if org.has_tool("spear") || org.has_tool("bronze_spear") || org.has_tool("stone_spear") {
        CombatStyle::Spear
    } else {
        CombatStyle::Brawl
    }
}

fn military_policy_bonus(government: Option<&Government>) -> f32 {
    let Some(government) = government else {
        return 0.0;
    };
    if !government.has_law(LawKind::MilitaryService) {
        return 0.0;
    }
    // An enacted service law improves coordination. A funded treasury adds a
    // smaller logistics bonus, capped so equipment and individual skill still
    // decide battles.
    0.08 + (government.treasury as f32 / 500.0).min(0.12)
}

fn soldier_bonus(o: &crate::organism::organism::Organism) -> f32 {
    let training: f32 = match o.specialty.as_deref() {
        Some("officer") => 0.38,
        Some("soldier") => 0.24,
        _ => 0.0,
    };
    let equipment: f32 = if o.has_tool("rifle") {
        0.34
    } else if o.has_tool("musket") {
        0.25
    } else if o.has_tool("sword") || o.has_tool("bow") {
        0.16
    } else if o.has_tool("spear") {
        0.10
    } else {
        0.0
    };
    let readiness = (0.55 + 0.25 * o.energy + 0.20 * o.health).clamp(0.4, 1.0);
    (training + equipment) * readiness
}

fn is_defensive_building(kind: BuildingKind) -> bool {
    matches!(
        kind,
        BuildingKind::Wall
            | BuildingKind::Tower
            | BuildingKind::Watchtower
            | BuildingKind::Barracks
            | BuildingKind::Castle
            | BuildingKind::Gate
            | BuildingKind::Fence
    )
}

fn nearby_operational_defense(buildings: &[Building], defenders: &[String], loc: (i32, i32)) -> bool {
    buildings.iter().any(|building| {
        if !building.is_operational() || !is_defensive_building(building.kind) {
            return false;
        }
        let Some(owner) = building.owner_lineage.as_deref() else {
            return false;
        };
        if !defenders.iter().any(|lineage| lineage == owner) {
            return false;
        }
        let (width, height) = building.footprint();
        let nearest_x = loc.0.clamp(building.x, building.x + i32::from(width) - 1);
        let nearest_y = loc.1.clamp(building.y, building.y + i32::from(height) - 1);
        (loc.0 - nearest_x).abs() <= 3 && (loc.1 - nearest_y).abs() <= 3
    })
}

fn nearby_field_fortification(
    fortifications: &[FieldFortification],
    defenders: &[String],
    loc: (i32, i32),
    grid: &WorldGrid,
) -> bool {
    fortifications.iter().any(|fortification| {
        grid.structure_at(fortification.x, fortification.y) > 0.0
            && defenders
                .iter()
                .any(|lineage| lineage == &fortification.lineage_id)
            && (loc.0 - fortification.x).abs() <= 3
            && (loc.1 - fortification.y).abs() <= 3
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::civ::government::{GovernmentKind, Law};
    use crate::sim::simulation::Simulation;
    use rand::SeedableRng;

    fn treaty(a: &str, b: &str, kind: TreatyKind, signed_tick: u64, expires_tick: u64) -> Treaty {
        Treaty {
            lineage_a: a.to_string(),
            lineage_b: b.to_string(),
            kind,
            signed_tick,
            expires_tick,
        }
    }

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

    #[test]
    fn same_kind_renewal_extends_without_stacking_goodwill() {
        let mut sim = Simulation::new(85);
        sim.organisms.truncate(4);
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            organism.alive = true;
            organism.lineage_id = if index < 2 { "river".into() } else { "hill".into() };
        }

        assert!(establish_treaty(
            &mut sim.treaties,
            &mut sim.organisms,
            "river",
            "hill",
            TreatyKind::NonAggression,
            10,
            100,
        ));
        let attitudes_after_signing: Vec<f32> = sim
            .organisms
            .iter()
            .map(|organism| {
                let other = if organism.lineage_id == "river" {
                    "hill"
                } else {
                    "river"
                };
                organism.attitude_toward(other)
            })
            .collect();

        assert!(establish_treaty(
            &mut sim.treaties,
            &mut sim.organisms,
            "hill",
            "river",
            TreatyKind::NonAggression,
            20,
            200,
        ));

        assert_eq!(sim.treaties.len(), 1);
        assert_eq!(sim.treaties[0].signed_tick, 20);
        assert_eq!(sim.treaties[0].expires_tick, 200);
        let attitudes_after_renewal: Vec<f32> = sim
            .organisms
            .iter()
            .map(|organism| {
                let other = if organism.lineage_id == "river" {
                    "hill"
                } else {
                    "river"
                };
                organism.attitude_toward(other)
            })
            .collect();
        assert_eq!(attitudes_after_renewal, attitudes_after_signing);

        assert!(establish_treaty(
            &mut sim.treaties,
            &mut sim.organisms,
            "river",
            "hill",
            TreatyKind::NonAggression,
            201,
            300,
        ));
        assert!(sim.organisms[0].attitude_toward("hill") > attitudes_after_renewal[0]);
    }

    #[test]
    fn consolidation_deterministically_removes_expired_invalid_and_duplicate_records() {
        let records = vec![
            treaty("a", "b", TreatyKind::NonAggression, 1, 10),
            treaty("b", "a", TreatyKind::NonAggression, 20, 100),
            treaty("a", "b", TreatyKind::Trade, 30, 90),
            treaty("same", "same", TreatyKind::Alliance, 10, 100),
            treaty("future", "other", TreatyKind::Trade, 100, 200),
            treaty("vassal", "ruler", TreatyKind::Vassalage, 40, 140),
        ];
        let mut forward = records.clone();
        let mut reverse = records;
        reverse.reverse();

        assert_eq!(consolidate_treaties(&mut forward, 50), 4);
        assert_eq!(consolidate_treaties(&mut reverse, 50), 4);

        assert_eq!(forward, reverse, "input order must not change consolidation");
        assert_eq!(forward.len(), 2);
        let pair = forward
            .iter()
            .find(|record| treaty_matches_lineages(record, "a", "b"))
            .unwrap();
        assert_eq!(pair.kind, TreatyKind::Trade);
        assert_eq!(pair.signed_tick, 30);
        let vassalage = forward
            .iter()
            .find(|record| record.kind == TreatyKind::Vassalage)
            .unwrap();
        assert_eq!(vassalage.lineage_a, "vassal", "direction must be preserved");
        assert_eq!(vassalage.lineage_b, "ruler");
    }

    #[test]
    fn opposing_lineages_in_an_unfinished_battle_cannot_negotiate() {
        let mut battle = Battle {
            id: "active-conflict".into(),
            attackers: vec!["river".into()],
            defenders: vec!["hill".into()],
            attacker_orgs: Vec::new(),
            defender_orgs: Vec::new(),
            scale: BattleScale::Skirmish,
            location: (20, 20),
            started_tick: 1,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 1,
            initial_d: 1,
        };

        assert!(has_active_battle_between(
            std::slice::from_ref(&battle),
            "river",
            "hill"
        ));
        assert!(has_active_battle_between(
            std::slice::from_ref(&battle),
            "hill",
            "river"
        ));
        battle.ended_tick = Some(20);
        assert!(!has_active_battle_between(&[battle], "river", "hill"));
    }

    #[test]
    fn combatant_selection_uses_normalized_age_stages() {
        let mut sim = Simulation::new(84);
        let ages = [
            ("infant", 50),
            ("child", 200),
            ("teen", 300),
            ("adult", 500),
            ("elder", 800),
        ];
        let indices: Vec<_> = sim
            .organisms
            .iter()
            .enumerate()
            .filter_map(|(index, org)| org.alive.then_some(index))
            .take(ages.len())
            .collect();
        assert_eq!(indices.len(), ages.len());
        for (position, (index, (id, age))) in indices.iter().copied().zip(ages).enumerate() {
            let org = &mut sim.organisms[index];
            org.id = id.into();
            org.lineage_id = "guard".into();
            org.age = age;
            org.max_age = 1_000;
            org.x = position as f32;
            org.y = 0.0;
        }
        let populations = HashMap::from([("guard".to_string(), indices)]);
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(84);

        let selected = pick_combatants(
            &sim.organisms,
            &populations,
            "guard",
            ages.len(),
            (0, 0),
            &mut rng,
        );

        assert_eq!(selected.len(), 3);
        assert!(!selected.iter().any(|id| id == "infant" || id == "child"));
        assert!(selected.iter().any(|id| id == "teen"));
        assert!(selected.iter().any(|id| id == "adult"));
        assert!(selected.iter().any(|id| id == "elder"));
    }

    #[test]
    fn training_and_equipment_create_real_combat_advantage() {
        let mut sim = Simulation::new(81);
        let index = sim.organisms.iter().position(|org| org.alive).unwrap();
        let civilian_bonus = soldier_bonus(&sim.organisms[index]);
        let recruit = &mut sim.organisms[index];
        recruit.specialty = Some("soldier".into());
        recruit.tools.insert("spear".into(), 1);
        assert!(soldier_bonus(recruit) > civilian_bonus + 0.2);
        recruit.tools.insert("rifle".into(), 1);
        assert!(soldier_bonus(recruit) > 0.5);
    }

    #[test]
    fn firearm_style_applies_only_to_the_equipped_combatant() {
        let mut sim = Simulation::new(82);
        let mut indices = sim
            .organisms
            .iter()
            .enumerate()
            .filter_map(|(index, org)| org.alive.then_some(index));
        let armed = indices.next().unwrap();
        let unarmed = indices.next().unwrap();
        sim.organisms[armed].tools.insert("rifle".into(), 1);

        assert_eq!(
            combat_style_for(&sim.organisms[armed], Era::Modern),
            CombatStyle::Modern
        );
        assert_eq!(
            combat_style_for(&sim.organisms[unarmed], Era::Modern),
            CombatStyle::Brawl,
            "one rifle must not upgrade the rest of the force"
        );
    }

    #[test]
    fn military_law_and_funding_improve_coordination() {
        let mut government = Government::new("guard".into(), GovernmentKind::Republic, 1);
        assert_eq!(military_policy_bonus(Some(&government)), 0.0);
        government.laws.push(Law {
            kind: LawKind::MilitaryService,
            enacted_tick: 2,
        });
        let unfunded = military_policy_bonus(Some(&government));
        government.treasury = 500;
        assert!(military_policy_bonus(Some(&government)) > unfunded);
    }

    #[test]
    fn defense_bonus_requires_completed_defender_owned_fortifications() {
        let defenders = vec!["guard".to_string()];
        let mut wall = Building::new(1, BuildingKind::Wall, 20, 20, Some("guard".into()), 1);
        assert!(!nearby_operational_defense(&[wall.clone()], &defenders, (20, 20)));

        wall.condition = 1.0;
        assert!(nearby_operational_defense(&[wall.clone()], &defenders, (23, 20)));

        wall.kind = BuildingKind::Temple;
        assert!(!nearby_operational_defense(&[wall.clone()], &defenders, (20, 20)));

        wall.kind = BuildingKind::Watchtower;
        wall.owner_lineage = Some("attacker".into());
        assert!(!nearby_operational_defense(&[wall], &defenders, (20, 20)));

        let field_position = FieldFortification {
            x: 22,
            y: 20,
            lineage_id: "guard".into(),
        };
        let mut sim = Simulation::new(83);
        *sim.grid.structure_at_mut(22, 20) = 0.12;
        assert!(nearby_field_fortification(
            std::slice::from_ref(&field_position),
            &defenders,
            (20, 20),
            &sim.grid,
        ));
        assert!(!nearby_field_fortification(
            &[FieldFortification {
                lineage_id: "attacker".into(),
                ..field_position
            }],
            &defenders,
            (20, 20),
            &sim.grid,
        ));
        *sim.grid.structure_at_mut(22, 20) = 0.0;
        assert!(!nearby_field_fortification(
            &[FieldFortification {
                x: 22,
                y: 20,
                lineage_id: "guard".into(),
            }],
            &defenders,
            (20, 20),
            &sim.grid,
        ));
    }
}
