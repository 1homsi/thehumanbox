use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::organism::organism::Sex;
use crate::sim::agents::age_stage::AgeStage;
use crate::sim::civ::society::nations::NATION_STEP;
use crate::sim::civ::society::relations::MemoryKind;
use crate::sim::civ::trade_routes::route_is_embargoed;
use crate::sim::civ::warfare::{Treaty, TreatyKind};
use crate::sim::cosmos::YEAR_LENGTH_TICKS;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

pub const RULER_PHASE: u64 = 1_000;
const TRAIT_AT: f32 = 0.62;
const MILD_AT: f32 = 0.38;
const MAX_TRAITS: usize = 2;
const MARRIAGE_WARMTH: f32 = 0.0;
const MARRIAGE_REACH: i32 = 160;
const MARRIAGE_CHANCE: u64 = 20;
const DIPLOMAT_CHANCE: u64 = 20;
const MARRIAGE_GAP: u64 = YEAR_LENGTH_TICKS;
const ALLIANCE_TICKS: u64 = YEAR_LENGTH_TICKS;
const MAX_MARRIAGES: usize = 32;
const MAX_CLAIMS: usize = 32;
pub const WARLIKE_AMBITION: f32 = 0.15;
pub const PEACEFUL_COHESION: f32 = 0.1;
pub const DIPLOMAT_WARMTH: f32 = 0.05;
pub const BUILDER_ROADS: u32 = 2;
pub const PIOUS_FAITH: u32 = 2;
const FAITH_REACH: i32 = 120;
const SHARED_FAITH: f32 = 0.02;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RulerTrait {
    Warlike,
    Peaceful,
    Diplomat,
    Builder,
    Pious,
}

