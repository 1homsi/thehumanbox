use std::collections::{BTreeMap, BTreeSet};

use rand::SeedableRng;
use serde::{Deserialize, Serialize};

use crate::sim::civ::society::relations::MemoryKind;
use crate::sim::civ::warfare::{tribe_mood, CasusBelli, TreatyKind};
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

pub const NATION_STEP: u64 = 1_200;
const NATION_PHASE: u64 = 900;
const FOUNDING_TIER: u8 = 4;
const FOUNDING_TOWNS: usize = 2;
const UNION_TREATY_AGE: u64 = 1_200;
const UNION_REACH: i32 = 120;
const UNION_WARMTH: f32 = 0.15;
const KIN_REACH: i32 = 100;
const KIN_WARMTH: f32 = 0.15;
const WARD_MAX: usize = 12;
const PROTECTOR_MIN: usize = 15;
const PROTECTOR_RATIO: usize = 2;
const PROTECT_REACH: i32 = 80;
const WARDS_PER_PASS: usize = 10;
const VASSAL_JOIN_AGE: u64 = 3_000;
const VASSAL_RESENTMENT: f32 = -0.3;
const SPLIT_BELOW: f32 = 0.2;
const CIVIL_WAR_BELOW: f32 = -0.15;
const CAPITAL_REACH: i32 = 80;
const FAR_SPAN: f32 = 120.0;
const COMFORTABLE_SIZE: usize = 30;
pub const NATION_COLOURS: u8 = 12;

