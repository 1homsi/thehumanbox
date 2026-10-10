use super::*;
use crate::sim::agents::age_stage::AgeStage;
use crate::sim::agents::family_outings::{chebyshev, spread};
use crate::sim::era::Era;
use crate::sim::tech::buildings::BuildingKind;
use std::collections::BTreeMap;

/// A market day comes round every this many ticks in each tribe with a working market.
pub const MARKET_DAY_TICKS: u64 = 240;
/// A tribe needs this many people alive before its market day brings in any coin.
pub const MARKET_MIN_PEOPLE: usize = 6;
/// Most coin one market day brings in, however large the tribe.
pub const MARKET_MAX_TAKE: u64 = 6;
/// Every this many market days the chronicle names the day (the rest are counted in the card's earnings).
const MARKET_CHRONICLE_EVERY: u64 = 4;
/// The crowd gathers at the market for this many ticks from the start of each market day.
pub(crate) const MARKET_CROWD_TICKS: u64 = 60;
/// People this close to the market's centre are standing at the market.
const MARKET_STAND_RANGE: i32 = 3;
/// Free people this close to the market are called to it on a market day.
const MARKET_CALL_REACH: i32 = 14;
/// Food a person holds above which they have some to sell at market.
const MARKET_SELLER_SPARE: u8 = 3;
/// Most sales one market crowd makes in a day.
const MARKET_MAX_SALES: usize = 4;
/// What one measure of food costs at market, in coin.
const MARKET_FOOD_PRICE: u32 = 1;

/// The centre tile of the operational market a lineage holds: where its market day crowd gathers,
/// and where caravans bound for its town unload. `None` when the lineage has no working market.
pub(crate) fn market_square(sim: &Simulation, lineage: &str) -> Option<[i32; 2]> {
    market_squares(sim).get(lineage).copied()
}

/// The centre tile of every lineage's working market. A lineage with several markets
/// uses the first (the one nearest the origin), so the choice does not depend on hash order.
fn market_squares(sim: &Simulation) -> BTreeMap<String, [i32; 2]> {
    let mut squares: BTreeMap<String, [i32; 2]> = BTreeMap::new();
    for building in sim
        .buildings
        .iter()
        .filter(|building| building.kind == BuildingKind::Market && building.is_operational())
    {
        let Some(lineage) = building.owner_lineage.as_ref() else {
            continue;
        };
        let (width, height) = building.footprint();
        let square = [
            building.x + i32::from(width) / 2,
            building.y + i32::from(height) / 2,
        ];
        squares
            .entry(lineage.clone())
            .and_modify(|best| *best = (*best).min(square))
            .or_insert(square);
    }
    squares
}

/// On a market day each tribe with a working Market sells to its people and to passing
/// merchants: the coin it takes (one for each eight people, up to `MARKET_MAX_TAKE`) is
/// added to its trade earnings, so the tribe card shows it, and a busy market is named in
/// the chronicle.
pub(super) fn market_days(sim: &mut Simulation) {
    let tick = sim.tick_count;
    if tick == 0 || !tick.is_multiple_of(MARKET_DAY_TICKS) {
        return;
    }
    let owners: BTreeSet<String> = sim
        .buildings
        .iter()
        .filter(|building| building.kind == BuildingKind::Market && building.is_operational())
        .filter_map(|building| building.owner_lineage.clone())
        .collect();
    let day = tick / MARKET_DAY_TICKS;
    for lineage in owners {
        let people = sim
            .organisms
            .iter()
            .filter(|org| org.alive && org.lineage_id == lineage)
            .count();
        if people < MARKET_MIN_PEOPLE {
            continue;
        }
        let take = ((people / 8) as u64).clamp(1, MARKET_MAX_TAKE);
        *sim.trade_income.entry(lineage.clone()).or_default() += take;
        if day.is_multiple_of(MARKET_CHRONICLE_EVERY) {
            let name = sim
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| lineage.clone());
            push_event(
                &mut sim.events,
                tick,
                "trade",
                &name,
                &format!("market day at {name}'s market: {people} people traded and {take} coin came in"),
            );
        }
    }
}

