use super::*;
use crate::sim::civ::society::economy::LAND_GOODS;
use std::collections::BTreeMap;

/// How often each tribe's specialty is looked at again.
pub const SPECIALTY_TICKS: u64 = 480;
/// A tribe holding fewer land goods than this has no specialty yet.
pub const SPECIALTY_MIN_GOODS: u32 = 12;
/// The good must make up at least this share (percent) of the tribe's land goods.
pub const SPECIALTY_SHARE_PERCENT: u32 = 50;
/// A specialised tribe finds its own good this much more often (capped at certainty).
pub const SPECIALTY_BONUS: f32 = 1.5;

/// The town name a specialty gives a tribe ("a mining town"), or None for an unknown good.
pub fn specialty_town(good: &str) -> Option<&'static str> {
    Some(match good {
        "ore" => "mining town",
        "salt" => "salt town",
        "clay" => "pottery town",
        "spice" => "spice town",
        "ochre" => "ochre town",
        "fur" => "fur town",
        _ => return None,
    })
}

/// The land good a tribe is known for, if it has a specialty.
pub fn specialty_good_of<'a>(sim: &'a Simulation, lineage: &str) -> Option<&'a str> {
    sim.specialties.get(lineage).map(String::as_str)
}

/// Every `SPECIALTY_TICKS`, a tribe that holds most of its land goods in one kind becomes known
/// for it. The bonus applies when the people of that tribe find that good (see `yield_land_good`).
/// A tribe that gains a specialty is named in the chronicle.
pub(super) fn update_specialties(sim: &mut Simulation) {
    let tick = sim.tick_count;
    if tick == 0 || !tick.is_multiple_of(SPECIALTY_TICKS) {
        return;
    }
    let mut holdings: BTreeMap<String, BTreeMap<&'static str, u32>> = BTreeMap::new();
    for org in sim
        .organisms
        .iter()
        .filter(|org| org.alive && !org.lineage_id.is_empty())
    {
        let entry = holdings.entry(org.lineage_id.clone()).or_default();
        for &good in LAND_GOODS {
            *entry.entry(good).or_default() += u32::from(org.land_good_count(good));
        }
    }
    for (lineage, goods) in holdings {
        let total: u32 = goods.values().sum();
        let top = goods
            .iter()
            .max_by_key(|(good, count)| (**count, std::cmp::Reverse(**good)))
            .map(|(good, count)| (*good, *count));
        let specialty = top.filter(|&(_, count)| {
            total >= SPECIALTY_MIN_GOODS && count * 100 >= total * SPECIALTY_SHARE_PERCENT
        });
        match specialty {
            Some((good, _)) => {
                if sim.specialties.get(&lineage).map(String::as_str) != Some(good) {
                    sim.specialties.insert(lineage.clone(), good.to_string());
                    if let Some(town) = specialty_town(good) {
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
                            &format!("{name} became known as a {town}"),
                        );
                    }
                }
            }
            None => {
                sim.specialties.remove(&lineage);
            }
        }
    }
    // Tribes with no people left lose their specialty.
    let living: std::collections::BTreeSet<String> = sim
        .organisms
        .iter()
        .filter(|org| org.alive)
        .map(|org| org.lineage_id.clone())
        .collect();
    sim.specialties.retain(|lineage, _| living.contains(lineage));
}
