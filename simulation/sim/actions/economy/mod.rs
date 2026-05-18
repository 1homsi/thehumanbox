

pub mod barter;
pub mod set_price;
pub mod create_market_stall;
pub mod haggle;
pub mod lend_goods;
pub mod collect_debt;
pub mod form_guild;
pub mod weigh_goods;
pub mod distribute_wealth;
pub mod hoard_resources;
pub mod donate_to_poor;
pub mod establish_trade_route;
pub mod send_caravan;
pub mod receive_caravan;
pub mod pay_tribute;
pub mod mint_coin;
pub mod smuggle;
pub mod inspect_goods;
pub mod grant_trade_rights;
pub mod tax_collection;

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
        _   => 0.0,
    }
}
