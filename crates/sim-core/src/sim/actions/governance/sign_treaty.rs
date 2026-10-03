use super::super::ctx::ActionCtx;
use crate::sim::warfare::{establish_treaty, has_active_battle_between, TreatyKind};

const NON_AGGRESSION_DURATION_TICKS: u64 = 12_000;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let lid = ctx.lid.clone();
    let pick = ctx
        .near
        .iter()
        .copied()
        .find(|&k| ctx.sim.organisms[k].lineage_id != lid);
    let Some(ki) = pick else {
        ctx.think("no one to sign a treaty with");
        return 0.0;
    };
    let their = ctx.sim.organisms[ki].lineage_id.clone();
    if has_active_battle_between(&ctx.sim.battles, &lid, &their) {
        ctx.think("cannot sign a treaty while our peoples are still fighting");
        return 0.0;
    }
    let expires_tick = ctx.tick.saturating_add(NON_AGGRESSION_DURATION_TICKS);
    let established = {
        let sim = &mut *ctx.sim;
        establish_treaty(
            &mut sim.treaties,
            &mut sim.organisms,
            &lid,
            &their,
            TreatyKind::NonAggression,
            ctx.tick,
            expires_tick,
        )
    };
    if !established {
        ctx.think("unable to formalize the treaty");
        return 0.0;
    }

    ctx.think("signing a treaty");
    ctx.discover("treaty", "signed a formal peace treaty with a foreign lineage");
    ctx.event(
        "treaty",
        &format!("concluded a non-aggression treaty with lineage {their}"),
    );
    0.040
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;
    use crate::sim::spatial::SpatialIndex;
    use crate::sim::warfare::{Battle, BattleScale};

    #[test]
    fn active_battle_blocks_action_signed_treaty() {
        let mut sim = Simulation::new(0x60_0308);
        sim.organisms.truncate(2);
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            organism.alive = true;
            organism.lineage_id = if index == 0 { "river".into() } else { "hill".into() };
            organism.x = 100.0 + index as f32;
            organism.y = 100.0;
        }
        sim.battles.push(Battle {
            id: "battle-river-hill".into(),
            attackers: vec!["river".into()],
            defenders: vec!["hill".into()],
            attacker_orgs: vec![sim.organisms[0].id.clone()],
            defender_orgs: vec![sim.organisms[1].id.clone()],
            scale: BattleScale::Skirmish,
            location: (100, 100),
            started_tick: 1,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 1,
            initial_d: 1,
        });

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let mut ctx = ActionCtx::new(&mut sim, 0, 100, 100, &spatial);

        assert_eq!(apply(&mut ctx), 0.0);
        assert!(ctx.sim.treaties.is_empty());
        assert!(ctx.org().thought.contains("still fighting"));
    }
}
