use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;

fn fishing_success(org: &Organism) -> f32 {
    if org.has_tool("net") {
        0.58
    } else if org.has_tool("fishing_hook") && org.has_tool("fishing_line") {
        0.50
    } else if org.has_tool("fishing_hook") || org.has_tool("fishing_line") {
        0.40
    } else if org.discoveries.contains("fishing") {
        0.32
    } else {
        0.22
    }
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !ctx.water_near || ctx.org().carry_room() == 0 {
        ctx.think("looking for water to fish");
        return 0.0;
    }
    let org = ctx.org();
    let success_p = fishing_success(org);
    if ctx.chance(success_p) {
        let o = ctx.org_mut();
        o.inv_food = o.inv_food.saturating_add(1);
        ctx.think("caught a fish");
        ctx.discover("fishing", "learned to fish");
        0.02 + (success_p - 0.22) * 0.04
    } else {
        ctx.think("fishing the shallows");
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;

    #[test]
    fn complete_fishing_kit_and_net_improve_the_catch_rate() {
        let mut sim = Simulation::new(0xF150_0001);
        let org = &mut sim.organisms[0];
        let bare = fishing_success(org);
        org.give_tool("fishing_hook");
        let hook = fishing_success(org);
        org.give_tool("fishing_line");
        let kit = fishing_success(org);
        org.give_tool("net");
        let net = fishing_success(org);

        assert!(hook > bare);
        assert!(kit > hook);
        assert!(net > kit);
    }
}
