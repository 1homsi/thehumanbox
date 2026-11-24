use super::*;
use crate::sim::agents::family_outings::chebyshev;
use crate::sim::agents::routine::Activity;
use crate::sim::cosmos::DAY_LENGTH;

pub(crate) const TOWN_STEP: u64 = 8;

/// Longest closed step a region takes once it has been calm for a few days.
pub(crate) const COARSE_MAX: u64 = 64;

const CALM_EVERY: u64 = 60;

/// A town that has only just gone quiet keeps the 8-tick step. Longer quiet
/// stretches double it, up to a day-scale step, so a fresh calm patch still
/// resolves births on the old cadence.
pub(crate) fn step_for(calm_for: u64) -> u64 {
    if calm_for >= 1_800 {
        COARSE_MAX
    } else if calm_for >= 600 {
        32
    } else if calm_for >= 120 {
        16
    } else {
        TOWN_STEP
    }
}

const EVENT_REACH: i32 = 40;

const HOME_REACH: i32 = 30;

const FIRE_CELL: i32 = 16;

const WELL: f32 = 0.5;

const WORK_WELL: f32 = 0.6;

/// A coarse step only drains. The rates sit above a hard winter, and from 32
/// ticks up the person also needs a carried meal, so the granary trip is not
/// one of the ticks that got skipped.
const ENERGY_DRAIN_PER_TICK: f32 = 0.007;
const WATER_DRAIN_PER_TICK: f32 = 0.0035;
const CARRIED_MEAL: f32 = 0.30;
const CARRIED_DRINK: f32 = 0.18;
const STORE_FLOOR: f32 = 0.35;

fn stores_cover(o: &Organism, step: u64) -> bool {
    if step <= TOWN_STEP {
        return true;
    }
    let meals = u64::from(o.inv_food) + u64::from(o.tools.get("winter_provisions").copied().unwrap_or(0));
    let drinks = u64::from(o.inv_water);
    // 16 ticks can run on whatever still covers the drain. 32 wants a meal,
    // 64 wants two, and the longest step wants a drink as well.
    let need = step / 32;
    let drink_need = step / 64;
    if meals < need || drinks < drink_need {
        return false;
    }
    let span = step as f32;
    let energy = o.energy + meals as f32 * CARRIED_MEAL - ENERGY_DRAIN_PER_TICK * span;
    let hydration = o.hydration + drinks as f32 * CARRIED_DRINK - WATER_DRAIN_PER_TICK * span;
    energy > STORE_FLOOR && hydration > STORE_FLOOR
}

const UNITS_EVERY: u64 = 8;

const WAR_REACH: i32 = 48;

const HAMLET: i32 = 32;

const HAMLETS: u32 = 1 << 24;

type TownSpot = (u32, (i32, i32));

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Tier {
    Own,
    Idle,
    Step,
}

pub(crate) fn due(tick: u64, dt: u64, every: u64, phase: u64) -> bool {
    (tick + every - phase % every) % every < dt
}

/// How many of the `dt` ticks ending at `tick` land on `phase`. The window is
/// inclusive, so a 64-tick step does not drop the tick it lands on.
pub(crate) fn openings(tick: u64, dt: u64, every: u64, phase: u64) -> u64 {
    if dt == 0 || every == 0 {
        return 0;
    }
    let phase = phase % every;
    let start = tick.saturating_sub(dt - 1);
    let rem = start % every;
    let first = if rem <= phase {
        start + (phase - rem)
    } else {
        start + every - rem + phase
    };
    if first > tick {
        0
    } else {
        (tick - first) / every + 1
    }
}

pub(crate) fn chance(p: f32, dt: u64) -> f32 {
    if dt <= 1 {
        return p;
    }
    let mut miss = 1.0f32;
    for _ in 0..dt {
        miss *= 1.0 - p;
    }
    1.0 - miss
}

#[derive(Default)]
pub(crate) struct CalmMap {
    pub(crate) towns: HashSet<u32>,
    hot: Vec<(i32, i32)>,
    busy: HashSet<String>,
    foes: HashMap<String, Vec<(i32, i32)>>,
    /// Lineages in hunger, thirst or sickness. A hamlet of theirs is not calm.
    starving: HashSet<String>,
    /// Lineages whose granary spoiled empty. A granary that was simply used
    /// down to nothing is not a famine.
    famine: HashSet<crate::intern::Sym>,
    /// Tick when each calm town or hamlet last became quiet. The step length
    /// is derived from this, so it survives a refresh that finds the same region still calm.
    since: HashMap<u32, u64>,
    /// Fingerprint of the wake reasons. A change rebuilds the map on that tick
    /// instead of waiting out `CALM_EVERY`.
    stamp: u64,
}

/// One blocked resident clears the hamlet clock, whichever note is applied
/// last. A hamlet that is quiet all the way through keeps the start it had.
fn apply_since(since: &mut HashMap<u32, u64>, notes: impl Iterator<Item = (u32, bool)>, tick: u64) {
    let notes: Vec<(u32, bool)> = notes.collect();
    let mut blocked: Vec<u32> = notes
        .iter()
        .filter(|(_, quiet)| !quiet)
        .map(|(id, _)| *id)
        .collect();
    blocked.sort_unstable();
    blocked.dedup();
    for (id, quiet) in &notes {
        if *quiet && blocked.binary_search(id).is_err() {
            since.entry(*id).or_insert(tick);
        }
    }
    for id in &blocked {
        since.swap_remove(id);
    }
}

fn at_front(foes: &HashMap<String, Vec<(i32, i32)>>, lineage: &str, p: (i32, i32)) -> bool {
    foes.get(lineage)
        .is_some_and(|list| list.iter().any(|&f| chebyshev(f, p) <= WAR_REACH))
}

