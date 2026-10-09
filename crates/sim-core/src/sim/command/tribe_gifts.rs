use super::Simulation;
use crate::sim::world_events::push_event;
use crate::world::grid::{HEIGHT, WIDTH};
use rand::RngExt;

/// How far from a click the tribe nearest to it is found, in tiles, unless the radius says otherwise.
const DEFAULT_REACH: f32 = 8.0;
const MAX_REACH: f32 = 20.0;
/// Portions of food each living member of a tribe gets from a tribe food gift.
const FOOD_PER_PERSON: u8 = 1;
/// The tool a tribe tool gift hands to each member.
const TRIBE_TOOL: &str = "stone_tools";
/// A member with at least this many portions in the pack can spare one for a trade.
const SPARE_FROM: u8 = 2;
/// Most portions a trade carries from one tribe to the other.
const MAX_TRADE: usize = 30;

fn reach_of(radius: f32) -> f32 {
    if radius > 0.0 {
        radius.min(MAX_REACH)
    } else {
        DEFAULT_REACH
    }
}

impl Simulation {
    /// A gift for a whole tribe: every living member of the tribe nearest the point gets a portion of food, or a
    /// stone tool. False for an unknown gift or when no tribe is in reach.
    pub(super) fn cmd_tribe_gift(&mut self, x: f32, y: f32, radius: f32, what: String) -> bool {
        if !x.is_finite() || !y.is_finite() || !matches!(what.as_str(), "food" | "tool") {
            return false;
        }
        let Some(lineage) = self.nearest_living_lineage(x, y, reach_of(radius)) else {
            return false;
        };
        let mut given = 0usize;
        for person in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == lineage)
        {
            if what == "food" {
                person.inv_food = person.inv_food.saturating_add(FOOD_PER_PERSON);
            } else {
                person.give_tool(TRIBE_TOOL);
            }
            given += 1;
        }
        let name = self
            .lineage_names
            .get(&lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".into());
        let gift = if what == "food" { "food" } else { "stone tools" };
        push_event(
            &mut self.events,
            self.tick_count,
            "tribe",
            &name,
            &format!("{name} was given {gift} for all {given} of its people"),
        );
        true
    }

    /// The tribe nearest the point moves to it: every living member is set down in a loose group around the
    /// click, as a people on the move would arrive. False when no tribe is in reach.
    pub(super) fn cmd_migrate_tribe(&mut self, x: f32, y: f32, radius: f32) -> bool {
        if !x.is_finite() || !y.is_finite() {
            return false;
        }
        let Some(lineage) = self.nearest_living_lineage(x, y, reach_of(radius)) else {
            return false;
        };
        let mut moved = 0usize;
        for i in 0..self.organisms.len() {
            if !(self.organisms[i].alive && self.organisms[i].lineage_id == lineage) {
                continue;
            }
            let jx = (x + self.rng.random_range(-2.0..2.0)).clamp(2.0, WIDTH as f32 - 2.0);
            let jy = (y + self.rng.random_range(-2.0..2.0)).clamp(2.0, HEIGHT as f32 - 2.0);
            let spot = if self.grid.get(jx as i32, jy as i32).walkable() {
                (jx, jy)
            } else {
                (
                    x.clamp(2.0, WIDTH as f32 - 2.0),
                    y.clamp(2.0, HEIGHT as f32 - 2.0),
                )
            };
            self.organisms[i].x = spot.0;
            self.organisms[i].y = spot.1;
            moved += 1;
        }
        let name = self
            .lineage_names
            .get(&lineage)
            .cloned()
            .unwrap_or_else(|| "a tribe".into());
        push_event(
            &mut self.events,
            self.tick_count,
            "tribe",
            &name,
            &format!("{name} moved its {moved} people to a new site at ({x:.0}, {y:.0})"),
        );
        true
    }

