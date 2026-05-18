//! Warfare, scouting & territory (indices 96..=106 and 191..=200).

pub mod raid;
pub mod ambush;
pub mod pillage;
pub mod sabotage;
pub mod patrol;
pub mod stand_guard;
pub mod rally;
pub mod defend;
pub mod retreat;
pub mod scout_enemy;
pub mod claim_land;
pub mod muster_warband;
pub mod fortify_position;
pub mod throw_stone;
pub mod duel_rival;
pub mod shield_kin;
pub mod rally_cry;
pub mod spy_on_rival;
pub mod raid_stockpile;
pub mod intercept_raid;
pub mod negotiate_ransom;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        96  => raid::apply(ctx),
        97  => ambush::apply(ctx),
        98  => pillage::apply(ctx),
        99  => sabotage::apply(ctx),
        100 => patrol::apply(ctx),
        101 => stand_guard::apply(ctx),
        102 => rally::apply(ctx),
        103 => defend::apply(ctx),
        104 => retreat::apply(ctx),
        105 => scout_enemy::apply(ctx),
        106 => claim_land::apply(ctx),
        191 => muster_warband::apply(ctx),
        192 => fortify_position::apply(ctx),
        193 => throw_stone::apply(ctx),
        194 => duel_rival::apply(ctx),
        195 => shield_kin::apply(ctx),
        196 => rally_cry::apply(ctx),
        197 => spy_on_rival::apply(ctx),
        198 => raid_stockpile::apply(ctx),
        199 => intercept_raid::apply(ctx),
        200 => negotiate_ransom::apply(ctx),
        _   => 0.0,
    }
}
