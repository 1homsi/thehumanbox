pub mod barter;
pub mod collect_debt;
pub mod create_market_stall;
pub mod distribute_wealth;
pub mod donate_to_poor;
pub mod establish_trade_route;
pub mod form_guild;
pub mod grant_trade_rights;
pub mod haggle;
pub mod hoard_resources;
pub mod inspect_goods;
pub mod lend_goods;
pub mod mint_coin;
pub mod pay_tribute;
pub mod receive_caravan;
pub mod send_caravan;
pub mod set_price;
pub mod smuggle;
pub mod tax_collection;
pub mod weigh_goods;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        276 => barter::apply(ctx),
        277 => set_price::apply(ctx),
        278 => create_market_stall::apply(ctx),
        279 => haggle::apply(ctx),
        280 => lend_goods::apply(ctx),
        281 => collect_debt::apply(ctx),
        282 => form_guild::apply(ctx),
        283 => weigh_goods::apply(ctx),
        284 => distribute_wealth::apply(ctx),
        285 => hoard_resources::apply(ctx),
        286 => donate_to_poor::apply(ctx),
        287 => establish_trade_route::apply(ctx),
        288 => send_caravan::apply(ctx),
        289 => receive_caravan::apply(ctx),
        290 => pay_tribute::apply(ctx),
        291 => mint_coin::apply(ctx),
        292 => smuggle::apply(ctx),
        293 => inspect_goods::apply(ctx),
        294 => grant_trade_rights::apply(ctx),
        295 => tax_collection::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::government::{Government, GovernmentKind, Law, LawKind};
    use crate::sim::simulation::Simulation;
    use crate::sim::spatial::SpatialIndex;
    use crate::sim::tech::buildings::BuildingKind;
    use crate::world::tiles::Tile;

    #[test]
    fn tax_collection_remits_only_rate_assessed_receipts_and_cannot_double_collect() {
        let mut sim = Simulation::new(0xEC_0001);
        sim.organisms.truncate(2);
        let lineage = "tax-collection-test";
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            organism.alive = true;
            organism.lineage_id = lineage.into();
            organism.x = 140.0 + index as f32;
            organism.y = 140.0;
            organism.inv_food = 5 + index as u8;
            organism.wealth = if index == 0 { 3 } else { 7 };
        }
        sim.grid.set(140, 140, Tile::Grass);

        let mut government = Government::new(lineage.into(), GovernmentKind::Republic, 1);
        government.treasury = 8;
        government.tax_rate = 0.20;
        government.tax_receipts_pending = 2;
        government.laws.push(Law {
            kind: LawKind::Taxation,
            enacted_tick: 1,
        });
        sim.governments.insert(lineage.into(), government);

        let food_before: Vec<u8> = sim.organisms.iter().map(|organism| organism.inv_food).collect();
        let wealth_before: Vec<u32> = sim.organisms.iter().map(|organism| organism.wealth).collect();
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, 140, 140, &spatial);
            apply(295, &mut ctx)
        };

        assert!(reward > 0.0);
        assert_eq!(sim.governments[lineage].treasury, 10);
        assert_eq!(sim.governments[lineage].tax_receipts_pending, 0);
        assert_eq!(
            sim.organisms
                .iter()
                .map(|organism| organism.wealth)
                .collect::<Vec<_>>(),
            wealth_before,
            "remittance must not tax accumulated savings a second time"
        );
        assert_eq!(
            sim.organisms
                .iter()
                .map(|organism| organism.inv_food)
                .collect::<Vec<_>>(),
            food_before
        );

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let second_reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, 140, 140, &spatial);
            apply(295, &mut ctx)
        };
        assert_eq!(second_reward, 0.0);
        assert_eq!(sim.governments[lineage].treasury, 10);
        assert_eq!(
            sim.organisms
                .iter()
                .map(|organism| organism.wealth)
                .collect::<Vec<_>>(),
            wealth_before
        );
    }

    #[test]
    fn market_stall_action_opens_a_real_project_and_unlocks_market_only_on_completion() {
        let mut sim = Simulation::new(0xEC_0002);
        sim.organisms.truncate(1);
        sim.buildings.clear();
        let lineage = sim.organisms[0].lineage_id.clone();
        let (x, y) = (160, 160);
        let cost = BuildingKind::MarketStall.construction_cost();
        let builder = &mut sim.organisms[0];
        builder.alive = true;
        builder.age = builder.max_age / 2;
        builder.energy = 1.0;
        builder.health = 1.0;
        builder.x = x as f32;
        builder.y = y as f32;
        builder.home_x = x as f32;
        builder.home_y = y as f32;
        builder.inv_wood = u8::try_from(cost.wood).expect("market stall wood cost fits inventory");
        builder.inv_stone = u8::try_from(cost.stone).expect("market stall stone cost fits inventory");
        builder.wealth = cost.wealth;
        sim.grid.set(x, y, Tile::Grass);

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = {
            let mut ctx = ActionCtx::new(&mut sim, 0, x, y, &spatial);
            apply(278, &mut ctx)
        };

        assert!(reward > 0.0);
        assert_eq!(sim.buildings.len(), 1);
        assert_eq!(sim.buildings[0].kind, BuildingKind::MarketStall);
        assert!(!sim.buildings[0].is_operational());
        assert!(!sim.organisms[0].discoveries.contains("market"));
        assert!(sim.events.iter().all(|event| event.etype != "built"));

        sim.buildings[0].condition = 0.99;
        sim.tick_count = 20;
        crate::sim::civ_tick::tick_civ(&mut sim, None);

        assert!(sim.buildings[0].is_operational());
        assert!(sim.organisms[0].discoveries.contains("market_stall"));
        assert!(sim.organisms[0].discoveries.contains("market"));
        assert!(sim
            .events
            .iter()
            .any(|event| { event.etype == "built" && event.detail.contains("market_stall") }));
        assert_eq!(sim.buildings[0].owner_lineage.as_deref(), Some(lineage.as_str()));
    }
}