    /// A trade between two tribes: the tribe of the first click sends food to the tribe of the second. Each member
    /// with spare food gives a portion, and the portions are shared out among the second tribe's living people, and
    /// the first tribe's people warm toward the second. False when either click finds no one, the tribes are the
    /// same, or the first tribe has no food to spare.
    pub(super) fn cmd_trade_gift(&mut self, ax: f32, ay: f32, bx: f32, by: f32) -> bool {
        let (Some(a), Some(b)) = (
            self.nearest_in_reach(ax, ay, 0.0),
            self.nearest_in_reach(bx, by, 0.0),
        ) else {
            return false;
        };
        let giver = self.organisms[a].lineage_id.clone();
        let taker = self.organisms[b].lineage_id.clone();
        if giver.is_empty() || taker.is_empty() || giver == taker {
            return false;
        }
        let receivers: Vec<usize> = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive && o.lineage_id == taker)
            .map(|(i, _)| i)
            .collect();
        if receivers.is_empty() {
            return false;
        }
        let mut portions = 0usize;
        for person in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == giver)
        {
            if portions >= MAX_TRADE {
                break;
            }
            if person.inv_food >= SPARE_FROM {
                person.inv_food -= 1;
                portions += 1;
            }
        }
        if portions == 0 {
            return false;
        }
        for k in 0..portions {
            let i = receivers[k % receivers.len()];
            self.organisms[i].inv_food = self.organisms[i].inv_food.saturating_add(1);
        }
        for person in self
            .organisms
            .iter_mut()
            .filter(|o| o.alive && o.lineage_id == giver)
        {
            let warmth = person.lineage_attitudes.entry(taker.clone()).or_insert(0.0);
            *warmth = (*warmth + 0.2).min(1.0);
        }
        let from = self
            .lineage_names
            .get(&giver)
            .cloned()
            .unwrap_or_else(|| "a tribe".into());
        let to = self
            .lineage_names
            .get(&taker)
            .cloned()
            .unwrap_or_else(|| "another tribe".into());
        push_event(
            &mut self.events,
            self.tick_count,
            "tribe",
            &from,
            &format!("{from} sent {portions} portions of food to {to}"),
        );
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    fn alone_except(sim: &mut Simulation, keep: &[usize]) {
        for (i, o) in sim.organisms.iter_mut().enumerate() {
            o.alive = keep.contains(&i);
        }
    }

    #[test]
    fn a_tribe_food_gift_reaches_every_member_of_the_nearest_tribe_only() {
        let mut sim = Simulation::new(91);
        alone_except(&mut sim, &[0, 1, 2]);
        for (i, (x, y, l)) in [(100.0, 100.0, "T1"), (102.0, 100.0, "T1"), (300.0, 300.0, "T2")]
            .iter()
            .enumerate()
        {
            sim.organisms[i].x = *x;
            sim.organisms[i].y = *y;
            sim.organisms[i].lineage_id = l.to_string();
            sim.organisms[i].inv_food = 0;
        }
        assert!(
            sim.apply_command_json(r#"{"cmd":"tribe_gift","x":101.0,"y":100.0,"radius":6.0,"what":"food"}"#)
        );
        assert!(
            sim.organisms[0].inv_food >= 1 && sim.organisms[1].inv_food >= 1,
            "the tribe gets food"
        );
        assert_eq!(sim.organisms[2].inv_food, 0, "the other tribe does not");
        assert!(
            !sim.apply_command_json(r#"{"cmd":"tribe_gift","x":500.0,"y":500.0,"radius":6.0,"what":"food"}"#)
        );
    }

    #[test]
    fn a_migrating_tribe_is_set_down_at_the_click() {
        let mut sim = Simulation::new(92);
        alone_except(&mut sim, &[0, 1]);
        for (i, x) in [100.0f32, 101.0].iter().enumerate() {
            sim.organisms[i].x = *x;
            sim.organisms[i].y = 100.0;
            sim.organisms[i].lineage_id = "M1".into();
        }
        assert!(sim.apply_command_json(r#"{"cmd":"migrate_tribe","x":103.0,"y":100.0,"radius":6.0}"#));
        for o in [&sim.organisms[0], &sim.organisms[1]] {
            assert!(
                (o.x - 103.0).hypot(o.y - 100.0) <= 3.5,
                "the tribe is near the click"
            );
        }
    }

    #[test]
    fn a_trade_sends_food_from_one_tribe_to_the_other_and_warms_them() {
        let mut sim = Simulation::new(93);
        alone_except(&mut sim, &[0, 1, 2]);
        for (i, (x, food, l)) in [(100.0f32, 4u8, "G1"), (101.0, 4, "G1"), (300.0, 0, "R1")]
            .iter()
            .enumerate()
        {
            sim.organisms[i].x = *x;
            sim.organisms[i].y = if i == 2 { 300.0 } else { 100.0 };
            sim.organisms[i].lineage_id = l.to_string();
            sim.organisms[i].inv_food = *food;
        }
        assert!(sim.apply_command_json(r#"{"cmd":"trade_gift","ax":100.0,"ay":100.0,"bx":300.0,"by":300.0}"#));
        assert_eq!(
            sim.organisms[2].inv_food, 2,
            "the other tribe receives the portions"
        );
        assert!(
            sim.organisms[0]
                .lineage_attitudes
                .get("R1")
                .copied()
                .unwrap_or(0.0)
                > 0.0
        );
        let mut bare = Simulation::new(93);
        alone_except(&mut bare, &[0, 1]);
        bare.organisms[0].x = 100.0;
        bare.organisms[0].y = 100.0;
        bare.organisms[0].lineage_id = "G1".into();
        bare.organisms[0].inv_food = 0;
        bare.organisms[1].x = 300.0;
        bare.organisms[1].y = 300.0;
        bare.organisms[1].lineage_id = "R1".into();
        assert!(
            !bare.apply_command_json(r#"{"cmd":"trade_gift","ax":100.0,"ay":100.0,"bx":300.0,"by":300.0}"#),
            "a tribe with no food to spare cannot trade"
        );
    }
}