fn whole() -> f32 {
    1.0
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Nation {
    pub id: u32,
    pub name: String,
    #[serde(default)]
    pub capital: u32,
    pub ruler: String,
    pub members: Vec<String>,
    #[serde(default)]
    pub colour: u8,
    #[serde(default)]
    pub founded_tick: u64,
    #[serde(default = "whole")]
    pub cohesion: f32,
}

#[derive(Default)]
struct Census {
    pop: BTreeMap<String, usize>,
    centre: BTreeMap<String, [i32; 2]>,
    towns: BTreeMap<String, Vec<u32>>,
    moods: BTreeMap<String, BTreeMap<String, f32>>,
}

impl Census {
    fn pop(&self, lineage: &str) -> usize {
        self.pop.get(lineage).copied().unwrap_or(0)
    }

    fn towns(&self, lineage: &str) -> usize {
        self.towns.get(lineage).map_or(0, Vec::len)
    }

    fn mood(&self, a: &str, b: &str) -> f32 {
        self.moods.get(a).and_then(|m| m.get(b)).copied().unwrap_or(0.0)
    }
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

impl Simulation {
    pub(crate) fn index_nations(&mut self) {
        let index: BTreeMap<String, u32> = self
            .diplomacy
            .nations
            .iter()
            .flat_map(|n| n.members.iter().map(move |m| (m.clone(), n.id)))
            .collect();
        self.diplomacy.nation_of = index;
    }

    pub fn nation_of(&self, lineage: &str) -> Option<&Nation> {
        let id = self.diplomacy.nation_of.get(lineage)?;
        self.diplomacy.nations.iter().find(|n| n.id == *id)
    }

    fn nation_index(&self, id: u32) -> Option<usize> {
        self.diplomacy.nations.iter().position(|n| n.id == id)
    }

    fn nation_census(&self) -> Census {
        let mut census = Census::default();
        let mut members: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        let mut sums: BTreeMap<String, (f64, f64)> = BTreeMap::new();
        for (i, o) in self.organisms.iter().enumerate().filter(|(_, o)| o.alive) {
            *census.pop.entry(o.lineage_id.clone()).or_insert(0) += 1;
            members.entry(o.lineage_id.clone()).or_default().push(i);
            let s = sums.entry(o.lineage_id.clone()).or_insert((0.0, 0.0));
            s.0 += f64::from(o.x);
            s.1 += f64::from(o.y);
        }
        let mut towns: Vec<(u32, &str, [i32; 2])> = self
            .towns
            .iter()
            .map(|t| (t.id, t.lineage.as_str(), t.center))
            .collect();
        towns.sort_unstable();
        for (id, lineage, centre) in towns {
            census.towns.entry(lineage.to_string()).or_default().push(id);
            census.centre.entry(lineage.to_string()).or_insert(centre);
        }
        for (lineage, (sx, sy)) in sums {
            let n = census.pop(&lineage).max(1) as f64;
            census
                .centre
                .entry(lineage)
                .or_insert([(sx / n) as i32, (sy / n) as i32]);
        }
        census.moods = members
            .iter()
            .map(|(l, m)| (l.clone(), tribe_mood(&self.organisms, m)))
            .collect();
        census
    }

    fn opinion_in(&self, census: &Census, a: &str, b: &str) -> f32 {
        self.opinion_with_mood(a, b, census.mood(a, b))
    }

    fn actor_of(&self, lineage: &str) -> Vec<String> {
        self.nation_of(lineage)
            .map_or_else(|| vec![lineage.to_string()], |n| n.members.clone())
    }

    fn actor_key(&self, lineage: &str) -> String {
        self.diplomacy
            .nation_of
            .get(lineage)
            .map_or_else(|| format!("l:{lineage}"), |id| format!("n:{id}"))
    }

    fn actor_opinion(&self, census: &Census, xs: &[String], ys: &[String]) -> f32 {
        let mut sum = 0.0;
        let mut n = 0.0;
        for x in xs {
            for y in ys {
                sum += self.opinion_in(census, x, y);
                n += 1.0;
            }
        }
        if n == 0.0 {
            0.0
        } else {
            sum / n
        }
    }

    fn actor_centre(&self, census: &Census, lineage: &str) -> Option<[i32; 2]> {
        if let Some(n) = self.nation_of(lineage) {
            if let Some(t) = self.towns.iter().find(|t| t.id == n.capital) {
                return Some(t.center);
            }
            return census.centre.get(&n.ruler).copied();
        }
        census.centre.get(lineage).copied()
    }

    fn at_war_between(&self, xs: &[String], ys: &[String]) -> bool {
        self.diplomacy.wars.iter().any(|w| {
            w.active()
                && ((xs.contains(&w.attacker) && ys.contains(&w.defender))
                    || (ys.contains(&w.attacker) && xs.contains(&w.defender)))
        })
    }

    fn nation_name(&self, id: u32) -> String {
        let mut rng = rand_chacha::ChaCha8Rng::seed_from_u64(
            self.world_seed ^ u64::from(id).wrapping_mul(0x9E37_79B9_7F4A_7C15),
        );
        crate::organism::organism::generate_tribe_name(&mut rng)
    }

    fn free_colour(&self, id: u32) -> u8 {
        let used: BTreeSet<u8> = self.diplomacy.nations.iter().map(|n| n.colour).collect();
        (0..NATION_COLOURS)
            .find(|c| !used.contains(c))
            .unwrap_or((id % u32::from(NATION_COLOURS)) as u8)
    }

    fn capital_for(&self, census: &Census, ruler: &str, members: &[String]) -> u32 {
        census
            .towns
            .get(ruler)
            .and_then(|t| t.first().copied())
            .or_else(|| {
                members
                    .iter()
                    .filter_map(|m| census.towns.get(m).and_then(|t| t.first().copied()))
                    .min()
            })
            .unwrap_or(0)
    }

    fn found_nation(&mut self, census: &Census, ruler: &str, members: Vec<String>) -> u32 {
        let id = self.diplomacy.next_nation_id.max(1);
        self.diplomacy.next_nation_id = id + 1;
        let nation = Nation {
            id,
            name: self.nation_name(id),
            capital: self.capital_for(census, ruler, &members),
            ruler: ruler.to_string(),
            members,
            colour: self.free_colour(id),
            founded_tick: self.tick_count,
            cohesion: 1.0,
        };
        self.diplomacy.nations.push(nation);
        self.diplomacy.stats.nations_formed += 1;
        self.index_nations();
        id
    }

    fn nation_line(&mut self, line: String) {
        let now = self.tick_count;
        push_event(&mut self.events, now, "milestone", "world", &line);
        self.headlines.push_back((now, line));
        while self.headlines.len() > 80 {
            self.headlines.pop_front();
        }
    }

    fn leave_nation(&mut self, lineage: &str) {
        let Some(&id) = self.diplomacy.nation_of.get(lineage) else {
            return;
        };
        let Some(i) = self.nation_index(id) else {
            return;
        };
        let pops: BTreeMap<String, usize> =
            self.organisms
                .iter()
                .filter(|o| o.alive)
                .fold(BTreeMap::new(), |mut m, o| {
                    *m.entry(o.lineage_id.clone()).or_insert(0) += 1;
                    m
                });
        let nation = &mut self.diplomacy.nations[i];
        nation.members.retain(|m| m != lineage);
        if nation.ruler == lineage {
            if let Some(next) = nation
                .members
                .iter()
                .max_by(|a, b| {
                    pops.get(*a)
                        .unwrap_or(&0)
                        .cmp(pops.get(*b).unwrap_or(&0))
                        .then(b.cmp(a))
                })
                .cloned()
            {
                nation.ruler = next;
            }
        }
        self.index_nations();
    }

    pub(crate) fn annex(&mut self, winner: &str, loser: &str) {
        if self.same_side(winner, loser) || winner == loser {
            return;
        }
        let census = self.nation_census();
        self.leave_nation(loser);
        let name = match self.diplomacy.nation_of.get(winner).copied() {
            Some(id) => {
                if let Some(i) = self.nation_index(id) {
                    self.diplomacy.nations[i].members.push(loser.to_string());
                }
                self.index_nations();
                self.nation_of(winner).map(|n| n.name.clone()).unwrap_or_default()
            }
            None => {
                let id = self.found_nation(&census, winner, vec![winner.to_string(), loser.to_string()]);
                self.diplomacy
                    .nations
                    .iter()
                    .find(|n| n.id == id)
                    .map(|n| n.name.clone())
                    .unwrap_or_default()
            }
        };
        self.diplomacy.stats.nations_annexed += 1;
        let line = format!(
            "\u{1F451} The {} now belong to {name}, the realm of the {}.",
            self.tribe_name(loser),
            self.tribe_name(winner)
        );
        self.nation_line(line);
    }

    pub(crate) fn tick_nations(&mut self) {
        if self.tick_count == 0 || self.tick_count % NATION_STEP != NATION_PHASE {
            return;
        }
        let census = self.nation_census();
        self.prune_nations(&census);
        self.found_nations(&census);
        self.join_vassals(&census);
        self.seek_protection(&census);
        self.unite_allies(&census);
        self.split_nations(&census);
        self.index_nations();
    }

    fn prune_nations(&mut self, census: &Census) {
        let mut gone: Vec<(String, String)> = Vec::new();
        let mut nations = std::mem::take(&mut self.diplomacy.nations);
        for n in nations.iter_mut() {
            n.members.retain(|m| census.pop(m) > 0);
            n.members.sort();
            n.members.dedup();
            if !n.members.contains(&n.ruler) {
                if let Some(next) = n
                    .members
                    .iter()
                    .max_by(|a, b| census.pop(a).cmp(&census.pop(b)).then(b.cmp(a)))
                {
                    n.ruler = next.clone();
                }
            }
            let capital_held = self
                .towns
                .iter()
                .any(|t| t.id == n.capital && n.members.contains(&t.lineage));
            if !capital_held {
                n.capital = self.capital_for(census, &n.ruler, &n.members);
            }
        }
        nations.retain(|n| {
            let alone = n.members.len() == 1
                && !(self.settlement_tiers.get(&n.ruler).copied().unwrap_or(0) >= FOUNDING_TIER
                    && census.towns(&n.ruler) >= FOUNDING_TOWNS);
            let keep = !n.members.is_empty() && !alone;
            if !keep {
                gone.push((n.name.clone(), n.ruler.clone()));
            }
            keep
        });
        self.diplomacy.nations = nations;
        self.index_nations();
        for (name, _) in gone {
            self.diplomacy.stats.nations_dissolved += 1;
            self.nation_line(format!("\u{1F3DA}\u{FE0F} The nation of {name} is no more."));
        }
    }

    fn found_nations(&mut self, census: &Census) {
        let founders: Vec<String> = census
            .pop
            .keys()
            .filter(|l| !self.diplomacy.nation_of.contains_key(*l))
            .filter(|l| {
                self.settlement_tiers.get(*l).copied().unwrap_or(0) >= FOUNDING_TIER
                    && census.towns(l) >= FOUNDING_TOWNS
            })
            .cloned()
            .collect();
        for lineage in founders {
            let id = self.found_nation(census, &lineage, vec![lineage.clone()]);
            let name = self
                .diplomacy
                .nations
                .iter()
                .find(|n| n.id == id)
                .map(|n| n.name.clone())
                .unwrap_or_default();
            let line = format!(
                "\u{1F451} The {} founded the nation of {name}.",
                self.tribe_name(&lineage)
            );
            self.nation_line(line);
        }
    }

    fn join_vassals(&mut self, census: &Census) {
        let now = self.tick_count;
        let mut vassals: Vec<(String, String)> = self
            .treaties
            .iter()
            .filter(|t| {
                t.kind == TreatyKind::Vassalage
                    && t.expires_tick > now
                    && t.signed_tick + VASSAL_JOIN_AGE <= now
            })
            .map(|t| (t.lineage_a.clone(), t.lineage_b.clone()))
            .collect();
        vassals.sort();
        for (vassal, overlord) in vassals {
            if census.pop(&vassal) == 0 || census.pop(&overlord) == 0 || self.same_side(&vassal, &overlord) {
                continue;
            }
            if self.opinion_in(census, &vassal, &overlord) < VASSAL_RESENTMENT {
                continue;
            }
            self.annex(&overlord, &vassal);
        }
    }

    fn seek_protection(&mut self, census: &Census) {
        let wards: Vec<String> = census
            .pop
            .iter()
            .filter(|(l, &n)| n <= WARD_MAX && !self.diplomacy.nation_of.contains_key(*l))
            .map(|(l, _)| l.clone())
            .collect();
        let mut taken: BTreeMap<String, usize> = BTreeMap::new();
        for ward in wards {
            if self.war_weariness(&ward) >= 0.3
                || self.lineage_unrest.get(&ward).copied().unwrap_or(0.0) >= 0.5
            {
                continue;
            }
            let Some(&at) = census.centre.get(&ward) else {
                continue;
            };
            let size = census.pop(&ward);
            let mut best: Option<(i32, String, String)> = None;
            for (other, &there) in &census.centre {
                if *other == ward {
                    continue;
                }
                let d = chebyshev(at, there);
                if d > PROTECT_REACH || best.as_ref().is_some_and(|b| b.0 <= d) {
                    continue;
                }
                let key = self.actor_key(other);
                let members = self.actor_of(other);
                let strength: usize = members.iter().map(|m| census.pop(m)).sum();
                let ruler = self
                    .nation_of(other)
                    .map_or_else(|| other.clone(), |n| n.ruler.clone());
                if strength < PROTECTOR_MIN.max(size * PROTECTOR_RATIO)
                    || taken.get(&key).copied().unwrap_or(0) >= WARDS_PER_PASS
                    || self.at_war_between(std::slice::from_ref(&ward), &members)
                    || self.opinion_in(census, &ward, &ruler) < 0.0
                    || self.opinion_in(census, &ruler, &ward) < -0.1
                {
                    continue;
                }
                best = Some((d, key, ruler));
            }
            let Some((_, key, ruler)) = best else {
                continue;
            };
            *taken.entry(key).or_insert(0) += 1;
            self.take_under_wing(census, &ruler, &ward);
        }
    }

    fn take_under_wing(&mut self, census: &Census, ruler: &str, ward: &str) {
        let name = match self.diplomacy.nation_of.get(ruler).copied() {
            Some(id) => {
                if let Some(i) = self.nation_index(id) {
                    self.diplomacy.nations[i].members.push(ward.to_string());
                }
                self.index_nations();
                self.nation_of(ruler).map(|n| n.name.clone()).unwrap_or_default()
            }
            None => {
                let id = self.found_nation(census, ruler, vec![ruler.to_string(), ward.to_string()]);
                self.diplomacy
                    .nations
                    .iter()
                    .find(|n| n.id == id)
                    .map(|n| n.name.clone())
                    .unwrap_or_default()
            }
        };
        self.diplomacy.stats.protected += 1;
        self.remember_both(ward, ruler, MemoryKind::Peace, 0.1);
        let line = format!(
            "\u{1F451} The {} sought the protection of the {} and joined {name}.",
            self.tribe_name(ward),
            self.tribe_name(ruler)
        );
        self.nation_line(line);
    }

    fn unite_allies(&mut self, census: &Census) {
        let now = self.tick_count;
        let mut candidates: BTreeSet<(String, String)> = BTreeSet::new();
        for t in &self.treaties {
            if matches!(
                t.kind,
                TreatyKind::Alliance | TreatyKind::Defensive | TreatyKind::Trade
            ) && t.expires_tick > now
                && t.signed_tick + UNION_TREATY_AGE <= now
            {
                let pair = if t.lineage_a < t.lineage_b {
                    (t.lineage_a.clone(), t.lineage_b.clone())
                } else {
                    (t.lineage_b.clone(), t.lineage_a.clone())
                };
                candidates.insert(pair);
            }
        }
        let placed: Vec<(&String, &[i32; 2])> = census.centre.iter().collect();
        for (i, (a, ca)) in placed.iter().enumerate() {
            for (b, cb) in placed.iter().skip(i + 1) {
                if chebyshev(**ca, **cb) > KIN_REACH {
                    continue;
                }
                if self.opinion_in(census, a, b) >= KIN_WARMTH && self.opinion_in(census, b, a) >= KIN_WARMTH
                {
                    candidates.insert(((*a).clone(), (*b).clone()));
                }
            }
        }
        let mut used: BTreeSet<String> = BTreeSet::new();
        for (a, b) in candidates {
            if census.pop(&a) == 0 || census.pop(&b) == 0 || self.same_side(&a, &b) {
                continue;
            }
            let (ka, kb) = (self.actor_key(&a), self.actor_key(&b));
            if used.contains(&ka) || used.contains(&kb) {
                continue;
            }
            let (xs, ys) = (self.actor_of(&a), self.actor_of(&b));
            if self.at_war_between(&xs, &ys) {
                continue;
            }
            let (Some(cx), Some(cy)) = (self.actor_centre(census, &a), self.actor_centre(census, &b)) else {
                continue;
            };
            if chebyshev(cx, cy) > UNION_REACH {
                continue;
            }
            if self.actor_opinion(census, &xs, &ys) < UNION_WARMTH
                || self.actor_opinion(census, &ys, &xs) < UNION_WARMTH
            {
                continue;
            }
            used.insert(ka);
            used.insert(kb);
            self.unite(census, &a, &b);
        }
    }

    fn unite(&mut self, census: &Census, a: &str, b: &str) {
        let (xs, ys) = (self.actor_of(a), self.actor_of(b));
        let size = |ls: &[String]| ls.iter().map(|l| census.pop(l)).sum::<usize>();
        let (big, small, small_members) = if (size(&xs), b) >= (size(&ys), a) {
            (a, b, ys.clone())
        } else {
            (b, a, xs.clone())
        };
        let small_nation = self.nation_of(small).map(|n| (n.id, n.name.clone()));
        if let Some((id, _)) = small_nation {
            if let Some(i) = self.nation_index(id) {
                self.diplomacy.nations.remove(i);
            }
            self.index_nations();
        }
        let line = match self.diplomacy.nation_of.get(big).copied() {
            Some(id) => {
                if let Some(i) = self.nation_index(id) {
                    for m in &small_members {
                        if !self.diplomacy.nations[i].members.contains(m) {
                            self.diplomacy.nations[i].members.push(m.clone());
                        }
                    }
                }
                self.index_nations();
                let name = self.nation_of(big).map(|n| n.name.clone()).unwrap_or_default();
                match &small_nation {
                    Some((_, small_name)) => format!("\u{1F451} The nation of {small_name} joined {name}."),
                    None => format!("\u{1F451} The {} joined {name}.", self.tribe_name(small)),
                }
            }
            None => {
                let mut members = vec![big.to_string()];
                members.extend(small_members.iter().cloned());
                let id = self.found_nation(census, big, members);
                let name = self
                    .diplomacy
                    .nations
                    .iter()
                    .find(|n| n.id == id)
                    .map(|n| n.name.clone())
                    .unwrap_or_default();
                format!(
                    "\u{1F451} The {} and the {} united as {name}.",
                    self.tribe_name(big),
                    self.tribe_name(small)
                )
            }
        };
        self.diplomacy.stats.unions += 1;
        for x in &xs {
            for y in &ys {
                self.remember_both(x, y, MemoryKind::Peace, 0.1);
            }
        }
        self.nation_line(line);
    }

    fn cohesion_of(
        &self,
        census: &Census,
        nation: &crate::sim::civ::society::nations::Nation,
        member: &str,
    ) -> f32 {
        let capital = self
            .towns
            .iter()
            .find(|t| t.id == nation.capital)
            .map(|t| t.center)
            .or_else(|| census.centre.get(&nation.ruler).copied());
        let far = match (capital, census.centre.get(member)) {
            (Some(c), Some(m)) => ((chebyshev(c, *m) - CAPITAL_REACH).max(0) as f32) / FAR_SPAN,
            _ => 0.0,
        };
        let unrest = self.lineage_unrest.get(member).copied().unwrap_or(0.0) * 0.3;
        let weary = self.war_weariness(member) * 0.5;
        let grudge = (-self.opinion_in(census, member, &nation.ruler)).max(0.0) * 0.8;
        let stretch = nation.members.len().saturating_sub(COMFORTABLE_SIZE) as f32 * 0.01;
        1.0 - far - unrest - weary - grudge - stretch
    }

    fn split_nations(&mut self, census: &Census) {
        let mut breaks: Vec<(u32, String)> = Vec::new();
        for i in 0..self.diplomacy.nations.len() {
            let nation = self.diplomacy.nations[i].clone();
            let weakest = nation
                .members
                .iter()
                .filter(|m| **m != nation.ruler)
                .map(|m| (self.cohesion_of(census, &nation, m), m.clone()))
                .min_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));
            let cohesion = weakest.as_ref().map_or(1.0, |w| w.0);
            self.diplomacy.nations[i].cohesion = cohesion.clamp(0.0, 1.0);
            if let Some((c, member)) = weakest {
                if c < SPLIT_BELOW {
                    breaks.push((nation.id, member));
                }
            }
        }
        for (id, member) in breaks {
            let Some(nation) = self.diplomacy.nations.iter().find(|n| n.id == id).cloned() else {
                continue;
            };
            let bitter = self.opinion_in(census, &member, &nation.ruler) < CIVIL_WAR_BELOW;
            self.leave_nation(&member);
            self.diplomacy.stats.secessions += 1;
            let who = self.tribe_name(&member);
            if bitter {
                self.diplomacy.stats.civil_wars += 1;
                self.nation_line(format!(
                    "\u{2694}\u{FE0F} Civil war: the {who} rose against {} and broke away.",
                    nation.name
                ));
                let front = match (
                    census.centre.get(&member),
                    self.actor_centre(census, &nation.ruler),
                ) {
                    (Some(a), Some(b)) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                    (Some(a), None) => *a,
                    _ => [0, 0],
                };
                self.declare_war(&member, &nation.ruler, CasusBelli::Independence, front);
            } else {
                self.nation_line(format!(
                    "\u{1F3DA}\u{FE0F} The {who} left {} in peace.",
                    nation.name
                ));
            }
        }
    }
}

