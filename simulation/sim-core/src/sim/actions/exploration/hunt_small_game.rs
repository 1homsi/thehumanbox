use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;

fn hunting_success(org: &Organism) -> f32 {
    if org.has_tool("bow") || org.has_tool("spear") {
        0.44
    } else if org.has_tool("stone_tools") || org.has_tool("knife") {
        0.28
    } else if org.discoveries.contains("hunting") || org.discoveries.contains("trap") {
        0.18
    } else {
        0.12
    }
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if ctx.org().carry_room() == 0 {
        return 0.0;
    }
    let org = &ctx.sim.organisms[ctx.idx];
    // Actual equipment matters more than merely knowing the design.
    let success_p = hunting_success(org);

    if ctx.chance(success_p) {
        ctx.org_mut().inv_food = ctx.org().inv_food.saturating_add(1);
        ctx.think("caught small game");
        ctx.discover("trapping-game", "learned to hunt small game");
        0.012 + (success_p - 0.12) * 0.05
    } else {
        ctx.think("tracking small game");
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;

    #[test]
    fn crafted_weapon_matters_more_than_hunting_knowledge() {
        let mut sim = Simulation::new(0xB0A0_0001);
        let org = &mut sim.organisms[0];
        let bare = hunting_success(org);
        org.discoveries.insert("hunting".to_string());
        let trained = hunting_success(org);
        org.give_tool("bow");
        let equipped = hunting_success(org);

        assert!(trained > bare);
        assert!(equipped > trained);
    }
}
