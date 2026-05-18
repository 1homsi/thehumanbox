//! Action dispatch. Top-level `apply()` routes by index range to a
//! category submodule, which in turn routes to a per-action file.
//!
//! # Adding a new action
//! 1. Drop a file in the right category directory.
//! 2. `pub mod <name>;` in that category's `mod.rs`.
//! 3. Add one match arm in that category's `apply()`.
//! 4. The top-level `try_apply` only changes when adding a *new* category.
//! 5. Update `available_actions` below so masking covers the new index.
//!
//! # Index ranges
//! Phase-1/2 (original):
//!   26..=38   resources
//!   39..=50   construction
//!   51..=65   crafting
//!   66..=79   knowledge
//!   80..=89   social
//!   90..=95   diplomacy
//!   96..=106  warfare
//!   107..=116 self_care
//!   117..=125 exploration
//!   126..=140 knowledge (ext)
//!   141..=150 cooking
//!   151..=165 crafting (ext)
//!   166..=180 construction (ext)
//!   181..=190 diplomacy (ext)
//!   191..=200 warfare (ext)
//!   201..=210 spiritual
//!   211..=220 exploration (ext)
//!   221..=225 self_care (ext)
//!
//! Phase-3 (new categories):
//!   226..=245 relationships
//!   246..=260 medicine
//!   261..=275 family
//!   276..=295 economy
//!   296..=315 governance
//!   316..=335 art_culture
//!   336..=355 agriculture
//!   356..=370 animal_husbandry
//!   371..=385 environment
//!   386..=405 emotion
//!   406..=420 communication
//!   421..=435 science
//!   436..=455 military_strategy
//!   456..=470 religion_expanded
//!   471..=485 seasonal
//!   486..=500 legacy_death
//!   501..=520 education
//!   521..=535 ceremony

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
// phase-3 categories
pub mod relationships;
pub mod medicine;
pub mod family;
pub mod economy;
pub mod governance;
pub mod art_culture;
pub mod agriculture;
pub mod animal_husbandry;
pub mod environment;
pub mod emotion;
pub mod communication;
pub mod science;
pub mod military_strategy;
pub mod religion_expanded;
pub mod seasonal;
pub mod legacy_death;
pub mod education;
pub mod ceremony;

use ctx::ActionCtx;
use super::simulation::Simulation;
use crate::world::tiles::Tile;

// ── Action masking ────────────────────────────────────────────────────────────
//
// Returns the set of action indices that make sense for organism `idx` right
// now.  `choose_action` uses this list for both random exploration and
// Q-table lookup so the agent never wastes exploration budget on actions
// that cannot meaningfully fire (e.g. constructing when carrying nothing,
// cooking when the pantry is empty).
//
// Rule: be *inclusive* rather than strict – a gate that returns false for a
// valid action is a bug; a gate that returns true for an action that will
// score 0.0 is just a minor waste.  When in doubt, include the range.