const SHOWN_RELATIONS: usize = 8;

impl Simulation {
    fn actor_name(&self, key: &str) -> String {
        match key.strip_prefix("n:").and_then(|id| id.parse::<u32>().ok()) {
            Some(id) => self
                .diplomacy
                .nations
                .iter()
                .find(|n| n.id == id)
                .map_or_else(String::new, |n| n.name.clone()),
            None => self.tribe_name(key),
        }
    }

    fn outward_key(&self, lineage: &str) -> String {
        self.diplomacy
            .nation_of
            .get(lineage)
            .map_or_else(|| lineage.to_string(), |id| format!("n:{id}"))
    }

    pub(crate) fn nation_relations(&self, nation: &Nation) -> Vec<(String, String, f32, &'static str)> {
        let tick = self.tick_count;
        let own = format!("n:{}", nation.id);
        let mut sums: BTreeMap<String, (f32, u32)> = BTreeMap::new();
        for m in &nation.members {
            for other in self.diplomacy.relations.others_of(m) {
                let key = self.outward_key(other);
                if key == own {
                    continue;
                }
                let e = sums.entry(key).or_insert((0.0, 0));
                e.0 += self.diplomacy.relations.standing(m, other);
                e.1 += 1;
            }
        }
        let mut status: BTreeMap<String, &'static str> = BTreeMap::new();
        for t in self
            .treaties
            .iter()
            .filter(|t| t.signed_tick <= tick && t.expires_tick > tick)
        {
            let (mine, theirs, vassal_mine) = if nation.members.contains(&t.lineage_a) {
                (&t.lineage_a, &t.lineage_b, true)
            } else if nation.members.contains(&t.lineage_b) {
                (&t.lineage_b, &t.lineage_a, false)
            } else {
                continue;
            };
            let key = self.outward_key(theirs);
            if key == own || mine == theirs {
                continue;
            }
            let word = match t.kind {
                TreatyKind::Alliance | TreatyKind::Defensive => "allied",
                TreatyKind::Vassalage if vassal_mine => "overlord",
                TreatyKind::Vassalage => "vassal",
                TreatyKind::NonAggression | TreatyKind::Trade => "peace",
            };
            status.entry(key).or_insert(word);
        }
        for w in self.diplomacy.wars.iter().filter(|w| w.active()) {
            let other = if nation.members.contains(&w.attacker) {
                &w.defender
            } else if nation.members.contains(&w.defender) {
                &w.attacker
            } else {
                continue;
            };
            let key = self.outward_key(other);
            if key != own {
                status.insert(key, "war");
            }
        }
        let mut keys: BTreeSet<String> = sums.keys().cloned().collect();
        keys.extend(status.keys().cloned());
        let mut rows: Vec<(String, String, f32, &'static str)> = keys
            .into_iter()
            .map(|key| {
                let opinion = sums.get(&key).map_or(0.0, |(s, n)| s / *n as f32);
                let word = status.get(&key).copied().unwrap_or("");
                (self.actor_name(&key), key, opinion, word)
            })
            .filter(|(_, _, opinion, word)| !word.is_empty() || opinion.abs() >= 0.05)
            .map(|(name, key, opinion, word)| (key, name, opinion, word))
            .collect();
        rows.sort_by(|a, b| {
            (b.3 == "war")
                .cmp(&(a.3 == "war"))
                .then(b.2.abs().total_cmp(&a.2.abs()))
                .then(a.0.cmp(&b.0))
        });
        rows.truncate(SHOWN_RELATIONS);
        rows
    }

    pub(crate) fn nations_json(&self) -> serde_json::Value {
        let list: Vec<serde_json::Value> = self
            .diplomacy
            .nations
            .iter()
            .map(|n| {
                let towns: Vec<u32> = self
                    .towns
                    .iter()
                    .filter(|t| n.members.contains(&t.lineage))
                    .map(|t| t.id)
                    .collect();
                let capital_at = self.towns.iter().find(|t| t.id == n.capital).map(|t| t.center);
                let relations: Vec<serde_json::Value> = self
                    .nation_relations(n)
                    .into_iter()
                    .map(|(with, name, opinion, status)| {
                        serde_json::json!({
                            "with": with,
                            "name": name,
                            "opinion": (opinion * 100.0).round() / 100.0,
                            "status": status,
                        })
                    })
                    .collect();
                serde_json::json!({
                    "id": n.id,
                    "name": n.name,
                    "colour": n.colour,
                    "capital": n.capital,
                    "capital_at": capital_at,
                    "ruler": n.ruler,
                    "members": n.members,
                    "towns": towns,
                    "founded_tick": n.founded_tick,
                    "cohesion": (n.cohesion * 100.0).round() / 100.0,
                    "relations": relations,
                })
            })
            .collect();
        serde_json::Value::Array(list)
    }
}

#[cfg(test)]
#[path = "nations_tests.rs"]
mod tests;
