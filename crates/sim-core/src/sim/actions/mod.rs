use super::simulation::Simulation;
use crate::sim::age_stage::AgeStage;
use crate::sim::era::Era;
use crate::sim::tech::buildings::{BuildingFunction, BuildingKind};
use crate::world::tiles::Tile;
use ctx::ActionCtx;

#[macro_use]
mod band_types;
mod action_set;
mod available;
mod band_table;
mod base_bands;
mod bonus;
mod eligibility;
mod registered;
mod registry;
mod reservation;
mod resolved;
#[cfg(test)]
mod tests;

use action_set::ActionSet;
pub use available::{available_actions, available_actions_into};
use band_table::*;
use band_types::*;
use base_bands::*;
use bonus::*;
use eligibility::*;
use registry::ActionDef;
pub use registry::{registered_actions, FIRST_REGISTERED_ID, LAST_REGISTERED_ID};
use reservation::*;
pub(crate) use resolved::discovery_bit;
use resolved::{OrgGate, ResolvedBand};

const ACTIONS_PER_BAND: usize = 8;

/// Return one stable nearby representative for each foreign lineage.
///
/// Spatial buckets are an implementation detail and must not decide who an
/// organism negotiates with. Prefer the closest living representative, then
/// use lineage, organism id, and index as deterministic tie breakers.
fn deterministic_foreign_partners(ctx: &ActionCtx) -> Vec<usize> {
    let mut partners: Vec<usize> = ctx
        .near
        .iter()
        .copied()
        .filter(|&index| {
            ctx.sim
                .organisms
                .get(index)
                .is_some_and(|organism| organism.alive && organism.lineage_id != ctx.lid)
        })
        .collect();

    partners.sort_unstable_by(|&left_index, &right_index| {
        let left = &ctx.sim.organisms[left_index];
        let right = &ctx.sim.organisms[right_index];
        let left_distance = (left.x - ctx.sx).abs() + (left.y - ctx.sy).abs();
        let right_distance = (right.x - ctx.sx).abs() + (right.y - ctx.sy).abs();

        left_distance
            .total_cmp(&right_distance)
            .then_with(|| left.lineage_id.cmp(&right.lineage_id))
            .then_with(|| left.id.cmp(&right.id))
            .then_with(|| left_index.cmp(&right_index))
    });

    let mut seen_lineages = std::collections::BTreeSet::new();
    partners.retain(|&index| seen_lineages.insert(ctx.sim.organisms[index].lineage_id.clone()));
    partners
}

fn records_experiment(action: usize) -> bool {
    registry::records_experiment(action)
        || matches!(
            action,
            67 | 421 | 427 | 431
                | 4145..=4147
                | 4150..=4169
                | 4180..=4185
                | 4320..=4323
                | 4326..=4328
                | 4330..=4332
                | 4335..=4339
                | 4343..=4348
                | 4360..=4366
                | 4870..=4875
                | 4883..=4884
        )
}

