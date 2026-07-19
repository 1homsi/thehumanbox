use super::super::ctx::ActionCtx;
use crate::sim::government::{Law, LawKind};

const LAW_AGENDA: [LawKind; 19] = [
    LawKind::NoMurder,
    LawKind::NoTheft,
    LawKind::Marriage,
    LawKind::Inheritance,
    LawKind::Worship,
    LawKind::PropertyRights,
    LawKind::Religion,
    LawKind::MilitaryService,
    LawKind::Taxation,
    LawKind::Education,
    LawKind::FreedomOfSpeech,
    LawKind::NoSlavery,
    LawKind::SafetyNet,
    LawKind::Healthcare,
    LawKind::EqualRights,
    LawKind::ChildLabour,
    LawKind::EnvironmentalProtection,
    LawKind::DigitalRights,
    LawKind::Suffrage,
];

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let is_elder = ctx.sim.organisms[ctx.idx].is_elder;
    if !is_elder && ctx.kin.len() < 3 {
        ctx.think("lacks authority to pass a law");
        return 0.0;
    }
    let era = ctx.sim.era(&ctx.lid);
    let Some(government) = ctx.sim.governments.get_mut(&ctx.lid) else {
        ctx.think("there is no government able to enact a law");
        return 0.0;
    };
    let Some(kind) = LAW_AGENDA
        .iter()
        .copied()
        .find(|kind| kind.era_appearance() <= era && !government.has_law(*kind))
    else {
        ctx.think("no new law is ready for debate");
        return 0.0;
    };

    government.laws.push(Law {
        kind,
        enacted_tick: ctx.tick,
    });
    if kind == LawKind::MilitaryService {
        government.conscription = true;
    }

    let detail = format!("enacted the {} law", kind.name());
    ctx.think("passing a new law");
    ctx.discover("law", "enacted a binding law for the tribe");
    ctx.event("governance", &detail);
    0.012
}