impl Simulation {
    /// On each market day the people of a tribe with a working market walk to it, and those who
    /// reach it stand round its stalls for `MARKET_CROWD_TICKS`. A third of the tribe goes out on
    /// a given day. When the crowd breaks up, its people trade food for coin (see `market_sales`).
    pub(crate) fn tick_market_crowds(&mut self) {
        let tick = self.tick_count;
        let phase = tick % MARKET_DAY_TICKS;
        if tick == 0 || phase >= MARKET_CROWD_TICKS {
            return;
        }
        let squares = market_squares(self);
        if squares.is_empty() {
            return;
        }
        let day = tick / MARKET_DAY_TICKS;
        let closing = phase == MARKET_CROWD_TICKS - 1;
        let mut standing: BTreeMap<String, Vec<usize>> = BTreeMap::new();
        for idx in 0..self.organisms.len() {
            let o = &self.organisms[idx];
            if !o.alive {
                continue;
            }
            let Some(&square) = squares.get(o.lineage_id.as_str()) else {
                continue;
            };
            let stage = AgeStage::from_age(o.age, o.max_age);
            if stage == AgeStage::Infant || stage == AgeStage::Child {
                continue;
            }
            let distance = chebyshev((o.x as i32, o.y as i32), (square[0], square[1]));
            if distance <= MARKET_STAND_RANGE {
                if closing {
                    standing.entry(o.lineage_id.clone()).or_default().push(idx);
                }
                self.organisms[idx].think("trading at the market", tick);
                continue;
            }
            let fit = o.energy > 0.6 && o.hydration > 0.5 && o.health > 0.5;
            let free = o.journey.is_none() && o.wander_target.is_none();
            if distance > MARKET_CALL_REACH
                || !fit
                || !free
                || !(day + idx as u64).is_multiple_of(3)
                || tick % 20 != idx as u64 % 20
            {
                continue;
            }
            // Someone whose way there is blocked is skipped (see `set_outing_target`).
            let target = (
                square[0] + spread(idx, tick, 5, MARKET_STAND_RANGE - 1),
                square[1] + spread(idx, tick, 6, MARKET_STAND_RANGE - 1),
            );
            if self.set_outing_target(idx, target) {
                self.organisms[idx].think("heading to the market", tick);
            }
        }
        if closing {
            for (lineage, attendees) in standing {
                self.market_sales(&lineage, &attendees);
            }
        }
    }

    /// The food sold when a market crowd breaks up: each sale moves one measure of food from a
    /// seller's pack to a buyer's, and the coin the other way, and is logged as a trade. Only
    /// from the coin age on: the Stone age trades in kind and has no coin to pay.
    fn market_sales(&mut self, lineage: &str, attendees: &[usize]) {
        let tick = self.tick_count;
        let coin_age = self
            .lineage_eras
            .get(lineage)
            .is_some_and(|era| *era >= Era::Bronze);
        if !coin_age {
            return;
        }
        let sellers: Vec<usize> = attendees
            .iter()
            .copied()
            .filter(|&i| self.organisms[i].inv_food > MARKET_SELLER_SPARE)
            .collect();
        let buyers: Vec<usize> = attendees
            .iter()
            .copied()
            .filter(|&i| self.organisms[i].inv_food == 0 && self.organisms[i].wealth >= MARKET_FOOD_PRICE)
            .collect();
        for (&seller, &buyer) in sellers.iter().zip(buyers.iter()).take(MARKET_MAX_SALES) {
            let seller_id = self.organisms[seller].id.clone();
            let buyer_id = self.organisms[buyer].id.clone();
            {
                let seller_org = &mut self.organisms[seller];
                seller_org.inv_food -= 1;
                seller_org.wealth = seller_org.wealth.saturating_add(MARKET_FOOD_PRICE);
            }
            {
                let buyer_org = &mut self.organisms[buyer];
                buyer_org.inv_food += 1;
                buyer_org.wealth = buyer_org.wealth.saturating_sub(MARKET_FOOD_PRICE);
            }
            self.trades.push_back(Trade {
                tick,
                buyer_id,
                seller_id,
                good: "food".to_string(),
                amount: 1,
                price: MARKET_FOOD_PRICE,
            });
            while self.trades.len() > TRADE_LOG_CAP {
                self.trades.pop_front();
            }
        }
    }
}