pub fn available_actions(sim: &Simulation, idx: usize, ix: i32, iy: i32) -> Vec<usize> {
    let org   = &sim.organisms[idx];
    let tile  = sim.grid.get(ix, iy);
    let (sx, sy) = (org.x, org.y);
    let lid   = &org.lineage_id;

    let kin_near = sim.organisms.iter().enumerate()
        .any(|(i, o)| i != idx && o.alive && o.lineage_id == *lid
            && (o.x - sx).abs() + (o.y - sy).abs() <= 6.0);
    let stranger_near = sim.organisms.iter().enumerate()
        .any(|(i, o)| i != idx && o.alive && o.lineage_id != *lid
            && (o.x - sx).abs() + (o.y - sy).abs() <= 6.0);
    let any_near   = kin_near || stranger_near;
    let has_mats   = org.inv_wood > 0 || org.inv_stone > 0;
    let has_food   = org.inv_food > 0 || matches!(tile, Tile::Food);
    let near_water = (-2i32..=2).any(|dx| (-2i32..=2).any(|dy|
        matches!(sim.grid.get(ix + dx, iy + dy), Tile::Water)));
    let near_rock  = [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(1,-1),(-1,1),(1,1)]
        .iter().any(|&(dx,dy)| matches!(sim.grid.get(ix+dx, iy+dy), Tile::Rock | Tile::Mineral));
    let needs_low  = org.energy < 0.5 || org.hydration < 0.5;

    let mut a: Vec<usize> = Vec::with_capacity(128);

    // core movement (0..=25): handled by choose_action directly, not Q-table
    a.extend(0..=25);

    // resources – always foraging is possible
    a.extend(26..=38);

    // construction – need materials or be near rock/water for well/bridge
    if has_mats || near_rock || near_water {
        a.extend(39..=50);
        a.extend(166..=180);
    }

    // crafting – needs some energy
    if org.energy > 0.30 {
        a.extend(51..=65);
        a.extend(151..=165);
    }

    // knowledge – always applicable
    a.extend(66..=79);
    a.extend(126..=140);

    // social – need someone nearby
    if any_near { a.extend(80..=89); }

    // diplomacy – need a stranger or kin group
    if stranger_near || kin_near { a.extend(90..=95); a.extend(181..=190); }

    // warfare – need a stranger nearby (or general patrol/guard regardless)
    a.extend(100..=101); // patrol + stand_guard always
    if stranger_near { a.extend([96,97,98,99,102,103,104,105,106].iter().copied()); }
    a.extend(191..=200);

    // self-care – always
    a.extend(107..=116);
    a.extend(221..=225);

    // exploration – always
    a.extend(117..=125);
    a.extend(211..=220);

    // cooking – need food
    if has_food { a.extend(141..=150); }

    // spiritual – always
    a.extend(201..=210);

    // ── phase-3 ──────────────────────────────────────────────────────────────

    // relationships – need someone nearby
    if any_near { a.extend(226..=245); }

    // medicine – always (can prepare remedies alone)
    a.extend(246..=260);

    // family – need kin
    if kin_near { a.extend(261..=275); }

    // economy – near others or have inventory
    if any_near || org.inv_food > 0 || org.inv_wood > 0 {
        a.extend(276..=295);
    }

    // governance – need kin (councils, laws)
    if kin_near { a.extend(296..=315); }

    // art & culture – always (solo art is valid)
    a.extend(316..=335);

    // agriculture – near food tile or have food
    if matches!(tile, Tile::Food | Tile::Grass) || has_food || needs_low {
        a.extend(336..=355);
    }

    // animal husbandry – always (can look for animals)
    a.extend(356..=370);

    // environment – always (land management)
    a.extend(371..=385);

    // emotion – always
    a.extend(386..=405);

    // communication – always
    a.extend(406..=420);

    // science – need some discoveries already made
    if !org.discoveries.is_empty() || org.age > 200 {
        a.extend(421..=435);
    }

    // military strategy – need kin (to form units)
    if kin_near { a.extend(436..=455); }

    // religion expanded – always
    a.extend(456..=470);

    // seasonal – always
    a.extend(471..=485);

    // legacy / death – elder or near-death context
    if org.is_elder || org.health < 0.40 || kin_near {
        a.extend(486..=500);
    }

    // education – need kin (to teach/learn)
    if kin_near || org.is_elder { a.extend(501..=520); }

    // ceremony – need kin
    if kin_near { a.extend(521..=535); }

    a
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

/// Dispatch an action by index. Returns the Q-learning reward.
///
/// Returns `Some(reward)` if the actions/ module handled the action,
/// `None` for indices outside the supported range. The caller is
/// responsible for applying the per-tick energy decrement.
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
        // phase-3
        226..=245   => relationships::apply(action, &mut ctx),
        246..=260   => medicine::apply(action, &mut ctx),
        261..=275   => family::apply(action, &mut ctx),
        276..=295   => economy::apply(action, &mut ctx),
        296..=315   => governance::apply(action, &mut ctx),
        316..=335   => art_culture::apply(action, &mut ctx),
        336..=355   => agriculture::apply(action, &mut ctx),
        356..=370   => animal_husbandry::apply(action, &mut ctx),
        371..=385   => environment::apply(action, &mut ctx),
        386..=405   => emotion::apply(action, &mut ctx),
        406..=420   => communication::apply(action, &mut ctx),
        421..=435   => science::apply(action, &mut ctx),
        436..=455   => military_strategy::apply(action, &mut ctx),
        456..=470   => religion_expanded::apply(action, &mut ctx),
        471..=485   => seasonal::apply(action, &mut ctx),
        486..=500   => legacy_death::apply(action, &mut ctx),
        501..=520   => education::apply(action, &mut ctx),
        521..=535   => ceremony::apply(action, &mut ctx),
        _           => return None,
    };
    Some(r)
}
