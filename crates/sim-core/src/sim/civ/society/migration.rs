use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::sim::civ::civ_tick::town::PARENT_REACH;
use crate::sim::civ::land::land_memory::RESETTLE_REACH;
use crate::sim::civ::society::relations::MemoryKind;
use crate::sim::civ::trade_routes::{route_is_embargoed, CaravanKind};
use crate::sim::civ::warfare::{BattleOutcome, TreatyKind};
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;

pub const MIGRATION_STEP: u64 = DAY_LENGTH / 2;
const MIGRATION_PHASE: u64 = DAY_LENGTH / 6;
const MOVE_STEP: u64 = 20;
const MOVE_PHASE: u64 = 7;
const MIN_TOWN: usize = 4;
const FAMINE_SHARE: f32 = 0.4;
const FAMINE_FOOD: u32 = 1;
const HUNGRY_ENERGY: f32 = 0.5;
const GROUP_MIN: usize = 2;
const GROUP_MAX: usize = 10;
const REACH: i32 = 120;
const OVERLAND: i32 = 60;
const HOST_FOOD: u32 = 3;
const HOST_MIN: usize = 3;
const WAR_REACH: i32 = 20;
const ARRIVE: i32 = 6;
const TIMEOUT: u64 = 4 * DAY_LENGTH;
const LEAD: usize = 10;
const MAX_MIGRATIONS: usize = 24;
const WELCOME_MOOD: f32 = -0.1;
const NEUTRAL: f32 = -0.05;
const STRANGER: u8 = 1;
const FRIENDLY: f32 = 0.2;
const SETTLE_REACH: i32 = 40;
const SETTLE_AWAY: i32 = 12;
const MAX_PATH: usize = 240;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MigrationCause {
    #[default]
    Famine,
    War,
}

impl MigrationCause {
    pub fn name(self) -> &'static str {
        match self {
            MigrationCause::Famine => "famine",
            MigrationCause::War => "war",
        }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Migration {
    pub id: u32,
    pub lineage: String,
    pub cause: MigrationCause,
    pub members: Vec<String>,
    pub from_town: u32,
    pub to_town: u32,
    pub host: String,
    pub from: [i32; 2],
    pub to: [i32; 2],
    pub path: Vec<[i32; 2]>,
    pub departed: u64,
    pub tries: u8,
}

#[derive(Clone, Debug, Default)]
struct Place {
    id: u32,
    lineage: String,
    centre: [i32; 2],
    people: Vec<usize>,
    hungry: usize,
    food: u32,
}

impl Place {
    fn food_each(&self) -> u32 {
        self.food / self.people.len().max(1) as u32
    }

    fn famine(&self) -> bool {
        self.people.len() >= MIN_TOWN
            && self.hungry as f32 >= FAMINE_SHARE * self.people.len() as f32
            && self.food_each() < FAMINE_FOOD
    }
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

fn straight(from: [i32; 2], to: [i32; 2]) -> Vec<[i32; 2]> {
    let steps = chebyshev(from, to).max(1);
    (0..=steps)
        .map(|i| {
            let t = i as f32 / steps as f32;
            [
                from[0] + ((to[0] - from[0]) as f32 * t).round() as i32,
                from[1] + ((to[1] - from[1]) as f32 * t).round() as i32,
            ]
        })
        .collect()
}

fn thin(mut path: Vec<[i32; 2]>) -> Vec<[i32; 2]> {
    path.dedup();
    if path.len() <= MAX_PATH {
        return path;
    }
    let step = path.len().div_ceil(MAX_PATH);
    let last = *path.last().unwrap_or(&[0, 0]);
    let mut out: Vec<[i32; 2]> = path.into_iter().step_by(step).collect();
    if out.last() != Some(&last) {
        out.push(last);
    }
    out
}

impl Simulation {
    pub(crate) fn tick_migrations(&mut self) {
        if self.tick_count == 0 {
            return;
        }
        if self.tick_count % MOVE_STEP == MOVE_PHASE && !self.land.migrations.is_empty() {
            self.walk_migrations();
        }
        if self.tick_count % MIGRATION_STEP == MIGRATION_PHASE {
            self.start_migrations();
        }
    }

