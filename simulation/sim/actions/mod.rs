

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
pub mod crime_law;
pub mod seafaring;
pub mod arts_performance;
pub mod agriculture_advanced;
pub mod animal_handling;
pub mod industry;
pub mod tech_use;
pub mod survival;
pub mod relationships_deep;
pub mod self_improvement;
pub mod emotion_deep;
pub mod cosmic_arts;
pub mod shadow_arts;
pub mod ritual_advanced;
pub mod architecture_design;
pub mod leadership;
pub mod trade_advanced;
pub mod theology;
pub mod cooking_world;
pub mod community;
pub mod home_decor;
pub mod scholarly;
pub mod celestial_work;
pub mod mythmaking;
pub mod logistics;
pub mod oral_history;
pub mod infrastructure_work;
pub mod teaching_advanced;
pub mod caretaking_advanced;
pub mod deep_craft;
pub mod gardening;
pub mod festival_prep;
pub mod martial;
pub mod masonry_work;
pub mod woodwork;
pub mod metalwork;
pub mod glasswork;
pub mod textiles;
pub mod leatherwork;
pub mod ceramics_pottery;
pub mod science_lab;
pub mod field_research;
pub mod cyber_action;
pub mod bio_action;
pub mod ecological;
pub mod mountaineering;
pub mod water_sports;
pub mod stargazing;
pub mod emergency_response;
pub mod political_action;
pub mod orbital_act;
pub mod martian_act;
pub mod xenobiology;
pub mod singularity_act;
pub mod cosmic_engineer;
pub mod dreamwork;
pub mod negotiation;
pub mod historical_record;
pub mod courier;
pub mod beekeeping;
pub mod cafe_work;
pub mod barista_advanced;
pub mod retail;
pub mod tech_devops;
pub mod childhood;
pub mod elder_life;
pub mod journalism;
pub mod fashion;
pub mod butchery;
pub mod distillation;

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
    a.extend(1740..=1790);
    a.extend(1800..=1849);
    a.extend(1860..=1909);
    a.extend(1920..=1969);
    a.extend(1980..=2029);
    a.extend(2040..=2089);
    a.extend(2100..=2149);
    a.extend(2160..=2212);
    a.extend(2220..=2269);
    a.extend(2280..=2329);
    a.extend(2340..=2389);
    a.extend(2400..=2449);
    a.extend(2460..=2509);
    a.extend(2520..=2568);
    a.extend(2580..=2629);
    a.extend(2640..=2689);
    a.extend(2700..=2749);
    a.extend(2760..=2809);
    a.extend(2820..=2869);
    a.extend(2880..=2929);
    a.extend(2940..=2989);
    a.extend(3000..=3049);
    a.extend(3060..=3109);
    a.extend(3120..=3169);
    a.extend(3180..=3229);
    a.extend(3240..=3289);
    a.extend(3300..=3349);
    a.extend(3360..=3409);
    a.extend(3420..=3469);
    a.extend(3480..=3525);
    a.extend(3540..=3589);
    a.extend(3600..=3649);
    a.extend(3660..=3709);
    a.extend(3720..=3769);
    a.extend(3780..=3829);
    a.extend(3840..=3889);
    a.extend(3900..=3949);
    a.extend(3960..=4009);
    a.extend(4020..=4069);
    a.extend(4080..=4124);
    a.extend(4140..=4189);
    a.extend(4200..=4249);
    a.extend(4260..=4309);
    a.extend(4320..=4369);
    a.extend(4380..=4429);
    a.extend(4440..=4489);
    a.extend(4500..=4549);
    a.extend(4560..=4609);
    a.extend(4620..=4669);
    a.extend(4680..=4729);
    a.extend(4740..=4789);
    a.extend(4800..=4849);
    a.extend(4860..=4910);
    a.extend(4920..=4969);
    a.extend(4980..=5029);
    a.extend(5040..=5089);
    a.extend(5100..=5149);
    a.extend(5160..=5209);
    a.extend(5220..=5269);
    a.extend(5280..=5329);
    use super::civ::era::Era;
    let era = sim.era(lid);
    let stage = org.age_stage();
    let has = |d: &str| org.discoveries.contains(d);

    if era >= Era::Modern {
        a.extend(5340..=5389);
        a.extend(5400..=5449);
    }
    if has("currency") {
        a.extend(5460..=5509);
    }
    if era >= Era::Information && org.literacy >= 0.5 {
        a.extend(5520..=5569);
    }
    if matches!(stage, crate::sim::age_stage::AgeStage::Infant | crate::sim::age_stage::AgeStage::Child) {
        a.extend(5580..=5629);
    }
    if org.is_elder || matches!(stage, crate::sim::age_stage::AgeStage::Elder) {
        a.extend(5640..=5689);
    }
    if has("writing") && era >= Era::Renaissance {
        a.extend(5700..=5749);
    }
    if has("weaving") {
        a.extend(5760..=5809);
    }
    if has("hunting") || has("hunt") {
        a.extend(5820..=5869);
    }
    if has("brewing") && era >= Era::Bronze {
        a.extend(5880..=5929);
    }

    a
}