impl CalmMap {
    fn quiet_at(&self, p: (i32, i32)) -> bool {
        self.hot.iter().all(|&h| chebyshev(h, p) > EVENT_REACH)
    }
}

impl Simulation {
    /// How many ticks a calm town or hamlet skips between aggregate steps.
    pub(super) fn coarse_step(&self, id: u32) -> u64 {
        let Some(calm) = self.calm_towns.as_ref() else {
            return TOWN_STEP;
        };
        let Some(&since) = calm.since.get(&id) else {
            return TOWN_STEP;
        };
        step_for(self.tick_count.saturating_sub(since))
    }

    /// Wake reasons that must drop a calm region on the tick they appear.
    /// Counts and places only: no walk over the people.
    fn hot_stamp(&self) -> u64 {
        let mut h = 0xcbf2_9ce4_8422_2325u64;
        let mut mix = |v: u64| {
            h = (h ^ v).wrapping_mul(0x0000_0100_0000_01b3);
        };
        for battle in self.battles.iter().filter(|b| b.ended_tick.is_none()) {
            mix(battle.location.0 as u64);
            mix(battle.location.1 as u64);
        }
        for &(x, y, _) in &self.focus_points {
            mix(x as u64);
            mix(y as u64);
        }
        for &(x, y, _) in &self.flood_tiles {
            mix(x as u64);
            mix(y as u64);
        }
        for outbreak in &self.outbreaks {
            mix(outbreak.epicenter[0] as u64);
            mix(outbreak.epicenter[1] as u64);
            mix(outbreak.affected_count as u64);
        }
        let mut fires: Vec<(i32, i32)> = self
            .physics
            .fire_tiles()
            .filter(|&(x, y)| self.grid.get(x, y) == Tile::Fire)
            .map(|(x, y)| (x.div_euclid(FIRE_CELL), y.div_euclid(FIRE_CELL)))
            .collect();
        fires.sort_unstable();
        fires.dedup();
        for (cx, cy) in fires {
            mix(cx as u64);
            mix(cy as u64);
        }
        mix(self.festivals.len() as u64);
        mix(self.diplomacy.wars.iter().filter(|w| w.active()).count() as u64);
        for (lineage, peril) in &self.tribe_peril {
            mix(lineage
                .bytes()
                .fold(0u64, |acc, b| acc.wrapping_mul(131).wrapping_add(u64::from(b))));
            mix(peril.cause as u64);
        }
        for building in &self.buildings {
            if building.kind == crate::sim::tech::buildings::BuildingKind::Granary && building.stock == 0 {
                mix(u64::from(building.id));
                mix(building.spoiled_tick.unwrap_or(0));
            }
        }
        if let Some(id) = self.followed.as_deref() {
            mix(id
                .bytes()
                .fold(0u64, |acc, b| acc.wrapping_mul(131).wrapping_add(u64::from(b))));
            // The wakes they stand in, not the tile. Walking inside that set
            // does not rebuild the map; crossing into a town or a hamlet does.
            if let Some(o) = self.organisms.iter().find(|o| o.alive && o.id == id) {
                let at = (o.x as i32, o.y as i32);
                let near = self
                    .towns
                    .iter()
                    .filter(|t| chebyshev((t.center[0], t.center[1]), at) <= EVENT_REACH)
                    .map(|t| t.id)
                    .min();
                mix(u64::from(near.unwrap_or(u32::MAX)));
                let (cx, cy) = (at.0.div_euclid(HAMLET), at.1.div_euclid(HAMLET));
                let mut cells = Vec::new();
                for dy in -2..=2 {
                    for dx in -2..=2 {
                        let (hx, hy) = (cx + dx, cy + dy);
                        if hx < 0 || hy < 0 {
                            continue;
                        }
                        let center = (hx * HAMLET + HAMLET / 2, hy * HAMLET + HAMLET / 2);
                        if chebyshev(center, at) <= EVENT_REACH {
                            cells.push((hx as u32, hy as u32));
                        }
                    }
                }
                cells.sort_unstable();
                for (hx, hy) in cells {
                    mix(u64::from(hx));
                    mix(u64::from(hy));
                }
            }
        }
        h
    }

