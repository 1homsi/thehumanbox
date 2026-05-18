//! Cross-cutting helpers used by the per-action files in
//! `sim/actions/` and anything else that needs to reach into a
//! Simulation. Each file owns one domain so it stays small:
//!
//!   combat.rs   - raids, plundering, the things that hurt people
//!   crafting.rs - inventory consumption, the generic craft path
//!   lookup.rs   - nearest-X queries against the live world
//!
//! These all bolt methods onto `impl Simulation` because they need
//! wide access to its fields and method syntax is nicer than
//! threading a dozen arguments through every call site.

pub mod combat;
pub mod crafting;
pub mod lookup;
