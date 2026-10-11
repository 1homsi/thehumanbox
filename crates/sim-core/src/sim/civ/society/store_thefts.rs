//! Thieves at the granary. A hungry adult of a tribe with a granary that holds grain may slip in and take some
//! of it. The tribe's guards (the nearest idle adults) set out after the thief, and the thief runs off. The
//! chase ends in a catch (the grain goes back, and the thief is frightened) or the thief gets away with it
//! (and eats). Each theft is written into the chronicle.
//!
//! Runs once a day. The granaries are visited in building order, and every draw is in that fixed order.

use crate::sim::agents::age_stage::AgeStage;
use crate::sim::agents::family_outings::chebyshev;
use crate::sim::civ::land::village_stores::GRANARY_CAP;
use crate::sim::simulation::Simulation;
use crate::sim::tech::buildings::BuildingKind;
use crate::sim::world_events::push_event;
use rand::RngExt;

/// A granary is robbed only when it holds at least this much grain.
const MIN_STOCK: u32 = 4;
/// Measures of grain taken in one theft.
const TAKEN: u32 = 4;
/// Chance per day that a granary with a hungry adult near it is robbed.
const THEFT_PER_DAY: f32 = 0.12;
/// Guards who set out after a thief.
const GUARDS: usize = 2;
/// People this close to the granary (in tiles) can rob it or guard it.
const NEAR_GRANARY: i32 = 12;
/// Chance that the guards catch the thief.
const CATCH_CHANCE: f32 = 0.5;
/// Fewest living people in a tribe for a theft to count.
const MIN_PEOPLE: usize = 6;
/// How far (in tiles) the thief runs from the granary.
const FLEE_TILES: i32 = 8;

impl Simulation {
    /// The daily check for thefts from the tribes' granaries.
    pub(crate) fn tick_store_thefts(&mut self, tick: u64) {
        let granaries: Vec<usize> = self
            .buildings
            .iter()
            .enumerate()
            .filter(|(_, b)| {
                matches!(b.kind, BuildingKind::Granary | BuildingKind::Bakery)
                    && b.is_operational()
                    && b.stock >= MIN_STOCK
                    && b.owner_lineage.is_some()
            })
            .map(|(i, _)| i)
            .collect();
        for bi in granaries {
            let granary = (self.buildings[bi].x, self.buildings[bi].y);
            let stock = self.buildings[bi].stock;
            let lid = self.buildings[bi].owner_lineage.clone().unwrap_or_default();
            let people = self
                .organisms
                .iter()
                .filter(|o| o.alive && o.lineage_id == lid)
                .count();
            if people < MIN_PEOPLE || self.rng.random::<f32>() >= THEFT_PER_DAY {
                continue;
            }
            // The thief is the hungriest idle adult of the tribe near the granary (the lowest energy, then the first).
            let thief = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(_, o)| {
                    o.alive
                        && o.lineage_id == lid
                        && !matches!(o.age_stage(), AgeStage::Infant | AgeStage::Child)
                        && chebyshev((o.x as i32, o.y as i32), granary) <= NEAR_GRANARY
                })
                .min_by(|a, b| {
                    a.1.energy
                        .partial_cmp(&b.1.energy)
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then(a.0.cmp(&b.0))
                })
                .map(|(i, _)| i);
            let Some(t) = thief else { continue };
            let taken = TAKEN.min(stock);
            self.buildings[bi].stock -= taken;
            let thief_pos = (self.organisms[t].x as i32, self.organisms[t].y as i32);
            // The guards are the nearest idle, fit adults of the tribe, other than the thief.
            let mut guards: Vec<(i32, usize)> = self
                .organisms
                .iter()
                .enumerate()
                .filter(|(i, o)| {
                    *i != t
                        && o.alive
                        && o.lineage_id == lid
                        && o.journey.is_none()
                        && o.wander_target.is_none()
                        && o.energy >= 0.35
                        && o.fear_level <= 0.6
                        && !matches!(o.age_stage(), AgeStage::Infant | AgeStage::Child)
                })
                .map(|(i, o)| (chebyshev((o.x as i32, o.y as i32), thief_pos), i))
                .filter(|(d, _)| *d <= NEAR_GRANARY)
                .collect();
            guards.sort_unstable();
            let caught = self.rng.random::<f32>() < CATCH_CHANCE;
            let name = self
                .lineage_names
                .get(&lid)
                .cloned()
                .unwrap_or_else(|| "A tribe".to_string());

            self.organisms[t].think("stealing grain", tick);
            // The thief runs away from the granary, if there is open ground that way.
            let dx = (thief_pos.0 - granary.0).signum() * FLEE_TILES;
            let dy = (thief_pos.1 - granary.1).signum() * FLEE_TILES;
            let away = (thief_pos.0 + dx, thief_pos.1 + dy);
            if self.grid.get(away.0, away.1).walkable() {
                self.organisms[t].begin_journey(away, "running from the guards", tick);
            }
            for &(_, g) in guards.iter().take(GUARDS) {
                self.organisms[g].begin_journey(thief_pos, "chasing a thief", tick);
            }
            if caught {
                self.buildings[bi].stock = (self.buildings[bi].stock + taken).min(GRANARY_CAP);
                let fear = &mut self.organisms[t].fear_level;
                *fear = (*fear + 0.2).min(1.0);
                let detail = format!(
                    "a thief took {taken} measures of grain from the granary, and the guards caught them"
                );
                push_event(&mut self.events, tick, "theft", &name, &detail);
            } else {
                let energy = &mut self.organisms[t].energy;
                *energy = (*energy + 0.2).min(1.0);
                let detail = format!("a thief took {taken} measures of grain from the granary and got away");
                push_event(&mut self.events, tick, "theft", &name, &detail);
            }
        }
    }
}
