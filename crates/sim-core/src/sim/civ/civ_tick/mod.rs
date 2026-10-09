use super::moments::*;
use crate::hashing::{FxHashMap as HashMap, FxHashSet as HashSet};
use crate::sim::age_stage::AgeStage;
use crate::sim::buildings::{Building, BuildingKind};
use crate::sim::config::natural_lineage_limit;
use crate::sim::culture::{ArtKind, Artwork, Religion, ReligionKind};
use crate::sim::economy::Specialty;
use crate::sim::era::Era;
use crate::sim::government::{Government, GovernmentKind, Law, LawKind};
use crate::sim::language_tech::{pick_book_title, Book, BookTopic};
use crate::sim::medicine::DiseaseKind;
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;
use crate::sim::world_events::push_event;
use crate::sim::world_milestones::Milestone;
use rand::RngExt;

mod arts;
mod construction;
mod disease;
#[cfg(test)]
mod disease_tests;
#[cfg(test)]
mod faith_tests;
mod homes;
mod knowledge;
mod milestones;
mod people;
mod politics;
mod props;
mod religion;
mod targets;
#[cfg(test)]
mod tests;
mod watches;

use arts::*;
use construction::*;
pub(crate) use construction::{
    construction_site_is_valid, lineage_can_afford_construction, reconcile_operational_infrastructure,
    try_start_building_at, wants_manor,
};
#[cfg(test)]
pub(crate) use disease::tick_disease_spread_for_test;
use disease::*;
use homes::*;
use knowledge::*;
use milestones::*;
use people::*;
use politics::*;
use props::*;
pub(super) use props::{footprint_cells, prop_site_is_clear};
use religion::*;
use targets::*;
use watches::*;

pub fn tick_civ(sim: &mut Simulation, spatial: Option<&SpatialIndex>) {
    let tick = sim.tick_count;

    if tick.is_multiple_of(crate::sim::cosmos::YEAR_LENGTH_TICKS) {
        let gap = crate::sim::civ::society::inequality::average_wealth_gap(&sim.organisms);
        sim.history.record_wealth_gap(tick, gap);
    }

    if tick.is_multiple_of(60) {
        tick_age_stages(sim);
    }
    if tick.is_multiple_of(120) {
        tick_specialties(sim);
        tick_merchant_drift(sim);
        tick_apprenticeships(sim);
        tick_aspirations(sim);
    }
    if tick.is_multiple_of(200) {
        tick_governments(sim);
        tick_milestones(sim);
    }
    if tick.is_multiple_of(300) {
        tick_education(sim);
    }
    if tick.is_multiple_of(240) {
        tick_buildings_construct(sim);
    }
    if tick.is_multiple_of(DISEASE_STEP) {
        tick_disease_spread(sim);
    }
    if tick.is_multiple_of(150) {
        tick_scatter_props(sim);
    }
    if tick.is_multiple_of(400) {
        tick_religion_founding(sim);
        tick_artwork(sim);
        tick_books(sim);
    }
    if tick.is_multiple_of(1600) {
        tick_religion_schism(sim);
    }
    if tick.is_multiple_of(240) {
        tick_religion_adherents(sim);
        tick_religion_effects(sim);
    }
    if tick.is_multiple_of(600) {
        tick_leader_influence(sim);
    }
    if tick.is_multiple_of(300) {
        tick_dynasty_watch(sim);
        forget_vanished_tribes(sim);
    }
    if tick > 0 && tick.is_multiple_of(crate::sim::civ::land::village_roads::ROAD_STEP) {
        crate::sim::civ::land::village_roads::tick_village_roads(sim);
    }
    if tick > 0 && tick.is_multiple_of(super::festivals::FESTIVAL_STEP) {
        sim.tick_festivals();
    }
    if tick > 0 && tick.is_multiple_of(super::graves::GRAVE_STEP) {
        sim.tick_graves();
    }
    if tick > 0 && tick.is_multiple_of(super::orphans::ORPHAN_STEP) {
        sim.tick_orphans();
    }
    if tick > 0 && tick.is_multiple_of(super::refugees::REFUGE_STEP) {
        sim.tick_refugees();
    }
    if tick > 0 && tick.is_multiple_of(super::peril::PERIL_STEP) {
        sim.tick_tribe_peril();
    }
    if tick > 0 && tick.is_multiple_of(900) {
        tick_deforestation(sim);
    }
    if tick.is_multiple_of(800) {
        tick_diplomacy(sim);
    }
    if tick.is_multiple_of(1200) {
        tick_plague_watch(sim);
    }
    super::economy_tick::tick_economy(sim, tick);
    if tick.is_multiple_of(1200) {
        tick_disease_introduce(sim);
    }
    if tick.is_multiple_of(500) && tick > 0 {
        if let Some(spatial) = spatial {
            tick_cross_lineage_knowledge(sim, spatial);
        }
    }
    if tick.is_multiple_of(180) && tick > 0 {
        tick_building_auras(sim);
    }
    if tick.is_multiple_of(1200) && tick > 0 {
        tick_home_furnishing(sim);
    }
    if tick.is_multiple_of(60) && tick > 0 {
        tick_witnessed_events(sim);
    }
    if tick.is_multiple_of(180) && tick > 0 {
        tick_sky_omens(sim);
    }
    if tick.is_multiple_of(240) && tick > 0 {
        tick_reflections(sim);
    }
    if tick > 0 && tick.is_multiple_of(crate::sim::cosmos::DAY_LENGTH) {
        tick_lunar_observation(sim);
        super::vacancy::tick_vacancy(sim);
    }
    if tick > 0 && tick.is_multiple_of(crate::sim::cosmos::DAY_LENGTH * 6) {
        tick_maybe_eclipse(sim);
    }
    if tick > 0 && tick.is_multiple_of(90) && sim.is_night() {
        tick_dreams(sim);
    }
    if tick > 0 && tick.is_multiple_of(300) {
        tick_anniversaries(sim);
    }
    if tick > 0 && tick.is_multiple_of(60) {
        tick_mood_contagion(sim);
    }
    if tick > 0 && tick.is_multiple_of(180) {
        tick_meteor_shower(sim);
    }
    if tick > 0 && tick.is_multiple_of(360) {
        tick_aurora_sighting(sim);
    }
    if tick > 0 && tick.is_multiple_of(240) {
        tick_teaching(sim);
    }
    if tick > 0 && tick.is_multiple_of(80) {
        tick_friend_gravitation(sim);
    }
    if tick > 0 && tick.is_multiple_of(20) {
        tick_building_progress(sim);
    }
    if tick > 0 && tick.is_multiple_of(40) {
        tick_evening_gathering(sim);
    }
    if tick > 0 && tick.is_multiple_of(6) {
        tick_birth_celebrations(sim);
    }
    if tick > 0 && tick.is_multiple_of(6) {
        tick_coming_of_age(sim);
    }
    if tick > 0 && tick.is_multiple_of(20) {
        tick_funerals(sim);
    }
    if tick > 0 && tick.is_multiple_of(8) {
        tick_naming_ceremonies(sim);
    }
    if tick > 0 && tick.is_multiple_of(1800) {
        tick_festivals(sim);
    }
    if tick > 0 && tick.is_multiple_of(60) {
        tick_awe_marvels(sim);
    }
    if tick > 0 && tick.is_multiple_of(30) {
        tick_gratitude_sharing(sim);
    }
    if tick > 0 && tick.is_multiple_of(50) {
        tick_anger_outbursts(sim);
    }
    if tick > 0 && tick.is_multiple_of(90) {
        tick_spiritual_pilgrimage(sim);
    }
    if tick > 0 && tick.is_multiple_of(300) {
        tick_hopeful_aspiration(sim);
    }
    if tick > 0 && tick.is_multiple_of(100) {
        tick_jealousy_rivalries(sim);
    }
    if tick > 0 && tick.is_multiple_of(200) {
        tick_curiosity_exploration(sim);
    }
    if tick > 0 && tick.is_multiple_of(600) {
        tick_weddings(sim);
    }
    if tick > 0 && tick.is_multiple_of(1200) {
        tick_separations(sim);
    }
    if tick > 0 && tick.is_multiple_of(120) {
        tick_dream_sharing(sim);
    }
    if tick > 0 && tick.is_multiple_of(60) {
        tick_storyteller(sim);
    }
    if tick > 0 && tick.is_multiple_of(90) {
        tick_arguments(sim);
    }
    if tick > 0 && tick.is_multiple_of(240) {
        tick_reconciliations(sim);
    }
    tick_daily_summary(sim);
    tick_season_change(sim);
    if tick > 0 && tick.is_multiple_of(600) && sim.is_night() {
        tick_partner_pillow_talk(sim);
    }
    if tick > 0 && tick.is_multiple_of(240) {
        tick_grudge_recall(sim);
    }
    if tick > 0 && tick.is_multiple_of(45) {
        tick_mood(sim);
    }
}