    fn places(&self) -> Vec<Place> {
        let mut places: Vec<Place> = self
            .towns
            .iter()
            .map(|t| Place {
                id: t.id,
                lineage: t.lineage.to_string(),
                centre: t.center,
                ..Default::default()
            })
            .collect();
        let mut by_lineage: BTreeMap<&str, Vec<usize>> = BTreeMap::new();
        for (i, t) in self.towns.iter().enumerate() {
            by_lineage.entry(t.lineage.as_str()).or_default().push(i);
        }
        let moving: BTreeSet<&str> = self
            .land
            .migrations
            .iter()
            .flat_map(|m| m.members.iter().map(String::as_str))
            .collect();
        for (idx, o) in self.organisms.iter().enumerate().filter(|(_, o)| o.alive) {
            if moving.contains(o.id.as_str()) {
                continue;
            }
            let home = [o.home_x as i32, o.home_y as i32];
            let Some(&i) = by_lineage.get(o.lineage_id.as_str()).and_then(|list| {
                list.iter()
                    .filter(|&&i| chebyshev(self.towns[i].center, home) <= PARENT_REACH)
                    .min_by_key(|&&i| (chebyshev(self.towns[i].center, home), self.towns[i].id))
            }) else {
                continue;
            };
            let p = &mut places[i];
            p.people.push(idx);
            p.food += u32::from(o.inv_food);
            if o.inv_food == 0 && o.energy < HUNGRY_ENERGY {
                p.hungry += 1;
            }
        }
        let index: BTreeMap<u32, usize> = self.towns.iter().enumerate().map(|(i, t)| (t.id, i)).collect();
        for b in &self.buildings {
            if !matches!(b.kind, BuildingKind::Granary | BuildingKind::Warehouse) || !b.is_operational() {
                continue;
            }
            if let Some(&i) = b.town.and_then(|id| index.get(&id)) {
                if b.owner_lineage.as_deref() == Some(places[i].lineage.as_str()) {
                    places[i].food += b.stock;
                }
            }
        }
        places
    }

    fn kinship(&self, from: &str, to: &str) -> u8 {
        if from == to {
            return 5;
        }
        if route_is_embargoed(self, from, to) {
            return 0;
        }
        if self.same_side(from, to) {
            return 4;
        }
        let tick = self.tick_count;
        let treaty = self.treaties.iter().any(|t| {
            t.signed_tick <= tick
                && t.expires_tick > tick
                && matches!(
                    t.kind,
                    TreatyKind::Alliance | TreatyKind::Defensive | TreatyKind::Trade
                )
                && ((t.lineage_a == from && t.lineage_b == to) || (t.lineage_a == to && t.lineage_b == from))
        });
        if treaty {
            return 3;
        }
        let standing = self.diplomacy.relations.standing(from, to);
        if standing >= FRIENDLY {
            2
        } else {
            u8::from(standing >= NEUTRAL)
        }
    }

    fn way_between(&self, from: [i32; 2], to: [i32; 2]) -> Option<Vec<[i32; 2]>> {
        if let Some(way) = crate::sim::civ::land::road_net::caravan_way(self, from, to) {
            let cells = crate::sim::civ::land::road_net::cells_along(self, &way.legs);
            if !cells.is_empty() {
                let mut path = vec![from];
                path.extend(cells);
                path.push(to);
                return Some(thin(path));
            }
        }
        (chebyshev(from, to) <= OVERLAND).then(|| thin(straight(from, to)))
    }

    fn pick_host(
        &self,
        places: &[Place],
        from: usize,
        at: [i32; 2],
        skip: &str,
    ) -> Option<(usize, Vec<[i32; 2]>)> {
        let lineage = &places[from].lineage;
        let mut options: Vec<(u8, i32, u32, usize)> = places
            .iter()
            .enumerate()
            .filter(|&(i, p)| {
                i != from
                    && p.lineage != skip
                    && p.people.len() >= HOST_MIN
                    && !p.famine()
                    && p.food_each() >= HOST_FOOD
                    && chebyshev(p.centre, at) <= REACH
            })
            .filter_map(|(i, p)| {
                let kin = self.kinship(lineage, &p.lineage);
                (kin > 0).then_some((u8::MAX - kin, chebyshev(p.centre, at), p.id, i))
            })
            .collect();
        options.sort_unstable();
        options
            .into_iter()
            .take(4)
            .find_map(|(_, _, _, i)| self.way_between(at, places[i].centre).map(|path| (i, path)))
    }

