use super::*;
use std::collections::{BTreeMap, BTreeSet};

use crate::sim::civ::society::relations::{MemoryKind, Relations};
use crate::sim::culture::ReligionKind;
use crate::sim::simulation::Simulation;

pub const WAR_STEP: u64 = 480;
pub static NO_SIDES: BTreeMap<String, u32> = BTreeMap::new();
const WAR_BATTLE_ODDS: f32 = 0.6;
const WAR_DECIDED_AT: i32 = 2;
const WAR_MAX_BATTLES: u32 = 3;
const WAR_MAX_TICKS: u64 = 9_000;
const WAR_WEARY: f32 = 0.35;
const FRONT_STEP: i32 = 5;
const ALLY_REACH: i32 = 90;
const MAX_ALLIES: usize = 2;
const BORDER_REACH: i32 = 18;
const ABSORB_REACH: i32 = 40;
const TOWN_PEOPLE_REACH: i32 = 16;
const TOWN_LAND_REACH: i32 = 14;
const ABSORB_WHOLE_AT: usize = 12;
const KEEP_ENDED_WARS: usize = 32;
const MIN_REASON: f32 = 0.2;
const CLAIM_REASON: f32 = 0.45;
const WATER_REACH: i32 = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CasusBelli {
    Land,
    Water,
    Revenge,
    Ambition,
    Faith,
    Independence,
    Succession,
}

