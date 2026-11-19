use std::collections::{BTreeMap, BTreeSet};

use crate::sim::civ::society::relations::MemoryKind;
use crate::sim::civ::trade_routes::{send_shipment, CaravanKind};
use crate::sim::civ::warfare::TreatyKind;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;

const RELIEF_STEP: u64 = DAY_LENGTH / 2;
const FAMINE_SHARE: f32 = 0.3;
const SPARE_FOOD: u8 = 1;
const FAMINE_MIN_PEOPLE: usize = 4;
const DONOR_HUNGRY_MAX: f32 = 0.15;
const DONOR_MIN_STOCK: u32 = 16;
const RELIEF_MAX: u32 = 40;
const RELIEF_REACH: i32 = 100;
const FRIENDLY: f32 = 0.2;
const TRIBUTE_EVERY_DAYS: u64 = 2;
const TRIBUTE_MIN: u32 = 4;
const TRIBUTE_MAX: u32 = 16;

#[derive(Clone, Copy, Debug, Default)]
struct Larder {
    pop: usize,
    hungry: usize,
    stock: u32,
    centre: Option<[i32; 2]>,
    sum: (f64, f64),
}

impl Larder {
    fn hunger(&self) -> f32 {
        self.hungry as f32 / self.pop.max(1) as f32
    }
}

fn chebyshev(a: [i32; 2], b: [i32; 2]) -> i32 {
    (a[0] - b[0]).abs().max((a[1] - b[1]).abs())
}

impl Simulation {
    pub(crate) fn tick_relief(&mut self) {
        if self.tick_count == 0 || self.tick_count % RELIEF_STEP != RELIEF_STEP / 2 {
            return;
        }
        let mut larders = self.larders();
        self.send_relief(&mut larders);
        if self.tick_count % (DAY_LENGTH * TRIBUTE_EVERY_DAYS) == RELIEF_STEP / 2 {
            self.send_tribute(&mut larders);
        }
    }

    fn larders(&self) -> BTreeMap<String, Larder> {
        let mut larders: BTreeMap<String, Larder> = BTreeMap::new();
        for o in self.organisms.iter().filter(|o| o.alive) {
            let l = larders.entry(o.lineage_id.to_string()).or_default();
            l.pop += 1;
            l.sum.0 += f64::from(o.x);
            l.sum.1 += f64::from(o.y);
            if o.inv_food == 0 && o.energy < 0.6 {
                l.hungry += 1;
            }
            l.stock += u32::from(o.inv_food.saturating_sub(SPARE_FOOD));
        }
        for (lineage, stock) in crate::sim::civ::land::village_stores::food_stores(self) {
            if let Some(l) = larders.get_mut(&lineage) {
                l.stock += stock;
            }
        }
        let mut first: BTreeMap<&str, u32> = BTreeMap::new();
        for t in &self.towns {
            let e = first.entry(t.lineage.as_str()).or_insert(t.id);
            if t.id <= *e {
                *e = t.id;
                if let Some(l) = larders.get_mut(t.lineage.as_str()) {
                    l.centre = Some(t.center);
                }
            }
        }
        for l in larders.values_mut().filter(|l| l.centre.is_none()) {
            let n = l.pop.max(1) as f64;
            l.centre = Some([(l.sum.0 / n) as i32, (l.sum.1 / n) as i32]);
        }
        larders
    }

    pub(crate) fn befriends(
        &self,
        donor: &str,
        needy: &str,
        moods: &BTreeMap<String, BTreeMap<String, f32>>,
    ) -> bool {
        let mood = moods
            .get(donor)
            .and_then(|m| m.get(needy))
            .copied()
            .unwrap_or(0.0);
        let tick = self.tick_count;
        self.same_side(donor, needy)
            || self.treaties.iter().any(|t| {
                t.signed_tick <= tick
                    && t.expires_tick > tick
                    && matches!(
                        t.kind,
                        TreatyKind::Alliance | TreatyKind::Defensive | TreatyKind::Trade
                    )
                    && ((t.lineage_a == donor && t.lineage_b == needy)
                        || (t.lineage_a == needy && t.lineage_b == donor))
            })
            || self.opinion_with_mood(donor, needy, mood) >= FRIENDLY
    }

