//! Action dispatch. Top-level `apply()` routes by index range to a
//! category submodule, which in turn routes to a per-action file.
//!
//! Add a new action: drop a file in the right category directory,
//! `pub mod <name>;` in that category's `mod.rs`, add one line to
//! its match. The top-level only changes when introducing a new
//! category (or extending an existing range).
//!
//! Index ranges:
//!   26..=38   resources
//!   39..=50   construction
//!   51..=65   crafting
//!   66..=79   knowledge
//!   80..=89   social
//!   90..=95   diplomacy
//!   96..=106  warfare
//!   107..=116 self_care
//!   117..=125 exploration
//!   126..=140 knowledge (phase-2 extension)
//!   141..=150 cooking
//!   151..=165 crafting (phase-2 extension)
//!   166..=180 construction (phase-2 extension)
//!   181..=190 diplomacy (phase-2 extension)
//!   191..=200 warfare (phase-2 extension)
//!   201..=210 spiritual
//!   211..=220 exploration (phase-2 extension)
//!   221..=225 self_care (phase-2 extension)

pub mod ctx;
pub mod resources;
pub mod construction;
pub mod crafting;
pub mod cooking;
pub mod knowledge;
pub mod social;
pub mod diplomacy;
pub mod warfare;
pub mod self_care;
pub mod exploration;
pub mod spiritual;

use ctx::ActionCtx;

use super::simulation::Simulation;

/// Dispatch an action by index. Returns the Q-learning reward.
///
/// Returns `Some(reward)` if the actions/ module handled the
/// action, `None` for indices outside the supported range. The
/// caller is responsible for applying the per-tick energy decrement.
pub fn try_apply(sim: &mut Simulation, idx: usize, action: usize, ix: i32, iy: i32) -> Option<f32> {
    let mut ctx = ActionCtx::new(sim, idx, ix, iy);
    let r = match action {
        26..=38     => resources::apply(action, &mut ctx),
        39..=50     => construction::apply(action, &mut ctx),
        51..=65     => crafting::apply(action, &mut ctx),
        66..=79     => knowledge::apply(action, &mut ctx),
        80..=89     => social::apply(action, &mut ctx),
        90..=95     => diplomacy::apply(action, &mut ctx),
        96..=106    => warfare::apply(action, &mut ctx),
        107..=116   => self_care::apply(action, &mut ctx),
        117..=125   => exploration::apply(action, &mut ctx),
        126..=140   => knowledge::apply(action, &mut ctx),
        141..=150   => cooking::apply(action, &mut ctx),
        151..=165   => crafting::apply(action, &mut ctx),
        166..=180   => construction::apply(action, &mut ctx),
        181..=190   => diplomacy::apply(action, &mut ctx),
        191..=200   => warfare::apply(action, &mut ctx),
        201..=210   => spiritual::apply(action, &mut ctx),
        211..=220   => exploration::apply(action, &mut ctx),
        221..=225   => self_care::apply(action, &mut ctx),
        _           => return None,
    };
    Some(r)
}