    fn lost_battle_near(&self, lineage: &str, centre: [i32; 2]) -> bool {
        let tick = self.tick_count;
        self.battles.iter().any(|b| {
            let lost = b
                .ended_tick
                .is_some_and(|t| tick.saturating_sub(t) <= MIGRATION_STEP)
                && b.outcome == Some(BattleOutcome::AttackerVictory);
            let losing = b.ended_tick.is_none() && b.initial_a > b.initial_d.saturating_mul(2);
            (lost || losing)
                && b.defenders.iter().any(|d| d == lineage)
                && chebyshev([b.location.0, b.location.1], centre) <= WAR_REACH
        })
    }

    fn start_migrations(&mut self) {
        if self.land.migrations.len() >= MAX_MIGRATIONS || self.towns.is_empty() {
            return;
        }
        let places = self.places();
        let helped: BTreeSet<[i32; 2]> = self
            .caravans
            .iter()
            .filter(|c| c.cargo == "food" && matches!(c.kind, CaravanKind::Relief | CaravanKind::Supply))
            .map(|c| c.to)
            .collect();
        let leaving: BTreeSet<u32> = self.land.migrations.iter().map(|m| m.from_town).collect();
        let relieved: BTreeSet<&str> = self
            .caravans
            .iter()
            .filter(|c| c.kind == CaravanKind::Relief)
            .map(|c| c.receiver_lineage.as_str())
            .collect();
        let mut starts: Vec<(usize, MigrationCause)> = Vec::new();
        for (i, p) in places.iter().enumerate() {
            if leaving.contains(&p.id) || p.people.len() < MIN_TOWN {
                continue;
            }
            if p.famine() && !helped.contains(&p.centre) && !relieved.contains(p.lineage.as_str()) {
                starts.push((i, MigrationCause::Famine));
            } else if self.lost_battle_near(&p.lineage, p.centre) {
                starts.push((i, MigrationCause::War));
            }
        }
        for (i, cause) in starts {
            if self.land.migrations.len() >= MAX_MIGRATIONS {
                break;
            }
            let Some((host, path)) = self.pick_host(&places, i, places[i].centre, "") else {
                continue;
            };
            let place = &places[i];
            let share = match cause {
                MigrationCause::Famine => place.people.len() / 3,
                MigrationCause::War => place.people.len() / 2,
            };
            let count = share.clamp(GROUP_MIN, GROUP_MAX);
            let mut group: Vec<(u32, String, usize)> = place
                .people
                .iter()
                .map(|&idx| {
                    let o = &self.organisms[idx];
                    ((o.energy * 1000.0) as u32, o.id.to_string(), idx)
                })
                .collect();
            group.sort_unstable();
            group.truncate(count);
            let members: Vec<usize> = group.iter().map(|g| g.2).collect();
            let to = places[host].centre;
            let id = self.land.next_migration.max(1);
            self.land.next_migration = id + 1;
            let host_name = self.tribe_name(&places[host].lineage);
            let name = self.tribe_name(&place.lineage);
            let tick = self.tick_count;
            for &idx in &members {
                let o = &mut self.organisms[idx];
                o.work = None;
                o.wander_target = None;
                o.journey = None;
                o.last_action = None;
                o.home_x = to[0] as f32;
                o.home_y = to[1] as f32;
            }
            self.land.migrations.push(Migration {
                id,
                lineage: place.lineage.clone(),
                cause,
                members: group.into_iter().map(|g| g.1).collect(),
                from_town: place.id,
                to_town: places[host].id,
                host: places[host].lineage.clone(),
                from: place.centre,
                to,
                path,
                departed: tick,
                tries: 0,
            });
            let stats = &mut self.land.stats;
            stats.migrations[usize::from(cause == MigrationCause::War)] += 1;
            stats.refugees += members.len() as u32;
            let why = match cause {
                MigrationCause::Famine => "Famine",
                MigrationCause::War => "War",
            };
            let towards = if places[host].lineage == place.lineage {
                "another of their towns".to_string()
            } else {
                format!("the {host_name}")
            };
            let detail = format!(
                "\u{1F9F3} {why} drove {} of the {name} from their town; they set out on the road to {towards}.",
                members.len()
            );
            push_event(&mut self.events, tick, "milestone", &name, &detail);
        }
    }

