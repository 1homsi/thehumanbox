use std::collections::{BTreeMap, BTreeSet};

use crate::sim::civ::civ_tick::town::PARENT_REACH;
use crate::sim::civ::trade_routes::{route_is_embargoed, send_cargo, CaravanKind};
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;

pub const SUPPLY_STEP: u64 = DAY_LENGTH;
const SUPPLY_PHASE: u64 = DAY_LENGTH * 3 / 4;
pub const GOODS: [&str; 3] = ["food", "wood", "stone"];
const NEED: [u32; 3] = [3, 1, 1];
const KEEP: [u32; 3] = [6, 3, 3];
const MIN_PEOPLE: usize = 3;
const MIN_LOAD: u32 = 6;
const MAX_LOAD: u32 = 24;
const MAX_PER_DAY: usize = 16;
const SUPPLY_REACH: i32 = 120;
const CANDIDATES: usize = 4;
const OVERLAND_REACH: i32 = 40;
const OVERLAND_COST: u64 = 2;
const HELD: u8 = 1;
const BUILD_STONE: u32 = 3;

#[derive(Clone, Copy, Debug)]
enum Source {
    Store(usize),
    Person(usize),
}

#[derive(Clone, Debug, Default)]
struct Ledger {
    id: u32,
    lineage: String,
    centre: [i32; 2],
    people: Vec<usize>,
    stores: Vec<usize>,
    stock: [u32; 3],
    builders: u32,
}

impl Ledger {
    fn building(&self, good: usize) -> u32 {
        if good == 2 {
            self.builders * BUILD_STONE
        } else {
            0
        }
    }

    fn short(&self, good: usize) -> u32 {
        if self.people.len() < MIN_PEOPLE {
            return 0;
        }
        (NEED[good] * self.people.len() as u32 + self.building(good)).saturating_sub(self.stock[good])
    }

    fn spare(&self, good: usize) -> u32 {
        if self.people.len() < MIN_PEOPLE {
            return 0;
        }
        self.stock[good].saturating_sub(KEEP[good] * self.people.len() as u32 + self.building(good))
    }
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

fn manhattan(a: [i32; 2], b: [i32; 2]) -> u64 {
    u64::from((a[0] - b[0]).unsigned_abs() + (a[1] - b[1]).unsigned_abs())
}

fn held(o: &crate::organism::organism::Organism, good: usize) -> u8 {
    match good {
        0 => o.inv_food,
        1 => o.inv_wood,
        _ => o.inv_stone,
    }
}

fn held_mut(o: &mut crate::organism::organism::Organism, good: usize) -> &mut u8 {
    match good {
        0 => &mut o.inv_food,
        1 => &mut o.inv_wood,
        _ => &mut o.inv_stone,
    }
}

impl Simulation {
    pub(crate) fn tick_supply(&mut self) {
        if self.tick_count == 0 || self.tick_count % SUPPLY_STEP != SUPPLY_PHASE || self.towns.is_empty() {
            return;
        }
        let mut ledgers = self.ledgers();
        for ledger in &ledgers {
            let (mut short, mut spare) = (0u8, 0u8);
            for good in 0..GOODS.len() {
                if ledger.short(good) >= MIN_LOAD {
                    short |= 1 << good;
                }
                if ledger.spare(good) >= MIN_LOAD {
                    spare |= 1 << good;
                }
            }
            if let Some(town) = self.towns.iter_mut().find(|t| t.id == ledger.id) {
                town.short = short;
                town.spare = spare;
            }
        }
        self.match_supply(&mut ledgers);
    }