    pub(super) fn refresh_calm_towns(&mut self) {
        let stamp = self.hot_stamp();
        if self.calm_towns.as_ref().is_some_and(|c| c.stamp == stamp)
            && !self.tick_count.is_multiple_of(CALM_EVERY)
        {
            return;
        }
        if !self.lod {
            self.calm_towns = Some(CalmMap::default());
            self.lod_units.clear();
            return;
        }
        // A new wake reason drops cached homes on this tick. A periodic refresh
        // with the same reasons keeps them until the regular reassignment.
        let wake_changed = self.calm_towns.as_ref().is_none_or(|c| c.stamp != stamp);
        let old_since = self.calm_towns.take().map(|c| c.since).unwrap_or_default();
        if wake_changed {
            self.lod_units.clear();
        }
        let fronts: Vec<(&str, &str)> = self
            .diplomacy
            .wars
            .iter()
            .filter(|w| w.active())
            .flat_map(|w| {
                [
                    (w.attacker.as_str(), w.defender.as_str()),
                    (w.defender.as_str(), w.attacker.as_str()),
                ]
            })
            .collect();
        let mut foes: HashMap<String, Vec<(i32, i32)>> = HashMap::default();
        for (side, foe) in &fronts {
            let list = foes.entry(side.to_string()).or_default();
            list.extend(
                self.towns
                    .iter()
                    .filter(|e| e.lineage == *foe)
                    .map(|e| (e.center[0], e.center[1])),
            );
        }
        let busy: std::collections::BTreeSet<String> =
            self.festivals.iter().map(|f| f.lineage_id.clone()).collect();
        let mut hot: Vec<(i32, i32)> = self
            .battles
            .iter()
            .filter(|b| b.ended_tick.is_none())
            .map(|b| b.location)
            .collect();
        hot.extend(self.focus_points.iter().map(|&(x, y, _)| (x, y)));
        hot.extend(self.flood_tiles.iter().map(|&(x, y, _)| (x, y)));
        hot.extend(self.outbreaks.iter().map(|o| (o.epicenter[0], o.epicenter[1])));
        let mut fires: Vec<(i32, i32)> = self
            .physics
            .fire_tiles()
            .filter(|&(x, y)| self.grid.get(x, y) == Tile::Fire)
            .map(|(x, y)| (x.div_euclid(FIRE_CELL), y.div_euclid(FIRE_CELL)))
            .collect();
        fires.sort_unstable();
        fires.dedup();
        hot.extend(
            fires
                .into_iter()
                .map(|(cx, cy)| (cx * FIRE_CELL + FIRE_CELL / 2, cy * FIRE_CELL + FIRE_CELL / 2)),
        );
        if let Some(id) = self.followed.as_deref() {
            if let Some(o) = self.organisms.iter().find(|o| o.alive && o.id == id) {
                hot.push((o.x as i32, o.y as i32));
            }
        }
        let starving: HashSet<String> = self
            .tribe_peril
            .iter()
            .filter(|(_, peril)| {
                matches!(
                    peril.cause,
                    crate::sim::civ::peril::PerilCause::Hunger
                        | crate::sim::civ::peril::PerilCause::Thirst
                        | crate::sim::civ::peril::PerilCause::Sickness
                )
            })
            .map(|(lineage, _)| lineage.clone())
            .collect();
        let famine: HashSet<crate::intern::Sym> = self
            .buildings
            .iter()
            .filter(|b| {
                b.kind == crate::sim::tech::buildings::BuildingKind::Granary
                    && b.is_operational()
                    && b.stock == 0
                    && b.spoiled_tick.is_some()
            })
            .filter_map(|b| b.owner_lineage)
            .collect();
        let towns: HashSet<u32> = self
            .towns
            .iter()
            .filter(|t| {
                !busy.contains(t.lineage.as_str())
                    && !starving.contains(t.lineage.as_str())
                    && !famine.contains(&t.lineage)
                    && !at_front(&foes, &t.lineage, (t.center[0], t.center[1]))
            })
            .filter(|t| {
                hot.iter()
                    .all(|&h| chebyshev(h, (t.center[0], t.center[1])) > EVENT_REACH)
            })
            .map(|t| t.id)
            .collect();
        let tick = self.tick_count;
        let mut since: HashMap<u32, u64> = HashMap::default();
        for (&id, &started) in &old_since {
            if id >= HAMLETS {
                since.insert(id, started);
            }
        }
        for &id in &towns {
            let started = old_since.get(&id).copied().unwrap_or(tick);
            since.insert(id, started);
        }
        let map = CalmMap {
            towns,
            hot,
            foes,
            busy: busy.into_iter().collect(),
            starving,
            famine,
            since,
            stamp,
        };
        self.calm_towns = Some(map);
    }

    pub(super) fn calm_town_of_each(&mut self) -> Vec<Option<u32>> {
        let n = self.organisms.len();
        if !self.lod {
            return vec![None; n];
        }
        if self.lod_units.len() != n
            || self.tick_count.is_multiple_of(UNITS_EVERY)
            || self.tick_count % 1200 == 1
        {
            self.lod_units = self.home_units();
        }
        let riders: HashSet<&str> = self
            .vehicles
            .iter()
            .flat_map(|v| v.occupants.iter().map(String::as_str))
            .collect();
        let phase = self.tick_count % DAY_LENGTH;
        self.organisms
            .iter()
            .zip(&self.lod_units)
            .map(|(o, &unit)| {
                // Travellers stay on the per-tick path. Folding a journey into
                // the coarse step pulled people off the meetings where births
                // happen.
                let settled = o.alive
                    && o.journey.is_none()
                    && o.mounted_vehicle.is_none()
                    && o.water_ticks == 0
                    && o.last_action.is_some()
                    && o.energy >= WELL
                    && o.hydration >= WELL
                    && !riders.contains(o.id.as_str())
                    && o.routine.is_some_and(|r| {
                        r.activity_at(phase) != Activity::Work
                            || (o.energy >= WORK_WELL && !o.work.is_some_and(|plan| plan.skill.feeds()))
                    });
                // An empty pocket on a long step drains through the meal they
                // would have fetched. The 8-tick step is short enough that the
                // floor still holds; longer ones need the food in hand.
                unit.filter(|&id| settled && stores_cover(o, self.coarse_step(id)))
            })
            .collect()
    }

