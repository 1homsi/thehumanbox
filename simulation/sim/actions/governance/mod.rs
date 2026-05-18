//! Governance actions (indices 296..=315).

pub mod hold_election;
pub mod pass_law;
pub mod enforce_law;
pub mod exile_member;
pub mod pardon_criminal;
pub mod levy_tax;
pub mod conscript_warrior;
pub mod grant_land;
pub mod call_assembly;
pub mod form_council;
pub mod dissolve_council;
pub mod declare_war;
pub mod sign_treaty;
pub mod establish_borders;
pub mod grant_citizenship;
pub mod impeach_leader;
pub mod anoint_leader;
pub mod veto_decision;
pub mod revoke_privilege;
pub mod issue_decree;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        296 => hold_election::apply(ctx),
        297 => pass_law::apply(ctx),
        298 => enforce_law::apply(ctx),
        299 => exile_member::apply(ctx),
        300 => pardon_criminal::apply(ctx),
        301 => levy_tax::apply(ctx),
        302 => conscript_warrior::apply(ctx),
        303 => grant_land::apply(ctx),
        304 => call_assembly::apply(ctx),
        305 => form_council::apply(ctx),
        306 => dissolve_council::apply(ctx),
        307 => declare_war::apply(ctx),
        308 => sign_treaty::apply(ctx),
        309 => establish_borders::apply(ctx),
        310 => grant_citizenship::apply(ctx),
        311 => impeach_leader::apply(ctx),
        312 => anoint_leader::apply(ctx),
        313 => veto_decision::apply(ctx),
        314 => revoke_privilege::apply(ctx),
        315 => issue_decree::apply(ctx),
        _   => 0.0,
    }
}
