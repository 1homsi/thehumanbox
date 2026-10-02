//! Tribes pray to the player. Every so often each tribe looks at what is
//! hurting it most (hunger, thirst, sickness, beasts at the door, drought,
//! dwindling numbers) and asks the gods for help. A power that meets the
//! need near the tribe answers the prayer: the tribe gives thanks and its
//! faith grows. A prayer left unanswered leaves the tribe feeling forsaken.
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use rand::RngExt;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// How often tribes look at their needs.
pub const PRAYER_CHECK_TICKS: u64 = 300;
/// How long the gods have to answer before the tribe gives up.
pub const PRAYER_LIFETIME: u64 = 1800;
/// Quiet time after a prayer is answered or forsaken.
pub const PRAYER_COOLDOWN: u64 = 900;
/// How close to the praying tribe a power must land to answer it.
pub const ANSWER_RADIUS: f32 = 22.0;
/// How long an answered prayer's blessing lasts.
pub const BLESSING_TICKS: u64 = 2400;
/// How long a forsaken tribe despairs.
pub const DESPAIR_TICKS: u64 = 1800;
/// A tribe stuck in one era this long asks for wisdom.
pub const STALLED_ERA_TICKS: u64 = 7200;
/// At or below this faith a tribe has given up on its gods.
pub const LOST_FAITH: i32 = -6;
/// Faith stays within these bounds.
const FAITH_RANGE: (i32, i32) = (-10, 30);
/// Quiet time between unasked gifts counting towards a tribe's faith.
const GIFT_COOLDOWN: u64 = 600;
/// Blessings and despair act on people at this cadence.
const MOOD_TICKS: u64 = 60;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrayerKind {
    Hunger,
    Thirst,
    Sickness,
    Danger,
    Rain,
    Children,
    Peace,
    Knowledge,
}

impl PrayerKind {
    pub fn name(self) -> &'static str {
        match self {
            PrayerKind::Hunger => "hunger",
            PrayerKind::Thirst => "thirst",
            PrayerKind::Sickness => "sickness",
            PrayerKind::Danger => "danger",
            PrayerKind::Rain => "rain",
            PrayerKind::Children => "children",
            PrayerKind::Peace => "peace",
            PrayerKind::Knowledge => "knowledge",
        }
    }

    /// What the tribe asks for, as it reads in the event log.
    fn plea(self) -> &'static str {
        match self {
            PrayerKind::Hunger => "pray for food",
            PrayerKind::Thirst => "pray for clean water",
            PrayerKind::Sickness => "pray for their sick",
            PrayerKind::Danger => "pray to be saved from the beasts",
            PrayerKind::Rain => "pray for rain",
            PrayerKind::Children => "pray for children",
            PrayerKind::Peace => "pray for the war to end",
            PrayerKind::Knowledge => "pray for wisdom",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Prayer {
    pub id: u32,
    pub lineage: String,
    pub kind: PrayerKind,
    pub x: i32,
    pub y: i32,
    pub created: u64,
    pub expires: u64,
}

/// Prayers, faith and cooldowns, saved with the world.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PrayerState {
    pub active: Vec<Prayer>,
    pub next_id: u32,
    /// Answered prayers minus forsaken ones, per lineage.
    pub faith: BTreeMap<String, i32>,
    pub quiet_until: BTreeMap<String, u64>,
    pub answered: u32,
    pub forsaken: u32,
    /// Tribes living under an answered prayer's blessing, until a tick.
    pub blessed_until: BTreeMap<String, u64>,
    /// Tribes despairing after a forsaken prayer, until a tick.
    pub despair_until: BTreeMap<String, u64>,
    /// The era each tribe was last seen in, and since when.
    pub era_since: BTreeMap<String, (u8, u64)>,
    /// Earliest tick an unasked gift may again raise a tribe's faith.
    pub gift_quiet_until: BTreeMap<String, u64>,
}

#[derive(Default)]
struct Needs {
    people: usize,
    x: f32,
    y: f32,
    hungry: usize,
    thirsty: usize,
    sick: usize,
}