    fn home_units(&mut self) -> Vec<Option<u32>> {
        let n = self.organisms.len();
        let assigned = {
            let Some(calm) = self.calm_towns.as_ref() else {
                return vec![None; n];
            };
            let mut towns: HashMap<&str, Vec<TownSpot>> = HashMap::default();
            for t in &self.towns {
                towns
                    .entry(t.lineage.as_str())
                    .or_default()
                    .push((t.id, (t.center[0], t.center[1])));
            }
            let organisms = &self.organisms;
            crate::sim::par::map_with(
                n,
                || (),
                |_, i| {
                    let o = &organisms[i];
                    if !o.alive {
                        return (None, None);
                    }
                    let home = (o.home_x as i32, o.home_y as i32);
                    let town = towns.get(o.lineage_id.as_str()).and_then(|list| {
                        list.iter()
                            .filter(|&&(_, c)| chebyshev(c, home) <= HOME_REACH)
                            .min_by_key(|&&(id, c)| (chebyshev(c, home), id))
                    });
                    match town {
                        Some(&(id, _)) => (calm.towns.contains(&id).then_some(id), None),
                        None => {
                            let (cx, cy) = (home.0.div_euclid(HAMLET), home.1.div_euclid(HAMLET));
                            let id = HAMLETS + (cy.max(0) as u32) * 1024 + cx.max(0) as u32;
                            let blocked = calm.busy.contains(o.lineage_id.as_str())
                                || calm.starving.contains(o.lineage_id.as_str())
                                || calm.famine.contains(&o.lineage_id)
                                || at_front(
                                    &calm.foes,
                                    &o.lineage_id,
                                    (cx * HAMLET + HAMLET / 2, cy * HAMLET + HAMLET / 2),
                                );
                            if blocked {
                                // Drop the quiet clock so the hamlet restarts at
                                // the short step once the interruption ends.
                                return (None, Some((id, false)));
                            }
                            let quiet = calm.quiet_at((cx * HAMLET + HAMLET / 2, cy * HAMLET + HAMLET / 2));
                            (quiet.then_some(id), Some((id, quiet)))
                        }
                    }
                },
            )
        };
        let tick = self.tick_count;
        if let Some(calm) = self.calm_towns.as_mut() {
            apply_since(
                &mut calm.since,
                assigned.iter().filter_map(|(_, note)| *note),
                tick,
            );
        }
        assigned.into_iter().map(|(unit, _)| unit).collect()
    }

    pub(super) fn town_tiers(&self, towns: &[Option<u32>], awake: &[bool]) -> Vec<Tier> {
        let tick = self.tick_count;
        towns
            .iter()
            .zip(awake)
            .map(|(town, &awake)| match town {
                Some(id) if !awake => {
                    if (tick + u64::from(*id)).is_multiple_of(self.coarse_step(*id)) {
                        Tier::Step
                    } else {
                        Tier::Idle
                    }
                }
                _ => Tier::Own,
            })
            .collect()
    }

    pub(crate) fn on_minute(&self, every: u64, phase: u64) -> bool {
        due(self.tick_count, self.turn_dt.max(1), every, phase)
    }

    pub(super) fn turn_gap(&self, idx: usize) -> u64 {
        let last = self.organisms[idx].lod_turn;
        if last == 0 || last >= self.tick_count {
            1
        } else {
            self.tick_count - last
        }
    }

    /// A long step skips the turn where someone with nothing to do would pick
    /// up a game. Hand the game out here and let the glide walk them. A
    /// finished game is dropped without asking for a full turn on the next tick.
    pub(super) fn hand_out_pastimes(&mut self, tiers: &[Tier]) {
        use crate::organism::mind::Purpose;
        let night = self.is_night() || self.weather.kind >= 2;
        let tick = self.tick_count;
        for (i, &tier) in tiers.iter().enumerate() {
            if tier != Tier::Idle {
                continue;
            }
            let Some(id) = self.lod_units.get(i).copied().flatten() else {
                continue;
            };
            if self.coarse_step(id) <= TOWN_STEP {
                continue;
            }
            let o = &self.organisms[i];
            if !o.alive {
                continue;
            }
            let mut hold = false;
            if let Some(intent) = o.intent {
                if intent.purpose != Purpose::Play {
                    hold = true;
                } else {
                    let here = (o.x as i32, o.y as i32);
                    let done = night || tick >= intent.until || intent.arrived(here, &self.grid);
                    if !done {
                        hold = true;
                    } else {
                        self.organisms[i].intent = None;
                        hold = night;
                    }
                }
            } else if night {
                hold = true;
            }
            if !hold {
                let o = &self.organisms[i];
                let here = (o.x as i32, o.y as i32);
                let on_errand = o.journey.is_none()
                    && o.is_rooted()
                    && o.wander_target.is_some_and(|t| {
                        let gap = chebyshev(here, t);
                        gap > 3
                            && gap <= crate::organism::mind::ERRAND_REACH
                            && !o.route.borrow().recently_blocked(t)
                    });
                if !on_errand {
                    if let Some(game) = self.pastime(i) {
                        let thought = game.thought;
                        let o = &mut self.organisms[i];
                        o.intent = Some(game);
                        if o.thought != thought {
                            o.thought = thought.to_string();
                        }
                    }
                }
            }
            self.note_occupation(i);
        }
    }

    /// The step turn is what used to mark a game, or the job of someone who has
    /// reached their spot. Record that on the idle ticks so a long step does
    /// not leave them standing with nothing to do.
    fn note_occupation(&mut self, i: usize) {
        use crate::organism::mind::Purpose;
        let o = &self.organisms[i];
        let here = (o.x as i32, o.y as i32);
        let phase = self.tick_count % DAY_LENGTH;
        if let Some(plan) = o.work {
            if o.routine.is_some_and(|r| r.activity_at(phase) == Activity::Work) && plan.at_spot(here) {
                let (action, doing) = plan.action();
                let Ok(action) = u16::try_from(action) else {
                    return;
                };
                let o = &mut self.organisms[i];
                o.last_action = Some(action);
                if o.thought != doing {
                    o.thought = doing.to_string();
                }
                return;
            }
        }
        if o.intent.is_some_and(|intent| intent.purpose == Purpose::Play) {
            self.organisms[i].last_action = Some(113);
            return;
        }
        let resting = match o.intent {
            Some(intent) => {
                intent.stays
                    && intent.arrive == Some(17)
                    && self.tick_count < intent.until
                    && intent.arrived(here, &self.grid)
            }
            None => {
                o.journey.is_none()
                    && o.last_action.is_some_and(|action| action < 8)
                    && o.routine.is_some_and(|r| {
                        r.activity_at(phase) == Activity::Sleep
                            && r.place_of(Activity::Sleep)
                                .is_some_and(|home| chebyshev(here, home) <= 2)
                    })
            }
        };
        if resting && o.last_action != Some(17) {
            let o = &mut self.organisms[i];
            o.last_action = Some(17);
            if o.thought != "resting" {
                o.thought = "resting".to_string();
            }
        }
    }