    fn walk_migrations(&mut self) {
        let tick = self.tick_count;
        let wanted: BTreeSet<&str> = self
            .land
            .migrations
            .iter()
            .flat_map(|m| m.members.iter().map(String::as_str))
            .collect();
        let index: BTreeMap<String, usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && wanted.contains(o.id.as_str()))
            .map(|(i, o)| (o.id.to_string(), i))
            .collect();
        let mut arrived: Vec<usize> = Vec::new();
        let mut empty: Vec<usize> = Vec::new();
        for (m, migration) in self.land.migrations.iter().enumerate() {
            let walkers: Vec<usize> = migration
                .members
                .iter()
                .filter_map(|id| index.get(id).copied())
                .collect();
            if walkers.is_empty() {
                empty.push(m);
                continue;
            }
            let n = walkers.len() as f32;
            let cx = walkers.iter().map(|&i| self.organisms[i].x).sum::<f32>() / n;
            let cy = walkers.iter().map(|&i| self.organisms[i].y).sum::<f32>() / n;
            let centre = [cx as i32, cy as i32];
            if chebyshev(centre, migration.to) <= ARRIVE || tick.saturating_sub(migration.departed) >= TIMEOUT
            {
                arrived.push(m);
                continue;
            }
            let near = migration
                .path
                .iter()
                .enumerate()
                .min_by_key(|(k, p)| (chebyshev(**p, centre), usize::MAX - k))
                .map_or(0, |(k, _)| k);
            let target = migration
                .path
                .get((near + LEAD).min(migration.path.len().saturating_sub(1)))
                .copied();
            let Some([tx, ty]) = target else { continue };
            let label = format!("fleeing to {}", migration.host);
            let label = crate::text::prefix_chars(&label, 24).to_string();
            let needing: Vec<usize> = walkers
                .iter()
                .copied()
                .filter(|&i| {
                    !self.organisms[i]
                        .journey
                        .as_ref()
                        .is_some_and(|j| j.target == (tx, ty))
                })
                .collect();
            let trips: Vec<_> = needing
                .iter()
                .map(|&i| ((self.organisms[i].x as i32, self.organisms[i].y as i32), (tx, ty)))
                .collect();
            let routes = crate::sim::par::plan_routes(&self.grid, &trips);
            for (&i, steps) in needing.iter().zip(routes) {
                let o = &mut self.organisms[i];
                o.work = None;
                if !o.march_prepared(steps, (tx, ty), &label, tick) {
                    o.begin_journey((tx, ty), &label, tick);
                }
            }
        }
        if arrived.is_empty() && empty.is_empty() {
            return;
        }
        let mut done: Vec<Migration> = Vec::new();
        let all = std::mem::take(&mut self.land.migrations);
        for (m, migration) in all.into_iter().enumerate() {
            if arrived.contains(&m) {
                done.push(migration);
            } else if !empty.contains(&m) {
                self.land.migrations.push(migration);
            }
        }
        for migration in done {
            self.receive_refugees(migration, &index);
        }
    }

