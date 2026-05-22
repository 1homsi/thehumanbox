

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
pub mod domestic;
pub mod hobbies;
pub mod urban;
pub mod entertainment;
pub mod profession;
pub mod modern_tech;
pub mod nature_walk;
pub mod transport;
pub mod fitness;
pub mod creative_make;
pub mod food_drink;
pub mod crafts_advanced;
pub mod social_play;
pub mod medicine_care;
pub mod learning;
pub mod travel_explore;
pub mod spiritual_practice;
pub mod court_politics;
pub mod childcare;
pub mod work_trade;

use ctx::ActionCtx;
use super::simulation::Simulation;
use crate::world::tiles::Tile;

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

    a.extend(0..=25);

    a.extend(26..=38);

    if has_mats || near_rock || near_water {
        a.extend(39..=50);
        a.extend(166..=180);
    }

    if org.energy > 0.30 {
        a.extend(51..=65);
        a.extend(151..=165);
    }

    a.extend(66..=79);
    a.extend(126..=140);

    if any_near { a.extend(80..=89); }

    if stranger_near || kin_near { a.extend(90..=95); a.extend(181..=190); }

    a.extend(100..=101);
    if stranger_near { a.extend([96,97,98,99,102,103,104,105,106].iter().copied()); }
    a.extend(191..=200);

    a.extend(107..=116);
    a.extend(221..=225);

    a.extend(117..=125);
    a.extend(211..=220);

    if has_food { a.extend(141..=150); }

    a.extend(201..=210);

    if any_near { a.extend(226..=245); }

    a.extend(246..=260);

    if kin_near { a.extend(261..=275); }

    if any_near || org.inv_food > 0 || org.inv_wood > 0 {
        a.extend(276..=295);
    }

    // Governance/diplomacy 296-315. Half of them (declare_war,
    // sign_treaty, grant_citizenship, establish_borders) actually need
    // a stranger nearby; gating only on kin_near made them
    // unreachable unless kin and stranger happened to be in the same
    // 6-tile bubble. Open the mask to either condition.
    if kin_near || stranger_near { a.extend(296..=315); }

    a.extend(316..=335);

    if matches!(tile, Tile::Food | Tile::Grass) || has_food || needs_low {
        a.extend(336..=355);
    }

    a.extend(356..=370);

    a.extend(371..=385);

    a.extend(386..=405);

    a.extend(406..=420);

    if !org.discoveries.is_empty() || org.age > 200 {
        a.extend(421..=435);
    }

    if kin_near { a.extend(436..=455); }

    a.extend(456..=470);

    a.extend(471..=485);

    if org.is_elder || org.health < 0.40 || kin_near {
        a.extend(486..=500);
    }

    if kin_near || org.is_elder { a.extend(501..=520); }

    if kin_near { a.extend(521..=535); }

    a.extend(536..=537);

    a.extend(540..=589);
    a.extend(600..=649);
    a.extend(660..=710);
    a.extend(720..=770);
    a.extend(780..=830);
    a.extend(840..=889);
    a.extend(900..=949);
    a.extend(960..=1011);
    a.extend(1020..=1070);
    a.extend(1080..=1131);
    a.extend(1140..=1189);
    a.extend(1200..=1249);
    a.extend(1260..=1310);
    a.extend(1320..=1369);
    a.extend(1380..=1428);
    a.extend(1440..=1489);
    a.extend(1500..=1548);
    a.extend(1560..=1608);
    a.extend(1620..=1668);
    a.extend(1680..=1729);

    a
}

pub fn try_apply(sim: &mut Simulation, idx: usize, action: usize, ix: i32, iy: i32, spatial: &crate::sim::spatial::SpatialIndex) -> Option<f32> {
    let mut ctx = ActionCtx::new(sim, idx, ix, iy, spatial);
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
        536..=537   => construction::apply(action, &mut ctx),
        540..=589   => domestic::apply(action, &mut ctx),
        600..=649   => hobbies::apply(action, &mut ctx),
        660..=710   => urban::apply(action, &mut ctx),
        720..=770   => entertainment::apply(action, &mut ctx),
        780..=830   => profession::apply(action, &mut ctx),
        840..=889   => modern_tech::apply(action, &mut ctx),
        900..=949   => nature_walk::apply(action, &mut ctx),
        960..=1011  => transport::apply(action, &mut ctx),
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
        _           => return None,
    };
    Some(r)
}