    fn send_relief(&mut self, larders: &mut BTreeMap<String, Larder>) {
        let en_route: BTreeSet<String> = self
            .caravans
            .iter()
            .filter(|c| c.kind == CaravanKind::Relief)
            .map(|c| c.receiver_lineage.clone())
            .collect();
        let mut members: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for (i, o) in self.organisms.iter().enumerate().filter(|(_, o)| o.alive) {
            members.entry(o.lineage_id.to_string()).or_default().push(i);
        }
        let needy: Vec<String> = larders
            .iter()
            .filter(|(l, t)| {
                t.pop >= FAMINE_MIN_PEOPLE
                    && t.hunger() >= FAMINE_SHARE
                    && t.centre.is_some()
                    && !en_route.contains(*l)
            })
            .map(|(l, _)| l.clone())
            .collect();
        let moods: BTreeMap<String, BTreeMap<String, f32>> = if needy.is_empty() {
            BTreeMap::new()
        } else {
            members
                .iter()
                .map(|(l, m)| {
                    (
                        l.clone(),
                        crate::sim::civ::warfare::tribe_mood(&self.organisms, m),
                    )
                })
                .collect()
        };
        for needy in needy {
            let Some(to) = larders[&needy].centre else {
                continue;
            };
            let donor = larders
                .iter()
                .filter(|(d, t)| {
                    **d != needy
                        && t.stock >= DONOR_MIN_STOCK
                        && t.hunger() <= DONOR_HUNGRY_MAX
                        && t.centre.is_some_and(|c| chebyshev(c, to) <= RELIEF_REACH)
                })
                .filter(|(d, _)| self.befriends(d, &needy, &moods))
                .map(|(d, t)| (t.centre.map_or(i32::MAX, |c| chebyshev(c, to)), d.clone()))
                .min();
            let Some((_, donor)) = donor else {
                continue;
            };
            let Some(from) = larders[&donor].centre else {
                continue;
            };
            let want = (larders[&donor].stock / 3).min(RELIEF_MAX);
            let sent = self.withdraw_food(&donor, want);
            if sent == 0 {
                continue;
            }
            if let Some(l) = larders.get_mut(&donor) {
                l.stock = l.stock.saturating_sub(sent);
            }
            if !send_shipment(self, &donor, &needy, from, to, sent, CaravanKind::Relief) {
                crate::sim::civ::land::village_stores::deposit(self, &donor, sent);
                continue;
            }
            self.diplomacy.stats.relief_shipments += 1;
            self.diplomacy.stats.relief_food += sent;
            let line = format!(
                "\u{1F33E} The {} sent {sent} measures of grain to the starving {}.",
                self.tribe_name(&donor),
                self.tribe_name(&needy)
            );
            let now = self.tick_count;
            push_event(&mut self.events, now, "milestone", "world", &line);
            self.headlines.push_back((now, line));
            while self.headlines.len() > 80 {
                self.headlines.pop_front();
            }
        }
    }

    fn send_tribute(&mut self, larders: &mut BTreeMap<String, Larder>) {
        let tick = self.tick_count;
        let mut owed: Vec<(String, String)> = self
            .treaties
            .iter()
            .filter(|t| t.kind == TreatyKind::Vassalage && t.signed_tick <= tick && t.expires_tick > tick)
            .map(|t| (t.lineage_a.clone(), t.lineage_b.clone()))
            .collect();
        owed.sort();
        owed.dedup();
        for (vassal, overlord) in owed {
            let (Some(v), Some(o)) = (larders.get(&vassal).copied(), larders.get(&overlord).copied()) else {
                continue;
            };
            let (Some(from), Some(to)) = (v.centre, o.centre) else {
                continue;
            };
            if v.hunger() >= FAMINE_SHARE || v.stock < TRIBUTE_MIN * 2 {
                continue;
            }
            let want = (v.stock / 8).clamp(TRIBUTE_MIN, TRIBUTE_MAX);
            let sent = self.withdraw_food(&vassal, want);
            if sent == 0 {
                continue;
            }
            if let Some(l) = larders.get_mut(&vassal) {
                l.stock = l.stock.saturating_sub(sent);
            }
            if !send_shipment(self, &vassal, &overlord, from, to, sent, CaravanKind::Tribute) {
                crate::sim::civ::land::village_stores::deposit(self, &vassal, sent);
                continue;
            }
            self.diplomacy.stats.tribute_shipments += 1;
            let name = self.tribe_name(&vassal);
            let detail = format!(
                "sent {sent} measures of grain as tribute to the {}",
                self.tribe_name(&overlord)
            );
            push_event(&mut self.events, tick, "trade", &name, &detail);
        }
    }

    fn withdraw_food(&mut self, lineage: &str, want: u32) -> u32 {
        let mut stores: Vec<(u32, u32, usize)> = self
            .buildings
            .iter()
            .enumerate()
            .filter(|(_, b)| {
                matches!(b.kind, BuildingKind::Granary | BuildingKind::Warehouse)
                    && b.is_operational()
                    && b.stock > 0
                    && b.owner_lineage.as_deref() == Some(lineage)
            })
            .map(|(i, b)| (u32::MAX - b.stock, b.id, i))
            .collect();
        stores.sort_unstable();
        let mut left = want;
        for (_, _, i) in stores {
            if left == 0 {
                break;
            }
            let take = self.buildings[i].stock.min(left);
            self.buildings[i].stock -= take;
            left -= take;
        }
        let mut carriers: Vec<(u8, usize)> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == lineage && o.inv_food > SPARE_FOOD)
            .map(|(i, o)| (u8::MAX - o.inv_food, i))
            .collect();
        carriers.sort_unstable();
        for (_, i) in carriers {
            if left == 0 {
                break;
            }
            let o = &mut self.organisms[i];
            let take = u32::from(o.inv_food - SPARE_FOOD).min(left);
            o.inv_food -= take as u8;
            left -= take;
        }
        want - left
    }

    pub(crate) fn note_shipment_delivered(&mut self, kind: CaravanKind, sender: &str, receiver: &str) {
        match kind {
            CaravanKind::Trade => self.remember_both(sender, receiver, MemoryKind::Trade, 0.02),
            CaravanKind::Relief => {
                self.remember(receiver, sender, MemoryKind::Relief, 0.3);
                self.remember(sender, receiver, MemoryKind::Gift, 0.05);
            }
            CaravanKind::Tribute => {
                self.remember(sender, receiver, MemoryKind::Tribute, -0.05);
                self.remember(receiver, sender, MemoryKind::Tribute, 0.03);
            }
            CaravanKind::Supply => {
                self.diplomacy.stats.supply_delivered += 1;
                if sender != receiver {
                    self.remember_both(sender, receiver, MemoryKind::Trade, 0.02);
                }
            }
        }
    }
}