fn workshop_bonus(sim: &Simulation, ix: i32, iy: i32, action: usize) -> f32 {
    use crate::sim::tech::buildings::BuildingKind as BK;
    let kinds: &[BK] = match action {
        5340..=5449 => &[BK::Cafe, BK::Restaurant, BK::Bakery],
        5460..=5509 => &[BK::Market, BK::MallShop, BK::Supermarket, BK::MarketStall, BK::Kiosk],
        5520..=5569 => &[BK::Datacenter, BK::OfficeTower, BK::ResearchLab, BK::Studio],
        5700..=5749 => &[BK::Library, BK::Scribe, BK::BookStore, BK::University],
        5760..=5809 => &[BK::Tailor, BK::ClothingShop, BK::Cobbler, BK::Jeweler],
        5820..=5869 => &[BK::Butcher, BK::Cheesemonger, BK::Fishmonger, BK::Smithy],
        5880..=5929 => &[BK::Brewery, BK::Tavern, BK::Inn, BK::Vineyard],
        _ => return 1.0,
    };
    let near = sim.buildings.iter().any(|b| {
        if !kinds.contains(&b.kind) {
            return false;
        }
        let (fw, fh) = b.kind.footprint();
        let bx = b.x + fw as i32 / 2;
        let by = b.y + fh as i32 / 2;
        (bx - ix).abs() + (by - iy).abs() <= 7
    });
    if near { 1.55 } else { 1.0 }
}

fn category_for(action: usize) -> Option<&'static str> {
    Some(match action {
        5340..=5389 => "cafe_work",
        5400..=5449 => "barista_advanced",
        5460..=5509 => "retail",
        5520..=5569 => "tech_devops",
        5580..=5629 => "childhood",
        5640..=5689 => "elder_life",
        5700..=5749 => "journalism",
        5760..=5809 => "fashion",
        5820..=5869 => "butchery",
        5880..=5929 => "distillation",
        _ => return None,
    })
}

fn aspiration_bonus(aspiration: &str, action: usize) -> f32 {
    if aspiration.is_empty() {
        return 1.0;
    }
    let matches = match aspiration {
        "seeker" => {
            // Knowledge / science / exploration
            matches!(
                action,
                66..=79 | 117..=125 | 126..=140 | 211..=220 | 421..=435 | 1380..=1428 | 4140..=4189 | 4200..=4249 | 4560..=4609
            )
        }
        "wanderer" => {
            // Pure exploration
            matches!(action, 117..=125 | 211..=220 | 1440..=1489 | 4440..=4489 | 4500..=4549)
        }
        "warrior" => {
            // Combat / military
            matches!(action, 96..=106 | 191..=200 | 436..=455 | 3660..=3709 | 4620..=4669)
        }
        "connector" => {
            // Social / relationships / family
            matches!(action, 80..=89 | 226..=245 | 261..=275 | 1260..=1310 | 2220..=2269)
        }
        "builder" => {
            // Construction + craft + masonry
            matches!(
                action,
                39..=50 | 166..=180 | 51..=65 | 151..=165 | 1200..=1249 | 3480..=3525 | 3720..=3769 | 3780..=3829 | 3840..=3889
            )
        }
        "devout" => {
            // Spiritual + religion + ritual
            matches!(action, 201..=210 | 456..=470 | 1500..=1548 | 2520..=2568 | 2760..=2809)
        }
        "sage" => {
            // Teaching, education, scholarship
            matches!(action, 501..=520 | 3000..=3049 | 3240..=3289 | 3360..=3409)
        }
        "provider" => {
            matches!(action, 26..=38 | 141..=150 | 336..=355 | 356..=370 | 1140..=1189 | 1620..=1668 | 3420..=3469)
        }
        "artist" => {
            matches!(action, 316..=335 | 3120..=3169 | 3300..=3349 | 5160..=5209)
        }
        "healer" => {
            matches!(action, 246..=260 | 1320..=1369 | 3060..=3109 | 4920..=4969)
        }
        _ => false,
    };
    if matches { 1.4 } else { 1.0 }
}