impl CasusBelli {
    pub fn name(self) -> &'static str {
        match self {
            CasusBelli::Land => "land",
            CasusBelli::Water => "water",
            CasusBelli::Revenge => "revenge",
            CasusBelli::Ambition => "ambition",
            CasusBelli::Faith => "faith",
            CasusBelli::Independence => "independence",
            CasusBelli::Succession => "succession",
        }
    }

    fn phrase(self) -> &'static str {
        match self {
            CasusBelli::Land => "over the land",
            CasusBelli::Water => "over the water",
            CasusBelli::Revenge => "to avenge their dead",
            CasusBelli::Ambition => "for their chief's glory",
            CasusBelli::Faith => "over the faith",
            CasusBelli::Independence => "for their freedom",
            CasusBelli::Succession => "to press a claim to the throne",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WarOutcome {
    BorderChange,
    Tribute,
    Absorption,
    Peace,
    Independence,
}

impl WarOutcome {
    pub fn name(self) -> &'static str {
        match self {
            WarOutcome::BorderChange => "border_change",
            WarOutcome::Tribute => "tribute",
            WarOutcome::Absorption => "absorption",
            WarOutcome::Peace => "peace",
            WarOutcome::Independence => "independence",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct War {
    pub id: u32,
    pub attacker: String,
    pub defender: String,
    #[serde(default)]
    pub allies: Vec<String>,
    pub reason: CasusBelli,
    #[serde(default)]
    pub raids_before: u32,
    pub started_tick: u64,
    pub front: [i32; 2],
    #[serde(default)]
    pub score: i32,
    #[serde(default)]
    pub battles: Vec<String>,
    #[serde(default)]
    pub fought: u32,
    #[serde(default)]
    pub ended_tick: Option<u64>,
    #[serde(default)]
    pub outcome: Option<WarOutcome>,
    #[serde(default)]
    pub winner: Option<String>,
    #[serde(default)]
    pub towns_ceded: u32,
    #[serde(default)]
    pub tiles_ceded: u32,
}

impl War {
    pub fn active(&self) -> bool {
        self.ended_tick.is_none()
    }

    pub fn between(&self, a: &str, b: &str) -> bool {
        (self.attacker == a && self.defender == b) || (self.attacker == b && self.defender == a)
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct TribeFacts {
    pub pop: usize,
    pub hungry: f32,
    pub land: usize,
    pub water: u32,
    pub faith: Option<(String, ReligionKind)>,
    pub ambition: f32,
    pub centre: (i32, i32),
    pub claims: Vec<String>,
}

pub struct WarMinds<'a> {
    pub relations: &'a Relations,
    pub facts: &'a BTreeMap<String, TribeFacts>,
    pub sides: &'a BTreeMap<String, u32>,
    pub at_war: &'a BTreeSet<String>,
}

impl WarMinds<'_> {
    pub fn same_side(&self, a: &str, b: &str) -> bool {
        a == b
            || matches!(
                (self.sides.get(a), self.sides.get(b)),
                (Some(x), Some(y)) if x == y
            )
    }

    pub fn opinion(&self, a: &str, b: &str, mood: f32) -> f32 {
        (self.relations.standing(a, b) + super::super::relations::MOOD_SHARE * mood).clamp(-1.0, 1.0)
    }

    pub fn casus(&self, a: &str, b: &str, border: bool) -> Option<CasusBelli> {
        let fa = self.facts.get(a)?;
        let fb = self.facts.get(b)?;
        let mut best: (f32, Option<CasusBelli>) = (MIN_REASON, None);
        let mut consider = |score: f32, why: CasusBelli| {
            if score > best.0 {
                best = (score, Some(why));
            }
        };
        consider(self.relations.grievance(a, b), CasusBelli::Revenge);
        if fa.hungry >= 0.2 && fb.hungry + 0.1 <= fa.hungry {
            consider(0.15 + fa.hungry, CasusBelli::Land);
        }
        let friction = -self.relations.weight(a, b, MemoryKind::Border);
        if border || friction >= 0.06 {
            let crowded = if fa.land >= 360 { 0.1 } else { 0.0 };
            consider(0.21 + friction + crowded, CasusBelli::Land);
        }
        if fa.water <= 3 && fb.water >= 8 {
            consider(0.45, CasusBelli::Water);
        }
        if fa.claims.iter().any(|c| c == b) {
            consider(CLAIM_REASON, CasusBelli::Succession);
        }
        if fa.ambition >= 0.6 && fa.pop * 4 >= fb.pop * 5 {
            consider(fa.ambition - 0.2, CasusBelli::Ambition);
        }
        if let (Some((ra, ka)), Some((rb, kb))) = (&fa.faith, &fb.faith) {
            if ra != rb && ka == kb {
                consider(0.4, CasusBelli::Faith);
            }
        }
        best.1
    }
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

pub(crate) fn number_word(n: u32) -> String {
    const WORDS: [&str; 11] = [
        "no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    ];
    WORDS
        .get(n as usize)
        .map_or_else(|| n.to_string(), |w| (*w).to_string())
}

fn step_toward(from: [i32; 2], to: (i32, i32), step: i32) -> [i32; 2] {
    let dx = to.0 - from[0];
    let dy = to.1 - from[1];
    let len = dx.abs().max(dy.abs());
    if len <= step {
        return [to.0, to.1];
    }
    [from[0] + dx * step / len, from[1] + dy * step / len]
}

impl Simulation {
    pub(crate) fn tribe_facts(&self) -> BTreeMap<String, TribeFacts> {
        let mut facts: BTreeMap<String, TribeFacts> = BTreeMap::new();
        let mut sums: BTreeMap<&str, (f64, f64)> = BTreeMap::new();
        let mut faiths: BTreeMap<&str, BTreeMap<&str, u32>> = BTreeMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let f = facts.entry(o.lineage_id.to_string()).or_default();
            f.pop += 1;
            if o.inv_food == 0 && o.energy < 0.4 {
                f.hungry += 1.0;
            }
            if o.is_leader {
                f.ambition = f.ambition.max(o.traits.aggression);
            }
            let s = sums.entry(o.lineage_id.as_str()).or_insert((0.0, 0.0));
            s.0 += f64::from(o.x);
            s.1 += f64::from(o.y);
            if let Some(r) = o.religion_id.as_deref() {
                *faiths
                    .entry(o.lineage_id.as_str())
                    .or_default()
                    .entry(r)
                    .or_insert(0) += 1;
            }
        }
        let mut capitals: BTreeMap<&str, (u32, [i32; 2])> = BTreeMap::new();
        for t in &self.towns {
            let e = capitals.entry(t.lineage.as_str()).or_insert((t.id, t.center));
            if t.id < e.0 {
                *e = (t.id, t.center);
            }
        }
        let kinds: BTreeMap<&str, ReligionKind> =
            self.religions.iter().map(|r| (r.id.as_str(), r.kind)).collect();
        for (lid, f) in facts.iter_mut() {
            let n = f.pop as f32;
            f.hungry /= n;
            let (sx, sy) = sums.get(lid.as_str()).copied().unwrap_or((0.0, 0.0));
            f.centre = capitals.get(lid.as_str()).map_or(
                ((sx / f.pop as f64) as i32, (sy / f.pop as f64) as i32),
                |(_, c)| (c[0], c[1]),
            );
            f.land = self.territory.get(lid.as_str()).map_or(0, |t| t.len());
            if self.ruled_by(lid, crate::sim::civ::society::rulers::RulerTrait::Warlike) {
                f.ambition = (f.ambition + crate::sim::civ::society::rulers::WARLIKE_AMBITION).min(1.0);
            } else if self.ruled_by(lid, crate::sim::civ::society::rulers::RulerTrait::Peaceful) {
                f.ambition = (f.ambition - crate::sim::civ::society::rulers::WARLIKE_AMBITION).max(0.0);
            }
            f.water = self.water_near(f.centre, WATER_REACH);
            f.faith = faiths
                .get(lid.as_str())
                .and_then(|m| m.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0))))
                .filter(|(_, count)| (**count as usize) * 2 >= f.pop)
                .and_then(|(r, _)| kinds.get(r).map(|k| (r.to_string(), *k)));
        }
        for (holder, on) in self.pressed_claims() {
            if let Some(f) = facts.get_mut(&holder) {
                f.claims.push(on);
            }
        }
        facts
    }

    fn water_near(&self, (cx, cy): (i32, i32), reach: i32) -> u32 {
        let mut n = 0;
        for y in cy - reach..=cy + reach {
            for x in cx - reach..=cx + reach {
                if crate::world::grid::WorldGrid::in_bounds(x, y)
                    && self.grid.get(x, y) == crate::world::tiles::Tile::Water
                {
                    n += 1;
                }
            }
        }
        n
    }

    pub(crate) fn lineages_at_war(&self) -> BTreeSet<String> {
        self.diplomacy
            .wars
            .iter()
            .filter(|w| w.active())
            .flat_map(|w| [w.attacker.clone(), w.defender.clone()])
            .collect()
    }

    pub(crate) fn war_battle_ids(&self) -> HashSet<String> {
        self.diplomacy
            .wars
            .iter()
            .filter(|w| w.active())
            .flat_map(|w| w.battles.iter().cloned())
            .collect()
    }

    fn living_of(&self, lineage: &str) -> Vec<usize> {
        self.organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lineage)
            .map(|(i, _)| i)
            .collect()
    }

    fn engaged_lineages(&self) -> BTreeSet<String> {
        self.battles
            .iter()
            .filter(|b| b.ended_tick.is_none())
            .flat_map(|b| b.attackers.iter().chain(b.defenders.iter()).cloned())
            .collect()
    }

    pub(crate) fn same_side(&self, a: &str, b: &str) -> bool {
        a == b
            || matches!(
                (self.diplomacy.nation_of.get(a), self.diplomacy.nation_of.get(b)),
                (Some(x), Some(y)) if x == y
            )
    }

    fn allied_with(&self, a: &str, b: &str) -> bool {
        let tick = self.tick_count;
        self.same_side(a, b)
            || self.treaties.iter().any(|t| {
                t.signed_tick <= tick
                    && t.expires_tick > tick
                    && matches!(t.kind, TreatyKind::Alliance | TreatyKind::Defensive)
                    && ((t.lineage_a == a && t.lineage_b == b) || (t.lineage_a == b && t.lineage_b == a))
            })
    }

    pub(crate) fn enter_wars(
        &mut self,
        battles: Vec<Battle>,
        reasons: &[(String, CasusBelli)],
        declares: bool,
    ) -> Vec<Battle> {
        let mut out = Vec::with_capacity(battles.len());
        for mut battle in battles {
            let (Some(a), Some(d)) = (
                battle.attackers.first().cloned(),
                battle.defenders.first().cloned(),
            ) else {
                out.push(battle);
                continue;
            };
            let reason = reasons
                .iter()
                .find(|(id, _)| id == &battle.id)
                .map_or(CasusBelli::Land, |r| r.1);
            if !declares {
                self.diplomacy.stats.raids += 1;
                self.remember(&d, &a, MemoryKind::Raid, -0.25);
                out.push(battle);
                continue;
            }
            let wi = self.declare_war(&a, &d, reason, [battle.location.0, battle.location.1]);
            self.join_allies(&mut battle, wi);
            self.diplomacy.wars[wi].battles.push(battle.id.clone());
            out.push(battle);
        }
        out
    }

    pub(crate) fn declare_war(&mut self, a: &str, d: &str, reason: CasusBelli, front: [i32; 2]) -> usize {
        let id = self.diplomacy.next_war_id.max(1);
        self.diplomacy.next_war_id = id + 1;
        let rel = &self.diplomacy.relations;
        let raids = rel.count(a, d, MemoryKind::Raid) + rel.count(d, a, MemoryKind::Raid);
        self.diplomacy.wars.push(War {
            id,
            attacker: a.to_string(),
            defender: d.to_string(),
            allies: Vec::new(),
            reason,
            raids_before: raids,
            started_tick: self.tick_count,
            front,
            score: 0,
            battles: Vec::new(),
            fought: 0,
            ended_tick: None,
            outcome: None,
            winner: None,
            towns_ceded: 0,
            tiles_ceded: 0,
        });
        *self
            .diplomacy
            .stats
            .wars_by_reason
            .entry(reason.name())
            .or_insert(0) += 1;
        if reason == CasusBelli::Succession {
            self.diplomacy.stats.succession_wars += 1;
            self.drop_claim(a, d);
        }
        let line = format!(
            "\u{2694}\u{FE0F} The {} declared war on the {} {}{}.",
            self.tribe_name(a),
            self.tribe_name(d),
            reason.phrase(),
            after_raids(raids)
        );
        self.headline(line);
        self.diplomacy.wars.len() - 1
    }

    fn headline(&mut self, line: String) {
        let now = self.tick_count;
        push_event(&mut self.events, now, "milestone", "world", &line);
        self.headlines.push_back((now, line));
        while self.headlines.len() > 80 {
            self.headlines.pop_front();
        }
    }

    fn join_allies(&mut self, battle: &mut Battle, wi: usize) {
        let (Some(a), Some(d)) = (
            battle.attackers.first().cloned(),
            battle.defenders.first().cloned(),
        ) else {
            return;
        };
        let engaged = self.engaged_lineages();
        let front = battle.location;
        let mut pops: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for (i, o) in self.organisms.iter().enumerate().filter(|(_, o)| o.alive) {
            pops.entry(o.lineage_id.to_string()).or_default().push(i);
        }
        let candidates: Vec<String> = pops
            .iter()
            .filter(|(l, members)| {
                *l != &a
                    && *l != &d
                    && members.len() >= RAID_MIN_POP
                    && !engaged.contains(*l)
                    && !battle.defenders.contains(l)
                    && self.allied_with(l, &d)
                    && !self.allied_with(l, &a)
            })
            .map(|(l, _)| l.clone())
            .collect();
        let mut joined = 0usize;
        for ally in candidates {
            if joined >= MAX_ALLIES {
                break;
            }
            let (cx, cy) = lineage_centroid(&self.organisms, &ally);
            if (cx - front.0).abs().max((cy - front.1).abs()) > ALLY_REACH {
                continue;
            }
            let pop = pops[&ally].len();
            let n = (2 + pop / 12).min(5);
            let index: HashMap<String, Vec<usize>> =
                [(ally.clone(), pops[&ally].clone())].into_iter().collect();
            let fighters = pick_combatants(&self.organisms, &index, &ally, n, front, &mut self.rng);
            if fighters.is_empty() {
                continue;
            }
            battle.initial_d += fighters.len() as u32;
            battle.defender_orgs.extend(fighters);
            battle.defenders.push(ally.clone());
            if !self.diplomacy.wars[wi].allies.contains(&ally) {
                self.diplomacy.wars[wi].allies.push(ally.clone());
            }
            self.remember(&d, &ally, MemoryKind::Aid, 0.2);
            self.diplomacy.stats.allies_joined += 1;
            joined += 1;
            let line = format!(
                "\u{1F6E1}\u{FE0F} The {} marched to the aid of the {} against the {}.",
                self.tribe_name(&ally),
                self.tribe_name(&d),
                self.tribe_name(&a)
            );
            self.headline(line);
        }
    }

    pub(crate) fn tick_wars(&mut self) -> Vec<Battle> {
        let mut out = Vec::new();
        if self.tick_count == 0 || !self.tick_count.is_multiple_of(WAR_STEP) {
            return out;
        }
        let now = self.tick_count;
        let engaged = self.engaged_lineages();
        let active: Vec<usize> = (0..self.diplomacy.wars.len())
            .filter(|&i| self.diplomacy.wars[i].active())
            .collect();
        for wi in active {
            let war = self.diplomacy.wars[wi].clone();
            let a_members = self.living_of(&war.attacker);
            let d_members = self.living_of(&war.defender);
            if a_members.len() < 4 || d_members.len() < 4 {
                let winner = if a_members.len() >= d_members.len() {
                    &war.attacker
                } else {
                    &war.defender
                };
                let winner = (!a_members.is_empty() || !d_members.is_empty()).then(|| winner.clone());
                self.end_war(wi, winner);
                continue;
            }
            if now.saturating_sub(war.started_tick) > WAR_MAX_TICKS {
                self.end_war(wi, self.leader_by_score(wi));
                continue;
            }
            if engaged.contains(&war.attacker) || engaged.contains(&war.defender) {
                continue;
            }
            use rand::RngExt;
            if self.rng.random::<f32>() > WAR_BATTLE_ODDS {
                continue;
            }
            let n = (6 + (self.rng.random::<u32>() % 5) as usize)
                .min(a_members.len() / 2)
                .min(d_members.len() / 2);
            if n < 2 {
                self.end_war(wi, self.leader_by_score(wi));
                continue;
            }
            let loc = (war.front[0], war.front[1]);
            let index: HashMap<String, Vec<usize>> = [
                (war.attacker.clone(), a_members.clone()),
                (war.defender.clone(), d_members.clone()),
            ]
            .into_iter()
            .collect();
            let attacker_orgs =
                pick_combatants(&self.organisms, &index, &war.attacker, n, loc, &mut self.rng);
            let defender_orgs =
                pick_combatants(&self.organisms, &index, &war.defender, n, loc, &mut self.rng);
            if attacker_orgs.is_empty() || defender_orgs.is_empty() {
                continue;
            }
            let id = format!("war_{}_{}_{}", war.id, now, war.fought);
            let mut battle = Battle {
                id: id.clone(),
                attackers: vec![war.attacker.clone()],
                defenders: vec![war.defender.clone()],
                initial_a: attacker_orgs.len() as u32,
                initial_d: defender_orgs.len() as u32,
                scale: scale_for_participants(attacker_orgs.len() + defender_orgs.len()),
                attacker_orgs,
                defender_orgs,
                location: loc,
                started_tick: now,
                ended_tick: None,
                casualties_a: 0,
                casualties_d: 0,
                outcome: None,
            };
            self.join_allies(&mut battle, wi);
            self.diplomacy.wars[wi].battles.push(id.clone());
            self.diplomacy.stats.front_battles += 1;
            push_event(
                &mut self.events,
                now,
                "battle_began",
                &id,
                &format!(
                    "{} attacks {} at the front ({}, {} v {})",
                    war.attacker,
                    war.defender,
                    battle.scale.name(),
                    battle.initial_a,
                    battle.initial_d
                ),
            );
            out.push(battle);
        }
        out
    }

    fn leader_by_score(&self, wi: usize) -> Option<String> {
        let war = &self.diplomacy.wars[wi];
        match war.score.signum() {
            1 => Some(war.attacker.clone()),
            -1 => Some(war.defender.clone()),
            _ => None,
        }
    }

    pub(crate) fn settle_wars(&mut self) {
        let now = self.tick_count;
        let ended: Vec<Battle> = self
            .battles
            .iter()
            .filter(|b| b.ended_tick == Some(now))
            .cloned()
            .collect();
        for battle in ended {
            let (Some(a), Some(d)) = (battle.attackers.first(), battle.defenders.first()) else {
                continue;
            };
            let a_frac = 1.0 - battle.casualties_a as f32 / battle.initial_a.max(1) as f32;
            let d_frac = 1.0 - battle.casualties_d as f32 / battle.initial_d.max(1) as f32;
            let points = match battle.outcome {
                Some(BattleOutcome::AttackerVictory) => {
                    for loser in &battle.defenders {
                        self.remember(loser, a, MemoryKind::BattleLost, -0.2);
                        self.remember(a, loser, MemoryKind::BattleWon, -0.05);
                    }
                    1 + i32::from(a_frac - d_frac >= 0.4)
                }
                Some(BattleOutcome::DefenderVictory) => {
                    self.remember(a, d, MemoryKind::BattleLost, -0.2);
                    for winner in &battle.defenders {
                        self.remember(winner, a, MemoryKind::BattleWon, -0.05);
                    }
                    -1 - i32::from(d_frac - a_frac >= 0.4)
                }
                _ => {
                    self.remember(a, d, MemoryKind::BattleLost, -0.05);
                    self.remember(d, a, MemoryKind::BattleLost, -0.05);
                    0
                }
            };
            let Some(wi) = self
                .diplomacy
                .wars
                .iter()
                .position(|w| w.active() && w.battles.contains(&battle.id))
            else {
                continue;
            };
            let loser_side = match points.signum() {
                1 => Some(d.clone()),
                -1 => Some(a.clone()),
                _ => None,
            };
            {
                let war = &mut self.diplomacy.wars[wi];
                war.battles.retain(|id| id != &battle.id);
                war.fought += 1;
                war.score += points;
            }
            if let Some(loser) = loser_side {
                let home = lineage_centroid(&self.organisms, &loser);
                let war = &mut self.diplomacy.wars[wi];
                war.front = step_toward(war.front, home, FRONT_STEP);
            }
            let war = &self.diplomacy.wars[wi];
            let weary = self.war_weariness(&war.attacker) >= WAR_WEARY
                && self.war_weariness(&war.defender) >= WAR_WEARY;
            if war.score.abs() >= WAR_DECIDED_AT || war.fought >= WAR_MAX_BATTLES || weary {
                let winner = self.leader_by_score(wi);
                self.end_war(wi, winner);
            }
        }
    }

    pub(crate) fn end_war(&mut self, wi: usize, winner: Option<String>) {
        use rand::RngExt;
        let now = self.tick_count;
        let war = self.diplomacy.wars[wi].clone();
        if !war.active() {
            return;
        }
        let (a, d) = (war.attacker.clone(), war.defender.clone());
        let front = war.front;
        let mut towns = 0u32;
        let mut tiles = 0u32;
        let mut absorbed = false;
        let outcome = match &winner {
            None => WarOutcome::Peace,
            Some(w) => {
                let attacker_won = *w == a;
                match (war.reason, attacker_won) {
                    (CasusBelli::Independence, true) => WarOutcome::Independence,
                    (CasusBelli::Independence, false) => WarOutcome::Absorption,
                    (_, false) => WarOutcome::BorderChange,
                    (CasusBelli::Land | CasusBelli::Water, true) => WarOutcome::BorderChange,
                    (CasusBelli::Revenge | CasusBelli::Faith, true) => WarOutcome::Tribute,
                    (CasusBelli::Succession, true) => WarOutcome::Absorption,
                    (CasusBelli::Ambition, true) => {
                        if self.living_of(&a).len() * 2 >= self.living_of(&d).len() * 3 {
                            WarOutcome::Absorption
                        } else {
                            WarOutcome::BorderChange
                        }
                    }
                }
            }
        };
        let (w, l) = match &winner {
            Some(w) if *w == a => (a.clone(), d.clone()),
            Some(_) => (d.clone(), a.clone()),
            None => (a.clone(), d.clone()),
        };
        match outcome {
            WarOutcome::BorderChange => {
                tiles = self.cede_land(&l, &w, front, BORDER_REACH);
                towns = self.cede_towns(&l, &w, front, BORDER_REACH + 6, 2, true);
            }
            WarOutcome::Absorption => {
                tiles = self.cede_land(&l, &w, front, BORDER_REACH);
                towns = self.cede_towns(&l, &w, front, ABSORB_REACH, 2, false);
                let left = self.living_of(&l).len();
                if left > 0 && left <= ABSORB_WHOLE_AT && !self.towns.iter().any(|t| t.lineage == l) {
                    self.absorb_people(&l, &w);
                    absorbed = true;
                }
            }
            WarOutcome::Tribute | WarOutcome::Peace | WarOutcome::Independence => {}
        }
        let treaty_ends = now + 5_000 + self.rng.random::<u64>() % 3_000;
        if outcome == WarOutcome::Tribute {
            establish_treaty(
                &mut self.treaties,
                &mut self.organisms,
                &l,
                &w,
                TreatyKind::Vassalage,
                now,
                now + 9_000,
            );
        } else if !absorbed {
            establish_treaty(
                &mut self.treaties,
                &mut self.organisms,
                &a,
                &d,
                TreatyKind::NonAggression,
                now,
                treaty_ends,
            );
        }
        if outcome == WarOutcome::Peace {
            self.remember_both(&a, &d, MemoryKind::Peace, 0.15);
        } else {
            if towns > 0 || tiles > 0 {
                self.remember(
                    &l,
                    &w,
                    MemoryKind::LandTaken,
                    -0.15 - 0.1 * towns as f32 - tiles as f32 / 400.0,
                );
            }
            self.remember(&w, &l, MemoryKind::Peace, 0.1);
            self.remember(&l, &w, MemoryKind::Peace, 0.05);
        }
        let (an, dn, wn, ln) = (
            self.tribe_name(&a),
            self.tribe_name(&d),
            self.tribe_name(&w),
            self.tribe_name(&l),
        );
        let result = match outcome {
            WarOutcome::Peace => "both sides made peace".to_string(),
            WarOutcome::BorderChange if towns > 0 => format!(
                "the {ln} ceded {} {}",
                number_word(towns),
                if towns == 1 { "village" } else { "villages" }
            ),
            WarOutcome::BorderChange if tiles > 0 => format!("the {ln} gave up land at the border"),
            WarOutcome::BorderChange => format!("the {wn} held their ground"),
            WarOutcome::Tribute => format!("the {ln} now pay tribute to the {wn}"),
            WarOutcome::Absorption if absorbed => format!("the {ln} were absorbed by the {wn}"),
            WarOutcome::Absorption if towns > 0 => {
                format!("the {wn} took {} of their towns", number_word(towns))
            }
            WarOutcome::Absorption => format!("the {ln} bowed to the {wn}"),
            WarOutcome::Independence => format!("the {wn} won their freedom"),
        };
        let line = format!(
            "\u{1F54A}\u{FE0F} The {an} went to war with the {dn} {}{}; {result}.",
            war.reason.phrase(),
            after_raids(war.raids_before)
        );
        self.headline(line);
        {
            let war = &mut self.diplomacy.wars[wi];
            war.ended_tick = Some(now);
            war.outcome = Some(outcome);
            war.winner = winner;
            war.towns_ceded = towns;
            war.tiles_ceded = tiles;
            war.battles.clear();
        }
        *self.diplomacy.stats.outcomes.entry(outcome.name()).or_insert(0) += 1;
        self.diplomacy.stats.towns_ceded += towns;
        self.prune_wars();
        if outcome == WarOutcome::Absorption && !absorbed {
            self.annex(&w, &l);
        }
    }

    fn prune_wars(&mut self) {
        let ended = self.diplomacy.wars.iter().filter(|w| !w.active()).count();
        if ended <= KEEP_ENDED_WARS {
            return;
        }
        let mut drop = ended - KEEP_ENDED_WARS;
        self.diplomacy.wars.retain(|w| {
            if drop > 0 && !w.active() {
                drop -= 1;
                return false;
            }
            true
        });
    }

    fn cede_land(&mut self, from: &str, to: &str, near: [i32; 2], reach: i32) -> u32 {
        let Some(tiles) = self.territory.get(from) else {
            return 0;
        };
        let mut taken: Vec<(i32, i32)> = tiles
            .iter()
            .copied()
            .filter(|&(x, y)| chebyshev([x, y], near) <= reach)
            .collect();
        taken.sort_unstable();
        self.move_tiles(from, to, &taken);
        taken.len() as u32
    }

    fn move_tiles(&mut self, from: &str, to: &str, tiles: &[(i32, i32)]) {
        if tiles.is_empty() {
            return;
        }
        if let Some(set) = self.territory.get_mut(from) {
            for t in tiles {
                set.swap_remove(t);
            }
        }
        let set = self.territory.entry(to.to_string().into()).or_default();
        for &t in tiles {
            set.insert(t);
        }
        for &t in tiles {
            self.tile_owner.insert(t, to.to_string().into());
        }
    }

    fn cede_towns(
        &mut self,
        from: &str,
        to: &str,
        near: [i32; 2],
        reach: i32,
        max: usize,
        keep_one: bool,
    ) -> u32 {
        let owned = self.towns.iter().filter(|t| t.lineage == from).count();
        let room = if keep_one { owned.saturating_sub(1) } else { owned }.min(max);
        let mut nearby: Vec<(i32, u32)> = self
            .towns
            .iter()
            .filter(|t| t.lineage == from)
            .map(|t| (chebyshev(t.center, near), t.id))
            .filter(|&(dist, _)| dist <= reach)
            .collect();
        nearby.sort_unstable();
        let mut ceded = 0;
        for (_, id) in nearby.into_iter().take(room) {
            self.transfer_town(id, from, to);
            ceded += 1;
        }
        ceded
    }

    pub(crate) fn transfer_town(&mut self, id: u32, from: &str, to: &str) {
        let Some(town) = self.towns.iter_mut().find(|t| t.id == id) else {
            return;
        };
        town.lineage = to.to_string().into();
        let centre = town.center;
        for b in self.buildings.iter_mut() {
            if b.town == Some(id) && b.owner_lineage.as_deref() == Some(from) {
                b.owner_lineage = Some(to.to_string().into());
            }
        }
        self.building_state_revision = self.building_state_revision.wrapping_add(1);
        for o in self.organisms.iter_mut() {
            if o.alive
                && o.lineage_id == from
                && chebyshev([o.home_x as i32, o.home_y as i32], centre) <= TOWN_PEOPLE_REACH
            {
                o.lineage_id = to.to_string().into();
            }
        }
        self.organism_columns.refresh_lineages(&self.organisms);
        let land: Vec<(i32, i32)> = self.territory.get(from).map_or_else(Vec::new, |tiles| {
            let mut v: Vec<(i32, i32)> = tiles
                .iter()
                .copied()
                .filter(|&(x, y)| chebyshev([x, y], centre) <= TOWN_LAND_REACH)
                .collect();
            v.sort_unstable();
            v
        });
        self.move_tiles(from, to, &land);
    }

    fn absorb_people(&mut self, from: &str, to: &str) {
        for o in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == from)
        {
            o.lineage_id = to.to_string().into();
        }
        self.organism_columns.refresh_lineages(&self.organisms);
        let land: Vec<(i32, i32)> = self.territory.get(from).map_or_else(Vec::new, |tiles| {
            let mut v: Vec<(i32, i32)> = tiles.iter().copied().collect();
            v.sort_unstable();
            v
        });
        self.move_tiles(from, to, &land);
        for b in self.buildings.iter_mut() {
            if b.owner_lineage.as_deref() == Some(from) {
                b.owner_lineage = Some(to.to_string().into());
            }
        }
        self.building_state_revision = self.building_state_revision.wrapping_add(1);
        self.lineage_peak_pop.swap_remove(from);
        self.tribe_peril.swap_remove(from);
    }
}