    fn receive_refugees(&mut self, mut migration: Migration, index: &BTreeMap<String, usize>) {
        let tick = self.tick_count;
        let walkers: Vec<usize> = migration
            .members
            .iter()
            .filter_map(|id| index.get(id).copied())
            .collect();
        if walkers.is_empty() {
            return;
        }
        let places = self.places();
        let host = places.iter().position(|p| p.id == migration.to_town);
        let name = self.tribe_name(&migration.lineage);
        let host_name = self.tribe_name(&migration.host);
        let welcome = migration.host == migration.lineage
            || host.is_some_and(|h| {
                let p = &places[h];
                let (food, room) = if self.kinship(&p.lineage, &migration.lineage) <= STRANGER {
                    (2 * HOST_FOOD, p.people.len() / 2)
                } else {
                    (HOST_FOOD, p.people.len())
                };
                p.food_each() >= food
                    && walkers.len() <= room
                    && self.diplomacy.relations.standing(&p.lineage, &migration.lineage) >= WELCOME_MOOD
                    && !route_is_embargoed(self, &p.lineage, &migration.lineage)
            });
        if welcome {
            let host_lineage = migration.host.clone();
            for &i in &walkers {
                let o = &mut self.organisms[i];
                o.lineage_id = host_lineage.clone().into();
                o.journey = None;
                o.wander_target = None;
            }
            self.land.stats.welcomed += 1;
            self.land.stats.people_welcomed += walkers.len() as u32;
            if host_lineage != migration.lineage {
                self.remember(&migration.lineage, &host_lineage, MemoryKind::Relief, 0.3);
                self.remember(&host_lineage, &migration.lineage, MemoryKind::Gift, 0.05);
                let detail = format!(
                    "\u{1F3E0} The {host_name} took in {} refugees of the {name}.",
                    walkers.len()
                );
                push_event(&mut self.events, tick, "milestone", &host_name, &detail);
            }
            return;
        }
        self.land.stats.turned_away += 1;
        self.remember(&migration.lineage, &migration.host, MemoryKind::Betrayal, -0.2);
        let detail = format!(
            "\u{1F6AB} The {host_name} turned away {} refugees of the {name}.",
            walkers.len()
        );
        push_event(&mut self.events, tick, "milestone", &host_name, &detail);
        let n = walkers.len() as f32;
        let at = [
            (walkers.iter().map(|&i| self.organisms[i].x).sum::<f32>() / n) as i32,
            (walkers.iter().map(|&i| self.organisms[i].y).sum::<f32>() / n) as i32,
        ];
        if migration.tries == 0 {
            let from = places.iter().position(|p| p.id == migration.from_town);
            if let Some((next, path)) = from.and_then(|f| self.pick_host(&places, f, at, &migration.host)) {
                migration.tries = 1;
                migration.to_town = places[next].id;
                migration.host = places[next].lineage.clone();
                migration.to = places[next].centre;
                migration.path = path;
                migration.departed = tick;
                for &i in &walkers {
                    self.organisms[i].home_x = migration.to[0] as f32;
                    self.organisms[i].home_y = migration.to[1] as f32;
                }
                self.land.migrations.push(migration);
                return;
            }
        }
        let ruin = self
            .land
            .ruins
            .iter()
            .filter(|r| chebyshev(r.center, at) <= SETTLE_REACH)
            .min_by_key(|r| (chebyshev(r.center, at), r.id))
            .map(|r| r.center);
        let home = ruin.unwrap_or_else(|| {
            let dx = (at[0] - migration.to[0]).signum();
            let dy = (at[1] - migration.to[1]).signum();
            let (dx, dy) = if dx == 0 && dy == 0 { (1, 0) } else { (dx, dy) };
            [at[0] + dx * SETTLE_AWAY, at[1] + dy * SETTLE_AWAY]
        });
        let home = [
            home[0].clamp(0, crate::world::grid::WIDTH as i32 - 1),
            home[1].clamp(0, crate::world::grid::HEIGHT as i32 - 1),
        ];
        for &i in &walkers {
            let o = &mut self.organisms[i];
            o.home_x = home[0] as f32;
            o.home_y = home[1] as f32;
            o.journey = None;
            o.wander_target = None;
        }
        self.land.stats.settled += 1;
        let place = if ruin.is_some_and(|r| chebyshev(r, home) <= RESETTLE_REACH) {
            "in the ruins of an old town"
        } else {
            "on open land"
        };
        let detail = format!("\u{26FA} The refugees of the {name} made camp {place}.");
        push_event(&mut self.events, tick, "milestone", &name, &detail);
    }
}

#[cfg(test)]
#[path = "migration_tests.rs"]
mod tests;
