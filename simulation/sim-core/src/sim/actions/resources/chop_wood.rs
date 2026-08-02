use super::super::ctx::ActionCtx;
use crate::organism::organism::Organism;
use crate::world::tiles::Tile;

fn woodcutting_profile(org: &Organism) -> (f32, u8) {
    if org.has_tool("axe") {
        (0.88, 1)
    } else if org.has_tool("stone_tools") {
        (0.70, 0)
    } else if org.discoveries.contains("axe") || org.discoveries.contains("toolmaking") {
        (0.56, 0)
    } else {
        (0.50, 0)
    }
}

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    if !matches!(ctx.tile, Tile::Grass) || ctx.org().carry_room() == 0 {
        return 0.0;
    }

    let org = &ctx.sim.organisms[ctx.idx];
    // Knowledge tells someone what to make; carried equipment is what makes
    // the work faster. This keeps a discovered axe from acting like an
    // invisible permanent item.
    let (success_p, yield_bonus) = woodcutting_profile(org);

    if ctx.chance(success_p) {
        let o = ctx.org_mut();
        let gathered = (1 + yield_bonus).min(o.carry_room() as u8);
        o.inv_wood = o.inv_wood.saturating_add(gathered);
        ctx.think("chopping wood");
        ctx.discover("woodcutting", "learned to fell wood");
        0.010 + yield_bonus as f32 * 0.005
    } else {
        ctx.think("gathering timber");
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;

    #[test]
    fn physical_axe_outperforms_knowledge_alone() {
        let mut sim = Simulation::new(0xA8E0_0001);
        let org = &mut sim.organisms[0];
        let bare = woodcutting_profile(org);
        org.discoveries.insert("axe".to_string());
        let knowledge = woodcutting_profile(org);
        org.give_tool("axe");
        let equipped = woodcutting_profile(org);

        assert!(knowledge.0 > bare.0);
        assert!(equipped.0 > knowledge.0);
        assert_eq!(knowledge.1, 0);
        assert_eq!(equipped.1, 1);
    }
}
