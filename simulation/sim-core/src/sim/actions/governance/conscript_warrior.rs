use super::super::ctx::ActionCtx;
use crate::sim::age_stage::AgeStage;
use crate::sim::economy::{military_issue_for_era, Specialty, MILITARY_EQUIPMENT_COST};
use crate::sim::government::LawKind;

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let military_service = ctx
        .sim
        .governments
        .get(&ctx.lid)
        .is_some_and(|government| government.has_law(LawKind::MilitaryService));
    if !military_service {
        ctx.think("military service has not been enacted into law");
        return 0.0;
    }

    let pick = ctx.kin.iter().copied().find(|&k| {
        let candidate = &ctx.sim.organisms[k];
        matches!(candidate.age_stage(), AgeStage::Teen | AgeStage::Adult)
            && candidate.health > 0.5
            && !matches!(candidate.specialty.as_deref(), Some("soldier" | "officer"))
    });
    let Some(ki) = pick else {
        ctx.think("no suitable warriors among kin");
        return 0.0;
    };
    let era = ctx.sim.era(&ctx.lid);
    let equipment = military_issue_for_era(era);
    let needs_equipment = !ctx.sim.organisms[ki].has_tool(equipment);
    let government = ctx
        .sim
        .governments
        .get_mut(&ctx.lid)
        .expect("military-service authority was checked before selecting a recruit");
    if needs_equipment && government.treasury < MILITARY_EQUIPMENT_COST {
        ctx.think("the public treasury cannot equip another warrior");
        return 0.0;
    }
    if needs_equipment {
        government.treasury -= MILITARY_EQUIPMENT_COST;
    }
    government.conscription = true;

    let recruit = &mut ctx.sim.organisms[ki];
    recruit.specialty = Some(Specialty::Soldier.name().into());
    recruit.discoveries.insert("military_training".into());
    if needs_equipment {
        recruit.give_tool(equipment);
    }
    recruit.comfort = (recruit.comfort - 0.02).max(0.0);
    let recruit_name = recruit.name.clone();

    ctx.think("conscripting a warrior");
    ctx.event(
        "warfare",
        &format!("conscripted and equipped {recruit_name} for tribal defense"),
    );
    0.008
}
