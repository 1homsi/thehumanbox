use super::super::ctx::ActionCtx;
use crate::sim::survival_resources::{CacheRaidOutcome, CachedSupply};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    match ctx.sim.raid_supply_cache(ctx.idx, ctx.ix, ctx.iy) {
        Some(CacheRaidOutcome::Stolen(supply)) => {
            ctx.think(match supply {
                CachedSupply::Food => "stealing food from a hostile cache",
                CachedSupply::Water => "stealing water from a hostile cache",
            });
            ctx.discover("stockpile-raid", "raided a defended supply cache");
            ctx.event("war", "stole supplies from a rival cache");
            0.018
        }
        Some(CacheRaidOutcome::Intercepted) => {
            ctx.think("driven back from a fortified cache");
            ctx.event("war", "a fortified cache repelled a raid");
            -0.012
        }
        None => 0.0,
    }
}