    pub(super) fn glide(&mut self, tiers: &[Tier]) {
        let phase = self.tick_count % DAY_LENGTH;
        for (i, &tier) in tiers.iter().enumerate() {
            if tier != Tier::Idle {
                continue;
            }
            let o = &self.organisms[i];
            let Some(r) = o.routine else {
                continue;
            };
            let activity = r.activity_at(phase);
            let here = (o.x as i32, o.y as i32);
            if o.hydration < crate::sim::agents::routine::FETCH_WATER {
                continue;
            }
            let purpose = o.intent.filter(|intent| self.tick_count < intent.until);
            if purpose.is_none() && o.intent.is_some() {
                let o = &mut self.organisms[i];
                o.intent = None;
                o.rethink = true;
                continue;
            }
            let bound = o.wander_target.filter(|_| purpose.is_none());
            if bound.is_some() && o.journey.is_none() && !o.is_rooted() {
                continue;
            }
            let bound = bound.filter(|&t| {
                o.journey.is_some() || chebyshev(here, t) <= crate::organism::mind::ERRAND_REACH
            });
            if let Some(target) = bound {
                if chebyshev(here, target) > 2 {
                    if let Some(action) = o.dry_way(crate::organism::mind::Purpose::Roam, target, &self.grid)
                    {
                        let (dx, dy) = DIRECTIONS[action];
                        let o = &mut self.organisms[i];
                        o.x = (here.0 + dx) as f32;
                        o.y = (here.1 + dy) as f32;
                    }
                } else if o.journey.is_some() {
                    self.organisms[i].rethink = true;
                }
                continue;
            }
            let target = match (purpose, activity, o.work) {
                (Some(intent), _, _) => Some(intent.target),
                (None, Activity::Work, Some(plan)) => Some(plan.spot),
                _ => r.place_of(activity),
            };
            let Some(target) = target else {
                continue;
            };
            let gap = chebyshev(here, target);
            if let Some(intent) = purpose {
                if intent.arrived(here, &self.grid) {
                    if !intent.stays {
                        self.organisms[i].rethink = true;
                    }
                    continue;
                }
            } else {
                // A work spot is one tile. The usual two-tile settle leaves a
                // long step standing short of it, and the turn that would have
                // closed the gap is the one being skipped.
                let reach = if activity == Activity::Work
                    && o.work.is_some()
                    && self
                        .lod_units
                        .get(i)
                        .copied()
                        .flatten()
                        .is_some_and(|id| self.coarse_step(id) > TOWN_STEP)
                {
                    0
                } else {
                    2
                };
                if self.organisms[i].route.get_mut().settles(target, gap, reach) {
                    continue;
                }
            }
            let planned = purpose.is_some() || self.organisms[i].route.get_mut().has_plan_for(target);
            if planned {
                let o = &self.organisms[i];
                let kind = purpose.map_or(crate::organism::mind::Purpose::Duty, |intent| intent.purpose);
                match o.dry_way(kind, target, &self.grid) {
                    Some(action) => {
                        let (dx, dy) = DIRECTIONS[action];
                        let o = &mut self.organisms[i];
                        o.x = (here.0 + dx) as f32;
                        o.y = (here.1 + dy) as f32;
                    }
                    None if purpose.is_some() => {
                        let o = &mut self.organisms[i];
                        o.intent = None;
                        o.rethink = true;
                    }
                    None => {}
                }
                continue;
            }
            let reach = |p: (i32, i32)| {
                (
                    chebyshev(p, target),
                    (p.0 - target.0).abs() + (p.1 - target.1).abs(),
                )
            };
            let best = DIRECTIONS
                .iter()
                .map(|&(dx, dy)| (here.0 + dx, here.1 + dy))
                .filter(|&(x, y)| {
                    let tile = self.grid.get(x, y);
                    tile.walkable() && !self.grid.is_wet(tile, x, y)
                })
                .min_by_key(|&p| reach(p));
            if let Some(p) = best.filter(|&p| reach(p) < reach(here)) {
                let o = &mut self.organisms[i];
                o.x += (p.0 - here.0) as f32;
                o.y += (p.1 - here.1) as f32;
            }
        }
    }

    /// Conception keeps the old 8-tick cadence while the rest of a long step is
    /// skipped. The step's own turn rolls as well; this covers the idle ticks,
    /// so a quiet stretch does not lower the birth rate.
    pub(super) fn coarse_conceptions(
        &mut self,
        tiers: &[Tier],
        mut slots_used: usize,
        lineage_counts: &mut FxHashMap<crate::intern::Sym, usize>,
        org_idx_by_id: &FxHashMap<crate::intern::Sym, usize>,
    ) {
        let tick = self.tick_count;
        // A region still on the 8-tick step rolls inside its own turn. Once the
        // step is longer, the idle ticks in between keep that same phase so the
        // quiet stretch does not drop a conception check.
        let due: Vec<usize> = (0..tiers.len())
            .filter(|&i| {
                tiers[i] == Tier::Idle
                    && (tick + i as u64).is_multiple_of(TOWN_STEP)
                    && self
                        .lod_units
                        .get(i)
                        .and_then(|id| *id)
                        .is_some_and(|id| self.coarse_step(id) > TOWN_STEP)
            })
            .filter(|&i| {
                self.organisms
                    .get(i)
                    .is_some_and(|o| o.alive && o.sex == crate::organism::organism::Sex::Female)
            })
            .collect();
        for idx in due {
            if slots_used >= self.population_limit {
                break;
            }
            let before = self.organisms.len();
            crate::sim::growth::try_reproduce(
                idx,
                &mut self.organisms,
                &self.grid,
                tick,
                &mut self.events,
                &mut self.rng,
                crate::sim::growth::ReproductionPopulation {
                    slots_used,
                    limit: self.population_limit,
                    lineage_counts,
                    org_idx_by_id,
                },
            );
            let added = self.organisms.len().saturating_sub(before);
            if added > 0 {
                for child in &self.organisms[before..] {
                    if super::growth::is_pending_birth(child) {
                        *lineage_counts.entry(child.lineage_id).or_insert(0) += 1;
                    }
                }
                slots_used += added;
            }
        }
    }