    fn ledgers(&self) -> Vec<Ledger> {
        let mut ledgers: Vec<Ledger> = self
            .towns
            .iter()
            .map(|t| Ledger {
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
        let town_of = |lineage: &str, at: [i32; 2]| -> Option<usize> {
            by_lineage.get(lineage).and_then(|list| {
                list.iter()
                    .map(|&i| (chebyshev(self.towns[i].center, at), self.towns[i].id, i))
                    .filter(|&(d, _, _)| d <= PARENT_REACH)
                    .min()
                    .map(|(_, _, i)| i)
            })
        };
        for (idx, o) in self.organisms.iter().enumerate().filter(|(_, o)| o.alive) {
            if let Some(i) = town_of(&o.lineage_id, [o.home_x as i32, o.home_y as i32]) {
                let l = &mut ledgers[i];
                l.people.push(idx);
                if o.fetch_stone_until > self.tick_count {
                    l.builders += 1;
                }
                l.stock[0] += u32::from(o.inv_food);
                l.stock[1] += u32::from(o.inv_wood);
                l.stock[2] += u32::from(o.inv_stone);
            }
        }
        let index: BTreeMap<u32, usize> = self.towns.iter().enumerate().map(|(i, t)| (t.id, i)).collect();
        for (bi, b) in self.buildings.iter().enumerate() {
            if !matches!(b.kind, BuildingKind::Granary | BuildingKind::Warehouse) || !b.is_operational() {
                continue;
            }
            let Some(&i) = b.town.and_then(|id| index.get(&id)) else {
                continue;
            };
            if b.owner_lineage.as_deref() == Some(ledgers[i].lineage.as_str()) {
                ledgers[i].stock[0] += b.stock;
                ledgers[i].stores.push(bi);
            }
        }
        ledgers
    }

    fn supply_friends(&self, donor: &str, needy: &str) -> bool {
        donor == needy
            || (!route_is_embargoed(self, donor, needy) && self.befriends(donor, needy, &BTreeMap::new()))
    }

    fn match_supply(&mut self, ledgers: &mut [Ledger]) {
        let mut en_route: BTreeSet<([i32; 2], String)> = self
            .caravans
            .iter()
            .filter(|c| c.kind == CaravanKind::Supply)
            .map(|c| (c.to, c.cargo.clone()))
            .collect();
        let mut sent = 0;
        for good in 0..GOODS.len() {
            let mut needy: Vec<(u32, u32, usize)> = ledgers
                .iter()
                .enumerate()
                .filter(|(_, l)| l.short(good) >= MIN_LOAD)
                .map(|(i, l)| (u32::MAX - l.short(good), l.id, i))
                .collect();
            needy.sort_unstable();
            for (_, _, n) in needy {
                if sent >= MAX_PER_DAY {
                    return;
                }
                let to = ledgers[n].centre;
                if en_route.contains(&(to, GOODS[good].to_string())) {
                    continue;
                }
                let mut near: Vec<(i32, u32, usize)> = ledgers
                    .iter()
                    .enumerate()
                    .filter(|&(d, l)| {
                        d != n && l.spare(good) >= MIN_LOAD && chebyshev(l.centre, to) <= SUPPLY_REACH
                    })
                    .filter(|(_, l)| self.supply_friends(&l.lineage, &ledgers[n].lineage))
                    .map(|(d, l)| (chebyshev(l.centre, to), l.id, d))
                    .collect();
                near.sort_unstable();
                let donor = near
                    .into_iter()
                    .take(CANDIDATES)
                    .filter_map(|(gap, id, d)| {
                        match crate::sim::civ::land::road_net::caravan_way(self, ledgers[d].centre, to) {
                            Some(way) => Some((way.walk, id, d)),
                            None if gap <= OVERLAND_REACH => {
                                Some((OVERLAND_COST * manhattan(ledgers[d].centre, to), id, d))
                            }
                            None => None,
                        }
                    })
                    .min();
                let Some((_, _, d)) = donor else {
                    continue;
                };
                let want = ledgers[n].short(good).min(ledgers[d].spare(good)).min(MAX_LOAD);
                let taken = self.take_supply(&ledgers[d], good, want);
                let amount: u32 = taken.iter().map(|&(_, a)| a).sum();
                if amount == 0 {
                    continue;
                }
                let (sender, receiver) = (ledgers[d].lineage.clone(), ledgers[n].lineage.clone());
                let from = ledgers[d].centre;
                if !send_cargo(
                    self,
                    &sender,
                    &receiver,
                    from,
                    to,
                    GOODS[good],
                    amount,
                    CaravanKind::Supply,
                ) {
                    self.give_back(good, &taken);
                    continue;
                }
                let on_road = self.caravans.last().is_some_and(|c| !c.way.is_empty());
                ledgers[d].stock[good] -= amount;
                ledgers[n].stock[good] += amount;
                en_route.insert((to, GOODS[good].to_string()));
                sent += 1;
                let stats = &mut self.diplomacy.stats;
                stats.supply_sent += 1;
                stats.supply_units[good] += amount;
                if on_road {
                    stats.supply_on_roads += 1;
                }
                if sender == receiver {
                    stats.supply_within += 1;
                } else {
                    stats.supply_between += 1;
                }
                let from_role = self
                    .towns
                    .iter()
                    .find(|t| t.id == ledgers[d].id)
                    .map(|t| t.role.name())
                    .unwrap_or("");
                let name = self.tribe_name(&sender);
                let detail = if sender == receiver {
                    format!(
                        "sent {amount} {} from their {from_role} town to a town short of it",
                        GOODS[good]
                    )
                } else {
                    format!(
                        "sent {amount} {} from their {from_role} town to the {}, who were short of it",
                        GOODS[good],
                        self.tribe_name(&receiver)
                    )
                };
                let now = self.tick_count;
                push_event(&mut self.events, now, "trade", &name, &detail);
            }
        }
    }

    fn take_supply(&mut self, ledger: &Ledger, good: usize, want: u32) -> Vec<(Source, u32)> {
        let mut taken = Vec::new();
        let mut left = want;
        if good == 0 {
            let mut stores: Vec<(u32, u32, usize)> = ledger
                .stores
                .iter()
                .map(|&i| (u32::MAX - self.buildings[i].stock, self.buildings[i].id, i))
                .collect();
            stores.sort_unstable();
            for (_, _, i) in stores {
                if left == 0 {
                    break;
                }
                let take = self.buildings[i].stock.min(left);
                if take > 0 {
                    self.buildings[i].stock -= take;
                    left -= take;
                    taken.push((Source::Store(i), take));
                }
            }
        }
        let mut carriers: Vec<(u8, usize)> = ledger
            .people
            .iter()
            .filter(|&&i| held(&self.organisms[i], good) > HELD)
            .map(|&i| (u8::MAX - held(&self.organisms[i], good), i))
            .collect();
        carriers.sort_unstable();
        for (_, i) in carriers {
            if left == 0 {
                break;
            }
            let slot = held_mut(&mut self.organisms[i], good);
            let take = u32::from(*slot - HELD).min(left);
            *slot -= take as u8;
            left -= take;
            taken.push((Source::Person(i), take));
        }
        taken
    }

    fn give_back(&mut self, good: usize, taken: &[(Source, u32)]) {
        for &(at, amount) in taken {
            match at {
                Source::Person(i) => {
                    let slot = held_mut(&mut self.organisms[i], good);
                    *slot = slot.saturating_add(amount.min(u32::from(u8::MAX)) as u8);
                }
                Source::Store(i) => self.buildings[i].stock += amount,
            }
        }
    }
}

#[cfg(test)]
#[path = "supply_tests.rs"]
mod tests;