fn specialty_bonus(org_specialty: Option<&str>, action: usize) -> f32 {
    let Some(spec) = org_specialty else { return 1.0 };
    let matches = match action {
        5340..=5449 => spec == "baker",
        5460..=5509 => spec == "merchant" || spec == "banker",
        5520..=5569 => spec == "programmer" || spec == "engineer",
        5700..=5749 => spec == "journalist" || spec == "scholar" || spec == "scribe",
        5760..=5809 => spec == "weaver",
        5820..=5869 => spec == "hunter" || spec == "farmer",
        5880..=5929 => spec == "brewer",
        336..=355   => spec == "farmer",
        356..=370   => spec == "hunter" || spec == "farmer",
        66..=79 | 126..=140 | 421..=435 => spec == "scholar" || spec == "scribe" || spec == "teacher",
        446..=455 | 96..=106 | 191..=200 => spec == "soldier" || spec == "officer",
        246..=260 => spec == "healer" || spec == "doctor",
        201..=210 | 456..=470 => spec == "priest",
        276..=295 => spec == "merchant" || spec == "banker",
        316..=335 => spec == "artist",
        _ => false,
    };
    if matches { 1.4 } else { 1.0 }
}

pub fn try_apply(sim: &mut Simulation, idx: usize, action: usize, ix: i32, iy: i32, spatial: &crate::sim::spatial::SpatialIndex) -> Option<f32> {
    let bonus = workshop_bonus(sim, ix, iy, action);
    let spec_bonus = specialty_bonus(sim.organisms[idx].specialty.as_deref(), action);
    let asp_bonus = aspiration_bonus(&sim.organisms[idx].aspiration, action);
    if let Some(cat) = category_for(action) {
        *sim.action_counts.entry(cat).or_insert(0) += 1;
        if matches!(
            action,
            5340..=5449 | 5460..=5509 | 5520..=5569 | 5700..=5749 |
            5760..=5809 | 5820..=5869 | 5880..=5929
        ) {
            let entry = sim.workshop_hits.entry(cat).or_insert((0, 0));
            if bonus > 1.0 { entry.0 += 1; } else { entry.1 += 1; }
        }
    }
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
        1740..=1790 => crime_law::apply(action, &mut ctx),
        1800..=1849 => seafaring::apply(action, &mut ctx),
        1860..=1909 => arts_performance::apply(action, &mut ctx),
        1920..=1969 => agriculture_advanced::apply(action, &mut ctx),
        1980..=2029 => animal_handling::apply(action, &mut ctx),
        2040..=2089 => industry::apply(action, &mut ctx),
        2100..=2149 => tech_use::apply(action, &mut ctx),
        2160..=2212 => survival::apply(action, &mut ctx),
        2220..=2269 => relationships_deep::apply(action, &mut ctx),
        2280..=2329 => self_improvement::apply(action, &mut ctx),
        2340..=2389 => emotion_deep::apply(action, &mut ctx),
        2400..=2449 => cosmic_arts::apply(action, &mut ctx),
        2460..=2509 => shadow_arts::apply(action, &mut ctx),
        2520..=2568 => ritual_advanced::apply(action, &mut ctx),
        2580..=2629 => architecture_design::apply(action, &mut ctx),
        2640..=2689 => leadership::apply(action, &mut ctx),
        2700..=2749 => trade_advanced::apply(action, &mut ctx),
        2760..=2809 => theology::apply(action, &mut ctx),
        2820..=2869 => cooking_world::apply(action, &mut ctx),
        2880..=2929 => community::apply(action, &mut ctx),
        2940..=2989 => home_decor::apply(action, &mut ctx),
        3000..=3049 => scholarly::apply(action, &mut ctx),
        3060..=3109 => celestial_work::apply(action, &mut ctx),
        3120..=3169 => mythmaking::apply(action, &mut ctx),
        3180..=3229 => logistics::apply(action, &mut ctx),
        3240..=3289 => oral_history::apply(action, &mut ctx),
        3300..=3349 => infrastructure_work::apply(action, &mut ctx),
        3360..=3409 => teaching_advanced::apply(action, &mut ctx),
        3420..=3469 => caretaking_advanced::apply(action, &mut ctx),
        3480..=3525 => deep_craft::apply(action, &mut ctx),
        3540..=3589 => gardening::apply(action, &mut ctx),
        3600..=3649 => festival_prep::apply(action, &mut ctx),
        3660..=3709 => martial::apply(action, &mut ctx),
        3720..=3769 => masonry_work::apply(action, &mut ctx),
        3780..=3829 => woodwork::apply(action, &mut ctx),
        3840..=3889 => metalwork::apply(action, &mut ctx),
        3900..=3949 => glasswork::apply(action, &mut ctx),
        3960..=4009 => textiles::apply(action, &mut ctx),
        4020..=4069 => leatherwork::apply(action, &mut ctx),
        4080..=4124 => ceramics_pottery::apply(action, &mut ctx),
        4140..=4189 => science_lab::apply(action, &mut ctx),
        4200..=4249 => field_research::apply(action, &mut ctx),
        4260..=4309 => cyber_action::apply(action, &mut ctx),
        4320..=4369 => bio_action::apply(action, &mut ctx),
        4380..=4429 => ecological::apply(action, &mut ctx),
        4440..=4489 => mountaineering::apply(action, &mut ctx),
        4500..=4549 => water_sports::apply(action, &mut ctx),
        4560..=4609 => stargazing::apply(action, &mut ctx),
        4620..=4669 => emergency_response::apply(action, &mut ctx),
        4680..=4729 => political_action::apply(action, &mut ctx),
        4740..=4789 => orbital_act::apply(action, &mut ctx),
        4800..=4849 => martian_act::apply(action, &mut ctx),
        4860..=4910 => xenobiology::apply(action, &mut ctx),
        4920..=4969 => singularity_act::apply(action, &mut ctx),
        4980..=5029 => cosmic_engineer::apply(action, &mut ctx),
        5040..=5089 => dreamwork::apply(action, &mut ctx),
        5100..=5149 => negotiation::apply(action, &mut ctx),
        5160..=5209 => historical_record::apply(action, &mut ctx),
        5220..=5269 => courier::apply(action, &mut ctx),
        5280..=5329 => beekeeping::apply(action, &mut ctx),
        5340..=5389 => cafe_work::apply(action, &mut ctx) * 0.8 * bonus,
        5400..=5449 => barista_advanced::apply(action, &mut ctx) * 1.4 * bonus,
        5460..=5509 => retail::apply(action, &mut ctx) * 1.2 * bonus,
        5520..=5569 => tech_devops::apply(action, &mut ctx) * 1.8 * bonus,
        5580..=5629 => childhood::apply(action, &mut ctx) * 1.6,
        5640..=5689 => elder_life::apply(action, &mut ctx) * 1.5,
        5700..=5749 => journalism::apply(action, &mut ctx) * 1.3 * bonus,
        5760..=5809 => fashion::apply(action, &mut ctx) * 1.1 * bonus,
        5820..=5869 => butchery::apply(action, &mut ctx) * 1.7 * bonus,
        5880..=5929 => distillation::apply(action, &mut ctx) * 2.0 * bonus,
        _           => return None,
    };
    Some(r * spec_bonus * asp_bonus)
}