fn era_index(name: &str) -> u32 {
    match name {
        "pre-stone" => 0,
        "stone" => 1,
        "bronze" => 2,
        "iron" => 3,
        "classical" => 4,
        "medieval" => 5,
        "renaissance" => 6,
        "industrial" => 7,
        "modern" => 8,
        "information" => 9,
        _ => 10,
    }
}

fn lineage_era(sim: &Simulation, lid: &str) -> Era {
    sim.lineage_eras.get(lid).copied().unwrap_or(Era::PreStone)
}

fn lineage_pop(sim: &Simulation, lid: &str) -> usize {
    if let Some(stats) = sim.lineage_aggregates.get(lid) {
        return stats.population;
    }
    sim.organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lid)
        .count()
}

fn lineage_center(sim: &Simulation, lid: &str) -> (i32, i32) {
    if let Some(stats) = sim.lineage_aggregates.get(lid) {
        return stats.center();
    }
    let mut sx = 0i64;
    let mut sy = 0i64;
    let mut n = 0i64;
    for o in &sim.organisms {
        if o.alive && o.lineage_id == lid {
            sx += o.x as i64;
            sy += o.y as i64;
            n += 1;
        }
    }
    if n == 0 {
        return (0, 0);
    }
    ((sx / n) as i32, (sy / n) as i32)
}

fn lineage_literacy(sim: &Simulation, lid: &str) -> f32 {
    if let Some(stats) = sim.lineage_aggregates.get(lid) {
        return stats.literacy();
    }
    let mut sum = 0.0;
    let mut n = 0;
    for o in &sim.organisms {
        if o.alive && o.lineage_id == *lid {
            sum += o.literacy;
            n += 1;
        }
    }
    if n == 0 {
        0.0
    } else {
        sum / n as f32
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    c.next()
        .map(|f| f.to_uppercase().chain(c).collect())
        .unwrap_or_default()
}