pub fn try_apply(
    sim: &mut Simulation,
    idx: usize,
    action: usize,
    ix: i32,
    iy: i32,
    spatial: &crate::sim::spatial::SpatialIndex,
) -> Option<f32> {
    let semantic_requirement = if action_requires_semantic_validation(action) {
        Some(eligible_band_for_action(sim, idx, action, ix, iy, spatial)?)
    } else {
        None
    };
    if (456..=470).contains(&action) {
        let actor = sim.organisms.get(idx)?;
        let mut nearby_indices = Vec::with_capacity(16);
        spatial.query_into(actor.x as i32, actor.y as i32, 6, &mut nearby_indices);
        if !religion_expanded::action_is_possible(sim, idx, action, &nearby_indices, sim.tick_count) {
            return None;
        }
    }
    if matches!(action, 2220 | 2221) {
        let actor = sim.organisms.get(idx)?;
        let mut nearby_indices = Vec::with_capacity(16);
        spatial.query_into(actor.x as i32, actor.y as i32, 6, &mut nearby_indices);
        if !relationships_deep::action_is_possible(sim, idx, action, &nearby_indices) {
            return None;
        }
    }
    if !registry::is_possible(sim, idx, action, ix, iy) {
        return None;
    }
    let reservation = if action_uses_atomic_reservation(action) {
        let requirement = semantic_requirement?;
        Some(reserve_action_resource(sim, idx, requirement.resource)?)
    } else {
        None
    };
    let deferred_resource = if action_uses_deferred_resource_charge(action) {
        semantic_requirement.map(|requirement| requirement.resource)
    } else {
        None
    };
    let bonus = workshop_bonus(sim, ix, iy, action);
    let spec_bonus = specialty_bonus(sim.organisms[idx].specialty.as_deref(), action);
    let asp_bonus = aspiration_bonus(&sim.organisms[idx].aspiration, action);
    if let Some(cat) = category_for(action) {
        *sim.action_counts.entry(cat).or_insert(0) += 1;
        if matches!(
            action,
            5340..=5449 | 5460..=5509 | 5520..=5569 | 5700..=5749 |
            5760..=5809 | 5820..=5869 | 5880..=5929
        ) {
            let entry = sim.workshop_hits.entry(cat).or_insert((0, 0));
            if bonus > 1.0 {
                entry.0 += 1;
            } else {
                entry.1 += 1;
            }
        }
    }
    let mut ctx = ActionCtx::new(sim, idx, ix, iy, spatial);
    let r = if let Some(def) = registry::find(action) {
        (def.apply)(&mut ctx)
    } else {
        match action {
            26..=38 => resources::apply(action, &mut ctx),
            39..=50 => construction::apply(action, &mut ctx),
            51..=65 => crafting::apply(action, &mut ctx),
            66..=79 => knowledge::apply(action, &mut ctx),
            80..=89 => social::apply(action, &mut ctx),
            90..=95 => diplomacy::apply(action, &mut ctx),
            96..=106 => warfare::apply(action, &mut ctx),
            107..=116 => self_care::apply(action, &mut ctx),
            117..=125 => exploration::apply(action, &mut ctx),
            126..=140 => knowledge::apply(action, &mut ctx),
            141..=150 => cooking::apply(action, &mut ctx),
            151..=165 => crafting::apply(action, &mut ctx),
            166..=180 => construction::apply(action, &mut ctx),
            181..=190 => diplomacy::apply(action, &mut ctx),
            191..=200 => warfare::apply(action, &mut ctx),
            201..=210 => spiritual::apply(action, &mut ctx),
            211..=220 => exploration::apply(action, &mut ctx),
            221..=225 => self_care::apply(action, &mut ctx),
            226..=245 => relationships::apply(action, &mut ctx),
            246..=260 => medicine::apply(action, &mut ctx),
            261..=275 => family::apply(action, &mut ctx),
            276..=295 => economy::apply(action, &mut ctx),
            296..=315 => governance::apply(action, &mut ctx),
            316..=335 => art_culture::apply(action, &mut ctx),
            336..=355 => agriculture::apply(action, &mut ctx),
            356..=370 => animal_husbandry::apply(action, &mut ctx),
            371..=385 => environment::apply(action, &mut ctx),
            386..=405 => emotion::apply(action, &mut ctx),
            406..=420 => communication::apply(action, &mut ctx),
            421..=435 => science::apply(action, &mut ctx),
            436..=455 => military_strategy::apply(action, &mut ctx),
            456..=470 => religion_expanded::apply(action, &mut ctx),
            471..=485 => seasonal::apply(action, &mut ctx),
            486..=500 => legacy_death::apply(action, &mut ctx),
            501..=520 => education::apply(action, &mut ctx),
            521..=535 => ceremony::apply(action, &mut ctx),
            536..=537 => construction::apply(action, &mut ctx),
            540..=589 => domestic::apply(action, &mut ctx),
            600..=649 => hobbies::apply(action, &mut ctx),
            660..=710 => urban::apply(action, &mut ctx),
            720..=770 => entertainment::apply(action, &mut ctx),
            780..=830 => profession::apply(action, &mut ctx),
            840..=889 => modern_tech::apply(action, &mut ctx),
            900..=949 => nature_walk::apply(action, &mut ctx),
            960..=1011 => transport::apply(action, &mut ctx),
            1020..=1070 => fitness::apply(action, &mut ctx),
            1080..=1131 => creative_make::apply(action, &mut ctx),
            1140..=1189 => food_drink::apply(action, &mut ctx),
            1200..=1249 => crafts_advanced::apply(action, &mut ctx),
            1260..=1310 => social_play::apply(action, &mut ctx),
            1320..=1369 => medicine_care::apply(action, &mut ctx),
            1380..=1428 => learning::apply(action, &mut ctx),
            1440..=1489 => travel_explore::apply(action, &mut ctx),
            1500..=1548 => spiritual_practice::apply(action, &mut ctx),
            1560..=1608 => court_politics::apply(action, &mut ctx),
            1620..=1668 => childcare::apply(action, &mut ctx),
            1680..=1729 => work_trade::apply(action, &mut ctx),
            1740..=1790 => crime_law::apply(action, &mut ctx),
            1800..=1849 => seafaring::apply(action, &mut ctx),
            1860..=1909 => arts_performance::apply(action, &mut ctx),
            1920..=1969 => agriculture_advanced::apply(action, &mut ctx),
            1980..=2029 => animal_handling::apply(action, &mut ctx),
            2040..=2089 => industry::apply(action, &mut ctx),
            2100..=2149 => tech_use::apply(action, &mut ctx),
            2160..=2212 => survival::apply(action, &mut ctx),
            2220..=2269 => relationships_deep::apply(action, &mut ctx),
            2280..=2329 => self_improvement::apply(action, &mut ctx),
            2340..=2389 => emotion_deep::apply(action, &mut ctx),
            2400..=2449 => cosmic_arts::apply(action, &mut ctx),
            2460..=2509 => shadow_arts::apply(action, &mut ctx),
            2520..=2568 => ritual_advanced::apply(action, &mut ctx),
            2580..=2629 => architecture_design::apply(action, &mut ctx),
            2640..=2689 => leadership::apply(action, &mut ctx),
            2700..=2749 => trade_advanced::apply(action, &mut ctx),
            2760..=2809 => theology::apply(action, &mut ctx),
            2820..=2869 => cooking_world::apply(action, &mut ctx),
            2880..=2929 => community::apply(action, &mut ctx),
            2940..=2989 => home_decor::apply(action, &mut ctx),
            3000..=3049 => scholarly::apply(action, &mut ctx),
            3060..=3109 => celestial_work::apply(action, &mut ctx),
            3120..=3169 => mythmaking::apply(action, &mut ctx),
            3180..=3229 => logistics::apply(action, &mut ctx),
            3240..=3289 => oral_history::apply(action, &mut ctx),
            3300..=3349 => infrastructure_work::apply(action, &mut ctx),
            3360..=3409 => teaching_advanced::apply(action, &mut ctx),
            3420..=3469 => caretaking_advanced::apply(action, &mut ctx),
            3480..=3525 => deep_craft::apply(action, &mut ctx),
            3540..=3589 => gardening::apply(action, &mut ctx),
            3600..=3649 => festival_prep::apply(action, &mut ctx),
            3660..=3709 => martial::apply(action, &mut ctx),
            3720..=3769 => masonry_work::apply(action, &mut ctx),
            3780..=3829 => woodwork::apply(action, &mut ctx),
            3840..=3889 => metalwork::apply(action, &mut ctx),
            3900..=3949 => glasswork::apply(action, &mut ctx),
            3960..=4009 => textiles::apply(action, &mut ctx),
            4020..=4069 => leatherwork::apply(action, &mut ctx),
            4080..=4124 => ceramics_pottery::apply(action, &mut ctx),
            4140..=4189 => science_lab::apply(action, &mut ctx),
            4200..=4249 => field_research::apply(action, &mut ctx),
            4260..=4309 => cyber_action::apply(action, &mut ctx),
            4320..=4369 => bio_action::apply(action, &mut ctx),
            4380..=4429 => ecological::apply(action, &mut ctx),
            4440..=4489 => mountaineering::apply(action, &mut ctx),
            4500..=4549 => water_sports::apply(action, &mut ctx),
            4560..=4609 => stargazing::apply(action, &mut ctx),
            4620..=4669 => emergency_response::apply(action, &mut ctx),
            4680..=4729 => political_action::apply(action, &mut ctx),
            4740..=4789 => orbital_act::apply(action, &mut ctx),
            4800..=4849 => martian_act::apply(action, &mut ctx),
            4860..=4910 => xenobiology::apply(action, &mut ctx),
            4920..=4969 => singularity_act::apply(action, &mut ctx),
            4980..=5029 => cosmic_engineer::apply(action, &mut ctx),
            5040..=5089 => dreamwork::apply(action, &mut ctx),
            5100..=5149 => negotiation::apply(action, &mut ctx),
            5160..=5209 => historical_record::apply(action, &mut ctx),
            5220..=5269 => courier::apply(action, &mut ctx),
            5280..=5329 => beekeeping::apply(action, &mut ctx),
            5340..=5389 => cafe_work::apply(action, &mut ctx) * 0.8 * bonus,
            5400..=5449 => barista_advanced::apply(action, &mut ctx) * 1.4 * bonus,
            5460..=5509 => retail::apply(action, &mut ctx) * 1.2 * bonus,
            5520..=5569 => tech_devops::apply(action, &mut ctx) * 1.8 * bonus,
            5580..=5629 => childhood::apply(action, &mut ctx) * 1.6,
            5640..=5689 => elder_life::apply(action, &mut ctx) * 1.5,
            5700..=5749 => journalism::apply(action, &mut ctx) * 1.3 * bonus,
            5760..=5809 => fashion::apply(action, &mut ctx) * 1.1 * bonus,
            5820..=5869 => butchery::apply(action, &mut ctx) * 1.7 * bonus,
            5880..=5929 => distillation::apply(action, &mut ctx) * 2.0 * bonus,
            _ => return None,
        }
    };
    if r > 0.0 && records_experiment(action) {
        ctx.sim.organisms[idx].last_experiment_tick = ctx.tick;
    }
    if r <= 0.0 {
        if let Some(snapshot) = reservation {
            restore_action_resource(ctx.sim, idx, snapshot);
        }
    } else if let Some(resource) = deferred_resource {
        let _charged = reserve_action_resource(ctx.sim, idx, resource)
            .unwrap_or_else(|| panic!("validated action {action} lost its resource before commit"));
    }
    Some(r * spec_bonus * asp_bonus)
}

