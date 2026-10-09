use super::Simulation;
use crate::math::DetMath;

/// How far from the clicked point a person may be and still receive the gift, in tiles.
const DEFAULT_REACH: f32 = 4.0;
const MAX_REACH: f32 = 16.0;
/// Portions of food a food gift puts in the pack.
const FOOD_GIFT: u8 = 3;
/// The tool a tool gift hands over.
const GIFT_TOOL: &str = "stone_tools";

impl Simulation {
    /// Give the living person nearest the point (within the radius) a gift: `food` puts portions of food in
    /// their pack, `tool` hands them a stone tool. Returns false for an unknown gift or when nobody is in reach.
    pub(super) fn cmd_gift(&mut self, x: f32, y: f32, radius: f32, what: String) -> bool {
        if !x.is_finite() || !y.is_finite() || !matches!(what.as_str(), "food" | "tool") {
            return false;
        }
        let reach = if radius > 0.0 {
            radius.min(MAX_REACH)
        } else {
            DEFAULT_REACH
        };
        let nearest = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (i, (o.x - x).det_hypot(o.y - y)))
            .filter(|&(_, d)| d <= reach)
            .min_by(|a, b| a.1.total_cmp(&b.1));
        let Some((i, _)) = nearest else {
            return false;
        };
        let person = &mut self.organisms[i];
        if what == "food" {
            person.inv_food = person.inv_food.saturating_add(FOOD_GIFT);
        } else {
            person.give_tool(GIFT_TOOL);
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use crate::sim::simulation::Simulation;

    fn only_person_at(sim: &mut Simulation, x: f32, y: f32) {
        for o in sim.organisms.iter_mut() {
            o.alive = false;
        }
        sim.organisms[0].alive = true;
        sim.organisms[0].x = x;
        sim.organisms[0].y = y;
        sim.organisms[0].inv_food = 0;
    }

    #[test]
    fn food_gift_fills_the_nearest_persons_pack() {
        let mut sim = Simulation::new(8);
        only_person_at(&mut sim, 60.0, 60.0);
        assert!(sim.apply_command_json(r#"{"cmd":"gift","x":61.0,"y":61.0,"what":"food"}"#));
        assert_eq!(sim.organisms[0].inv_food, 3);
    }

    #[test]
    fn tool_gift_hands_over_a_stone_tool() {
        let mut sim = Simulation::new(8);
        only_person_at(&mut sim, 60.0, 60.0);
        assert!(!sim.organisms[0].has_tool("stone_tools"));
        assert!(sim.apply_command_json(r#"{"cmd":"gift","x":60.0,"y":60.0,"what":"tool"}"#));
        assert!(sim.organisms[0].has_tool("stone_tools"));
    }

    #[test]
    fn gift_refuses_an_unknown_kind_and_nobody_in_reach() {
        let mut sim = Simulation::new(8);
        only_person_at(&mut sim, 60.0, 60.0);
        assert!(!sim.apply_command_json(r#"{"cmd":"gift","x":60.0,"y":60.0,"what":"gold"}"#));
        assert!(!sim.apply_command_json(r#"{"cmd":"gift","x":90.0,"y":90.0,"what":"food"}"#));
        assert_eq!(sim.organisms[0].inv_food, 0);
    }
}
