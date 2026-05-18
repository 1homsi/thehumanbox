//! Spiritual & cultural rites (indices 201..=210).

pub mod chant_at_dawn;
pub mod paint_body;
pub mod carve_totem_pole;
pub mod offer_sacrifice;
pub mod vision_quest;
pub mod burial_rite;
pub mod wedding_ceremony;
pub mod coming_of_age;
pub mod harvest_festival;
pub mod bless_a_field;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        201 => chant_at_dawn::apply(ctx),
        202 => paint_body::apply(ctx),
        203 => carve_totem_pole::apply(ctx),
        204 => offer_sacrifice::apply(ctx),
        205 => vision_quest::apply(ctx),
        206 => burial_rite::apply(ctx),
        207 => wedding_ceremony::apply(ctx),
        208 => coming_of_age::apply(ctx),
        209 => harvest_festival::apply(ctx),
        210 => bless_a_field::apply(ctx),
        _   => 0.0,
    }
}