pub mod agriculture;

pub mod agriculture_advanced;

pub mod animal_handling;

pub mod animal_husbandry;

pub mod architecture_design;

pub mod art_culture;

pub mod arts_performance;

pub mod barista_advanced;

pub mod beekeeping;

pub mod bio_action;

pub mod butchery;

pub mod cafe_work;

pub mod caretaking_advanced;

pub mod celestial_work;

pub mod ceramics_pottery;

pub mod ceremony;

pub mod childcare;

pub mod childhood;

pub mod communication;

pub mod community;

pub mod construction;

pub mod cooking;

pub mod cooking_world;

pub mod cosmic_arts;

pub mod cosmic_engineer;

pub mod courier;

pub mod court_politics;

pub mod crafting;

pub mod crafts_advanced;

pub mod creative_make;

pub mod crime_law;
pub mod ctx;

pub mod cyber_action;

pub mod deep_craft;

pub mod diplomacy;

pub mod distillation;

pub mod domestic;

pub mod dreamwork;

pub mod ecological;

pub mod economy;

pub mod education;

pub mod elder_life;

pub mod emergency_response;

pub mod emotion;

pub mod emotion_deep;

pub mod entertainment;

pub mod environment;

pub mod exploration;

pub mod family;

pub mod fashion;

pub mod festival_prep;