    /// Walk one person up to `steps` tiles along the routine they would have
    /// followed on the idle ticks a coarse step skipped.
    #[cfg(test)]
    pub(super) fn stride(&mut self, idx: usize, steps: u64) {
        let phase = self.tick_count % DAY_LENGTH;
        let Some(target) = self.stride_target(idx, phase) else {
            return;
        };
        for _ in 0..steps {
            if !self.step_toward(idx, target) {
                break;
            }
        }
    }

    /// A journey in progress is the walk the skipped ticks would have taken.
    /// Otherwise the person keeps to the routine place.
    #[cfg(test)]
    fn stride_target(&self, idx: usize, phase: u64) -> Option<(i32, i32)> {
        let o = &self.organisms[idx];
        if let Some(journey) = &o.journey {
            return Some(journey.target);
        }
        self.routine_target(idx, phase)
    }

    #[cfg(test)]
    fn routine_target(&self, idx: usize, phase: u64) -> Option<(i32, i32)> {
        let o = &self.organisms[idx];
        let r = o.routine?;
        let activity = r.activity_at(phase);
        match (activity, o.work) {
            (Activity::Work, Some(plan)) => Some(plan.spot),
            _ => r.place_of(activity),
        }
    }

    /// One greedy step toward `target`, the same step the idle glide takes.
    /// Returns whether the person moved.
    #[cfg(test)]
    fn step_toward(&mut self, idx: usize, target: (i32, i32)) -> bool {
        let o = &self.organisms[idx];
        let here = (o.x as i32, o.y as i32);
        if chebyshev(here, target) <= 2 {
            return false;
        }
        let reach = |p: (i32, i32)| {
            (
                chebyshev(p, target),
                (p.0 - target.0).abs() + (p.1 - target.1).abs(),
            )
        };
        let best = DIRECTIONS
            .iter()
            .map(|&(dx, dy)| (here.0 + dx, here.1 + dy))
            .filter(|&(x, y)| {
                let tile = self.grid.get(x, y);
                tile.walkable() && !self.grid.is_wet(tile, x, y)
            })
            .min_by_key(|&p| reach(p));
        if let Some(p) = best.filter(|&p| reach(p) < reach(here)) {
            let o = &mut self.organisms[idx];
            o.x += (p.0 - here.0) as f32;
            o.y += (p.1 - here.1) as f32;
            true
        } else {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_window_of_one_tick_is_the_old_minute_check() {
        for tick in 0..200u64 {
            for phase in 0..7u64 {
                assert_eq!(due(tick, 1, 7, phase), tick % 7 == phase % 7);
            }
        }
    }

    #[test]
    fn a_long_window_counts_the_tick_it_lands_on() {
        assert_eq!(openings(128, 64, 7, 2), 10);
        assert_eq!(openings(129, 64, 7, 2), 9);
    }

    #[test]
    fn one_blocked_resident_clears_the_hamlet_clock() {
        let mut since = HashMap::default();
        since.insert(9, 10);
        apply_since(&mut since, [(9, false), (9, true), (8, true)].into_iter(), 100);
        assert!(!since.contains_key(&9));
        assert_eq!(since.get(&8), Some(&100));
        apply_since(&mut since, [(8, true)].into_iter(), 200);
        assert_eq!(since.get(&8), Some(&100));
    }

    #[test]
    fn a_window_of_several_ticks_catches_each_minute_once() {
        let hits = (0..800u64).filter(|&t| t % 8 == 0 && due(t, 8, 120, 37)).count();
        assert_eq!(hits, (0..800u64).filter(|&t| t % 120 == 37).count());
    }

    #[test]
    fn a_command_nearby_wakes_a_calm_town_and_the_debug_switch_wakes_them_all() {
        let mut sim = Simulation::new(42);
        sim.tick_n(1300);
        sim.refresh_calm_towns();
        let calm = sim
            .calm_towns
            .as_ref()
            .map(|c| c.towns.clone())
            .unwrap_or_default();
        let town = sim
            .towns
            .iter()
            .find(|t| calm.contains(&t.id))
            .cloned()
            .expect("a calm town");
        sim.focus_points
            .push((town.center[0], town.center[1], sim.tick_count + 100));
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        assert!(!sim
            .calm_towns
            .as_ref()
            .is_some_and(|c| c.towns.contains(&town.id)));
        sim.lod = false;
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        assert!(sim.calm_town_of_each().iter().all(Option::is_none));
    }

    #[test]
    fn a_calm_town_steps_its_rested_workers_but_not_those_who_bring_in_food() {
        use crate::organism::skills::Skill;
        use crate::sim::agents::daily_work::WorkPlan;
        let mut sim = Simulation::new(42);
        sim.tick_n(1300);
        while !(100..250).contains(&(sim.tick_count % DAY_LENGTH)) {
            sim.tick();
        }
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        sim.lod_units = sim.home_units();
        let phase = sim.tick_count % DAY_LENGTH;
        let idx = (0..sim.organisms.len())
            .find(|&i| {
                sim.lod_units[i].is_some()
                    && sim.organisms[i]
                        .routine
                        .is_some_and(|r| r.activity_at(phase) == Activity::Work)
            })
            .expect("a worker of a calm town");
        let unit = sim.lod_units[idx];
        {
            let o = &mut sim.organisms[idx];
            o.journey = None;
            o.mounted_vehicle = None;
            o.water_ticks = 0;
            o.last_action = Some(27);
            o.energy = 0.9;
            o.hydration = 0.9;
            o.work = Some(WorkPlan {
                skill: Skill::Woodcutting,
                spot: (o.x as i32, o.y as i32),
                until: sim.tick_count + 100,
                harvest: false,
                misses: 0,
            });
        }
        for vehicle in &mut sim.vehicles {
            vehicle.occupants.retain(|id| *id != sim.organisms[idx].id);
        }
        assert_eq!(sim.calm_town_of_each()[idx], unit);
        sim.organisms[idx].energy = 0.55;
        assert_eq!(sim.calm_town_of_each()[idx], None);
        sim.organisms[idx].energy = 0.9;
        for skill in [Skill::Foraging, Skill::Fishing, Skill::Hunting, Skill::Farming] {
            sim.organisms[idx].work.as_mut().expect("a work plan").skill = skill;
            assert_eq!(sim.calm_town_of_each()[idx], None, "{skill:?}");
        }
    }

    #[test]
    fn an_empty_pocket_does_not_skip_a_long_step() {
        let mut sim = Simulation::new(42);
        sim.tick_n(2_200);
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        sim.lod_units = sim.home_units();
        if let Some(calm) = sim.calm_towns.as_mut() {
            for started in calm.since.values_mut() {
                *started = sim.tick_count.saturating_sub(2_000);
            }
        }
        let idx = (0..sim.organisms.len())
            .find(|&i| {
                sim.lod_units[i].is_some() && sim.organisms[i].alive && sim.organisms[i].routine.is_some()
            })
            .expect("someone at home in a calm region");
        let id = sim.lod_units[idx].expect("a calm home");
        assert!(sim.coarse_step(id) > TOWN_STEP);
        {
            let o = &mut sim.organisms[idx];
            o.journey = None;
            o.mounted_vehicle = None;
            o.water_ticks = 0;
            o.last_action = Some(27);
            o.energy = 0.95;
            o.hydration = 0.95;
            o.inv_food = 4;
            o.inv_water = 4;
            o.tools.remove("winter_provisions");
            o.work = None;
        }
        for vehicle in &mut sim.vehicles {
            vehicle.occupants.retain(|id| *id != sim.organisms[idx].id);
        }
        // A day-scale step needs the meals in hand. An empty pocket, or a
        // couple of meals, stays on the per-tick path and can walk to food.
        assert_eq!(sim.coarse_step(id), COARSE_MAX);
        let fed = sim.calm_town_of_each()[idx];
        assert!(fed.is_some());
        sim.organisms[idx].inv_food = 0;
        assert_eq!(sim.calm_town_of_each()[idx], None);
        sim.organisms[idx].inv_food = 4;
        sim.organisms[idx].energy = 0.62;
        assert_eq!(sim.calm_town_of_each()[idx], fed);
    }

    #[test]
    fn chances_add_up_over_a_step() {
        assert_eq!(chance(0.1, 1), 0.1);
        let p = chance(0.1, 8);
        assert!((p - (1.0 - 0.9f32.powi(8))).abs() < 1e-6);
    }

    #[test]
    fn a_quiet_stretch_lengthens_the_step_up_to_a_day() {
        assert_eq!(step_for(0), TOWN_STEP);
        assert_eq!(step_for(119), TOWN_STEP);
        assert_eq!(step_for(120), 16);
        assert_eq!(step_for(599), 16);
        assert_eq!(step_for(600), 32);
        assert_eq!(step_for(1_799), 32);
        assert_eq!(step_for(1_800), COARSE_MAX);
        assert_eq!(step_for(9_000), COARSE_MAX);
    }

    #[test]
    fn a_command_wakes_a_calm_town_on_the_tick_it_arrives() {
        let mut sim = Simulation::new(42);
        sim.tick_n(1300);
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        let town = sim
            .towns
            .iter()
            .find(|t| sim.calm_towns.as_ref().is_some_and(|c| c.towns.contains(&t.id)))
            .cloned()
            .expect("a calm town");
        let step = sim.coarse_step(town.id);
        assert!((TOWN_STEP..=COARSE_MAX).contains(&step) && step.is_power_of_two());
        sim.refresh_calm_towns();
        assert!(sim
            .calm_towns
            .as_ref()
            .is_some_and(|c| c.towns.contains(&town.id)));
        sim.focus_points
            .push((town.center[0], town.center[1], sim.tick_count + 100));
        sim.refresh_calm_towns();
        assert!(
            !sim.calm_towns
                .as_ref()
                .is_some_and(|c| c.towns.contains(&town.id)),
            "a command on the town waited for the calm refresh"
        );
    }

    #[test]
    fn a_plague_and_a_famine_keep_a_town_awake() {
        use crate::sim::civ::peril::{Peril, PerilCause};
        use crate::sim::medicine::{DiseaseKind, Outbreak};
        let mut sim = Simulation::new(42);
        sim.tick_n(1300);
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        let town = sim
            .towns
            .iter()
            .find(|t| sim.calm_towns.as_ref().is_some_and(|c| c.towns.contains(&t.id)))
            .cloned()
            .expect("a calm town");
        sim.outbreaks.push(Outbreak {
            kind: DiseaseKind::Plague,
            epicenter: [town.center[0], town.center[1]],
            started_tick: sim.tick_count,
            affected_count: 3,
            deaths: 0,
        });
        sim.refresh_calm_towns();
        assert!(!sim
            .calm_towns
            .as_ref()
            .is_some_and(|c| c.towns.contains(&town.id)));
        sim.outbreaks.clear();
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        assert!(sim
            .calm_towns
            .as_ref()
            .is_some_and(|c| c.towns.contains(&town.id)));
        sim.tribe_peril.insert(
            town.lineage.to_string(),
            Peril {
                population: 4,
                peak: 20,
                cause: PerilCause::Hunger,
                since: sim.tick_count,
            },
        );
        sim.refresh_calm_towns();
        assert!(!sim
            .calm_towns
            .as_ref()
            .is_some_and(|c| c.towns.contains(&town.id)));
    }

    #[test]
    fn a_journey_stays_on_the_per_tick_path_even_after_a_long_calm() {
        use crate::organism::organism::Journey;
        let mut sim = Simulation::new(42);
        sim.tick_n(1300);
        sim.calm_towns = None;
        sim.refresh_calm_towns();
        sim.lod_units = sim.home_units();
        if let Some(calm) = sim.calm_towns.as_mut() {
            for started in calm.since.values_mut() {
                *started = sim.tick_count.saturating_sub(200);
            }
        }
        let idx = (0..sim.organisms.len())
            .find(|&i| {
                sim.lod_units[i].is_some()
                    && sim.organisms[i].alive
                    && sim.organisms[i].routine.is_some()
                    && sim.organisms[i].journey.is_none()
            })
            .expect("someone at home in a calm region");
        let id = sim.lod_units[idx].expect("a calm home");
        assert!(sim.coarse_step(id) > TOWN_STEP);
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        {
            let o = &mut sim.organisms[idx];
            o.journey = Some(Journey {
                target: (x + 24, y),
                description: "walking".to_string(),
                expires_at: sim.tick_count + 800,
            });
            o.energy = 0.9;
            o.hydration = 0.9;
            o.last_action = Some(1);
            o.water_ticks = 0;
            o.mounted_vehicle = None;
            if let Some(plan) = o.work.as_mut() {
                plan.skill = crate::organism::skills::Skill::Woodcutting;
            }
        }
        assert_eq!(sim.calm_town_of_each()[idx], None);
        let x0 = sim.organisms[idx].x;
        sim.stride(idx, 16);
        let moved = (sim.organisms[idx].x - x0).abs();
        assert!(
            moved >= 10.0,
            "a 16-tick stride moved {moved} tiles toward the journey"
        );
    }

    #[test]
    fn a_long_step_hands_out_a_game_without_waking_a_turn() {
        use crate::organism::mind::Purpose;
        use crate::sim::agents::routine::{Group, Routine};
        use crate::world::tiles::Tile;
        let mut sim = Simulation::new(5);
        sim.tick_count = 5 * DAY_LENGTH + 200;
        sim.weather.kind = 0;
        let idx = sim.organisms.iter().position(|o| o.alive).expect("someone alive");
        let here = (100, 100);
        for x in 80..=120 {
            for y in 80..=120 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.organisms[idx].x = here.0 as f32;
        sim.organisms[idx].y = here.1 as f32;
        {
            let o = &mut sim.organisms[idx];
            o.journey = None;
            o.mounted_vehicle = None;
            o.water_ticks = 0;
            o.energy = 0.9;
            o.hydration = 0.9;
            o.health = 0.9;
            o.fear_level = 0.0;
            o.work = None;
            o.intent = None;
            o.last_action = Some(27);
            o.rethink = false;
            o.wander_target = None;
            o.routine = Some(Routine {
                day: 5,
                group: Group::Child,
                season: 0,
                home: here,
                play: (here.0 + 3, here.1),
                workshop: None,
                work_spot: None,
                gather: None,
                school: None,
                festival: None,
                centre: Some((here.0 + 4, here.1 + 4)),
                water: None,
            });
        }
        let mut calm = CalmMap::default();
        calm.since.insert(7, sim.tick_count - 2_000);
        sim.calm_towns = Some(calm);
        sim.lod_units = vec![None; sim.organisms.len()];
        sim.lod_units[idx] = Some(7);
        assert!(sim.coarse_step(7) > TOWN_STEP);
        let mut tiers = vec![Tier::Own; sim.organisms.len()];
        tiers[idx] = Tier::Idle;
        sim.hand_out_pastimes(&tiers);
        let game = sim.organisms[idx].intent.expect("a game on an idle tick");
        assert_eq!(game.purpose, Purpose::Play);
        assert_eq!(sim.organisms[idx].last_action, Some(113));
        assert!(!sim.organisms[idx].rethink);
        sim.organisms[idx].x = game.target.0 as f32;
        sim.organisms[idx].y = game.target.1 as f32;
        sim.hand_out_pastimes(&tiers);
        assert!(
            !sim.organisms[idx].rethink,
            "finishing a game does not wake a turn"
        );
        sim.tick_count = 5 * DAY_LENGTH + 450;
        sim.organisms[idx].intent = Some(game);
        sim.hand_out_pastimes(&tiers);
        assert!(sim.organisms[idx].intent.is_none());
        assert!(!sim.organisms[idx].rethink);
    }

    #[test]
    fn the_same_seed_takes_the_same_coarse_steps() {
        fn digest(sim: &Simulation) -> (u64, u64, u32) {
            let alive = sim.organisms.iter().filter(|o| o.alive).count() as u32;
            let hash = sim.organisms.iter().fold(sim.history.births, |acc, o| {
                acc.wrapping_mul(0x9E37_79B9_7F4A_7C15)
                    ^ u64::from(o.age)
                    ^ (o.x.to_bits() as u64)
                    ^ (o.y.to_bits() as u64).rotate_left(17)
                    ^ u64::from(o.alive)
            });
            (hash, sim.history.births, alive)
        }
        let mut a = Simulation::new(7);
        let mut b = Simulation::new(7);
        a.tick_n(180);
        b.tick_n(180);
        assert_eq!(digest(&a), digest(&b));
    }
}
