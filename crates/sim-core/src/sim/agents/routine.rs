use super::age_stage::AgeStage;
use super::family_outings::{chebyshev, spread};
use crate::sim::config::SEASON_LENGTH;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Activity {
    Sleep,
    Work,
    Meal,
    Gather,
    Festival,
    School,
    Play,
    Sit,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Group {
    Infant,
    Child,
    Worker,
    Elder,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Routine {
    pub day: u64,
    pub group: Group,
    pub season: u8,
    pub home: (i32, i32),
    pub play: (i32, i32),
    pub workshop: Option<(i32, i32)>,
    pub work_spot: Option<(i32, i32)>,
    pub gather: Option<(i32, i32)>,
    pub school: Option<(i32, i32)>,
    pub festival: Option<(i32, i32)>,
    pub centre: Option<(i32, i32)>,
    pub water: Option<(i32, i32)>,
}

pub fn season_of(tick: u64) -> u8 {
    ((tick / SEASON_LENGTH) % 4) as u8
}

const HARVEST: u8 = 1;
const WINTER: u8 = 2;
const PLANTING: u8 = 3;

const AT_PLACE: i32 = 2;
const WORK_REACH: i32 = 26;
const PLAY_OUT: i32 = 6;
const IN_CROWD: i32 = 3;
const SIP: f32 = 0.7;
pub(crate) const FETCH_WATER: f32 = 0.55;
const WATER_WALK: f32 = 24.0;
const WATER_LOOK: i32 = 14;
const WATER_HOME_REACH: i32 = 40;

const WORKDAY: (u64, u64, u64, u64) = (60, 270, 330, 420);

const EVENING: (u64, u64) = (420, 510);

impl Routine {
    pub fn activity_at(&self, phase: u64) -> Activity {
        let (start, meal, meal_end, end) = WORKDAY;
        let evening = if self.festival.is_some() {
            Activity::Festival
        } else {
            Activity::Gather
        };
        match self.group {
            Group::Infant => Activity::Sleep,
            Group::Worker => match phase {
                p if p < start => Activity::Sleep,
                p if p < meal => Activity::Work,
                p if p < meal_end => Activity::Meal,
                p if p < end => Activity::Work,
                p if p < EVENING.1 => evening,
                _ => Activity::Sleep,
            },
            Group::Child => match phase {
                p if p < start => Activity::Sleep,
                p if p < 360 && self.school.is_some() => Activity::School,
                p if p < EVENING.0 => Activity::Play,
                p if p < 480 => evening,
                _ => Activity::Sleep,
            },
            Group::Elder => match phase {
                p if p < start + 30 => Activity::Sleep,
                p if p < meal => Activity::Sit,
                p if p < meal_end => Activity::Meal,
                p if p < EVENING.0 => Activity::Sit,
                p if p < EVENING.1 => evening,
                _ => Activity::Sleep,
            },
        }
    }

    pub fn place_of(&self, activity: Activity) -> Option<(i32, i32)> {
        match activity {
            Activity::Sleep => Some(self.home),
            Activity::Meal => None,
            Activity::Play => Some(self.play),
            Activity::Work => self.workshop.or(self.work_spot),
            Activity::Gather => self.gather.or(self.centre),
            Activity::Festival => self.festival.or(self.gather).or(self.centre),
            Activity::School => self.school,
            Activity::Sit => self.centre.or(self.gather).or(Some(self.home)),
        }
    }
}

pub(crate) struct RoutineStep {
    pub action: usize,
    pub thought: Option<&'static str>,
}

fn setting_out(activity: Activity) -> &'static str {
    match activity {
        Activity::Sleep => "going home for the night",
        Activity::Work => "going to work",
        Activity::Meal => "taking the midday meal",
        Activity::Gather => "going to the evening gathering",
        Activity::Festival => "going to the festival",
        Activity::School => "going to school",
        Activity::Play => "playing near home",
        Activity::Sit => "going to sit at the town centre",
    }
}

fn group_of(stage: AgeStage) -> Group {
    match stage {
        AgeStage::Infant => Group::Infant,
        AgeStage::Child => Group::Child,
        AgeStage::Teen | AgeStage::Adult => Group::Worker,
        AgeStage::Elder => Group::Elder,
    }
}

impl Simulation {
    pub(crate) fn keep_routine(&mut self, idx: usize) {
        let tick = self.tick_count;
        let day = tick / DAY_LENGTH;
        let phase = tick % DAY_LENGTH;
        let stale = self.organisms[idx].routine.is_none_or(|r| r.day != day);
        if !stale || (self.organisms[idx].routine.is_some() && phase < idx as u64 % 60) {
            return;
        }
        let routine = self.plan_routine(idx, day);
        self.organisms[idx].routine = Some(routine);
    }

    fn plan_routine(&self, idx: usize, day: u64) -> Routine {
        let o = &self.organisms[idx];
        let home = (o.home_x as i32, o.home_y as i32);
        let group = group_of(o.age_stage());
        let tribe = o.lineage_id;
        let lineage = tribe.as_str();
        let jitter = |salt: u64, range: i32| spread(idx, day, salt, range);
        let around = |p: (i32, i32), salt: u64, range: i32| {
            let q = (p.0 + jitter(salt, range), p.1 + jitter(salt + 1, range));
            if self.is_good_land_target(q.0, q.1) {
                q
            } else {
                p
            }
        };
        let workshop = match (group, o.specialty.as_deref()) {
            (Group::Worker, Some(trade)) => {
                self.workplace_for(lineage, trade, home).map(|p| around(p, 11, 1))
            }
            _ => None,
        };
        let play = {
            let (dx, dy) = (jitter(19, PLAY_OUT), jitter(20, PLAY_OUT));
            let out = |d: i32| if d >= 0 { d + PLAY_OUT } else { d - PLAY_OUT };
            let q = (home.0 + out(dx) / 2, home.1 + out(dy) / 2);
            if self.is_good_land_target(q.0, q.1) {
                q
            } else {
                home
            }
        };
        let work_spot = match (group, workshop) {
            (Group::Worker, None) => self.usual_work_spot(idx, home),
            _ => None,
        };
        let centre = self
            .towns
            .iter()
            .filter(|t| t.lineage == tribe)
            .map(|t| (t.center[0], t.center[1]))
            .min_by_key(|&c| (chebyshev(c, home), c))
            .map(|c| around(c, 13, 3));
        let gather = self
            .evening_places
            .get(lineage)
            .copied()
            .map(|p| around(p, 15, IN_CROWD));
        let school = match group {
            Group::Child => self.school_for(lineage),
            _ => None,
        };
        let festival = self
            .festivals
            .iter()
            .find(|f| f.lineage_id == lineage)
            .map(|f| around((f.center[0], f.center[1]), 17, 4));
        Routine {
            day,
            group,
            season: season_of(self.tick_count),
            home,
            play,
            workshop,
            work_spot,
            gather,
            school,
            festival,
            centre,
            water: self.water_near_home(home),
        }
    }

    fn water_near_home(&self, home: (i32, i32)) -> Option<(i32, i32)> {
        use crate::world::tiles::Tile;
        (1..=WATER_HOME_REACH).find_map(|r| {
            let ring = (-r..=r).flat_map(move |d| [(d, -r), (d, r), (-r, d), (r, d)]);
            ring.map(|(dx, dy)| (home.0 + dx, home.1 + dy))
                .filter(|&(x, y)| matches!(self.grid.get(x, y), Tile::Water | Tile::Ice))
                .min_by_key(|&(x, y)| ((x - home.0).abs() + (y - home.1).abs(), x, y))
        })
    }

    fn usual_work_spot(&self, idx: usize, home: (i32, i32)) -> Option<(i32, i32)> {
        use crate::organism::skills::Skill;
        let o = &self.organisms[idx];
        let known: Vec<Skill> = o
            .skills
            .known()
            .into_iter()
            .map(|(s, _)| s)
            .filter(|s| {
                matches!(
                    s,
                    Skill::Farming
                        | Skill::Fishing
                        | Skill::Woodcutting
                        | Skill::Quarrying
                        | Skill::Foraging
                        | Skill::Hunting
                )
            })
            .collect();
        let seasonal: &[Skill] = match season_of(self.tick_count) {
            HARVEST | PLANTING => &[Skill::Farming],
            WINTER => &[Skill::Woodcutting, Skill::Foraging],
            _ => &[],
        };
        let usual = seasonal
            .iter()
            .copied()
            .find(|s| known.contains(s) && (*s == Skill::Farming || o.skills.good_spot(*s).is_some()))
            .or_else(|| known.first().copied())?;
        if usual == Skill::Farming {
            return self
                .farms
                .iter()
                .filter(|f| f.owner_lineage == o.lineage_id && !f.withered)
                .map(|f| (f.x, f.y))
                .filter(|&p| chebyshev(p, home) <= WORK_REACH)
                .min_by_key(|&p| (chebyshev(p, home), p));
        }
        o.skills
            .good_spot(usual)
            .map(|(p, _)| p)
            .filter(|&p| chebyshev(p, home) <= WORK_REACH && self.is_good_land_target(p.0, p.1))
    }

    fn school_for(&self, lineage: &str) -> Option<(i32, i32)> {
        let h = self.lineage_homes.get(lineage)?;
        let home = (h[0], h[1]);
        self.buildings
            .iter()
            .filter(|b| {
                b.kind == crate::sim::tech::buildings::BuildingKind::School
                    && b.is_operational()
                    && b.damage < 0.5
                    && b.owner_lineage.as_deref() == Some(lineage)
            })
            .map(|b| {
                let (fw, fh) = b.kind.footprint();
                (b.x + fw as i32 / 2, b.y + fh as i32 / 2)
            })
            .filter(|&p| chebyshev(p, home) <= 24)
            .min_by_key(|&p| (chebyshev(p, home), p))
    }

    fn dry_step(&self, o: &crate::organism::organism::Organism, target: (i32, i32)) -> Option<usize> {
        let action = o.toward(target, &self.grid);
        let (dx, dy) = *crate::organism::organism::DIRECTIONS.get(action)?;
        let (x, y) = (o.x as i32 + dx, o.y as i32 + dy);
        let tile = self.grid.get(x, y);
        (tile.walkable() && !self.grid.is_wet(tile, x, y)).then_some(action)
    }

    fn water_stop(&self, o: &crate::organism::organism::Organism, here: (i32, i32)) -> Option<RoutineStep> {
        if o.hydration < SIP
            && (self.grid.water_beside(here.0, here.1).is_some()
                || self.grid.ice_beside(here.0, here.1).is_some())
        {
            return Some(RoutineStep {
                action: 9,
                thought: Some("drinking at the water's edge"),
            });
        }
        if o.hydration < FETCH_WATER {
            let urgency = (FETCH_WATER - o.hydration) / FETCH_WATER;
            let water = crate::organism::organism::Organism::best_remembered_with_danger(
                &o.water_memory,
                o.x,
                o.y,
                &o.danger_memory,
                urgency,
            )
            .filter(|&t| ((t.0 - here.0).abs() + (t.1 - here.1).abs()) as f32 <= WATER_WALK)
            .filter(|&t| !o.route.borrow().recently_blocked(t))
            .or_else(|| o.nearest_visible(&self.grid, crate::world::tiles::Tile::Water, WATER_LOOK))
            .or_else(|| o.routine.and_then(|r| r.water))
            .filter(|&t| !o.route.borrow().recently_blocked(t));
            if let Some(t) = water {
                let step = self.dry_step(o, t);
                if step.is_none() {
                    o.route.borrow_mut().mark_blocked(t);
                }
                return step.map(|action| RoutineStep {
                    action,
                    thought: Some("fetching water"),
                });
            }
        }
        None
    }

    pub(crate) fn routine_step(&self, idx: usize) -> Option<RoutineStep> {
        let o = &self.organisms[idx];
        let r = o.routine.as_ref()?;
        if r.group == Group::Infant || o.mounted_vehicle.is_some() {
            return None;
        }
        let tick = self.tick_count;
        let phase = tick % DAY_LENGTH;
        let here = (o.x as i32, o.y as i32);
        if o.water_ticks > 0 || self.grid.is_wet(self.grid.get(here.0, here.1), here.0, here.1) {
            let goal = {
                let route = o.route.borrow();
                (route.next < route.steps.len()).then_some(route.goal)
            };
            return goal.filter(|&g| g != here).map(|g| RoutineStep {
                action: o.toward(g, &self.grid),
                thought: None,
            });
        }
        if o.journey.is_some() {
            return self.water_stop(o, here);
        }
        if let Some(step) = self.water_stop(o, here) {
            return Some(step);
        }
        let activity = if self.weather.kind >= 2 {
            Activity::Sleep
        } else {
            r.activity_at(phase)
        };
        let fresh = phase == 0 || r.activity_at(phase - 1) != activity;
        let thought = fresh.then(|| setting_out(activity));
        if activity == Activity::Meal {
            return Some(RoutineStep {
                action: usize::MAX,
                thought,
            });
        }
        if activity == Activity::Work {
            if let Some(plan) = o.work {
                let wet = self.grid.is_wet(self.grid.get(here.0, here.1), here.0, here.1);
                if plan.at_spot(here) && !wet {
                    let (action, doing) = plan.action();
                    return Some(RoutineStep {
                        action,
                        thought: fresh.then_some(doing),
                    });
                }
                if !o.route.borrow().recently_blocked(plan.spot) {
                    return self.dry_step(o, plan.spot).map(|action| RoutineStep {
                        action,
                        thought: fresh.then(|| plan.walking_thought()),
                    });
                }
            }
        }
        let place = r.place_of(activity)?;
        let reach = match activity {
            Activity::Gather | Activity::Festival | Activity::Play => IN_CROWD,
            _ => AT_PLACE,
        };
        if !o.route.borrow_mut().settles(place, chebyshev(here, place), reach) {
            if o.route.borrow().recently_blocked(place) {
                return None;
            }
            return self
                .dry_step(o, place)
                .map(|action| RoutineStep { action, thought });
        }
        let action = match activity {
            Activity::Work => match o.last_action.map(usize::from) {
                Some(a) if a >= 8 && !matches!(a, 10 | 11 | 21) => a,
                _ => usize::MAX,
            },
            Activity::Gather | Activity::Festival => match o.last_action.map(usize::from) {
                Some(a) if keeps_company(a) => a,
                _ => usize::MAX,
            },
            _ => usize::MAX,
        };
        Some(RoutineStep { action, thought })
    }
}

fn keeps_company(action: usize) -> bool {
    matches!(action, 80..=106 | 181..=200 | 436..=455) && !matches!(action, 10 | 11 | 21)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn routine(group: Group, season: u8) -> Routine {
        Routine {
            day: 0,
            group,
            season,
            home: (10, 10),
            play: (14, 10),
            workshop: Some((20, 10)),
            work_spot: None,
            gather: Some((15, 15)),
            school: None,
            festival: None,
            centre: Some((12, 12)),
            water: None,
        }
    }

    #[test]
    fn a_working_day_runs_from_dawn_through_the_meal_to_the_evening_and_home() {
        let r = routine(Group::Worker, 0);
        let day: Vec<Activity> = [0, 100, 300, 400, 450, 550]
            .iter()
            .map(|&p| r.activity_at(p))
            .collect();
        assert_eq!(
            day,
            [
                Activity::Sleep,
                Activity::Work,
                Activity::Meal,
                Activity::Work,
                Activity::Gather,
                Activity::Sleep
            ]
        );
        assert_eq!(r.place_of(Activity::Work), Some((20, 10)));
        assert_eq!(r.place_of(Activity::Gather), Some((15, 15)));
        assert_eq!(r.place_of(Activity::Sleep), Some((10, 10)));
    }

    #[test]
    fn the_midday_meal_is_taken_where_people_are() {
        let r = routine(Group::Worker, WINTER);
        assert_eq!(r.activity_at(300), Activity::Meal);
        assert_eq!(r.place_of(Activity::Meal), None);
        assert_eq!(r.activity_at(400), Activity::Work);
    }

    #[test]
    fn a_festival_takes_the_evening_and_children_without_a_school_play() {
        let mut r = routine(Group::Child, 0);
        assert_eq!(r.activity_at(200), Activity::Play);
        r.school = Some((30, 30));
        assert_eq!(r.activity_at(200), Activity::School);
        r.festival = Some((40, 40));
        assert_eq!(r.activity_at(450), Activity::Festival);
        assert_eq!(r.place_of(Activity::Festival), Some((40, 40)));
    }

    #[test]
    fn a_household_draws_water_from_the_nearest_well_or_river() {
        use crate::world::tiles::Tile;
        let mut sim = Simulation::new(3);
        for x in 60..=140 {
            for y in 60..=140 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        sim.grid.set(130, 100, Tile::Water);
        sim.grid.set(100, 88, Tile::Water);
        assert_eq!(sim.water_near_home((100, 100)), Some((100, 88)));
        sim.grid.set(100, 88, Tile::Grass);
        assert_eq!(sim.water_near_home((100, 100)), Some((130, 100)));
        sim.grid.set(130, 100, Tile::Grass);
        assert_eq!(sim.water_near_home((100, 100)), None);
    }

    #[test]
    fn elders_sit_at_the_town_centre_by_day() {
        let r = routine(Group::Elder, 0);
        assert_eq!(r.activity_at(200), Activity::Sit);
        assert_eq!(r.place_of(Activity::Sit), Some((12, 12)));
    }
}