impl RulerTrait {
    pub fn name(self) -> &'static str {
        match self {
            RulerTrait::Warlike => "warlike",
            RulerTrait::Peaceful => "peaceful",
            RulerTrait::Diplomat => "diplomat",
            RulerTrait::Builder => "builder",
            RulerTrait::Pious => "pious",
        }
    }

    fn words(self) -> &'static str {
        match self {
            RulerTrait::Warlike => "warlike",
            RulerTrait::Peaceful => "peace-loving",
            RulerTrait::Diplomat => "a matchmaker",
            RulerTrait::Builder => "a builder",
            RulerTrait::Pious => "devout",
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Sovereign {
    pub person: String,
    pub name: String,
    pub dynasty: String,
    pub house: String,
    pub generation: u16,
    pub since: u64,
    pub traits: Vec<RulerTrait>,
}

impl Sovereign {
    pub fn has(&self, t: RulerTrait) -> bool {
        self.traits.contains(&t)
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Claim {
    pub holder: u32,
    pub on: u32,
    pub house: String,
    pub since: u64,
    pub pressed: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct RoyalMarriage {
    pub a: u32,
    pub b: u32,
    pub tick: u64,
    pub spouses: [String; 2],
}

fn traits_of(o: &crate::organism::organism::Organism) -> Vec<RulerTrait> {
    let t = &o.traits;
    let mut scored: Vec<(f32, RulerTrait)> = Vec::new();
    if t.aggression >= TRAIT_AT {
        scored.push((t.aggression - TRAIT_AT, RulerTrait::Warlike));
    } else if t.aggression <= MILD_AT {
        scored.push((MILD_AT - t.aggression, RulerTrait::Peaceful));
    }
    if t.social_tendency >= TRAIT_AT {
        scored.push((t.social_tendency - TRAIT_AT, RulerTrait::Diplomat));
    }
    if t.curiosity >= TRAIT_AT {
        scored.push((t.curiosity - TRAIT_AT, RulerTrait::Builder));
    }
    if o.religion_id.is_some() && t.resilience >= TRAIT_AT {
        scored.push((t.resilience - TRAIT_AT, RulerTrait::Pious));
    }
    scored.sort_by(|a, b| b.0.total_cmp(&a.0).then(a.1.cmp(&b.1)));
    let mut out: Vec<RulerTrait> = scored.into_iter().take(MAX_TRAITS).map(|s| s.1).collect();
    out.sort();
    out
}

fn roll(seed: u64, tick: u64, a: u32, b: u32) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325 ^ seed;
    for v in [tick, u64::from(a), u64::from(b)] {
        for byte in v.to_le_bytes() {
            h ^= u64::from(byte);
            h = h.wrapping_mul(0x0100_0000_01b3);
        }
    }
    h % 100
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

impl Simulation {
    pub(crate) fn sovereign_of(&self, lineage: &str) -> Option<&Sovereign> {
        self.nation_of(lineage).and_then(|n| n.sovereign.as_ref())
    }

    pub(crate) fn ruled_by(&self, lineage: &str, t: RulerTrait) -> bool {
        self.sovereign_of(lineage).is_some_and(|s| s.has(t))
    }

    pub(crate) fn tick_rulers(&mut self) {
        if self.tick_count == 0 || self.tick_count % NATION_STEP != RULER_PHASE {
            return;
        }
        self.crown_rulers();
        self.arrange_marriages();
        self.spread_faith();
    }

    fn crown_rulers(&mut self) {
        let now = self.tick_count;
        let index: BTreeMap<&str, usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (o.id.as_str(), i))
            .collect();
        let mut lines: Vec<(String, String)> = Vec::new();
        let mut pressed: Vec<u32> = Vec::new();
        for n in 0..self.diplomacy.nations.len() {
            let nation = &self.diplomacy.nations[n];
            let leader = self
                .governments
                .get(&nation.ruler)
                .and_then(|g| g.leader_id.as_deref())
                .and_then(|id| index.get(id).copied());
            let Some(i) = leader else {
                continue;
            };
            let o = &self.organisms[i];
            if nation.sovereign.as_ref().is_some_and(|s| s.person == o.id) {
                continue;
            }
            let traits = traits_of(o);
            let before = nation.sovereign.clone();
            let heir = before.as_ref().is_some_and(|s| {
                o.parent_id == s.person || o.father_id.as_deref() == Some(s.person.as_str())
            });
            let (dynasty, house, generation) = match &before {
                Some(s) if heir => (s.dynasty.clone(), s.house.clone(), s.generation.saturating_add(1)),
                _ => (o.id.clone(), o.name.clone(), 1),
            };
            let name = o.name.clone();
            let realm = nation.name.clone();
            let id = nation.id;
            let words: Vec<&str> = traits.iter().map(|t| t.words()).collect();
            let character = if words.is_empty() {
                String::new()
            } else {
                format!(" ({})", words.join(", "))
            };
            let line = if heir || before.is_none() {
                format!("\u{1F451} {name} of the House of {house} now rules {realm}{character}.")
            } else {
                pressed.push(id);
                format!("\u{1F451} A new house takes the throne of {realm}: {name} of the House of {house}{character}.")
            };
            lines.push((realm, line));
            self.diplomacy.nations[n].sovereign = Some(Sovereign {
                person: self.organisms[i].id.clone(),
                name,
                dynasty,
                house,
                generation,
                since: now,
                traits,
            });
            self.diplomacy.stats.successions += 1;
            if !heir && before.is_some() {
                self.diplomacy.stats.new_dynasties += 1;
            }
        }
        for claim in self.diplomacy.claims.iter_mut() {
            if pressed.contains(&claim.on) && !claim.pressed {
                claim.pressed = true;
                self.diplomacy.stats.claims_pressed += 1;
            }
        }
        for (realm, line) in lines {
            push_event(&mut self.events, now, "milestone", &realm, &line);
        }
    }

    fn arrange_marriages(&mut self) {
        if self.diplomacy.nations.len() < 2 {
            return;
        }
        let now = self.tick_count;
        let capitals: BTreeMap<u32, [i32; 2]> = self
            .diplomacy
            .nations
            .iter()
            .filter_map(|n| {
                self.towns
                    .iter()
                    .find(|t| t.id == n.capital)
                    .map(|t| (n.id, t.center))
            })
            .collect();
        let recent: BTreeSet<(u32, u32)> = self
            .diplomacy
            .marriages
            .iter()
            .filter(|m| now.saturating_sub(m.tick) < MARRIAGE_GAP)
            .flat_map(|m| [(m.a, m.b), (m.b, m.a)])
            .collect();
        let nations: Vec<(u32, String, bool)> = self
            .diplomacy
            .nations
            .iter()
            .map(|n| {
                (
                    n.id,
                    n.ruler.clone(),
                    n.sovereign.as_ref().is_some_and(|s| s.has(RulerTrait::Diplomat)),
                )
            })
            .collect();
        let mut wed: BTreeSet<u32> = BTreeSet::new();
        for (i, (a, ra, da)) in nations.iter().enumerate() {
            for (b, rb, db) in nations.iter().skip(i + 1) {
                if wed.contains(a) || wed.contains(b) || recent.contains(&(*a, *b)) {
                    continue;
                }
                let (Some(&ca), Some(&cb)) = (capitals.get(a), capitals.get(b)) else {
                    continue;
                };
                if chebyshev(ca, cb) > MARRIAGE_REACH
                    || route_is_embargoed(self, ra, rb)
                    || self.diplomacy.relations.standing(ra, rb) < MARRIAGE_WARMTH
                    || self.diplomacy.relations.standing(rb, ra) < MARRIAGE_WARMTH
                {
                    continue;
                }
                let chance = MARRIAGE_CHANCE + DIPLOMAT_CHANCE * (u64::from(*da) + u64::from(*db));
                if roll(self.world_seed, now, *a, *b) >= chance {
                    continue;
                }
                if self.wed_houses(*a, ra, *b, rb, ca) {
                    wed.insert(*a);
                    wed.insert(*b);
                }
            }
        }
    }

    fn match_for(&self, lineage: &str, sex: Option<Sex>) -> Option<usize> {
        self.organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| {
                o.alive
                    && o.lineage_id == lineage
                    && o.partner_id.is_none()
                    && AgeStage::from_age(o.age, o.max_age) == AgeStage::Adult
                    && sex.is_none_or(|s| o.sex == s)
            })
            .min_by(|a, b| a.1.id.cmp(&b.1.id))
            .map(|(i, _)| i)
    }

    fn wed_houses(&mut self, a: u32, ra: &str, b: u32, rb: &str, home: [i32; 2]) -> bool {
        let Some(groom) = self.match_for(ra, None) else {
            return false;
        };
        let other = match self.organisms[groom].sex {
            Sex::Male => Sex::Female,
            Sex::Female => Sex::Male,
        };
        let Some(bride) = self.match_for(rb, Some(other)) else {
            return false;
        };
        let now = self.tick_count;
        let (gid, bid) = (self.organisms[groom].id.clone(), self.organisms[bride].id.clone());
        self.organisms[groom].partner_id = Some(bid.clone());
        self.organisms[bride].partner_id = Some(gid.clone());
        self.organisms[bride].home_x = home[0] as f32;
        self.organisms[bride].home_y = home[1] as f32;
        let names = [
            self.organisms[groom].name.clone(),
            self.organisms[bride].name.clone(),
        ];
        self.remember_both(ra, rb, MemoryKind::Marriage, 0.25);
        let allied = self.treaties.iter().any(|t| {
            t.kind == TreatyKind::Alliance
                && t.expires_tick > now
                && ((t.lineage_a == ra && t.lineage_b == rb) || (t.lineage_a == rb && t.lineage_b == ra))
        });
        if !allied {
            self.treaties.push(Treaty {
                lineage_a: ra.to_string(),
                lineage_b: rb.to_string(),
                kind: TreatyKind::Alliance,
                signed_tick: now,
                expires_tick: now + ALLIANCE_TICKS,
            });
        }
        let house = self
            .diplomacy
            .nations
            .iter()
            .find(|n| n.id == b)
            .and_then(|n| n.sovereign.as_ref())
            .map(|s| s.house.clone())
            .unwrap_or_default();
        self.diplomacy.claims.push(Claim {
            holder: a,
            on: b,
            house,
            since: now,
            pressed: false,
        });
        if self.diplomacy.claims.len() > MAX_CLAIMS {
            self.diplomacy.claims.remove(0);
        }
        self.diplomacy.marriages.push(RoyalMarriage {
            a,
            b,
            tick: now,
            spouses: names.clone(),
        });
        if self.diplomacy.marriages.len() > MAX_MARRIAGES {
            self.diplomacy.marriages.remove(0);
        }
        self.diplomacy.stats.royal_marriages += 1;
        let realm = |id: u32| {
            self.diplomacy
                .nations
                .iter()
                .find(|n| n.id == id)
                .map(|n| n.name.clone())
                .unwrap_or_default()
        };
        let (na, nb) = (realm(a), realm(b));
        let line = format!(
            "\u{1F48D} {} of {na} wed {} of {nb}; the two crowns are allies, and {na} now has a claim on {nb}.",
            names[0], names[1]
        );
        push_event(&mut self.events, now, "milestone", &na, &line);
        true
    }

    pub(crate) fn pressed_claims(&self) -> BTreeSet<(String, String)> {
        let ruler = |id: u32| {
            self.diplomacy
                .nations
                .iter()
                .find(|n| n.id == id)
                .map(|n| n.ruler.clone())
        };
        self.diplomacy
            .claims
            .iter()
            .filter(|c| c.pressed)
            .filter_map(|c| Some((ruler(c.holder)?, ruler(c.on)?)))
            .collect()
    }

    pub(crate) fn drop_claim(&mut self, holder: &str, on: &str) {
        let (Some(&h), Some(&o)) = (
            self.diplomacy.nation_of.get(holder),
            self.diplomacy.nation_of.get(on),
        ) else {
            return;
        };
        self.diplomacy.claims.retain(|c| !(c.holder == h && c.on == o));
    }

    fn spread_faith(&mut self) {
        let mut faiths: BTreeMap<&str, BTreeMap<&str, usize>> = BTreeMap::new();
        let mut people: BTreeMap<&str, usize> = BTreeMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            *people.entry(o.lineage_id.as_str()).or_insert(0) += 1;
            if let Some(r) = o.religion_id.as_deref() {
                *faiths
                    .entry(o.lineage_id.as_str())
                    .or_default()
                    .entry(r)
                    .or_insert(0) += 1;
            }
        }
        let main: BTreeMap<String, String> = faiths
            .iter()
            .filter_map(|(l, m)| {
                let (r, n) = m.iter().max_by(|a, b| a.1.cmp(b.1).then(b.0.cmp(a.0)))?;
                (*n * 2 >= people.get(l).copied().unwrap_or(0)).then(|| ((*l).to_string(), (*r).to_string()))
            })
            .collect();
        let town_at: BTreeMap<[i32; 2], &str> = self
            .towns
            .iter()
            .map(|t| (t.center, t.lineage.as_str()))
            .collect();
        let mut links: BTreeSet<(String, String)> = BTreeSet::new();
        for e in self.road_net.edges.iter().filter(|e| e.complete()) {
            let (Some(&la), Some(&lb)) = (town_at.get(&e.from), town_at.get(&e.to)) else {
                continue;
            };
            if la != lb {
                links.insert((la.to_string(), lb.to_string()));
                links.insert((lb.to_string(), la.to_string()));
            }
        }
        let mut converts: Vec<(String, String, u32)> = Vec::new();
        for (from, to) in &links {
            let Some(faith) = main.get(from) else { continue };
            if main.get(to) == Some(faith) {
                continue;
            }
            let count = if self.ruled_by(from, RulerTrait::Pious) {
                PIOUS_FAITH
            } else {
                1
            };
            converts.push((to.clone(), faith.clone(), count));
        }
        for (lineage, faith, count) in converts {
            let mut left = count;
            let mut ids: Vec<usize> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(_, o)| {
                    o.alive && o.lineage_id == lineage && o.religion_id.as_deref() != Some(faith.as_str())
                })
                .map(|(i, _)| i)
                .collect();
            ids.sort_by_key(|&i| {
                (
                    self.organisms[i].religion_id.is_some(),
                    self.organisms[i].id.clone(),
                )
            });
            for i in ids {
                if left == 0 {
                    break;
                }
                self.organisms[i].religion_id = Some(faith.clone());
                left -= 1;
                self.diplomacy.stats.faith_converts += 1;
            }
        }
        let shared: Vec<(String, String)> = {
            let centres: BTreeMap<&str, [i32; 2]> = self
                .towns
                .iter()
                .map(|t| (t.lineage.as_str(), t.center))
                .collect();
            let list: Vec<(&String, &String)> = main.iter().collect();
            let mut out = Vec::new();
            for (i, (a, fa)) in list.iter().enumerate() {
                for (b, fb) in list.iter().skip(i + 1) {
                    let near = matches!(
                        (centres.get(a.as_str()), centres.get(b.as_str())),
                        (Some(ca), Some(cb)) if chebyshev(*ca, *cb) <= FAITH_REACH
                    );
                    if fa == fb && near {
                        out.push(((*a).clone(), (*b).clone()));
                    }
                }
            }
            out
        };
        for (a, b) in shared {
            self.remember_both(&a, &b, MemoryKind::SharedFaith, SHARED_FAITH);
        }
    }
}

#[cfg(test)]
#[path = "rulers_tests.rs"]
mod tests;