pub mod field_research;

pub mod fitness;

pub mod food_drink;

pub mod gardening;

pub mod glasswork;

pub mod governance;

pub mod historical_record;

pub mod hobbies;

pub mod home_decor;

pub mod industry;

pub mod infrastructure_work;

pub mod journalism;

pub mod knowledge;

pub mod leadership;

pub mod learning;

pub mod leatherwork;

pub mod legacy_death;

pub mod logistics;

pub mod martial;

pub mod martian_act;

pub mod masonry_work;

pub mod medicine;

pub mod medicine_care;

pub mod metalwork;

pub mod military_strategy;

pub mod modern_tech;

pub mod mountaineering;

pub mod mythmaking;

pub mod nature_walk;

pub mod negotiation;

pub mod oral_history;

pub mod orbital_act;

pub mod political_action;

pub mod profession;

pub mod relationships;

pub mod relationships_deep;

pub mod religion_expanded;

pub mod resources;

pub mod retail;

pub mod ritual_advanced;

pub mod scholarly;

pub mod science;

pub mod science_lab;

pub mod seafaring;

pub mod seasonal;

pub mod self_care;

pub mod self_improvement;

pub mod shadow_arts;

pub mod singularity_act;

pub mod social;

pub mod social_play;

pub mod spiritual;

pub mod spiritual_practice;

pub mod stargazing;

pub mod survival;

pub mod teaching_advanced;

pub mod tech_devops;

pub mod tech_use;

pub mod textiles;

pub mod theology;

pub mod trade_advanced;

pub mod transport;

pub mod travel_explore;

pub mod urban;

pub mod warfare;

pub mod water_sports;

pub mod woodwork;

pub mod work_trade;

pub mod xenobiology;