impl Simulation {
    fn tribe_name(&self, lineage: &str) -> String {
        self.lineage_names
            .get(lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".to_string())
    }

    pub(crate) fn tick_prayers(&mut self) {
        let now = self.tick_count;
        self.settle_rain_prayers(now);
        self.expire_prayers(now);
        if now.is_multiple_of(MOOD_TICKS) {
            self.tick_blessings(now);
            self.gather_to_pray();
        }
        if !now.is_multiple_of(PRAYER_CHECK_TICKS) {
            return;
        }
        let mut needs: BTreeMap<String, Needs> = BTreeMap::new();
        for o in self
            .organisms
            .iter()
            .filter(|o| o.alive && !o.lineage_id.is_empty())
        {
            let n = needs.entry(o.lineage_id.clone()).or_default();
            n.people += 1;
            n.x += o.x;
            n.y += o.y;
            n.hungry += usize::from(o.energy < 0.45);
            n.thirsty += usize::from(o.hydration < 0.35);
            n.sick += usize::from(o.infection > 0.3 || !o.diseases.is_empty());
        }
        for (lineage, n) in needs {
            if self.prayers.active.iter().any(|p| p.lineage == lineage)
                || self.prayers.quiet_until.get(&lineage).is_some_and(|&t| now < t)
            {
                continue;
            }
            // A tribe that has lost faith rarely bothers praying; only real
            // desperation brings it to its knees.
            if self.prayers.faith.get(&lineage).is_some_and(|&f| f <= LOST_FAITH)
                && self.rng.random::<f32>() >= 0.1
            {
                continue;
            }
            let (cx, cy) = (n.x / n.people as f32, n.y / n.people as f32);
            let share = |k: usize| k as f32 / n.people as f32;
            let beasts = self
                .animals
                .iter()
                .filter(|a| a.alive && a.kind.hostile() && (a.x - cx).hypot(a.y - cy) < 16.0)
                .map(|a| if a.kind.monster() { 3 } else { 1 })
                .sum::<u32>();
            let mut best: Option<(f32, PrayerKind)> = None;
            let mut consider = |score: f32, kind: PrayerKind| {
                if score > 0.0 && best.is_none_or(|(s, _)| score > s) {
                    best = Some((score, kind));
                }
            };
            consider(
                if beasts >= 3 {
                    1.0 + beasts as f32 * 0.1
                } else {
                    0.0
                },
                PrayerKind::Danger,
            );
            consider((share(n.sick) - 0.25).max(0.0) * 3.0, PrayerKind::Sickness);
            consider((share(n.thirsty) - 0.3).max(0.0) * 2.5, PrayerKind::Thirst);
            consider((share(n.hungry) - 0.2).max(0.0) * 2.5, PrayerKind::Hunger);
            let at_war = self.battles.iter().any(|b| {
                b.ended_tick.is_none() && (b.attackers.contains(&lineage) || b.defenders.contains(&lineage))
            });
            consider(if at_war { 0.9 } else { 0.0 }, PrayerKind::Peace);
            let era = self.era(&lineage) as u8;
            let since = match self.prayers.era_since.get(&lineage) {
                Some(&(seen, since)) if seen == era => since,
                _ => {
                    self.prayers.era_since.insert(lineage.clone(), (era, now));
                    now
                }
            };
            consider(
                if now.saturating_sub(since) >= STALLED_ERA_TICKS {
                    0.25
                } else {
                    0.0
                },
                PrayerKind::Knowledge,
            );
            let raining = self.weather.kind >= 1;
            consider(
                if self.drought.active && !raining { 0.4 } else { 0.0 },
                PrayerKind::Rain,
            );
            consider(if n.people <= 4 { 0.3 } else { 0.0 }, PrayerKind::Children);
            let Some((_, kind)) = best else { continue };
            let id = self.prayers.next_id;
            self.prayers.next_id = id.wrapping_add(1);
            self.prayers.active.push(Prayer {
                id,
                lineage: lineage.clone(),
                kind,
                x: cx.round() as i32,
                y: cy.round() as i32,
                created: now,
                expires: now + PRAYER_LIFETIME,
            });
            let name = self.tribe_name(&lineage);
            push_event(&mut self.events, now, "prayer", &name, kind.plea());
        }
    }

    /// When rain comes by itself, prayers for rain are settled: nobody
    /// was forsaken, but the gods earned no thanks either.
    fn settle_rain_prayers(&mut self, now: u64) {
        let rained = self.weather.kind >= 1 || !self.drought.active;
        if !rained || !self.prayers.active.iter().any(|p| p.kind == PrayerKind::Rain) {
            return;
        }
        let settled: Vec<String> = self
            .prayers
            .active
            .iter()
            .filter(|p| p.kind == PrayerKind::Rain)
            .map(|p| p.lineage.clone())
            .collect();
        self.prayers.active.retain(|p| p.kind != PrayerKind::Rain);
        for lineage in settled {
            self.prayers.quiet_until.insert(lineage, now + PRAYER_COOLDOWN);
        }
        push_event(
            &mut self.events,
            now,
            "weather",
            "the sky",
            "the rains came by themselves",
        );
    }

    fn expire_prayers(&mut self, now: u64) {
        if !self
            .prayers
            .active
            .iter()
            .any(|p| now >= p.expires || !self.lineage_alive(&p.lineage))
        {
            return;
        }
        let (lapsed, kept): (Vec<Prayer>, Vec<Prayer>) = std::mem::take(&mut self.prayers.active)
            .into_iter()
            .partition(|p| now >= p.expires || !self.lineage_alive(&p.lineage));
        self.prayers.active = kept;
        for p in lapsed {
            if !self.lineage_alive(&p.lineage) {
                continue;
            }
            self.prayers.forsaken += 1;
            self.adjust_faith(&p.lineage, -1);
            self.prayers
                .quiet_until
                .insert(p.lineage.clone(), now + PRAYER_COOLDOWN);
            self.prayers
                .despair_until
                .insert(p.lineage.clone(), now + DESPAIR_TICKS);
            self.prayers.blessed_until.remove(&p.lineage);
            for o in self
                .organisms
                .iter_mut()
                .filter(|o| o.alive && o.lineage_id == p.lineage)
            {
                o.hope = (o.hope - 0.2).max(0.0);
                o.gratitude = (o.gratitude - 0.1).max(0.0);
                o.piety = (o.piety - 0.05).max(0.0);
                o.think("the gods did not answer us", now);
            }
            let name = self.tribe_name(&p.lineage);
            push_event(
                &mut self.events,
                now,
                "forsaken",
                &name,
                "feel forsaken by the gods",
            );
        }
    }

    /// Blessed tribes heal and stay fed; despairing tribes tire and lose
    /// heart. Both are gentle, lasting nudges rather than miracles.
    fn tick_blessings(&mut self, now: u64) {
        self.prayers.blessed_until.retain(|_, &mut until| now < until);
        self.prayers.despair_until.retain(|_, &mut until| now < until);
        if self.prayers.blessed_until.is_empty() && self.prayers.despair_until.is_empty() {
            return;
        }
        for o in self.organisms.iter_mut().filter(|o| o.alive) {
            if self.prayers.blessed_until.contains_key(&o.lineage_id) {
                o.health = (o.health + 0.03).min(1.0);
                o.energy = (o.energy + 0.02).min(1.0);
                o.infection *= 0.9;
                o.hope = o.hope.max(0.6);
            } else if self.prayers.despair_until.contains_key(&o.lineage_id) {
                o.energy = (o.energy - 0.015).max(0.1);
                o.hope = (o.hope - 0.02).max(0.0);
            }
        }
    }

    /// The gods' standing across the world: answered prayers minus
    /// forsaken ones.
    pub(crate) fn prayers_faith_total(&self) -> i32 {
        self.prayers.faith.values().sum()
    }

    /// While a tribe prays, some of its people drift to where the prayer
    /// was raised and gather there. It is a soft pull: hunger, thirst or
    /// danger still win, and nobody abandons a journey for it.
    fn gather_to_pray(&mut self) {
        use rand::RngExt;
        if self.prayers.active.is_empty() {
            return;
        }
        let spots: Vec<(String, i32, i32)> = self
            .prayers
            .active
            .iter()
            .map(|p| (p.lineage.clone(), p.x, p.y))
            .collect();
        for (lineage, x, y) in spots {
            for i in 0..self.organisms.len() {
                let o = &self.organisms[i];
                if !o.alive || o.lineage_id != lineage || o.journey.is_some() {
                    continue;
                }
                let d = (o.x - x as f32).hypot(o.y - y as f32);
                if !(3.0..=25.0).contains(&d) || o.energy < 0.5 || o.hydration < 0.5 {
                    continue;
                }
                if self.rng.random::<f32>() < 0.3 {
                    let jx = self.rng.random_range(-2..=2);
                    let jy = self.rng.random_range(-2..=2);
                    self.organisms[i].wander_target = Some((x + jx, y + jy));
                }
            }
        }
    }

    /// Help nobody asked for still counts: a tribe that feels the gods'
    /// kindness unprompted grows a little more faithful, which is how a
    /// tribe that lost its faith is won back.
    fn unasked_gifts(&mut self, kinds: &[PrayerKind], at: Option<(f32, f32)>, answered: &[String]) {
        let Some((x, y)) = at else { return };
        let gift = kinds.iter().any(|k| {
            matches!(
                k,
                PrayerKind::Hunger | PrayerKind::Thirst | PrayerKind::Sickness | PrayerKind::Knowledge
            )
        });
        if !gift {
            return;
        }
        let now = self.tick_count;
        let near: Vec<String> = self
            .lineage_aggregates
            .iter()
            .filter(|(lid, a)| {
                let (cx, cy) = a.center();
                a.population > 0
                    && (cx as f32 - x).hypot(cy as f32 - y) <= ANSWER_RADIUS
                    && !answered.contains(lid)
                    && !self.prayers.active.iter().any(|p| &p.lineage == *lid)
                    && self.prayers.gift_quiet_until.get(*lid).is_none_or(|&t| now >= t)
            })
            .map(|(lid, _)| lid.clone())
            .collect();
        let mut near = near;
        near.sort();
        for lineage in near {
            self.adjust_faith(&lineage, 1);
            self.prayers
                .gift_quiet_until
                .insert(lineage.clone(), now + GIFT_COOLDOWN);
            for o in self
                .organisms
                .iter_mut()
                .filter(|o| o.alive && o.lineage_id == lineage)
            {
                o.hope = (o.hope + 0.1).min(1.0);
                o.gratitude = (o.gratitude + 0.1).min(1.0);
            }
            let name = self.tribe_name(&lineage);
            push_event(
                &mut self.events,
                now,
                "answered",
                &name,
                "felt an unasked gift from the gods",
            );
        }
    }

    fn lineage_alive(&self, lineage: &str) -> bool {
        self.lineage_aggregates
            .get(lineage)
            .is_some_and(|a| a.population > 0)
    }

    /// Called after a power lands. `at` is where it landed, or `None` for
    /// powers that touch the whole world (weather, ending a drought).
    fn adjust_faith(&mut self, lineage: &str, delta: i32) {
        let f = self.prayers.faith.entry(lineage.to_string()).or_default();
        *f = (*f + delta).clamp(FAITH_RANGE.0, FAITH_RANGE.1);
    }

    pub(crate) fn answer_prayers(&mut self, kinds: &[PrayerKind], at: Option<(f32, f32)>) {
        if kinds.is_empty() {
            return;
        }
        let now = self.tick_count;
        let (answered, kept): (Vec<Prayer>, Vec<Prayer>) = std::mem::take(&mut self.prayers.active)
            .into_iter()
            .partition(|p| {
                kinds.contains(&p.kind)
                    && at.is_none_or(|(x, y)| (x - p.x as f32).hypot(y - p.y as f32) <= ANSWER_RADIUS)
            });
        self.prayers.active = kept;
        let mut answered_lineages: Vec<String> = Vec::new();
        for p in answered {
            self.prayers.answered += 1;
            self.adjust_faith(&p.lineage, 1);
            self.prayers
                .quiet_until
                .insert(p.lineage.clone(), now + PRAYER_COOLDOWN);
            self.prayers
                .blessed_until
                .insert(p.lineage.clone(), now + BLESSING_TICKS);
            self.prayers.despair_until.remove(&p.lineage);
            if p.kind == PrayerKind::Knowledge {
                // The answer to "how?" sticks: the stall clock starts over.
                self.prayers.era_since.remove(&p.lineage);
            }
            for o in self
                .organisms
                .iter_mut()
                .filter(|o| o.alive && o.lineage_id == p.lineage)
            {
                o.hope = (o.hope + 0.25).min(1.0);
                o.gratitude = (o.gratitude + 0.3).min(1.0);
                o.awe = (o.awe + 0.15).min(1.0);
                o.piety = (o.piety + 0.1).min(1.0);
                o.think("the gods heard our prayer", now);
            }
            let name = self.tribe_name(&p.lineage);
            let detail = format!("give thanks: the gods answered their {} prayer", p.kind.name());
            push_event(&mut self.events, now, "answered", &name, &detail);
            answered_lineages.push(p.lineage);
        }
        self.unasked_gifts(kinds, at, &answered_lineages);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tribe_sim() -> (Simulation, String) {
        let mut sim = Simulation::new(11);
        sim.animals.clear();
        sim.drought.active = false;
        let lineage = sim
            .organisms
            .iter()
            .find(|o| o.alive)
            .expect("a person")
            .lineage_id
            .clone();
        sim.organisms.retain(|o| o.lineage_id == lineage);
        for o in sim.organisms.iter_mut() {
            o.energy = 1.0;
            o.hydration = 1.0;
            o.infection = 0.0;
            o.diseases.clear();
        }
        sim.rebuild_lineage_aggregates();
        (sim, lineage)
    }

    fn check(sim: &mut Simulation) {
        sim.tick_count = (sim.tick_count / PRAYER_CHECK_TICKS + 1) * PRAYER_CHECK_TICKS;
        sim.tick_prayers();
    }

    #[test]
    fn a_hungry_tribe_prays_and_a_harvest_answers_it() {
        let (mut sim, lineage) = tribe_sim();
        check(&mut sim);
        assert!(sim.prayers.active.is_empty(), "a content tribe does not pray");
        for o in sim.organisms.iter_mut() {
            o.energy = 0.2;
        }
        check(&mut sim);
        let prayer = sim.prayers.active.first().expect("a prayer").clone();
        assert_eq!(prayer.kind, PrayerKind::Hunger);
        assert_eq!(prayer.lineage, lineage);
        let cmd = format!(
            r#"{{"cmd":"harvest","x":{},"y":{},"radius":6}}"#,
            prayer.x, prayer.y
        );
        sim.apply_command_json(&cmd);
        assert!(sim.prayers.active.is_empty());
        assert_eq!(sim.prayers.faith.get(&lineage), Some(&1));
        assert!(sim.organisms.iter().all(|o| o.gratitude >= 0.3));
    }

    #[test]
    fn a_far_away_power_does_not_answer_and_the_prayer_lapses() {
        let (mut sim, lineage) = tribe_sim();
        for o in sim.organisms.iter_mut() {
            o.infection = 0.8;
        }
        check(&mut sim);
        let prayer = sim.prayers.active.first().expect("a prayer").clone();
        assert_eq!(prayer.kind, PrayerKind::Sickness);
        let far = format!(
            r#"{{"cmd":"cure","x":{},"y":{},"radius":4}}"#,
            prayer.x + 120,
            prayer.y
        );
        sim.apply_command_json(&far);
        assert_eq!(sim.prayers.active.len(), 1);
        sim.tick_count = prayer.expires;
        sim.tick_prayers();
        assert!(sim.prayers.active.is_empty());
        assert_eq!(sim.prayers.faith.get(&lineage), Some(&-1));
        assert_eq!(sim.prayers.forsaken, 1);
    }

    #[test]
    fn rain_answers_a_drought_prayer_anywhere() {
        let (mut sim, _) = tribe_sim();
        sim.drought.active = true;
        check(&mut sim);
        assert_eq!(sim.prayers.active.first().map(|p| p.kind), Some(PrayerKind::Rain));
        sim.apply_command_json(r#"{"cmd":"weather","kind":"rain"}"#);
        assert!(sim.prayers.active.is_empty());
        assert_eq!(sim.prayers.answered, 1);
    }

    #[test]
    fn an_answered_prayer_blesses_and_a_forsaken_one_brings_despair() {
        let (mut sim, lineage) = tribe_sim();
        for o in sim.organisms.iter_mut() {
            o.energy = 0.2;
        }
        check(&mut sim);
        let prayer = sim.prayers.active[0].clone();
        sim.answer_prayers(&[PrayerKind::Hunger], Some((prayer.x as f32, prayer.y as f32)));
        assert!(sim.prayers.blessed_until.contains_key(&lineage));
        for o in sim.organisms.iter_mut() {
            o.health = 0.5;
        }
        sim.tick_count = (sim.tick_count / MOOD_TICKS + 1) * MOOD_TICKS;
        sim.tick_blessings(sim.tick_count);
        assert!(sim.organisms.iter().all(|o| o.health > 0.5));

        sim.tick_count += PRAYER_COOLDOWN;
        for o in sim.organisms.iter_mut() {
            o.energy = 0.2;
        }
        check(&mut sim);
        let expires = sim.prayers.active[0].expires;
        sim.tick_count = expires;
        sim.tick_prayers();
        assert!(sim.prayers.despair_until.contains_key(&lineage));
        assert!(!sim.prayers.blessed_until.contains_key(&lineage));
    }

    #[test]
    fn a_stalled_tribe_prays_for_wisdom_and_inspiration_answers() {
        let (mut sim, _) = tribe_sim();
        check(&mut sim);
        assert!(sim.prayers.active.is_empty());
        sim.tick_count += STALLED_ERA_TICKS;
        check(&mut sim);
        let prayer = sim.prayers.active.first().expect("a prayer").clone();
        assert_eq!(prayer.kind, PrayerKind::Knowledge);
        let cmd = format!(
            r#"{{"cmd":"inspire","x":{},"y":{},"radius":8}}"#,
            prayer.x, prayer.y
        );
        sim.apply_command_json(&cmd);
        assert!(sim.prayers.active.is_empty());
    }

    #[test]
    fn natural_rain_settles_rain_prayers_without_faith_or_blame() {
        let (mut sim, lineage) = tribe_sim();
        sim.drought.active = true;
        sim.weather.kind = 0;
        check(&mut sim);
        assert_eq!(sim.prayers.active.first().map(|p| p.kind), Some(PrayerKind::Rain));
        sim.weather.kind = 1;
        sim.tick_count += 1;
        sim.tick_prayers();
        assert!(sim.prayers.active.is_empty());
        assert_eq!(sim.prayers.faith.get(&lineage), None);
        assert_eq!(sim.prayers.forsaken, 0);
        // And nobody prays for rain while it is raining.
        sim.tick_count += PRAYER_COOLDOWN;
        check(&mut sim);
        assert!(sim.prayers.active.iter().all(|p| p.kind != PrayerKind::Rain));
    }

    #[test]
    fn a_praying_tribe_gathers_where_the_prayer_was_raised() {
        let (mut sim, _) = tribe_sim();
        for o in sim.organisms.iter_mut() {
            o.energy = 0.2;
        }
        check(&mut sim);
        let p = sim.prayers.active[0].clone();
        for (k, o) in sim.organisms.iter_mut().enumerate() {
            o.energy = 0.9;
            o.hydration = 0.9;
            o.journey = None;
            o.wander_target = None;
            o.x = (p.x + 10 + (k % 3) as i32) as f32;
            o.y = p.y as f32;
        }
        for _ in 0..10 {
            sim.gather_to_pray();
        }
        let drawn = sim
            .organisms
            .iter()
            .filter(|o| {
                o.wander_target
                    .is_some_and(|(tx, ty)| (tx - p.x).abs() <= 2 && (ty - p.y).abs() <= 2)
            })
            .count();
        assert!(drawn > 0, "some of the tribe heads for the prayer");
    }

    #[test]
    fn a_faithless_tribe_rarely_prays_and_unasked_gifts_win_it_back() {
        let (mut sim, lineage) = tribe_sim();
        sim.prayers.faith.insert(lineage.clone(), LOST_FAITH - 2);
        for o in sim.organisms.iter_mut() {
            o.energy = 0.2;
        }
        let mut prayed = 0;
        for _ in 0..40 {
            check(&mut sim);
            if sim.prayers.active.drain(..).next().is_some() {
                prayed += 1;
            }
            sim.prayers.quiet_until.clear();
        }
        assert!(prayed < 15, "a faithless tribe prayed {prayed} times in 40");

        // A harvest nobody asked for counts, once per cooldown.
        sim.rebuild_lineage_aggregates();
        let (cx, cy) = sim.lineage_aggregates[&lineage].center();
        let before = sim.prayers.faith[&lineage];
        let cmd = format!(r#"{{"cmd":"bless","x":{cx},"y":{cy},"radius":8}}"#);
        sim.apply_command_json(&cmd);
        sim.apply_command_json(&cmd);
        assert_eq!(sim.prayers.faith[&lineage], before + 1);
    }

    #[test]
    fn faith_stays_within_bounds() {
        let (mut sim, lineage) = tribe_sim();
        for _ in 0..50 {
            sim.adjust_faith(&lineage, -1);
        }
        assert_eq!(sim.prayers.faith[&lineage], FAITH_RANGE.0);
    }

    #[test]
    fn prayers_survive_save_and_load() {
        let (mut sim, _) = tribe_sim();
        for o in sim.organisms.iter_mut() {
            o.hydration = 0.1;
        }
        check(&mut sim);
        assert!(!sim.prayers.active.is_empty());
        let json = serde_json::to_string(&sim.to_save_state()).expect("save");
        let loaded = Simulation::from_save(11, serde_json::from_str(&json).expect("load"));
        assert_eq!(loaded.prayers, sim.prayers);
    }
}