fn after_raids(raids: u32) -> String {
    if raids >= 2 {
        format!(" after {} raids", number_word(raids))
    } else {
        String::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(pop: usize) -> TribeFacts {
        TribeFacts {
            pop,
            water: 10,
            ..TribeFacts::default()
        }
    }

    #[test]
    fn a_war_needs_a_reason_and_names_the_strongest() {
        let mut relations = Relations::default();
        let mut table: BTreeMap<String, TribeFacts> = BTreeMap::new();
        table.insert("a".into(), facts(20));
        table.insert("b".into(), facts(20));
        let sides = BTreeMap::new();
        let at_war = BTreeSet::new();
        let minds = WarMinds {
            relations: &relations,
            facts: &table,
            sides: &sides,
            at_war: &at_war,
        };
        assert_eq!(minds.casus("a", "b", false), None);
        assert_eq!(minds.casus("a", "b", true), Some(CasusBelli::Land));

        relations.remember("a", "b", MemoryKind::Raid, -0.5, 0);
        let minds = WarMinds {
            relations: &relations,
            facts: &table,
            sides: &sides,
            at_war: &at_war,
        };
        assert_eq!(minds.casus("a", "b", true), Some(CasusBelli::Revenge));

        table.get_mut("a").unwrap().water = 0;
        table.get_mut("b").unwrap().water = 20;
        let relations = Relations::default();
        let minds = WarMinds {
            relations: &relations,
            facts: &table,
            sides: &sides,
            at_war: &at_war,
        };
        assert_eq!(minds.casus("a", "b", false), Some(CasusBelli::Water));
        assert_eq!(minds.casus("b", "a", false), None);
    }

    #[test]
    fn the_front_steps_toward_the_loser() {
        assert_eq!(step_toward([0, 0], (20, 0), 5), [5, 0]);
        assert_eq!(step_toward([0, 0], (3, 3), 5), [3, 3]);
        assert_eq!(step_toward([10, 10], (0, 20), 5), [5, 15]);
    }
}
