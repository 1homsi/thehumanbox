use super::*;
use crate::sim::tech::buildings::BuildingKind;

/// A market day comes round every this many ticks in each tribe with a working market.
pub const MARKET_DAY_TICKS: u64 = 240;
/// A tribe needs this many people alive before its market day brings in any coin.
pub const MARKET_MIN_PEOPLE: usize = 6;
/// Most coin one market day brings in, however large the tribe.
pub const MARKET_MAX_TAKE: u64 = 6;
/// Every this many market days the chronicle names the day (the rest are counted in the card's earnings).
const MARKET_CHRONICLE_EVERY: u64 = 4;

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
