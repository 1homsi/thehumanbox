use super::*;
use crate::sim::agents::family_outings::chebyshev;
use crate::sim::agents::routine::Activity;
use crate::sim::cosmos::DAY_LENGTH;

pub(crate) const TOWN_STEP: u64 = 8;

const CALM_EVERY: u64 = 60;

const EVENT_REACH: i32 = 40;

const HOME_REACH: i32 = 30;

const FIRE_CELL: i32 = 16;

const WELL: f32 = 0.5;

const WORK_WELL: f32 = 0.6;

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
    pub(super) fn refresh_calm_towns(&mut self) {
        if self.calm_towns.is_some() && !self.tick_count.is_multiple_of(CALM_EVERY) {
            return;
        }
        if !self.lod {
            self.calm_towns = Some(CalmMap::default());
            return;
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
        let towns: HashSet<u32> = self
            .towns
            .iter()
            .filter(|t| {
                !busy.contains(t.lineage.as_str()) && !at_front(&foes, &t.lineage, (t.center[0], t.center[1]))
            })
            .filter(|t| {
                hot.iter()
                    .all(|&h| chebyshev(h, (t.center[0], t.center[1])) > EVENT_REACH)
            })
            .map(|t| t.id)
            .collect();
        let map = CalmMap {
            towns,
            hot,
            foes,
            busy: busy.into_iter().collect(),
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
                unit.filter(|_| settled)
            })
            .collect()
    }

    fn home_units(&self) -> Vec<Option<u32>> {
        let n = self.organisms.len();
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
                    return None;
                }
                let home = (o.home_x as i32, o.home_y as i32);
                let town = towns.get(o.lineage_id.as_str()).and_then(|list| {
                    list.iter()
                        .filter(|&&(_, c)| chebyshev(c, home) <= HOME_REACH)
                        .min_by_key(|&&(id, c)| (chebyshev(c, home), id))
                });
                match town {
                    Some(&(id, _)) => calm.towns.contains(&id).then_some(id),
                    None if calm.busy.contains(o.lineage_id.as_str()) => None,
                    None => {
                        let (cx, cy) = (home.0.div_euclid(HAMLET), home.1.div_euclid(HAMLET));
                        if at_front(
                            &calm.foes,
                            &o.lineage_id,
                            (cx * HAMLET + HAMLET / 2, cy * HAMLET + HAMLET / 2),
                        ) {
                            return None;
                        }
                        let id = HAMLETS + (cy.max(0) as u32) * 1024 + cx.max(0) as u32;
                        calm.quiet_at((cx * HAMLET + HAMLET / 2, cy * HAMLET + HAMLET / 2))
                            .then_some(id)
                    }
                }
            },
        )
    }

    pub(super) fn town_tiers(&self, towns: &[Option<u32>], awake: &[bool]) -> Vec<Tier> {
        let tick = self.tick_count;
        towns
            .iter()
            .zip(awake)
            .map(|(town, &awake)| match town {
                Some(id) if !awake => {
                    if (tick + u64::from(*id)).is_multiple_of(TOWN_STEP) {
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
            if purpose.is_none() && (o.intent.is_some() || o.wander_target.is_some()) {
                if o.intent.is_some() {
                    let o = &mut self.organisms[i];
                    o.intent = None;
                    o.rethink = true;
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
            } else if self.organisms[i].route.get_mut().settles(target, gap, 2) {
                continue;
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
    fn chances_add_up_over_a_step() {
        assert_eq!(chance(0.1, 1), 0.1);
        let p = chance(0.1, 8);
        assert!((p - (1.0 - 0.9f32.powi(8))).abs() < 1e-6);
    }
}
