use super::moments::*;
use crate::sim::age_stage::AgeStage;
use crate::sim::buildings::{Building, BuildingKind};
use crate::sim::config::natural_lineage_limit;
use crate::sim::culture::{ArtKind, Artwork, Religion, ReligionKind};
use crate::sim::economy::Specialty;
use crate::sim::era::Era;
use crate::sim::government::{Government, GovernmentKind, Law, LawKind};
use crate::sim::language_tech::{pick_book_title, Book, BookTopic};
use crate::sim::medicine::{pick_introduction, DiseaseKind};
use crate::sim::simulation::Simulation;
use crate::sim::spatial::SpatialIndex;
use crate::sim::world_events::push_event;
use crate::sim::world_milestones::Milestone;
use rand::Rng;
use std::collections::{HashMap, HashSet};

pub fn tick_civ(sim: &mut Simulation, spatial: Option<&SpatialIndex>) {
    let tick = sim.tick_count;

    if tick.is_multiple_of(60) {
        tick_age_stages(sim);
    }
    if tick.is_multiple_of(120) {
        tick_specialties(sim);
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
    if tick.is_multiple_of(400) {
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

fn tick_home_furnishing(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    for idx in 0..sim.organisms.len() {
        let o = &sim.organisms[idx];
        if !o.alive || o.age < 600 {
            continue;
        }
        if o.home_furniture.len() >= 12 {
            continue;
        }
        if o.energy < 0.30 || o.comfort < 0.30 {
            continue;
        }
        let era = era_map
            .get(&o.lineage_id)
            .copied()
            .unwrap_or(crate::sim::era::Era::PreStone);
        let era_name = era.name();
        let era_idx = era_index(era_name);

        let curiosity = o.traits.curiosity;
        let social = o.traits.social_tendency;
        let aggression = o.traits.aggression;
        let resilience = o.traits.resilience;
        let wealth = o.wealth;
        let literacy = o.literacy;
        let piety = o.piety;
        let specialty = o.specialty.clone();

        let mut candidates: Vec<&'static str> = Vec::new();
        for (name, reqs, min_era) in FURNITURE_POOL {
            if o.home_furniture.iter().any(|f| f == name) {
                continue;
            }
            if era_index(min_era) > era_idx {
                continue;
            }
            if !reqs.iter().all(|r| o.discoveries.contains(*r)) {
                continue;
            }
            let trait_match = match *name {
                "bookshelf" | "writing_desk" | "globe" | "telescope_decor" | "clock" => {
                    literacy > 0.3 || curiosity > 0.55
                }
                "rug" | "vase_flowers" | "painting" | "art_print" | "photo_frame" | "potted_plant"
                | "standing_plant" => social > 0.5 || curiosity > 0.5,
                "anvil" => specialty.as_deref() == Some("smith"),
                "loom" => specialty.as_deref() == Some("weaver") || social > 0.4,
                "wine_jug" => specialty.as_deref() == Some("brewer") || aggression < 0.4,
                "four_poster_bed" | "armchair" | "sofa" | "coffee_table" => wealth > 8,
                "piano" | "gramophone" | "smart_speaker" => social > 0.55 && wealth > 12,
                "monitor" | "computer_desk" => curiosity > 0.55,
                "fireplace" | "kitchen_stove" => resilience > 0.4,
                "mirror" => social > 0.5,
                _ => true,
            };
            if !trait_match {
                continue;
            }
            candidates.push(name);
        }
        if candidates.is_empty() {
            continue;
        }
        if sim.rng.random::<f32>() > 0.45 + curiosity * 0.3 + piety * 0.05 {
            continue;
        }

        let pick = candidates[sim.rng.random_range(0..candidates.len())];
        let org = &mut sim.organisms[idx];
        if org.home_style_seed == 0 {
            org.home_style_seed = (sim.tick_count as u32)
                .wrapping_mul(2654435761)
                .wrapping_add(idx as u32 * 11);
        }
        org.home_furniture.push(pick.to_string());
        let nm = org.name.clone();
        let tick_now = sim.tick_count;
        push_event(
            &mut sim.events,
            tick_now,
            "home",
            &nm,
            &format!("brought home a {}", pick.replace('_', " ")),
        );
    }
}

fn tick_building_auras(sim: &mut Simulation) {
    use crate::sim::tech::buildings::BuildingKind as BK;
    let auras: Vec<(f32, f32, Option<String>, BK)> = sim
        .buildings
        .iter()
        .filter_map(|b| {
            if !b.is_operational() {
                return None;
            }
            let kind = b.kind;
            if !matches!(
                kind,
                BK::Library
                    | BK::BookStore
                    | BK::Scribe
                    | BK::Hospital
                    | BK::Hospital2
                    | BK::Clinic
                    | BK::Pharmacy
                    | BK::Apothecary
                    | BK::Temple
                    | BK::Cathedral
                    | BK::Shrine
                    | BK::Mosque
                    | BK::Synagogue
                    | BK::Pagoda
                    | BK::School
                    | BK::University
                    | BK::Bank
                    | BK::Bathhouse
                    | BK::Spa
                    | BK::Stadium
                    | BK::PlayGround
                    | BK::ArtGallery
                    | BK::MusicHall
                    | BK::Theatre
                    | BK::Museum
                    | BK::Tavern
                    | BK::Inn
                    | BK::Cafe
                    | BK::Restaurant
                    | BK::Garden
                    | BK::Pond
                    | BK::Orchard
                    | BK::Fountain
                    | BK::Fountain2
                    | BK::Cemetery
                    | BK::GraveStone
                    | BK::Mausoleum
                    | BK::Bandstand
                    | BK::Pavilion
                    | BK::Gazebo
            ) {
                return None;
            }
            let (fw, fh) = b.kind.footprint();
            let bx = b.x as f32 + fw as f32 / 2.0;
            let by = b.y as f32 + fh as f32 / 2.0;
            Some((bx, by, b.owner_lineage.clone(), kind))
        })
        .collect();

    if auras.is_empty() {
        return;
    }

    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        for (bx, by, owner, kind) in &auras {
            if let Some(o) = owner {
                if o != &org.lineage_id {
                    continue;
                }
            }
            let d = (org.x - bx).abs() + (org.y - by).abs();
            if d > 8.0 {
                continue;
            }
            match *kind {
                BK::Library | BK::BookStore | BK::Scribe => {
                    org.literacy = (org.literacy + 0.002).min(1.0);
                }
                BK::Hospital | BK::Hospital2 | BK::Clinic | BK::Pharmacy | BK::Apothecary => {
                    org.infection = (org.infection - 0.01).max(0.0);
                    org.health = (org.health + 0.004).min(1.0);
                }
                BK::Temple | BK::Cathedral | BK::Shrine | BK::Mosque | BK::Synagogue | BK::Pagoda => {
                    org.piety = (org.piety + 0.003).min(1.0);
                    org.comfort = (org.comfort + 0.002).min(1.0);
                }
                BK::School => {
                    if org.age < 2000 {
                        org.literacy = (org.literacy + 0.004).min(1.0);
                    }
                }
                BK::University => {
                    if org.literacy > 0.4 {
                        org.literacy = (org.literacy + 0.003).min(1.0);
                    }
                }
                BK::Bank => {
                    if org.specialty.as_deref() == Some("merchant")
                        || org.specialty.as_deref() == Some("banker")
                    {
                        org.wealth = org.wealth.saturating_add(1);
                    }
                }
                BK::Bathhouse | BK::Spa => {
                    org.comfort = (org.comfort + 0.005).min(1.0);
                    org.infection = (org.infection - 0.003).max(0.0);
                }
                BK::Stadium | BK::PlayGround => {
                    org.comfort = (org.comfort + 0.003).min(1.0);
                    org.energy = (org.energy + 0.002).min(1.0);
                }
                BK::ArtGallery | BK::MusicHall | BK::Theatre | BK::Museum => {
                    org.comfort = (org.comfort + 0.004).min(1.0);
                    org.literacy = (org.literacy + 0.001).min(1.0);
                }
                BK::Tavern | BK::Inn | BK::Cafe | BK::Restaurant => {
                    org.comfort = (org.comfort + 0.003).min(1.0);
                    org.boredom = (org.boredom - 0.004).max(0.0);
                    org.loneliness = (org.loneliness - 0.003).max(0.0);
                }
                BK::Garden | BK::Pond | BK::Orchard | BK::Fountain | BK::Fountain2 => {
                    org.comfort = (org.comfort + 0.003).min(1.0);
                    org.fear_level = (org.fear_level - 0.002).max(0.0);
                }
                BK::Cemetery | BK::GraveStone | BK::Mausoleum => {
                    if org.grief_ticks > 0 {
                        org.grief_ticks = org.grief_ticks.saturating_sub(2);
                        org.comfort = (org.comfort + 0.002).min(1.0);
                    }
                }
                BK::Bandstand | BK::Pavilion | BK::Gazebo => {
                    org.comfort = (org.comfort + 0.002).min(1.0);
                    org.boredom = (org.boredom - 0.003).max(0.0);
                }
                _ => {}
            }
            break;
        }
    }
}

fn tick_cross_lineage_knowledge(sim: &mut Simulation, spatial: &SpatialIndex) {
    let mut nearby = Vec::with_capacity(32);
    let mut to_grant: Vec<(usize, usize, String)> = Vec::new();

    for learner_idx in 0..sim.organisms.len() {
        let learner = &sim.organisms[learner_idx];
        if !learner.alive {
            continue;
        }
        let (x, y) = (learner.x, learner.y);
        let learner_lineage = &learner.lineage_id;
        let curiosity = learner.traits.curiosity;
        let sociability = learner.traits.social_tendency;

        spatial.query_into(x as i32, y as i32, 4, &mut nearby);
        let mut best_teacher: Option<(usize, f32)> = None;
        for &teacher_idx in &nearby {
            if teacher_idx == learner_idx {
                continue;
            }
            let teacher = &sim.organisms[teacher_idx];
            if !teacher.alive || teacher.lineage_id == *learner_lineage {
                continue;
            }
            let distance = (teacher.x - x).abs() + (teacher.y - y).abs();
            if distance > 4.0 || teacher.discoveries.is_empty() {
                continue;
            }
            if !teacher
                .discoveries
                .iter()
                .any(|d| !learner.discoveries.contains(d))
            {
                continue;
            }
            if best_teacher.is_none_or(|(_, best_distance)| distance < best_distance) {
                best_teacher = Some((teacher_idx, distance));
            }
        }

        let Some((teacher_idx, distance)) = best_teacher else {
            continue;
        };
        let teacher = &sim.organisms[teacher_idx];
        let attitude = learner.attitude_toward(&teacher.lineage_id);
        let trust = learner.org_trust.get(&teacher.id).copied().unwrap_or(0.0);
        // Curious, social organisms learn more readily, especially from a
        // trusted nearby teacher. Hostility makes accidental cultural transfer
        // rare without making it impossible at a shared border.
        let chance =
            (0.025 + curiosity * 0.050 + sociability * 0.025 + trust * 0.040 + attitude.max(0.0) * 0.030)
                * (1.0 - distance / 8.0)
                * if attitude < -0.35 { 0.18 } else { 1.0 };
        if sim.rng.random::<f32>() >= chance {
            continue;
        }

        // Reservoir sample a discovery without materialising a set-difference.
        let mut selected: Option<&String> = None;
        let mut choices = 0u32;
        for discovery in &teacher.discoveries {
            if learner.discoveries.contains(discovery) {
                continue;
            }
            choices += 1;
            if sim.rng.random_range(0..choices) == 0 {
                selected = Some(discovery);
            }
        }
        if let Some(discovery) = selected {
            to_grant.push((learner_idx, teacher_idx, discovery.clone()));
        }
    }

    let tick_now = sim.tick_count;
    let mut events: Vec<(String, String)> = Vec::new();
    for (learner_idx, teacher_idx, discovery) in to_grant {
        if learner_idx == teacher_idx || !sim.organisms[learner_idx].alive {
            continue;
        }
        let teacher_id = sim.organisms[teacher_idx].id.clone();
        let teacher_name = sim.organisms[teacher_idx].name.clone();
        let teacher_lineage = sim.organisms[teacher_idx].lineage_id.clone();
        let learner = &mut sim.organisms[learner_idx];
        if !learner.discoveries.insert(discovery.clone()) {
            continue;
        }
        *learner.org_trust.entry(teacher_id).or_insert(0.0) += 0.015;
        learner.think(
            &format!("{} showed me {}", teacher_name, discovery.replace('_', " ")),
            tick_now,
        );
        learner.update_attitude(&teacher_lineage, 0.004);
        events.push((learner.name.clone(), discovery));
    }
    for (name, disc) in events {
        push_event(
            &mut sim.events,
            tick_now,
            "build",
            &name,
            &format!("learned {} through a nearby encounter", disc.replace('_', " ")),
        );
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

fn tick_age_stages(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    for i in 0..sim.organisms.len() {
        if !sim.organisms[i].alive {
            continue;
        }
        if sim.organisms[i].age_stage() == AgeStage::Teen
            && !sim.organisms[i].attributes.contains("left_home")
        {
            let drift = 70.0;
            let dx = sim.rng.random_range(-drift..=drift) * 0.5 + sim.rng.random_range(-drift..=drift) * 0.5;
            let dy = sim.rng.random_range(-drift..=drift) * 0.5 + sim.rng.random_range(-drift..=drift) * 0.5;
            let reflect = |mut v: f32, max: f32| {
                if v < 0.0 {
                    v = -v;
                }
                if v > max {
                    v = 2.0 * max - v;
                }
                v.clamp(0.0, max)
            };
            let org = &mut sim.organisms[i];
            org.home_x = reflect(org.home_x + dx, (crate::world::grid::WIDTH - 1) as f32);
            org.home_y = reflect(org.home_y + dy, (crate::world::grid::HEIGHT - 1) as f32);
            org.attributes.insert("left_home".to_string());
            org.log_life(
                tick,
                "milestone",
                "left the family hearth to claim my own ground".to_string(),
            );
            org.memories.insert(
                MemoryEntry::new(
                    MemoryKind::Episode,
                    "the day I left the family hearth — frightened, and free",
                    tick,
                )
                .with_salience(0.85)
                .with_emotion(1),
            );
        }
    }
    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        let stage = org.age_stage();
        if stage == AgeStage::Elder && !org.is_elder {
            org.is_elder = true;
            org.memories.insert(
                MemoryEntry::new(
                    MemoryKind::Fact,
                    "I am elder now — the young look to me for what I remember",
                    tick,
                )
                .with_salience(0.95)
                .with_emotion(2),
            );
            org.joy_ticks = (org.joy_ticks + 80).min(1200);
        }
    }

    let new_elders: Vec<(String, Option<String>)> = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.is_elder && o.attributes.contains("milestone:elder_headline:pending"))
        .map(|o| {
            let testimony = o
                .memories
                .entries
                .iter()
                .filter(|m| !matches!(m.kind, MemoryKind::Core))
                .max_by(|a, b| {
                    a.salience
                        .partial_cmp(&b.salience)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|m| m.text.clone());
            (o.name.clone(), testimony)
        })
        .collect();
    for o in sim.organisms.iter_mut() {
        if o.attributes.remove("milestone:elder_headline:pending") {
            let _ = o;
        }
    }
    for (name, testimony) in new_elders {
        let line = match testimony {
            Some(t) => format!("{} became an elder, carrying: \"{}\"", name, t),
            None => format!("{} became an elder among the people", name),
        };
        sim.headlines.push_back((tick, line));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        let stage = org.age_stage();
        if stage == AgeStage::Elder
            && !org.attributes.contains("milestone:elder_headline:fired")
            && !org.attributes.contains("milestone:elder_headline:pending")
        {
            org.attributes
                .insert("milestone:elder_headline:fired".to_string());
            org.attributes
                .insert("milestone:elder_headline:pending".to_string());
        }
        if stage == AgeStage::Adult && !org.attributes.contains("milestone:adult") {
            org.attributes.insert("milestone:adult".to_string());
            org.memories.insert(
                MemoryEntry::new(
                    MemoryKind::Fact,
                    "I am no longer a child — the world is mine to walk now",
                    tick,
                )
                .with_salience(0.90)
                .with_emotion(2),
            );
            org.joy_ticks = (org.joy_ticks + 50).min(1200);
        }
        if stage == AgeStage::Teen && !org.attributes.contains("milestone:teen") {
            org.attributes.insert("milestone:teen".to_string());
            org.memories.insert(
                MemoryEntry::new(
                    MemoryKind::Fact,
                    "I am growing — my body changes and the elders watch",
                    tick,
                )
                .with_salience(0.75)
                .with_emotion(1),
            );
        }
    }
}

fn workshop_pull(kind: BuildingKind) -> Option<Specialty> {
    use BuildingKind::*;
    Some(match kind {
        Forge | Smithy => Specialty::Smith,
        Bakery => Specialty::Baker,
        Brewery | Tavern | Inn => Specialty::Brewer,
        Tailor | ClothingShop => Specialty::Weaver,
        Cobbler => Specialty::Weaver,
        Workshop | SawMill => Specialty::Carpenter,
        Quarry | Mine => Specialty::Miner,
        Mill | Windmill | Watermill => Specialty::Baker,
        Cafe | Restaurant => Specialty::Baker,
        Butcher | Fishmonger | Cheesemonger => Specialty::Hunter,
        Ranch | Stable | Kennel => Specialty::Farmer,
        Temple | Cathedral | Shrine | Mosque | Synagogue | Pagoda => Specialty::Priest,
        Hospital | Clinic | Pharmacy | Apothecary | Herbalist => Specialty::Healer,
        Hospital2 => Specialty::Doctor,
        School | University | Library | BookStore | Scribe => Specialty::Scholar,
        Market | MarketStall | MallShop | Supermarket => Specialty::Merchant,
        Bank => Specialty::Banker,
        Courthouse | CityHall => Specialty::Lawyer,
        Barracks | PoliceStation | Watchtower => Specialty::Soldier,
        FireStation => Specialty::Officer,
        Factory | Refinery | PowerPlant => Specialty::Engineer,
        Datacenter | OfficeTower | ResearchLab => Specialty::Programmer,
        Studio | Theatre | MusicHall | ArtGallery => Specialty::Artist,
        Observatory => Specialty::Scholar,
        Port | Marina | Dock => Specialty::Sailor,
        Airport | Hangar => Specialty::Pilot,
        Stadium => Specialty::Athlete,
        _ => return None,
    })
}

fn tick_specialties(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();

    let workshops: Vec<(f32, f32, Option<String>, Specialty)> = sim
        .buildings
        .iter()
        .filter_map(|b| {
            if !b.is_operational() {
                return None;
            }
            let s = workshop_pull(b.kind)?;
            let (fw, fh) = b.kind.footprint();
            let bx = b.x as f32 + fw as f32 / 2.0;
            let by = b.y as f32 + fh as f32 / 2.0;
            Some((bx, by, b.owner_lineage.clone(), s))
        })
        .collect();

    type OrgTraitRow = (usize, f32, f32, f32, f32, f32, String, bool);
    let traits_clone: Vec<OrgTraitRow> = sim
        .organisms
        .iter()
        .enumerate()
        .filter_map(|(i, o)| {
            if o.alive && o.age_stage() == AgeStage::Adult && o.specialty.is_none() {
                Some((
                    i,
                    o.x,
                    o.y,
                    o.traits.curiosity,
                    o.traits.aggression,
                    o.traits.social_tendency,
                    o.lineage_id.clone(),
                    o.discoveries.contains("writing"),
                ))
            } else {
                None
            }
        })
        .collect();

    for (i, ox, oy, curiosity, aggression, social, lid, has_writing) in traits_clone {
        let era = era_map.get(&lid).copied().unwrap_or(Era::PreStone);
        let mut nearest_workshop: Option<(f32, Specialty)> = None;
        for (sx, sy, slid, spec) in &workshops {
            if let Some(slid) = slid {
                if slid != &lid {
                    continue;
                }
            }
            let d = (ox - sx).abs() + (oy - sy).abs();
            if d > 12.0 {
                continue;
            }
            match nearest_workshop {
                None => nearest_workshop = Some((d, *spec)),
                Some((d0, _)) if d < d0 => nearest_workshop = Some((d, *spec)),
                _ => {}
            }
        }

        if let Some((_, near_spec)) = nearest_workshop {
            if near_spec.era_unlock() <= era && sim.rng.random::<f32>() < 0.35 {
                sim.organisms[i].specialty = Some(near_spec.name().to_string());
                let name = sim.organisms[i].name.clone();
                push_event(
                    &mut sim.events,
                    sim.tick_count,
                    "specialty",
                    &name,
                    &format!("became a {} (apprenticed near workshop)", near_spec.name()),
                );
                continue;
            }
        }

        if sim.rng.random::<f32>() > 0.06 {
            continue;
        }
        let candidates = candidate_specialties(era, curiosity, aggression, social, has_writing);
        if candidates.is_empty() {
            continue;
        }
        let pick = candidates[sim.rng.random_range(0..candidates.len())];
        sim.organisms[i].specialty = Some(pick.name().to_string());
        let name = sim.organisms[i].name.clone();
        push_event(
            &mut sim.events,
            sim.tick_count,
            "specialty",
            &name,
            &format!("became a {}", pick.name()),
        );
    }
}

/// Assign a long-term life aspiration when an org reaches adulthood.
/// Once set, persists for the rest of the org's life — drives behaviour
/// via specialty + Q-reward biases downstream.
fn tick_aspirations(sim: &mut Simulation) {
    let now = sim.tick_count;
    for i in 0..sim.organisms.len() {
        let o = &sim.organisms[i];
        if !o.alive {
            continue;
        }
        if !o.aspiration.is_empty() {
            continue;
        }
        if o.age_stage() != AgeStage::Adult && o.age_stage() != AgeStage::Teen {
            continue;
        }
        // Pick deterministically from traits — same orgs always get the
        // same aspiration so behaviour reads as a personality, not noise.
        let t = &o.traits;
        let pick: &'static str = if t.curiosity > 0.72 && t.social_tendency < 0.45 {
            "wanderer"
        } else if t.curiosity > 0.65 {
            "seeker"
        } else if t.aggression > 0.65 {
            "warrior"
        } else if t.social_tendency > 0.68 {
            "connector"
        } else if t.resilience > 0.65 && o.literacy > 0.30 && t.aggression < 0.35 {
            "healer"
        } else if t.curiosity > 0.55 && t.aggression < 0.30 && t.social_tendency < 0.55 {
            "artist"
        } else if t.resilience > 0.68 {
            "builder"
        } else if o.piety > 0.4 {
            "devout"
        } else if o.literacy > 0.35 {
            "sage"
        } else {
            "provider"
        };
        let o_mut = &mut sim.organisms[i];
        o_mut.aspiration = pick.to_string();
        let nm = o_mut.name.clone();
        let aspiration_msg = format!("set their heart on becoming a {}", pick);
        o_mut.log_life(now, "aspiration", aspiration_msg.clone());
        push_event(&mut sim.events, now, "aspiration", &nm, &aspiration_msg);
    }
}

fn candidate_specialties(
    era: Era,
    curiosity: f32,
    aggression: f32,
    social: f32,
    has_writing: bool,
) -> Vec<Specialty> {
    let mut out = Vec::new();
    if era >= Era::Stone {
        out.push(Specialty::Farmer);
        if aggression > 0.5 {
            out.push(Specialty::Hunter);
        }
        out.push(Specialty::Builder);
        if curiosity > 0.6 {
            out.push(Specialty::Healer);
        }
        if curiosity > 0.55 {
            out.push(Specialty::Artist);
        }
        out.push(Specialty::Priest);
    }
    if era >= Era::Bronze {
        out.push(Specialty::Smith);
        if social > 0.5 {
            out.push(Specialty::Merchant);
        }
        if aggression > 0.55 {
            out.push(Specialty::Soldier);
        }
        out.push(Specialty::Weaver);
        out.push(Specialty::Baker);
        out.push(Specialty::Carpenter);
        out.push(Specialty::Mason);
    }
    if era >= Era::Iron && has_writing {
        out.push(Specialty::Scholar);
        out.push(Specialty::Scribe);
        out.push(Specialty::Engineer);
    }
    if era >= Era::Renaissance && has_writing {
        out.push(Specialty::Teacher);
        if curiosity > 0.6 {
            out.push(Specialty::Doctor);
        }
        out.push(Specialty::Lawyer);
        out.push(Specialty::Banker);
    }
    if era >= Era::Modern && has_writing {
        if curiosity > 0.6 {
            out.push(Specialty::Pilot);
        }
        if curiosity > 0.5 {
            out.push(Specialty::Journalist);
        }
        if social > 0.6 {
            out.push(Specialty::Actor);
        }
        if social > 0.6 {
            out.push(Specialty::Politician);
        }
    }
    if era >= Era::Information && curiosity > 0.55 && has_writing {
        out.push(Specialty::Programmer);
    }
    out
}

fn tick_education(sim: &mut Simulation) {
    let school_positions: Vec<(i32, i32, String)> = sim
        .buildings
        .iter()
        .filter(|b| b.is_operational() && matches!(b.kind, BuildingKind::School))
        .map(|b| {
            (
                b.x + b.kind.footprint().0 as i32 / 2,
                b.y + b.kind.footprint().1 as i32 / 2,
                b.owner_lineage.clone().unwrap_or_default(),
            )
        })
        .collect();
    let uni_positions: Vec<(i32, i32, String)> = sim
        .buildings
        .iter()
        .filter(|b| b.is_operational() && matches!(b.kind, BuildingKind::University))
        .map(|b| {
            (
                b.x + b.kind.footprint().0 as i32 / 2,
                b.y + b.kind.footprint().1 as i32 / 2,
                b.owner_lineage.clone().unwrap_or_default(),
            )
        })
        .collect();

    let era_map = sim.lineage_eras.clone();
    let tick = sim.tick_count;
    let mut graduates: Vec<(String, String)> = Vec::new();

    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        let near_school = school_positions.iter().any(|(sx, sy, _)| {
            let dx = (org.x as i32) - sx;
            let dy = (org.y as i32) - sy;
            dx * dx + dy * dy <= 25
        });
        let near_uni = uni_positions.iter().any(|(sx, sy, _)| {
            let dx = (org.x as i32) - sx;
            let dy = (org.y as i32) - sy;
            dx * dx + dy * dy <= 36
        });

        if near_school && org.age_stage() != AgeStage::Infant {
            org.schooling_ticks = org.schooling_ticks.saturating_add(300);
            org.literacy = (org.literacy + 0.05).min(1.0);
        } else if org.discoveries.contains("language") || org.discoveries.contains("writing") {
            let cap = if org.discoveries.contains("writing") {
                0.6
            } else {
                0.35
            };
            if org.literacy < cap {
                org.literacy = (org.literacy + 0.004).min(cap);
            }
        }
        if near_uni && org.literacy >= 0.7 && org.age_stage() == AgeStage::Adult {
            org.university_ticks = org.university_ticks.saturating_add(300);
            if org.university_ticks >= 1800 && org.degrees.len() < 3 {
                org.university_ticks = 0;
                let era = era_map.get(&org.lineage_id).copied().unwrap_or(Era::Stone);
                let deg = pick_degree(era, tick + (org.id.len() as u64));
                if !org.degrees.contains(&deg.to_string()) {
                    org.add_degree(deg);
                    graduates.push((org.name.clone(), deg.to_string()));
                }
            }
        }
    }
    for (name, deg) in graduates {
        push_event(
            &mut sim.events,
            tick,
            "graduated",
            &name,
            &format!("earned a degree in {}", deg),
        );
    }
}

fn pick_degree(era: Era, seed: u64) -> &'static str {
    let mut opts: Vec<&'static str> = vec!["philosophy", "arts", "law", "history", "literature"];
    if era >= Era::Classical {
        opts.extend(["medicine", "mathematics", "astronomy"]);
    }
    if era >= Era::Renaissance {
        opts.extend(["theology", "architecture"]);
    }
    if era >= Era::Industrial {
        opts.extend(["engineering", "economics"]);
    }
    if era >= Era::Modern {
        opts.push("science");
    }
    opts[(seed as usize) % opts.len()]
}

const FUNCTIONAL_BUILDINGS_CAP: usize = 1200;
const BUILDINGS_SOFT_CAP: usize = 1500;
const BASELINE_MAX_BUILDING_REQUIREMENT: usize = 450;
const CONSTRUCTION_WORKER_REACH: f32 = 18.0;

fn construction_population_requirement(base: usize, population_limit: usize) -> usize {
    // Building thresholds were originally authored for a single lineage that
    // could grow to 450 people. A local world intentionally protects multiple
    // lineages, so scale that secondary gate to the largest sustainable
    // lineage share. Era/discovery requirements remain unchanged.
    let lineage_capacity =
        natural_lineage_limit(population_limit).clamp(1, BASELINE_MAX_BUILDING_REQUIREMENT);
    // Preserve authored pacing wherever it is achievable. Only gates above
    // the expected lineage ceiling are lowered; proportional compression
    // would make classical cities appear in settlements of just 3 people.
    base.min(lineage_capacity)
}

fn reserve_construction_cost(sim: &mut Simulation, lineage: &str, kind: BuildingKind) -> bool {
    let cost = kind.construction_cost();
    let mut wood_available = 0u32;
    let mut stone_available = 0u32;
    let mut wealth_available = 0u64;
    for org in sim
        .organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage)
    {
        wood_available += u32::from(org.inv_wood);
        stone_available += u32::from(org.inv_stone);
        wealth_available += u64::from(org.wealth);
    }
    if wood_available < u32::from(cost.wood)
        || stone_available < u32::from(cost.stone)
        || wealth_available < u64::from(cost.wealth)
    {
        return false;
    }

    let mut wood_left = u32::from(cost.wood);
    let mut stone_left = u32::from(cost.stone);
    let mut wealth_left = cost.wealth;
    for org in sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id == lineage)
    {
        let wood = wood_left.min(u32::from(org.inv_wood));
        org.inv_wood -= wood as u8;
        wood_left -= wood;

        let stone = stone_left.min(u32::from(org.inv_stone));
        org.inv_stone -= stone as u8;
        stone_left -= stone;

        let wealth = wealth_left.min(org.wealth);
        org.wealth -= wealth;
        wealth_left -= wealth;
        if wood_left == 0 && stone_left == 0 && wealth_left == 0 {
            break;
        }
    }
    debug_assert_eq!((wood_left, stone_left, wealth_left), (0, 0, 0));
    true
}

fn building_footprints_overlap(
    a_x: i32,
    a_y: i32,
    a_width: u8,
    a_height: u8,
    b_x: i32,
    b_y: i32,
    b_width: u8,
    b_height: u8,
) -> bool {
    a_x < b_x + i32::from(b_width)
        && a_x + i32::from(a_width) > b_x
        && a_y < b_y + i32::from(b_height)
        && a_y + i32::from(a_height) > b_y
}

fn construction_site_is_valid(sim: &Simulation, kind: BuildingKind, x: i32, y: i32) -> bool {
    use crate::world::grid::{HEIGHT, WIDTH};
    use crate::world::tiles::Tile;

    let (width, height) = kind.footprint();
    if x < 0 || y < 0 || x + i32::from(width) > WIDTH as i32 || y + i32::from(height) > HEIGHT as i32 {
        return false;
    }

    if kind == BuildingKind::Bridge {
        // A bridge spans a four-tile horizontal channel: dry land anchors
        // both ends, while at least one interior tile must actually be water.
        // Water is invalid for every other construction kind.
        let valid_anchor = |tile| {
            matches!(
                tile,
                Tile::Grass | Tile::Food | Tile::Ash | Tile::Scorched | Tile::Snow | Tile::Sand
            )
        };
        if height != 1
            || width < 3
            || !valid_anchor(sim.grid.get(x, y))
            || !valid_anchor(sim.grid.get(x + i32::from(width) - 1, y))
        {
            return false;
        }
        let mut crosses_water = false;
        for tile_x in x + 1..x + i32::from(width) - 1 {
            match sim.grid.get(tile_x, y) {
                Tile::Water => crosses_water = true,
                tile if valid_anchor(tile) => {}
                _ => return false,
            }
        }
        if !crosses_water {
            return false;
        }
    } else {
        for tile_y in y..y + i32::from(height) {
            for tile_x in x..x + i32::from(width) {
                if matches!(
                    sim.grid.get(tile_x, tile_y),
                    Tile::Void | Tile::Water | Tile::Fire | Tile::Campfire | Tile::Hut | Tile::Flooded
                ) {
                    return false;
                }
            }
        }
    }
    !sim.buildings.iter().any(|building| {
        !building.decorative
            && building_footprints_overlap(
                x,
                y,
                width,
                height,
                building.x,
                building.y,
                building.footprint().0,
                building.footprint().1,
            )
    })
}

fn apply_completed_building_effect(sim: &mut Simulation, kind: BuildingKind, x: i32, y: i32) {
    use crate::world::grid::{TrailKind, WorldGrid};
    use crate::world::tiles::Tile;

    match kind {
        BuildingKind::Well => {
            // Groundwater is a completed well's effect, not a free side
            // effect of selecting the action that opened its project.
            sim.grid.set(x, y, Tile::Water);
        }
        BuildingKind::Bridge => {
            let (width, height) = kind.footprint();
            for tile_y in y..y + i32::from(height) {
                for tile_x in x..x + i32::from(width) {
                    if sim.grid.get(tile_x, tile_y) == Tile::Water {
                        // Sand is walkable, nonflammable, and cannot regrow
                        // food. The Building entity supplies the bridge visual;
                        // the terrain conversion supplies actual traversal.
                        sim.grid.set(tile_x, tile_y, Tile::Sand);
                        let index = WorldGrid::idx(tile_x, tile_y);
                        sim.grid.depth[index] = 0.0;
                        sim.grid.fertility[index] = 0.0;
                    }
                    sim.grid.leave_trail(tile_x, tile_y, TrailKind::Path, 5.0);
                }
            }
        }
        _ => {}
    }
}

fn can_work_on_construction(org: &crate::organism::organism::Organism) -> bool {
    org.alive && org.age_stage() == AgeStage::Adult && org.energy > 0.20 && org.health > 0.25
}

fn construction_site_has_reachable_worker(sim: &Simulation, lineage: &str, x: i32, y: i32) -> bool {
    sim.organisms.iter().any(|org| {
        org.lineage_id == lineage
            && can_work_on_construction(org)
            && (org.x - x as f32).abs() + (org.y - y as f32).abs() <= CONSTRUCTION_WORKER_REACH
    })
}

fn find_construction_site(
    sim: &Simulation,
    lineage: &str,
    kind: BuildingKind,
    preferred_x: i32,
    preferred_y: i32,
) -> Option<(i32, i32)> {
    if construction_site_is_valid(sim, kind, preferred_x, preferred_y)
        && construction_site_has_reachable_worker(sim, lineage, preferred_x, preferred_y)
    {
        return Some((preferred_x, preferred_y));
    }
    // Automatic plans use a preferred settlement offset. Search a compact
    // ring around it so water or another structure delays only this site,
    // rather than charging resources or permanently blocking construction.
    for radius in 1i32..=12 {
        for dy in -radius..=radius {
            for dx in -radius..=radius {
                if dx.abs() != radius && dy.abs() != radius {
                    continue;
                }
                let x = preferred_x + dx;
                let y = preferred_y + dy;
                if construction_site_is_valid(sim, kind, x, y)
                    && construction_site_has_reachable_worker(sim, lineage, x, y)
                {
                    return Some((x, y));
                }
            }
        }
    }
    None
}

fn start_building_at_valid_site(
    sim: &mut Simulation,
    lineage: &str,
    kind: BuildingKind,
    site_x: i32,
    site_y: i32,
) -> bool {
    if sim
        .buildings
        .iter()
        .filter(|building| !building.decorative)
        .count()
        >= FUNCTIONAL_BUILDINGS_CAP
    {
        return false;
    }
    if !construction_site_is_valid(sim, kind, site_x, site_y)
        || !construction_site_has_reachable_worker(sim, lineage, site_x, site_y)
    {
        return false;
    }
    if !reserve_construction_cost(sim, lineage, kind) {
        return false;
    }
    let (site_width, site_height) = kind.footprint();
    sim.buildings.retain(|building| {
        !building.decorative
            || !building_footprints_overlap(
                site_x,
                site_y,
                site_width,
                site_height,
                building.x,
                building.y,
                building.footprint().0,
                building.footprint().1,
            )
    });
    let id = sim.next_building_id;
    sim.next_building_id += 1;
    sim.buildings.push(Building::new(
        id,
        kind,
        site_x,
        site_y,
        Some(lineage.to_string()),
        sim.tick_count,
    ));
    let cost = kind.construction_cost();
    push_event(
        &mut sim.events,
        sim.tick_count,
        "construction_started",
        lineage,
        &format!(
            "started a {} using {} wood, {} stone, and {} wealth",
            kind.name(),
            cost.wood,
            cost.stone,
            cost.wealth
        ),
    );
    true
}

/// Opens a construction project at an exact, player-selected site.
///
/// Action-driven construction must never silently move a project or consume
/// materials for a blocked footprint. Validation and worker availability are
/// therefore checked before the lineage's pooled cost is reserved.
pub(crate) fn try_start_building_at(
    sim: &mut Simulation,
    lineage: &str,
    kind: BuildingKind,
    x: i32,
    y: i32,
) -> bool {
    start_building_at_valid_site(sim, lineage, kind, x, y)
}

fn try_start_building(sim: &mut Simulation, lineage: &str, kind: BuildingKind, x: i32, y: i32) -> bool {
    let Some((site_x, site_y)) = find_construction_site(sim, lineage, kind, x, y) else {
        return false;
    };
    start_building_at_valid_site(sim, lineage, kind, site_x, site_y)
}

fn tick_buildings_construct(sim: &mut Simulation) {
    let mut functional_slots = FUNCTIONAL_BUILDINGS_CAP.saturating_sub(
        sim.buildings
            .iter()
            .filter(|building| !building.decorative)
            .count(),
    );
    if functional_slots == 0 {
        return;
    }
    let alive_lineages: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    for lid in alive_lineages {
        if functional_slots == 0 {
            break;
        }
        let era = lineage_era(sim, &lid);
        let pop = lineage_pop(sim, &lid);
        if pop < 3 {
            continue;
        }
        let builds_this_pass = if pop >= 40 {
            3
        } else if pop >= 20 {
            2
        } else {
            1
        };
        let mut existing: HashSet<BuildingKind> = sim
            .buildings
            .iter()
            .filter(|b| !b.decorative && b.owner_lineage.as_deref() == Some(&lid))
            .map(|b| b.kind)
            .collect();
        for _ in 0..builds_this_pass {
            if functional_slots == 0 {
                break;
            }
            let mut considered = existing.clone();
            let mut started = None;
            while let Some(kind) = next_target_building(era, pop, sim.population_limit(), &considered) {
                considered.insert(kind);
                let (cx, cy) = lineage_center(sim, &lid);
                if cx == 0 && cy == 0 {
                    break;
                }
                let offset_x = (sim.next_building_id as i32 * 3) % 16 - 8;
                let offset_y = (sim.next_building_id as i32 * 5) % 14 - 7;
                if try_start_building(sim, &lid, kind, cx + offset_x, cy + offset_y) {
                    started = Some(kind);
                    break;
                }
            }
            let Some(kind) = started else { break };
            existing.insert(kind);
            functional_slots -= 1;
        }
    }
    cap_buildings(sim);
}

fn is_wonder(kind: BuildingKind) -> bool {
    use BuildingKind::*;
    matches!(
        kind,
        Cathedral | Castle | Pyramid | Ziggurat | Coliseum | University | Observatory | Stadium | Museum
    )
}

fn cap_buildings(sim: &mut Simulation) {
    let mut excess = sim.buildings.len().saturating_sub(BUILDINGS_SOFT_CAP);
    if excess == 0 {
        return;
    }

    // Ambient props are disposable rendering detail. Functional buildings
    // and wonders represent civilization progress, so a busy old world must
    // never silently erase them just because newer scenery was scattered.
    sim.buildings.retain(|building| {
        if excess > 0 && building.decorative {
            excess -= 1;
            false
        } else {
            true
        }
    });
}

fn tick_building_progress(sim: &mut Simulation) {
    if sim.buildings.is_empty() {
        return;
    }
    #[derive(Clone, Copy)]
    struct Worker {
        index: usize,
        x: f32,
        y: f32,
        effort: f32,
    }

    let mut completed: Vec<(String, BuildingKind, i32, i32)> = Vec::new();
    let assigned_workers: HashSet<usize> = {
        let organisms = &sim.organisms;
        let mut by_lineage: HashMap<&str, Vec<Worker>> = HashMap::new();
        for (index, org) in organisms.iter().enumerate() {
            if !can_work_on_construction(org) {
                continue;
            }
            let skill = match org.specialty.as_deref() {
                Some("builder" | "carpenter" | "mason" | "engineer") => 1.75,
                Some("smith" | "miner") => 1.30,
                _ => 1.0,
            };
            by_lineage
                .entry(org.lineage_id.as_str())
                .or_default()
                .push(Worker {
                    index,
                    x: org.x,
                    y: org.y,
                    effort: skill * (0.5 + org.energy.clamp(0.0, 1.0) * 0.5),
                });
        }

        let mut assigned = HashSet::new();
        for building in sim.buildings.iter_mut() {
            if building.is_complete() || building.decorative {
                continue;
            }
            building.occupants.clear();
            let Some(owner) = building.owner_lineage.as_deref() else {
                continue;
            };
            let Some(lineage_workers) = by_lineage.get(owner) else {
                continue;
            };
            let bx = building.x as f32;
            let by = building.y as f32;
            let mut nearby: Vec<(f32, Worker)> = lineage_workers
                .iter()
                .copied()
                .filter(|worker| !assigned.contains(&worker.index))
                .filter_map(|worker| {
                    let distance = (worker.x - bx).abs() + (worker.y - by).abs();
                    // The same reach is enforced before materials are charged,
                    // so a fallback site cannot create a permanently stalled
                    // project beyond every worker's travel range.
                    (distance <= CONSTRUCTION_WORKER_REACH).then_some((distance / worker.effort, worker))
                })
                .collect();
            nearby.sort_by(|(score_a, worker_a), (score_b, worker_b)| {
                score_a
                    .total_cmp(score_b)
                    .then_with(|| worker_a.index.cmp(&worker_b.index))
            });

            let crew_capacity = building.kind.construction_crew_capacity();
            let crew: Vec<Worker> = nearby
                .into_iter()
                .take(crew_capacity)
                .map(|(_, worker)| worker)
                .collect();
            if crew.is_empty() {
                continue;
            }
            let effort: f32 = crew.iter().map(|worker| worker.effort).sum();
            for worker in &crew {
                assigned.insert(worker.index);
                building.occupants.push(organisms[worker.index].id.clone());
            }
            let labor = f32::from(building.kind.construction_cost().labor);
            building.condition = (building.condition + effort / labor).min(1.0);
            if building.is_complete() {
                building.built_at_tick = sim.tick_count;
                building.occupants.clear();
                completed.push((owner.to_string(), building.kind, building.x, building.y));
            }
        }
        assigned
    };

    for worker_index in assigned_workers {
        sim.organisms[worker_index].energy = (sim.organisms[worker_index].energy - 0.006).max(0.0);
    }
    for (lineage, kind, x, y) in completed {
        // Construction knowledge is earned only when the project becomes
        // operational. Share the canonical building discovery across the
        // owning lineage so an unfinished action cannot unlock technology and
        // the knowledge does not disappear with a single builder.
        for org in sim
            .organisms
            .iter_mut()
            .filter(|org| org.alive && org.lineage_id == lineage)
        {
            org.discover(kind.name());
            for alias in kind.completion_discovery_aliases() {
                org.discover(alias);
            }
        }
        apply_completed_building_effect(sim, kind, x, y);
        push_event(
            &mut sim.events,
            sim.tick_count,
            "built",
            &lineage,
            &format!("completed a {}", kind.name()),
        );
        if is_wonder(kind) {
            let lineage_name = sim.lineage_names.get(&lineage).cloned().unwrap_or(lineage);
            sim.headlines.push_back((
                sim.tick_count,
                format!(
                    "\u{1F3DB}\u{FE0F} The {} completed a {} — a wonder of their age.",
                    lineage_name,
                    kind.name()
                ),
            ));
            while sim.headlines.len() > 80 {
                sim.headlines.pop_front();
            }
        }
    }
}

fn tick_scatter_props(sim: &mut Simulation) {
    use BuildingKind::*;
    let alive_lineages: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    let mut new_buildings: Vec<Building> = Vec::new();
    for lid in alive_lineages {
        let pop = lineage_pop(sim, &lid);
        if pop < 3 {
            continue;
        }
        const MAX_DECORATIVE_PER_LINEAGE: usize = 48;
        if sim
            .buildings
            .iter()
            .filter(|building| building.decorative && building.owner_lineage.as_deref() == Some(lid.as_str()))
            .count()
            >= MAX_DECORATIVE_PER_LINEAGE
        {
            continue;
        }
        let era = lineage_era(sim, &lid);
        let (cx, cy) = lineage_center(sim, &lid);
        if cx == 0 && cy == 0 {
            continue;
        }

        // Pick a deterministic-ish prop kind based on era+id, biased toward
        // small decorative items so a settlement looks lived-in.
        let palette: &[BuildingKind] = if era >= Era::Modern {
            &[
                Lamppost,
                StreetLight,
                Bench,
                Signpost,
                TelephonePole,
                BillBoard,
                BusStop,
                Crosswalk,
                Cart,
                Well,
                FlagPole,
                Kiosk,
                FoodTruck,
                Fence,
                Gate,
                NeonSign,
                Drone,
                ChargingStation,
                SolarPanel,
            ]
        } else if era >= Era::Industrial {
            &[
                Lamppost,
                StreetLight,
                Bench,
                Signpost,
                TelephonePole,
                BillBoard,
                BusStop,
                Cart,
                Well,
                FlagPole,
                Kiosk,
                MarketStall,
                FoodCart,
                Fence,
                Gate,
                Crosswalk,
            ]
        } else if era >= Era::Medieval {
            &[
                Lamppost,
                Bench,
                Signpost,
                Cart,
                Well,
                FlagPole,
                Kiosk,
                MarketStall,
                FoodCart,
                Fence,
                Gate,
                Pavilion,
                Gazebo,
                Bandstand,
                Tent,
                Watchtower,
                Shrine,
                Monument,
                Obelisk,
                GraveStone,
            ]
        } else if era >= Era::Bronze {
            &[
                Bench,
                Signpost,
                Cart,
                Well,
                MarketStall,
                FoodCart,
                Fence,
                Gate,
                Tent,
                Watchtower,
                Shrine,
                Monument,
                Obelisk,
                GraveStone,
                Pond,
                Garden,
            ]
        } else {
            &[Tent, Cart, Well, Signpost, Shrine, GraveStone]
        };

        let seed = sim.next_building_id as usize;
        let kind = palette[seed % palette.len()];

        // Scatter within a 16-tile radius around the lineage center using
        // a small deterministic offset table for spread.
        let offsets = [
            (-7, -3),
            (5, -6),
            (-4, 6),
            (8, 2),
            (-9, 1),
            (3, 7),
            (6, -5),
            (-2, -8),
            (1, 5),
            (-6, -1),
            (4, -2),
            (-8, 4),
            (2, -7),
            (7, 6),
            (-3, 8),
            (9, -3),
            (-5, 5),
            (0, 9),
        ];
        let (dx, dy) = offsets[seed % offsets.len()];

        let id = sim.next_building_id;
        sim.next_building_id += 1;
        let mut prop = Building::new(id, kind, cx + dx, cy + dy, Some(lid.clone()), sim.tick_count);
        prop.condition = 1.0;
        prop.decorative = true;
        new_buildings.push(prop);
    }
    sim.buildings.extend(new_buildings);
    cap_buildings(sim);
}

fn next_target_building(
    era: Era,
    pop: usize,
    population_limit: usize,
    existing: &HashSet<BuildingKind>,
) -> Option<BuildingKind> {
    use BuildingKind::*;
    let mut wishlist: Vec<BuildingKind> = Vec::new();
    let meets = |base| pop >= construction_population_requirement(base, population_limit);
    if era >= Era::Stone && meets(3) {
        wishlist.push(Hut);
        wishlist.push(Tent);
        wishlist.push(Well);
        wishlist.push(Signpost);
        wishlist.push(Shrine);
    }
    if era >= Era::Stone && meets(6) {
        wishlist.push(Watchtower);
        wishlist.push(Fence);
        wishlist.push(Gate);
        wishlist.push(Cart);
    }
    if era >= Era::Bronze && meets(8) {
        wishlist.push(House);
        wishlist.push(Forge);
        wishlist.push(Granary);
        wishlist.push(MarketStall);
        wishlist.push(Smithy);
    }
    if era >= Era::Bronze && meets(10) {
        wishlist.push(Quarry);
        wishlist.push(Mine);
        wishlist.push(SawMill);
        wishlist.push(Tannery);
        wishlist.push(Stable);
    }
    if era >= Era::Bronze && meets(12) {
        wishlist.push(Temple);
        wishlist.push(Garden);
        wishlist.push(Orchard);
        wishlist.push(Pond);
        wishlist.push(Cemetery);
        wishlist.push(Monument);
        wishlist.push(Obelisk);
    }
    if era >= Era::Iron && meets(15) {
        wishlist.push(Market);
        wishlist.push(Workshop);
        wishlist.push(Plaza);
        wishlist.push(Port);
        wishlist.push(FoodCart);
    }
    if era >= Era::Iron && meets(18) {
        wishlist.push(Butcher);
        wishlist.push(Fishmonger);
        wishlist.push(Cheesemonger);
        wishlist.push(Herbalist);
        wishlist.push(Tailor);
        wishlist.push(Cobbler);
        wishlist.push(Goldsmith);
    }
    if era >= Era::Classical && meets(18) {
        wishlist.push(School);
        wishlist.push(Library);
        wishlist.push(Bridge);
        wishlist.push(Bathhouse);
        wishlist.push(Pyramid);
        wishlist.push(Ziggurat);
        wishlist.push(Coliseum);
        wishlist.push(TriumphalArch);
    }
    if era >= Era::Classical && meets(22) {
        wishlist.push(Aqueduct);
        wishlist.push(Observatory);
        wishlist.push(ClockTower);
        wishlist.push(Mausoleum);
        wishlist.push(Pavilion);
        wishlist.push(Gazebo);
        wishlist.push(Bandstand);
    }
    if era >= Era::Medieval && meets(25) {
        wishlist.push(Manor);
        wishlist.push(Mill);
        wishlist.push(Castle);
        wishlist.push(Tavern);
        wishlist.push(Brewery);
        wishlist.push(Apothecary);
        wishlist.push(Jeweler);
        wishlist.push(Scribe);
    }
    if era >= Era::Medieval && meets(30) {
        wishlist.push(Cathedral);
        wishlist.push(Inn);
        wishlist.push(Bakery);
        wishlist.push(Windmill);
        wishlist.push(GuildHall);
        wishlist.push(Barbershop);
        wishlist.push(Vineyard);
        wishlist.push(Ranch);
        wishlist.push(Dovecote);
        wishlist.push(Kennel);
        wishlist.push(Pagoda);
        wishlist.push(Stupa);
        wishlist.push(Mosque);
        wishlist.push(Synagogue);
    }
    if era >= Era::Renaissance && meets(40) {
        wishlist.push(University);
        wishlist.push(TownHouse);
        wishlist.push(Theatre);
        wishlist.push(ClothingShop);
        wishlist.push(BookStore);
        wishlist.push(ArtGallery);
        wishlist.push(MusicHall);
        wishlist.push(Cafe);
        wishlist.push(Restaurant);
        wishlist.push(Hotel);
    }
    if era >= Era::Renaissance && meets(45) {
        wishlist.push(Bank);
        wishlist.push(Courthouse);
        wishlist.push(CityHall);
        wishlist.push(PostOffice);
        wishlist.push(Greenhouse);
        wishlist.push(Marina);
        wishlist.push(Drydock);
    }
    if era >= Era::Industrial && meets(60) {
        wishlist.push(Factory);
        wishlist.push(TrainStation);
        wishlist.push(Barracks);
        wishlist.push(PoliceStation);
        wishlist.push(FireStation);
        wishlist.push(Pharmacy);
        wishlist.push(Clinic);
        wishlist.push(Spa);
        wishlist.push(Refinery);
        wishlist.push(PowerPlant);
        wishlist.push(Substation);
        wishlist.push(WaterTower);
        wishlist.push(Reservoir);
        wishlist.push(Warehouse);
        wishlist.push(Silo);
    }
    if era >= Era::Industrial && meets(70) {
        wishlist.push(Museum);
        wishlist.push(Lighthouse);
        wishlist.push(Lighthouse2);
        wishlist.push(BillBoard);
        wishlist.push(StreetLight);
        wishlist.push(Lamppost);
        wishlist.push(TelephonePole);
        wishlist.push(BusStop);
        wishlist.push(Crane);
        wishlist.push(Hangar);
        wishlist.push(Dock);
    }
    if era >= Era::Modern && meets(100) {
        wishlist.push(Hospital);
        wishlist.push(Apartment);
        wishlist.push(Stadium);
        wishlist.push(GasStation);
        wishlist.push(AutoShop);
        wishlist.push(Garage);
        wishlist.push(MallShop);
        wishlist.push(Supermarket);
        wishlist.push(ParkingLot);
        wishlist.push(PlayGround);
        wishlist.push(FoodTruck);
        wishlist.push(NeonSign);
        wishlist.push(ArcadeBox);
        wishlist.push(Fountain2);
    }
    if era >= Era::Modern && meets(120) {
        wishlist.push(Airport);
        wishlist.push(Greenhouse2);
        wishlist.push(MushroomFarm);
        wishlist.push(Aquaculture);
    }
    if era >= Era::Information && meets(140) {
        wishlist.push(OfficeTower);
        wishlist.push(Skyscraper);
        wishlist.push(Datacenter);
        wishlist.push(Studio);
        wishlist.push(WindTurbine);
        wishlist.push(SolarPanel);
        wishlist.push(ChargingStation);
        wishlist.push(RoboticArm);
        wishlist.push(Drone);
    }
    if era >= Era::Atomic && meets(160) {
        wishlist.push(RadioTower);
        wishlist.push(SatelliteDish);
        wishlist.push(Spaceport);
        wishlist.push(SolarArray);
        wishlist.push(WindFarm);
    }
    if era >= Era::Digital && meets(180) {
        wishlist.push(NeuralHub);
        wishlist.push(AiCore);
        wishlist.push(ResearchLab);
        wishlist.push(HoloBoard);
    }
    if era >= Era::Fusion && meets(220) {
        wishlist.push(FusionPlant);
        wishlist.push(OrbitalLift);
        wishlist.push(Biodome);
        wishlist.push(Cryolab);
        wishlist.push(NanoFab);
    }
    if era >= Era::Solar && meets(240) {
        wishlist.push(Hyperloop);
        wishlist.push(Maglev);
        wishlist.push(Hospital2);
    }
    if era >= Era::Galactic && meets(450) {
        wishlist.push(Megastructure);
    }
    wishlist.into_iter().find(|&k| !existing.contains(&k))
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

fn tick_diplomacy(sim: &mut Simulation) {
    use crate::sim::civ::warfare::{
        establish_treaty, has_active_battle_between, has_active_treaty, TreatyKind,
    };
    let tick = sim.tick_count;
    let mut sums: HashMap<(String, String), (f32, u32)> = HashMap::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        for (other, att) in o.lineage_attitudes.iter() {
            if other == &o.lineage_id {
                continue;
            }
            let e = sums
                .entry((o.lineage_id.clone(), other.clone()))
                .or_insert((0.0, 0));
            e.0 += *att;
            e.1 += 1;
        }
    }
    let avg = |a: &str, b: &str| -> Option<f32> {
        sums.get(&(a.to_string(), b.to_string()))
            .map(|(s, n)| s / *n as f32)
    };
    let mut lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    lineages.sort();
    let mut formed = 0;
    for i in 0..lineages.len() {
        for j in (i + 1)..lineages.len() {
            if formed >= 2 {
                break;
            }
            let (a, b) = (&lineages[i], &lineages[j]);
            if has_active_treaty(&sim.treaties, a, b, tick) || has_active_battle_between(&sim.battles, a, b) {
                continue;
            }
            let warm = matches!((avg(a, b), avg(b, a)), (Some(x), Some(y)) if x > 0.35 && y > 0.35);
            if !warm {
                continue;
            }
            if !establish_treaty(
                &mut sim.treaties,
                &mut sim.organisms,
                a,
                b,
                TreatyKind::Alliance,
                tick,
                tick.saturating_add(12_000),
            ) {
                continue;
            }
            let na = sim.lineage_names.get(a).cloned().unwrap_or_else(|| a.clone());
            let nb = sim.lineage_names.get(b).cloned().unwrap_or_else(|| b.clone());
            let line = format!("\u{1F91D} {} and {} forged an alliance.", na, nb);
            push_event(&mut sim.events, tick, "treaty", "world", &line);
            sim.headlines.push_back((tick, line));
            while sim.headlines.len() > 80 {
                sim.headlines.pop_front();
            }
            formed += 1;
        }
    }
}

fn tick_plague_watch(sim: &mut Simulation) {
    let mut alive = 0u32;
    let mut sick = 0u32;
    for o in sim.organisms.iter().filter(|o| o.alive) {
        alive += 1;
        if o.infection > 0.3 {
            sick += 1;
        }
    }
    if alive >= 20 && (sick as f32) / (alive as f32) > 0.15 {
        let tick = sim.tick_count;
        let line = format!(
            "\u{1F912} A plague spreads — {} of {} are gravely ill.",
            sick, alive
        );
        push_event(&mut sim.events, tick, "outbreak", "world", &line);
        sim.headlines.push_back((tick, line));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}

fn tick_deforestation(sim: &mut Simulation) {
    use crate::world::grid::WorldGrid;
    use crate::world::tiles::Biome;
    use rand::Rng;
    let alive_lineages: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    for lid in alive_lineages {
        if lineage_pop(sim, &lid) < 5 {
            continue;
        }
        let (cx, cy) = lineage_center(sim, &lid);
        if cx == 0 && cy == 0 {
            continue;
        }
        let mut cleared = 0;
        'scan: for dy in -6..=6 {
            for dx in -6..=6 {
                if cleared >= 2 {
                    break 'scan;
                }
                let (x, y) = (cx + dx, cy + dy);
                if sim.grid.biome_at(x, y) == Biome::Forest && sim.rng.random::<f32>() < 0.05 {
                    let i = WorldGrid::idx(x, y);
                    sim.grid.biome[i] = Biome::Grassland as u8;
                    cleared += 1;
                }
            }
        }
    }
}

fn tick_dynasty_watch(sim: &mut Simulation) {
    let mut pop_now: HashMap<String, u32> = HashMap::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        *pop_now.entry(o.lineage_id.clone()).or_insert(0) += 1;
    }
    let tick = sim.tick_count;
    let tracked: Vec<String> = sim.lineage_peak_pop.keys().cloned().collect();
    for lid in tracked {
        let peak = sim.lineage_peak_pop.get(&lid).copied().unwrap_or(0);
        if pop_now.get(&lid).copied().unwrap_or(0) == 0 && peak >= 8 {
            let name = sim
                .lineage_names
                .get(&lid)
                .cloned()
                .unwrap_or_else(|| lid.clone());
            let line = format!(
                "\u{1F480} The {} dynasty has died out, after rising to {} strong.",
                name, peak
            );
            push_event(&mut sim.events, tick, "milestone", "world", &line);
            sim.headlines.push_back((tick, line));
            while sim.headlines.len() > 80 {
                sim.headlines.pop_front();
            }
            sim.lineage_peak_pop.remove(&lid);
        }
    }
    for (lid, n) in pop_now {
        let e = sim.lineage_peak_pop.entry(lid).or_insert(0);
        if n > *e {
            *e = n;
        }
    }
}

fn seat_building_for(gov_kind: &str) -> Option<BuildingKind> {
    use BuildingKind::*;
    match gov_kind {
        "monarchy" | "empire" => Some(Castle),
        "republic" | "democracy" | "federation" => Some(CityHall),
        "theocracy" => Some(Temple),
        "corporate" => Some(OfficeTower),
        "chiefdom" => Some(GuildHall),
        _ => None,
    }
}

fn tick_governments(sim: &mut Simulation) {
    let lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let alive_set: HashSet<&str> = lineages.iter().map(|s| s.as_str()).collect();
    sim.governments.retain(|k, _| alive_set.contains(k.as_str()));
    for lid in &lineages {
        let pop = lineage_pop(sim, lid);
        if pop < 3 {
            continue;
        }
        let era = lineage_era(sim, lid);
        let literacy_avg = lineage_literacy(sim, lid);
        let target_kind = Government::pick_kind_for(era, pop, literacy_avg);
        let existing = sim.governments.get(lid).map(|g| g.kind);
        if existing != Some(target_kind) {
            if let Some(government) = sim.governments.get_mut(lid) {
                government.transition_to(target_kind, sim.tick_count);
            } else {
                let government = Government::new(lid.clone(), target_kind, sim.tick_count);
                sim.governments.insert(lid.clone(), government);
            }
            push_event(
                &mut sim.events,
                sim.tick_count,
                "government_changed",
                lid,
                &format!("formed a {}", target_kind.name()),
            );
            let tick = sim.tick_count;
            let entry_msg = format!("our tribe became a {}", target_kind.name());
            for o in sim.organisms.iter_mut() {
                if !o.alive || &o.lineage_id != lid {
                    continue;
                }
                o.log_life(tick, "civ", entry_msg.clone());
            }
        }
        // A government may be declared immediately, but its physical seat is
        // a real construction project. Retry on later government ticks when
        // the lineage initially lacks materials instead of granting it free.
        if let Some(seat) = seat_building_for(target_kind.name()) {
            let already = sim
                .buildings
                .iter()
                .any(|b| b.kind == seat && b.owner_lineage.as_deref() == Some(lid.as_str()));
            let (cx, cy) = lineage_center(sim, lid);
            if !already && (cx != 0 || cy != 0) {
                try_start_building(sim, lid, seat, cx, cy);
            }
        }
    }
    for lid in &lineages {
        let era = lineage_era(sim, lid);
        let tick = sim.tick_count;
        if let Some(g) = sim.governments.get_mut(lid) {
            try_enact_law(g, era, tick);
        }
    }
    pick_leaders(sim, &lineages);
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

fn try_enact_law(g: &mut Government, era: Era, tick: u64) {
    use LawKind::*;
    let candidates = [
        NoMurder,
        NoTheft,
        Marriage,
        Inheritance,
        Worship,
        PropertyRights,
        Religion,
        MilitaryService,
        Taxation,
        Education,
        FreedomOfSpeech,
        NoSlavery,
        SafetyNet,
        Healthcare,
        EqualRights,
        ChildLabour,
        EnvironmentalProtection,
        DigitalRights,
        Suffrage,
    ];
    for k in candidates {
        if k.era_appearance() <= era && !g.laws.iter().any(|l| l.kind == k) {
            g.laws.push(Law {
                kind: k,
                enacted_tick: tick,
            });
            return;
        }
    }
}

fn tick_leader_influence(sim: &mut Simulation) {
    let leader_attitudes: std::collections::HashMap<String, Vec<(String, f32)>> = {
        let mut out: std::collections::HashMap<String, Vec<(String, f32)>> = std::collections::HashMap::new();
        for o in sim.organisms.iter() {
            if !o.alive || !o.is_leader {
                continue;
            }
            let mut entries: Vec<(String, f32)> = Vec::new();
            for (lid, &att) in o.lineage_attitudes.iter() {
                if att.abs() > 0.05 {
                    entries.push((lid.clone(), att));
                }
            }
            if !entries.is_empty() {
                out.insert(o.lineage_id.clone(), entries);
            }
        }
        out
    };
    if leader_attitudes.is_empty() {
        return;
    }
    for o in sim.organisms.iter_mut() {
        if !o.alive || o.is_leader {
            continue;
        }
        let Some(entries) = leader_attitudes.get(&o.lineage_id) else {
            continue;
        };
        for (target_lid, leader_att) in entries.iter() {
            let cur = o.lineage_attitudes.get(target_lid).copied().unwrap_or(0.0);
            let diff = leader_att - cur;
            let new_val = cur + diff * 0.10;
            o.lineage_attitudes
                .insert(target_lid.clone(), new_val.clamp(-1.0, 1.0));
        }
    }
}

fn pick_leaders(sim: &mut Simulation, lineages: &[String]) {
    use rand::Rng;
    let mut announcements: Vec<(u64, String)> = Vec::new();
    let tick = sim.tick_count;

    // Single O(n) pass: clear every leader flag and bucket eligible
    // (adult/elder) candidates by lineage, instead of re-scanning the whole
    // organism list once per lineage.
    let mut candidates_by_lineage: HashMap<String, Vec<(usize, f32)>> = HashMap::new();
    for i in 0..sim.organisms.len() {
        let o = &mut sim.organisms[i];
        o.is_leader = false;
        if !o.alive {
            continue;
        }
        let stage = o.age_stage();
        if stage != AgeStage::Adult && stage != AgeStage::Elder {
            continue;
        }
        let score =
            o.traits.social_tendency + o.traits.memory_strength + o.traits.curiosity + (o.literacy * 0.5);
        candidates_by_lineage
            .entry(o.lineage_id.clone())
            .or_default()
            .push((i, score));
    }

    for lid in lineages {
        let Some(g) = sim.governments.get(lid) else {
            continue;
        };
        let kind = g.kind;
        if kind.leader_count() == 0 {
            continue;
        }
        let want = kind.leader_count() as usize;
        let prev_leader_id = g.leader_id.clone();

        let Some(candidates) = candidates_by_lineage.get_mut(lid) else {
            continue;
        };
        if candidates.is_empty() {
            continue;
        }
        candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let prev_leader_alive = prev_leader_id
            .as_ref()
            .map(|pid| candidates.iter().any(|c| &sim.organisms[c.0].id == pid))
            .unwrap_or(false);

        // A living monarch reigns until death — but may be toppled in a coup.
        let coup = prev_leader_alive
            && kind.is_hereditary()
            && candidates.len() > 1
            && sim.rng.random::<f32>() < 0.02;

        let mut primary_idx = candidates[0].0;
        let mut event: Option<&str> = None;
        if prev_leader_alive && !coup {
            if let Some(pid) = &prev_leader_id {
                if let Some(c) = candidates.iter().find(|c| &sim.organisms[c.0].id == pid) {
                    primary_idx = c.0;
                }
            }
        } else if coup {
            // Highest-scoring challenger who is not the deposed ruler.
            if let Some(c) = candidates
                .iter()
                .find(|c| Some(&sim.organisms[c.0].id) != prev_leader_id.as_ref())
            {
                primary_idx = c.0;
            }
            event = Some("seized power in a coup");
        } else {
            // Vacant throne. Hereditary lines pass to an heir if one lives.
            if kind.is_hereditary() {
                if let Some(pid) = &prev_leader_id {
                    let heir = candidates.iter().find(|c| {
                        let o = &sim.organisms[c.0];
                        o.parent_id == *pid || o.father_id.as_deref() == Some(pid.as_str())
                    });
                    if let Some(h) = heir {
                        primary_idx = h.0;
                        event = Some("succeeds to the throne as heir");
                    } else {
                        event = Some("takes the throne, the old line ended");
                    }
                }
            }
        }

        let council_idx: Vec<usize> = candidates
            .iter()
            .map(|c| c.0)
            .filter(|&i| i != primary_idx)
            .take(want.saturating_sub(1))
            .collect();
        let leader_id = sim.organisms[primary_idx].id.clone();

        sim.organisms[primary_idx].is_leader = true;
        for &ci in &council_idx {
            sim.organisms[ci].is_leader = true;
        }
        let council_ids: Vec<String> = council_idx.iter().map(|&i| sim.organisms[i].id.clone()).collect();

        if let Some(verb) = event {
            let lname = sim.lineage_names.get(lid).cloned().unwrap_or_else(|| lid.clone());
            let leader_name = sim.organisms[primary_idx].name.clone();
            announcements.push((
                tick,
                format!("\u{1F451} {} of the {} {}.", leader_name, lname, verb),
            ));
        }

        if let Some(g) = sim.governments.get_mut(lid) {
            g.leader_id = Some(leader_id);
            g.council_ids = council_ids;
        }
    }
    for (t, line) in announcements {
        push_event(&mut sim.events, t, "government_changed", "world", &line);
        sim.headlines.push_back((t, line));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}

fn tick_religion_schism(sim: &mut Simulation) {
    use crate::sim::actions::religion_expanded::{create_religion, recount_religion_adherents};
    use rand::Rng;
    let mut counts: HashMap<String, u32> = HashMap::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if let Some(rid) = o.religion_id.as_ref() {
            *counts.entry(rid.clone()).or_insert(0) += 1;
        }
    }
    let big = counts.iter().filter(|(_, n)| **n >= 12).max_by_key(|(_, n)| **n);
    let Some((parent_id, _)) = big else {
        return;
    };
    let parent_id = parent_id.clone();
    if sim.rng.random::<f32>() >= 0.05 {
        return;
    }
    let Some(parent) = sim.religions.iter().find(|r| r.id == parent_id) else {
        return;
    };
    let kind = parent.kind;
    let parent_name = parent.name.clone();

    let converts: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.religion_id.as_deref() == Some(parent_id.as_str()))
        .map(|(i, _)| i)
        .collect();
    let mut chosen: Vec<usize> = Vec::new();
    for i in converts {
        if sim.rng.random::<f32>() < 0.4 {
            chosen.push(i);
        }
    }
    if chosen.len() == counts.get(&parent_id).copied().unwrap_or(0) as usize {
        chosen.pop();
    }
    if chosen.len() < 3 {
        return;
    }

    let founder_lineage = sim.organisms[chosen[0]].lineage_id.clone();
    let tick = sim.tick_count;
    let name_seed = tick.wrapping_add(chosen.len() as u64).wrapping_add(7);
    let sect_id = create_religion(sim, kind, &founder_lineage, tick, name_seed);
    for &i in &chosen {
        sim.organisms[i].religion_id = Some(sect_id.clone());
    }
    recount_religion_adherents(sim);
    let sect_name = sim
        .religions
        .iter()
        .find(|religion| religion.id == sect_id)
        .map(|religion| religion.name.clone())
        .unwrap_or_else(|| sect_id.clone());
    let line = format!(
        "\u{271D}\u{FE0F} A schism splits {}: the {} sect breaks away with {} believers.",
        parent_name,
        sect_name,
        chosen.len()
    );
    push_event(&mut sim.events, tick, "religion", "world", &line);
    sim.headlines.push_back((tick, line));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
}

fn tick_religion_founding(sim: &mut Simulation) {
    use crate::sim::actions::religion_expanded::{create_religion, recount_religion_adherents};

    let lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    for lid in lineages {
        let pop = lineage_pop(sim, &lid);
        if pop < 5 {
            continue;
        }
        let era = lineage_era(sim, &lid);
        let existing_for_lineage: Vec<&Religion> = sim
            .religions
            .iter()
            .filter(|r| r.founder_lineage == lid)
            .collect();
        if existing_for_lineage.len() >= 2 {
            continue;
        }
        let recent = existing_for_lineage
            .iter()
            .map(|r| r.founded_tick)
            .max()
            .unwrap_or(0);
        if recent > 0 && sim.tick_count.saturating_sub(recent) < 4_000 {
            continue;
        }
        let existing_kinds: HashSet<ReligionKind> = existing_for_lineage.iter().map(|r| r.kind).collect();
        let candidates = [
            ReligionKind::Animism,
            ReligionKind::Polytheism,
            ReligionKind::Monotheism,
            ReligionKind::Philosophical,
            ReligionKind::Secular,
        ];
        for k in candidates {
            if k.era_unlock() <= era && !existing_kinds.contains(&k) && sim.rng.random::<f32>() < 0.08 {
                let Some(founder_idx) = sim
                    .organisms
                    .iter()
                    .position(|o| o.alive && o.lineage_id == lid && o.religion_id.is_none())
                    .or_else(|| sim.organisms.iter().position(|o| o.alive && o.lineage_id == lid))
                else {
                    break;
                };
                let tick = sim.tick_count;
                let name_seed = tick.wrapping_add(lid.len() as u64);
                let id = create_religion(sim, k, &lid, tick, name_seed);
                sim.organisms[founder_idx].religion_id = Some(id.clone());
                sim.organisms[founder_idx].piety = sim.organisms[founder_idx].piety.max(0.30);
                recount_religion_adherents(sim);
                let name = sim
                    .religions
                    .iter()
                    .find(|religion| religion.id == id)
                    .map(|religion| religion.name.clone())
                    .unwrap_or_else(|| id.clone());
                push_event(
                    &mut sim.events,
                    tick,
                    "religion_founded",
                    &lid,
                    &format!("founded {} ({})", name, k.name()),
                );
                let entry_msg = format!("our people founded {}", name);
                for o in sim.organisms.iter_mut() {
                    if !o.alive || o.lineage_id != lid {
                        continue;
                    }
                    o.log_life(tick, "civ", entry_msg.clone());
                }
                break;
            }
        }
    }
}

fn tick_religion_adherents(sim: &mut Simulation) {
    if sim.religions.is_empty() {
        return;
    }
    let mut adherents_by_id: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if let Some(rid) = o.religion_id.as_ref() {
            *adherents_by_id.entry(rid.clone()).or_insert(0) += 1;
        }
    }
    let mut religion_by_lineage: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for r in sim.religions.iter() {
        religion_by_lineage
            .entry(r.founder_lineage.clone())
            .or_insert(r.id.clone());
    }
    let total_followers: u32 = adherents_by_id.values().sum();
    let dominant: Option<(String, u32)> = adherents_by_id
        .iter()
        .max_by_key(|(_, n)| **n)
        .map(|(id, n)| (id.clone(), *n));
    let convert_chance = 0.005f32;
    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
        if org.religion_id.is_some() {
            continue;
        }
        if let Some(rid) = religion_by_lineage.get(&org.lineage_id) {
            if sim.rng.random::<f32>() < convert_chance * (0.4 + org.traits.social_tendency) {
                org.religion_id = Some(rid.clone());
                org.piety = 0.20 + org.traits.social_tendency * 0.20;
                *adherents_by_id.entry(rid.clone()).or_insert(0) += 1;
                continue;
            }
        }
        if let Some((did, dn)) = dominant.as_ref() {
            if *dn >= 3 && total_followers > 0 {
                let share = (*dn as f32 / total_followers as f32).min(0.9);
                if sim.rng.random::<f32>()
                    < convert_chance * (0.4 + org.traits.social_tendency) * (0.5 + share)
                {
                    org.religion_id = Some(did.clone());
                    org.piety = 0.15 + org.traits.social_tendency * 0.20;
                    *adherents_by_id.entry(did.clone()).or_insert(0) += 1;
                }
            }
        }
    }
    for r in sim.religions.iter_mut() {
        r.adherents = adherents_by_id.get(&r.id).copied().unwrap_or(0);
    }
}

fn tick_religion_effects(sim: &mut Simulation) {
    use crate::sim::tech::buildings::BuildingKind as BK;
    if sim.religions.is_empty() {
        return;
    }
    let temple_anchors: Vec<(f32, f32, Option<String>)> = sim
        .buildings
        .iter()
        .filter(|b| {
            b.is_operational()
                && matches!(
                    b.kind,
                    BK::Temple | BK::Cathedral | BK::Shrine | BK::Mosque | BK::Synagogue | BK::Pagoda
                )
        })
        .map(|b| {
            let (fw, fh) = b.kind.footprint();
            (
                b.x as f32 + fw as f32 / 2.0,
                b.y as f32 + fh as f32 / 2.0,
                b.owner_lineage.clone(),
            )
        })
        .collect();

    for org in sim.organisms.iter_mut() {
        if !org.alive || org.religion_id.is_none() {
            continue;
        }
        let mut near_temple = false;
        for (tx, ty, lid) in &temple_anchors {
            if let Some(lid) = lid {
                if lid != &org.lineage_id {
                    continue;
                }
            }
            if (org.x - tx).abs() + (org.y - ty).abs() <= 6.0 {
                near_temple = true;
                break;
            }
        }
        let bonus = if near_temple { 0.02 } else { 0.005 };
        org.piety = (org.piety + 0.003).min(1.0);
        org.comfort = (org.comfort + bonus).min(1.0);
        if near_temple {
            org.loneliness = (org.loneliness - 0.005).max(0.0);
        }
    }

    let tick = sim.tick_count;
    let mut milestone_events: Vec<(String, String)> = Vec::new();
    for r in sim.religions.iter_mut() {
        let new = r.adherents;
        let last = r.last_milestone.unwrap_or(0);
        let bands: &[u32] = &[10, 25, 50, 100, 250, 500, 1000];
        let mut crossed: Option<u32> = None;
        for b in bands {
            if new >= *b && last < *b {
                crossed = Some(*b);
            }
        }
        if let Some(b) = crossed {
            r.last_milestone = Some(b);
            milestone_events.push((
                r.name.clone(),
                format!("the faith of {} reached {} followers", r.name, b),
            ));
        }
    }
    for (name, detail) in milestone_events {
        push_event(&mut sim.events, tick, "religion", &name, &detail);
    }
}

fn tick_artwork(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    let mut new_artworks: Vec<Artwork> = Vec::new();
    for o in &sim.organisms {
        if !o.alive {
            continue;
        }
        if o.age_stage() == AgeStage::Infant || o.age_stage() == AgeStage::Child {
            continue;
        }
        if o.traits.curiosity < 0.6 {
            continue;
        }
        if sim.rng.random::<f32>() > 0.04 {
            continue;
        }
        let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::Stone);
        let kind = pick_art_kind(era);
        let id = sim.next_artwork_id;
        sim.next_artwork_id += 1;
        let title = format!("Untitled {} no.{}", kind.name(), id);
        new_artworks.push(Artwork {
            id,
            kind,
            creator_id: o.id.clone(),
            creator_name: o.name.clone(),
            location: [o.x as i32, o.y as i32],
            tick: sim.tick_count,
            title,
        });
    }
    for a in &new_artworks {
        push_event(
            &mut sim.events,
            sim.tick_count,
            "artwork_created",
            &a.creator_name,
            &format!("created {} '{}'", a.kind.name(), a.title),
        );
    }
    sim.artworks.extend(new_artworks);
    while sim.artworks.len() > 200 {
        sim.artworks.remove(0);
    }
}

fn pick_art_kind(era: Era) -> ArtKind {
    if era >= Era::Information {
        ArtKind::Digital
    } else if era >= Era::Modern {
        ArtKind::Film
    } else if era >= Era::Industrial {
        ArtKind::Photograph
    } else if era >= Era::Renaissance {
        ArtKind::Painting
    } else if era >= Era::Classical {
        ArtKind::Fresco
    } else if era >= Era::Bronze {
        ArtKind::Sculpture
    } else {
        ArtKind::CavePainting
    }
}

fn tick_books(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    let mut new_books: Vec<Book> = Vec::new();
    for o in &sim.organisms {
        if !o.alive || o.literacy < 0.4 {
            continue;
        }
        if o.age_stage() != AgeStage::Adult && o.age_stage() != AgeStage::Elder {
            continue;
        }
        if sim.rng.random::<f32>() > 0.05 {
            continue;
        }
        let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::Iron);
        if era < Era::Bronze {
            continue;
        }
        let id = sim.next_book_id;
        sim.next_book_id += 1;
        let title = pick_book_title(sim.tick_count + id as u64);
        let topic = pick_topic(era, sim.tick_count + id as u64);
        new_books.push(Book {
            id,
            title: title.clone(),
            author_org_id: o.id.clone(),
            author_name: o.name.clone(),
            written_tick: sim.tick_count,
            lineage_id: o.lineage_id.clone(),
            topic,
            copies: if era >= Era::Renaissance { 50 } else { 1 },
        });
    }
    for b in &new_books {
        push_event(
            &mut sim.events,
            sim.tick_count,
            "book_written",
            &b.author_name,
            &format!("wrote '{}'", b.title),
        );
    }
    sim.books.extend(new_books);
    while sim.books.len() > 500 {
        sim.books.remove(0);
    }
}

fn pick_topic(era: Era, seed: u64) -> BookTopic {
    let mut opts = vec![BookTopic::History, BookTopic::Religion, BookTopic::Poetry];
    if era >= Era::Classical {
        opts.extend([
            BookTopic::Philosophy,
            BookTopic::Medicine,
            BookTopic::Mathematics,
            BookTopic::Geography,
        ]);
    }
    if era >= Era::Renaissance {
        opts.extend([
            BookTopic::Science,
            BookTopic::Astronomy,
            BookTopic::Engineering,
            BookTopic::Law,
        ]);
    }
    if era >= Era::Industrial {
        opts.extend([
            BookTopic::Fiction,
            BookTopic::Biography,
            BookTopic::Economics,
            BookTopic::Drama,
        ]);
    }
    opts[(seed as usize) % opts.len()]
}

fn tick_disease_introduce(sim: &mut Simulation) {
    let era = sim.lineage_eras.values().copied().max().unwrap_or(Era::PreStone);
    let Some(kind) = pick_introduction(era, sim.tick_count) else {
        return;
    };
    let alive: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter_map(|(i, o)| if o.alive { Some(i) } else { None })
        .collect();
    if alive.is_empty() {
        return;
    }
    let pick = alive[sim.rng.random_range(0..alive.len())];
    let name = kind.name().to_string();
    let already = sim.organisms[pick].diseases.iter().any(|(d, _)| d == &name);
    let immune = sim.organisms[pick]
        .disease_immunity
        .get(&name)
        .copied()
        .unwrap_or(0)
        > sim.tick_count;
    if already || immune {
        return;
    }
    sim.organisms[pick].diseases.push((name.clone(), sim.tick_count));
    let org_name = sim.organisms[pick].name.clone();
    push_event(
        &mut sim.events,
        sim.tick_count,
        "got_sick",
        &org_name,
        &format!("contracted {}", kind.name()),
    );
}

fn tick_disease_spread(sim: &mut Simulation) {
    let snapshots: Vec<(usize, f32, f32, Vec<String>)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (i, o.x, o.y, o.diseases.iter().map(|(k, _)| k.clone()).collect()))
        .collect();
    let mut new_infections: Vec<(usize, String)> = Vec::new();
    for (i, x, y, ds) in &snapshots {
        if ds.is_empty() {
            continue;
        }
        for (j, ox, oy, _) in &snapshots {
            if i == j {
                continue;
            }
            let dx = x - ox;
            let dy = y - oy;
            if dx * dx + dy * dy > 6.0 {
                continue;
            }
            for d in ds {
                let kind = match d.as_str() {
                    "cold" => DiseaseKind::Cold,
                    "flu" => DiseaseKind::Flu,
                    "fever" => DiseaseKind::Fever,
                    "plague" => DiseaseKind::Plague,
                    "cholera" => DiseaseKind::Cholera,
                    "pox" => DiseaseKind::Pox,
                    "tuberculosis" => DiseaseKind::Tuberculosis,
                    "influenza" => DiseaseKind::Influenza,
                    "malaria" => DiseaseKind::Malaria,
                    _ => continue,
                };
                if sim.rng.random::<f32>() < kind.contagion() * 0.05 {
                    new_infections.push((*j, d.clone()));
                }
            }
        }
    }
    for (idx, name) in new_infections {
        let already = sim.organisms[idx].diseases.iter().any(|(d, _)| d == &name);
        let immune = sim.organisms[idx]
            .disease_immunity
            .get(&name)
            .copied()
            .unwrap_or(0)
            > sim.tick_count;
        if already || immune {
            continue;
        }
        sim.organisms[idx].diseases.push((name, sim.tick_count));
    }

    let tick = sim.tick_count;
    let mut deaths: Vec<String> = Vec::new();
    for o in sim.organisms.iter_mut() {
        if !o.alive {
            continue;
        }
        let mut to_remove: Vec<usize> = Vec::new();
        for (idx, (kind_name, started)) in o.diseases.iter().enumerate() {
            let kind = match kind_name.as_str() {
                "cold" => DiseaseKind::Cold,
                "flu" => DiseaseKind::Flu,
                "fever" => DiseaseKind::Fever,
                "plague" => DiseaseKind::Plague,
                "cholera" => DiseaseKind::Cholera,
                "pox" => DiseaseKind::Pox,
                "tuberculosis" => DiseaseKind::Tuberculosis,
                "influenza" => DiseaseKind::Influenza,
                "malaria" => DiseaseKind::Malaria,
                "scurvy" => DiseaseKind::Scurvy,
                _ => continue,
            };
            o.health = (o.health - kind.lethality() * 0.05).max(0.0);
            if tick - started > kind.duration_ticks() as u64 {
                to_remove.push(idx);
                o.disease_immunity.insert(kind_name.clone(), tick + 50000);
            }
        }
        for &i in to_remove.iter().rev() {
            o.diseases.remove(i);
        }
        if o.health <= 0.0 && o.alive {
            deaths.push(o.name.clone());
        }
    }
    for n in deaths.iter().take(5) {
        push_event(&mut sim.events, tick, "disease_death", n, "succumbed to illness");
    }
}

fn tick_milestones(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let max_era = sim.lineage_eras.values().copied().max().unwrap_or(Era::PreStone);
    let alive_count = sim.organisms.iter().filter(|o| o.alive).count();
    let mut new_ms: Vec<Milestone> = Vec::new();

    let any_discoveries = |key: &str| {
        sim.organisms
            .iter()
            .any(|o| o.alive && o.discoveries.contains(key))
    };

    if any_discoveries("fire") {
        new_ms.push(Milestone::FirstFire);
    }
    if any_discoveries("stone_tools") {
        new_ms.push(Milestone::FirstTool);
    }
    if any_discoveries("shelter") {
        new_ms.push(Milestone::FirstShelter);
    }
    if any_discoveries("writing") {
        new_ms.push(Milestone::FirstWriting);
    }
    if !sim.books.is_empty() {
        new_ms.push(Milestone::FirstBook);
    }
    if !sim.religions.is_empty() {
        new_ms.push(Milestone::FirstReligion);
    }
    if !sim.battles.is_empty() {
        new_ms.push(Milestone::FirstWar);
    }
    if !sim.treaties.is_empty() {
        new_ms.push(Milestone::FirstTreaty);
    }

    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::School))
    {
        new_ms.push(Milestone::FirstSchool);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::University))
    {
        new_ms.push(Milestone::FirstUniversity);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::Factory))
    {
        new_ms.push(Milestone::FirstFactory);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::Hospital))
    {
        new_ms.push(Milestone::FirstHospital);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::TrainStation))
    {
        new_ms.push(Milestone::FirstTrain);
    }
    if sim
        .buildings
        .iter()
        .any(|b| b.is_operational() && matches!(b.kind, BuildingKind::Airport))
    {
        new_ms.push(Milestone::FirstPlane);
    }

    if alive_count >= 100 {
        new_ms.push(Milestone::Pop100);
    }
    if alive_count >= 500 {
        new_ms.push(Milestone::Pop500);
    }
    if alive_count >= 1000 {
        new_ms.push(Milestone::Pop1000);
    }
    if alive_count >= 5000 {
        new_ms.push(Milestone::Pop5000);
    }

    if max_era >= Era::Renaissance {
        new_ms.push(Milestone::Renaissance);
    }
    if max_era >= Era::Industrial {
        new_ms.push(Milestone::Enlightenment);
    }
    if max_era >= Era::Information {
        new_ms.push(Milestone::InternetAge);
    }

    if sim
        .governments
        .values()
        .any(|g| matches!(g.kind, GovernmentKind::Republic))
    {
        new_ms.push(Milestone::RepublicBorn);
    }
    if sim
        .governments
        .values()
        .any(|g| matches!(g.kind, GovernmentKind::Democracy | GovernmentKind::Federation))
    {
        new_ms.push(Milestone::DemocracyBorn);
    }
    if sim
        .governments
        .values()
        .any(|g| matches!(g.kind, GovernmentKind::Empire))
    {
        new_ms.push(Milestone::EmpireBorn);
    }

    if !sim.outbreaks.is_empty() {
        new_ms.push(Milestone::FirstPlague);
    }

    let mut headlines: Vec<(u64, String)> = Vec::new();
    for ms in new_ms {
        let key = ms.name().to_string();
        if sim.milestones_achieved.insert(key.clone()) {
            push_event(&mut sim.events, tick, "milestone", "the world", ms.description());
            headlines.push((tick, format!("{}: {}", ms.name(), ms.description())));
        }
    }
    for h in headlines {
        sim.headlines.push_back(h);
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;

    fn test_org(id: &str, name: &str, lineage: &str, x: f32, y: f32) -> Organism {
        let mut org = Organism::new(
            id.to_string(),
            name.to_string(),
            x,
            y,
            0,
            String::new(),
            lineage.to_string(),
            20_000,
            Traits::default(),
        );
        org.alive = true;
        org.age = 1500;
        org.energy = 0.8;
        org.loneliness = 0.85;
        org
    }

    #[test]
    fn autonomous_diplomacy_respects_active_battles_and_keeps_one_treaty() {
        use crate::sim::warfare::{Battle, BattleScale, TreatyKind};

        let mut sim = Simulation::new(0xD1_9101);
        sim.organisms.clear();
        let mut river = test_org("river-one", "River", "river", 50.0, 50.0);
        let mut hill = test_org("hill-one", "Hill", "hill", 51.0, 50.0);
        river.lineage_attitudes.insert("hill".into(), 0.8);
        hill.lineage_attitudes.insert("river".into(), 0.8);
        sim.organisms.extend([river, hill]);
        sim.battles.push(Battle {
            id: "battle-river-hill".into(),
            attackers: vec!["river".into()],
            defenders: vec!["hill".into()],
            attacker_orgs: vec!["river-one".into()],
            defender_orgs: vec!["hill-one".into()],
            scale: BattleScale::Skirmish,
            location: (50, 50),
            started_tick: 100,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a: 1,
            initial_d: 1,
        });

        sim.tick_count = 800;
        tick_diplomacy(&mut sim);
        assert!(sim.treaties.is_empty());

        sim.battles[0].ended_tick = Some(900);
        sim.tick_count = 1_600;
        tick_diplomacy(&mut sim);
        assert_eq!(sim.treaties.len(), 1);
        assert_eq!(sim.treaties[0].kind, TreatyKind::Alliance);

        sim.tick_count = 2_400;
        tick_diplomacy(&mut sim);
        assert_eq!(sim.treaties.len(), 1);
    }

    #[test]
    fn autonomous_religion_founding_assigns_a_real_founder() {
        let mut sim = Simulation::new(0xFA_1001);
        sim.organisms.truncate(5);
        sim.religions.clear();
        sim.religions.push(Religion {
            id: "rel1".into(),
            kind: ReligionKind::Animism,
            name: "Existing Path".into(),
            founded_tick: 1,
            founder_lineage: "other-lineage".into(),
            adherents: 0,
            last_milestone: None,
        });
        sim.next_religion_id = 1;
        let lineage = "autonomous-faith-lineage";
        for organism in &mut sim.organisms {
            organism.alive = true;
            organism.lineage_id = lineage.into();
            organism.religion_id = None;
            organism.piety = 0.0;
        }
        sim.lineage_aggregates.clear();
        sim.lineage_eras.insert(lineage.into(), Era::PreStone);

        for attempt in 1..=500 {
            sim.tick_count = attempt * 2_400;
            tick_religion_founding(&mut sim);
            if sim.religions.len() > 1 {
                break;
            }
        }

        let religion = sim
            .religions
            .iter()
            .find(|religion| religion.founder_lineage == lineage)
            .expect("a faith should eventually be founded");
        assert_eq!(religion.id, "rel2");
        let followers: Vec<_> = sim
            .organisms
            .iter()
            .filter(|organism| {
                organism.alive && organism.religion_id.as_deref() == Some(religion.id.as_str())
            })
            .collect();
        assert_eq!(followers.len(), 1);
        assert!(followers[0].piety >= 0.30);
        assert_eq!(religion.adherents, 1);
    }

    #[test]
    fn autonomous_schism_uses_unique_ids_and_recounts_both_faiths() {
        let mut sim = Simulation::new(0xFA_1003);
        sim.organisms.clear();
        for index in 0..12 {
            let mut follower = test_org(
                &format!("follower-{index}"),
                &format!("Follower {index}"),
                "shared-lineage",
                20.0 + index as f32,
                20.0,
            );
            follower.religion_id = Some("rel1".into());
            sim.organisms.push(follower);
        }
        sim.religions.clear();
        sim.religions.push(Religion {
            id: "rel1".into(),
            kind: ReligionKind::Animism,
            name: "Parent Path".into(),
            founded_tick: 1,
            founder_lineage: "shared-lineage".into(),
            adherents: 12,
            last_milestone: None,
        });
        sim.next_religion_id = 1;

        for attempt in 1..=1_000 {
            sim.tick_count = attempt * 1_600;
            tick_religion_schism(&mut sim);
            if sim.religions.len() > 1 {
                break;
            }
        }

        assert_eq!(sim.religions.len(), 2);
        assert!(sim.religions.iter().any(|religion| religion.id == "rel2"));
        assert_eq!(
            sim.religions
                .iter()
                .map(|religion| religion.adherents)
                .sum::<u32>(),
            12
        );
        assert!(sim
            .religions
            .iter()
            .find(|religion| religion.id == "rel1")
            .is_some_and(|religion| religion.adherents > 0));
    }

    #[test]
    fn periodic_religion_recount_sets_extinct_faiths_to_zero() {
        let mut sim = Simulation::new(0xFA_1002);
        for organism in &mut sim.organisms {
            organism.religion_id = None;
        }
        sim.religions.clear();
        sim.religions.push(Religion {
            id: "rel-extinct".into(),
            kind: ReligionKind::Animism,
            name: "Forgotten Path".into(),
            founded_tick: 1,
            founder_lineage: "extinct-lineage".into(),
            adherents: 42,
            last_milestone: None,
        });

        tick_religion_adherents(&mut sim);

        assert_eq!(sim.religions[0].adherents, 0);
    }

    #[test]
    fn cross_lineage_learning_uses_nearby_contact_without_snapshot_clones() {
        let mut sim = Simulation::new(0x1ea1);
        sim.organisms.clear();
        sim.tick_count = 500;

        let mut learner = test_org("learner", "Learner", "lineage-a", 20.0, 20.0);
        learner.traits.curiosity = 1.0;
        learner.traits.social_tendency = 1.0;
        learner.lineage_attitudes.insert("lineage-b".into(), 0.8);
        let mut teacher = test_org("teacher", "Teacher", "lineage-b", 21.0, 20.0);
        teacher.discoveries.insert("bronze_working".into());
        sim.organisms.push(learner);
        sim.organisms.push(teacher);

        let spatial = SpatialIndex::build(&sim.organisms, 8);
        for _ in 0..100 {
            tick_cross_lineage_knowledge(&mut sim, &spatial);
            if sim.organisms[0].discoveries.contains("bronze_working") {
                break;
            }
        }

        assert!(sim.organisms[0].discoveries.contains("bronze_working"));
        assert!(sim.organisms[0].org_trust.get("teacher").copied().unwrap_or(0.0) > 0.0);
    }

    #[test]
    fn deep_grief_sets_a_withdrawal_directive() {
        let mut sim = Simulation::new(7);
        let id = sim.organisms[0].id.clone();
        for _ in 0..20 {
            {
                let org = sim.organisms.iter_mut().find(|o| o.id == id).unwrap();
                org.grief_ticks = 100_000;
                org.comfort = 0.0;
                org.joy_ticks = 0;
                org.fear_level = 0.0;
                org.loneliness = 1.0;
                org.directive_until = 0;
                org.directive.clear();
            }
            sim.tick_count += 45;
            tick_mood(&mut sim);
            let org = sim.organisms.iter().find(|o| o.id == id).unwrap();
            if !org.directive.is_empty() {
                assert!(
                    org.directive == "isolate" || org.directive == "rest",
                    "unexpected directive {}",
                    org.directive
                );
                assert!(org.directive_until > sim.tick_count);
                return;
            }
        }
        panic!("20 mood cycles under maximal grief never set a directive");
    }

    #[test]
    fn good_mood_is_computed_positive() {
        let mut sim = Simulation::new(7);
        let id = sim.organisms[0].id.clone();
        {
            let org = sim.organisms.iter_mut().find(|o| o.id == id).unwrap();
            org.grief_ticks = 0;
            org.joy_ticks = 1200;
            org.comfort = 1.0;
            org.health = 1.0;
            org.fear_level = 0.0;
            org.loneliness = 0.0;
            org.boredom = 0.0;
            org.energy = 1.0;
        }
        sim.tick_count += 45;
        tick_mood(&mut sim);
        let org = sim.organisms.iter().find(|o| o.id == id).unwrap();
        assert!(org.mood > 0.5, "expected positive mood, got {}", org.mood);
    }

    #[test]
    fn friend_gravitation_follows_cross_lineage_friend() {
        let mut sim = Simulation::new(0x51);
        sim.organisms.clear();

        let mut lonely = test_org("lonely", "Lonely", "lineage-a", 20.0, 20.0);
        lonely.friends.insert("friend".into(), "Friend".into());
        lonely.lineage_attitudes.insert("lineage-b".into(), 0.20);
        sim.organisms.push(lonely);
        sim.organisms
            .push(test_org("friend", "Friend", "lineage-b", 42.0, 20.0));

        tick_friend_gravitation(&mut sim);

        assert!(sim.organisms[0].x > 20.0);
        assert_eq!(sim.organisms[0].y, 20.0);
    }

    #[test]
    fn friend_gravitation_ignores_hostile_cross_lineage_friend() {
        let mut sim = Simulation::new(0x52);
        sim.organisms.clear();

        let mut lonely = test_org("lonely", "Lonely", "lineage-a", 20.0, 20.0);
        lonely.friends.insert("friend".into(), "Friend".into());
        lonely.lineage_attitudes.insert("lineage-b".into(), -0.50);
        sim.organisms.push(lonely);
        sim.organisms
            .push(test_org("friend", "Friend", "lineage-b", 42.0, 20.0));

        tick_friend_gravitation(&mut sim);

        assert_eq!(sim.organisms[0].x, 20.0);
        assert_eq!(sim.organisms[0].y, 20.0);
    }

    #[test]
    fn building_cap_prunes_scenery_without_erasing_civilization() {
        let mut sim = Simulation::new(0xB17D);
        sim.buildings.clear();

        let wonder = Building::new(1, BuildingKind::University, 10, 10, Some("lineage-a".into()), 1);
        let hospital = Building::new(2, BuildingKind::Hospital, 12, 10, Some("lineage-a".into()), 2);
        sim.buildings.push(wonder);
        sim.buildings.push(hospital);

        for id in 3..=1_600 {
            let mut prop = Building::new(
                id,
                BuildingKind::Bench,
                id as i32 % 100,
                id as i32 / 100,
                Some("lineage-a".into()),
                id as u64,
            );
            prop.condition = 1.0;
            prop.decorative = true;
            sim.buildings.push(prop);
        }

        cap_buildings(&mut sim);

        assert_eq!(sim.buildings.len(), 1_500);
        assert!(sim.buildings.iter().any(|building| building.id == 1));
        assert!(sim.buildings.iter().any(|building| building.id == 2));
    }

    #[test]
    fn functional_building_budget_prevents_unbounded_world_growth() {
        let mut sim = Simulation::new(0xB01D);
        sim.buildings.clear();
        for id in 0..FUNCTIONAL_BUILDINGS_CAP as u32 {
            sim.buildings.push(Building::new(
                id,
                BuildingKind::Hospital,
                id as i32 % 100,
                id as i32 / 100,
                Some("lineage-a".into()),
                id as u64,
            ));
        }
        for org in sim.organisms.iter_mut().filter(|org| org.alive) {
            org.lineage_id = "lineage-a".into();
        }

        tick_buildings_construct(&mut sim);

        assert_eq!(sim.buildings.len(), FUNCTIONAL_BUILDINGS_CAP);
    }

    #[test]
    fn building_population_gates_are_reachable_at_every_supported_world_size() {
        let authored_gates = [
            3usize, 6, 8, 10, 12, 15, 18, 22, 25, 30, 40, 45, 60, 70, 100, 120, 140, 160, 180, 220, 240, 450,
        ];
        for population_limit in [120, 350, 500, 1_000, 2_000, 5_000] {
            let lineage_capacity =
                natural_lineage_limit(population_limit).min(BASELINE_MAX_BUILDING_REQUIREMENT);
            let requirements: Vec<usize> = authored_gates
                .iter()
                .map(|base| construction_population_requirement(*base, population_limit))
                .collect();
            assert!(requirements.windows(2).all(|pair| pair[0] <= pair[1]));
            assert_eq!(requirements.last().copied(), Some(lineage_capacity));

            let existing: HashSet<BuildingKind> = BuildingKind::all()
                .iter()
                .copied()
                .filter(|kind| *kind != BuildingKind::Megastructure)
                .collect();
            assert_eq!(
                next_target_building(Era::Galactic, lineage_capacity, population_limit, &existing),
                Some(BuildingKind::Megastructure),
                "Galactic construction should remain reachable at cap {population_limit}"
            );
        }
        assert_eq!(construction_population_requirement(40, 350), 40);
        assert_eq!(construction_population_requirement(100, 350), 60);
        assert_eq!(construction_population_requirement(240, 500), 240);
    }

    #[test]
    fn construction_reservation_is_atomic_and_charges_materials_and_wealth() {
        let mut sim = Simulation::new(0xC057);
        sim.organisms.clear();
        let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
        let cost = BuildingKind::Factory.construction_cost();
        builder.inv_wood = cost.wood as u8;
        builder.inv_stone = cost.stone as u8;
        builder.wealth = cost.wealth.saturating_sub(1);
        sim.organisms.push(builder);

        assert!(!reserve_construction_cost(
            &mut sim,
            "lineage-a",
            BuildingKind::Factory
        ));
        assert_eq!(sim.organisms[0].inv_wood, cost.wood as u8);
        assert_eq!(sim.organisms[0].inv_stone, cost.stone as u8);

        sim.organisms[0].wealth = cost.wealth;
        assert!(reserve_construction_cost(
            &mut sim,
            "lineage-a",
            BuildingKind::Factory
        ));
        assert_eq!(sim.organisms[0].inv_wood, 0);
        assert_eq!(sim.organisms[0].inv_stone, 0);
        assert_eq!(sim.organisms[0].wealth, 0);
    }

    #[test]
    fn invalid_construction_site_does_not_charge_the_lineage() {
        let mut sim = Simulation::new(0x51_7E);
        sim.organisms.clear();
        sim.buildings.clear();
        let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
        let cost = BuildingKind::Hut.construction_cost();
        builder.inv_wood = cost.wood as u8;
        builder.inv_stone = cost.stone as u8;
        builder.wealth = cost.wealth;
        sim.organisms.push(builder);

        assert!(!try_start_building(
            &mut sim,
            "lineage-a",
            BuildingKind::Hut,
            -1_000,
            -1_000,
        ));
        assert!(sim.buildings.is_empty());
        assert_eq!(sim.organisms[0].inv_wood, cost.wood as u8);
        assert_eq!(sim.organisms[0].inv_stone, cost.stone as u8);
        assert_eq!(sim.organisms[0].wealth, cost.wealth);
    }

    #[test]
    fn fallback_construction_site_remains_within_worker_reach() {
        use crate::world::tiles::Tile;

        let mut sim = Simulation::new(0x51_7F);
        sim.organisms.clear();
        sim.buildings.clear();
        for y in 5..=15 {
            for x in 5..=35 {
                sim.grid.set(x, y, Tile::Grass);
            }
        }
        let mut builder = test_org("builder", "Builder", "lineage-a", 10.0, 10.0);
        builder.age = 10_000;
        let cost = BuildingKind::Hut.construction_cost();
        builder.inv_wood = cost.wood as u8;
        builder.inv_stone = cost.stone as u8;
        builder.wealth = cost.wealth;
        sim.organisms.push(builder);
        sim.buildings.push(Building::new(
            900,
            BuildingKind::Hut,
            28,
            10,
            Some("lineage-b".into()),
            0,
        ));

        assert!(try_start_building(
            &mut sim,
            "lineage-a",
            BuildingKind::Hut,
            28,
            10,
        ));
        let project = sim
            .buildings
            .iter()
            .find(|building| building.owner_lineage.as_deref() == Some("lineage-a"))
            .expect("reachable fallback project");
        let distance =
            (project.x as f32 - sim.organisms[0].x).abs() + (project.y as f32 - sim.organisms[0].y).abs();
        assert!(distance <= CONSTRUCTION_WORKER_REACH);
    }

    #[test]
    fn construction_stalls_without_active_workers_then_completes_with_labor() {
        let mut sim = Simulation::new(0x1AB0);
        sim.organisms.clear();
        sim.buildings.clear();
        let mut worker = test_org("worker", "Worker", "lineage-a", 50.0, 50.0);
        worker.age = 10_000;
        worker.specialty = Some("builder".into());
        sim.organisms.push(worker);
        sim.buildings.push(Building::new(
            1,
            BuildingKind::Hut,
            10,
            10,
            Some("lineage-a".into()),
            0,
        ));

        tick_building_progress(&mut sim);
        assert_eq!(sim.buildings[0].condition, 0.0);
        assert!(sim.buildings[0].occupants.is_empty());

        sim.organisms[0].x = 10.0;
        sim.organisms[0].y = 10.0;
        let starting_energy = sim.organisms[0].energy;
        for tick in 1..=10 {
            sim.tick_count = tick * 20;
            tick_building_progress(&mut sim);
            if sim.buildings[0].is_complete() {
                break;
            }
        }
        assert!(sim.buildings[0].is_complete());
        assert_eq!(sim.buildings[0].built_at_tick, sim.tick_count);
        assert!(sim.buildings[0].occupants.is_empty());
        assert!(sim.organisms[0].energy < starting_energy);
        assert!(sim
            .events
            .iter()
            .any(|event| event.etype == "built" && event.detail.contains("hut")));
    }

    #[test]
    fn completed_housing_is_shelter_and_unfinished_projects_are_not() {
        use crate::world::grid::WorldGrid;
        use crate::world::tiles::Tile;

        let mut sim = Simulation::new(0x005E_17E2);
        sim.organisms.clear();
        sim.buildings.clear();
        let resident = test_org("resident", "Resident", "lineage-a", 80.0, 80.0);
        sim.organisms.push(resident);
        for y in 75..=85 {
            for x in 75..=85 {
                sim.grid.set(x, y, Tile::Grass);
                sim.grid.structure[WorldGrid::idx(x, y)] = 0.0;
            }
        }

        let mut hut = Building::new(1, BuildingKind::Hut, 81, 80, Some("lineage-a".into()), 0);
        hut.condition = 0.99;
        sim.buildings.push(hut);

        assert!(!sim.organisms[0].near_shelter(&sim.grid, &sim.buildings));
        assert!(sim.organisms[0].has_shelter_project_within(&sim.buildings, 3));

        sim.buildings[0].condition = 1.0;
        assert!(sim.organisms[0].near_shelter(&sim.grid, &sim.buildings));
        assert!(!sim.organisms[0].has_shelter_project_within(&sim.buildings, 3));

        let mut path = std::env::temp_dir();
        path.push(format!(
            "thehumanbox-shelter-save-test-{}.json",
            std::process::id()
        ));
        let path_s = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));

        sim.save_result(&path_s).unwrap();
        let loaded = Simulation::load_or_new(0x0BAD_5EED, &path_s);
        let loaded_resident = loaded
            .organisms
            .iter()
            .find(|org| org.id == "resident")
            .expect("resident survives save/load");
        assert!(loaded_resident.near_shelter(&loaded.grid, &loaded.buildings));

        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));
    }

    #[test]
    fn bridge_requires_a_crossing_and_only_changes_terrain_on_completion() {
        use crate::world::grid::{TrailKind, WorldGrid};
        use crate::world::tiles::Tile;

        let mut sim = Simulation::new(0x00B2_1D6E);
        sim.organisms.clear();
        sim.buildings.clear();
        let (x, y) = (120, 120);
        for tile_y in y - 2..=y + 4 {
            for tile_x in x - 2..=x + 8 {
                sim.grid.set(tile_x, tile_y, Tile::Grass);
                sim.grid.structure[WorldGrid::idx(tile_x, tile_y)] = 0.0;
            }
        }
        sim.grid.set(x + 1, y, Tile::Water);
        sim.grid.set(x + 2, y, Tile::Water);
        sim.grid.depth[WorldGrid::idx(x + 1, y)] = 0.8;
        sim.grid.depth[WorldGrid::idx(x + 2, y)] = 0.7;

        let mut builder = test_org("bridge-builder", "Builder", "lineage-a", x as f32, y as f32);
        builder.age = 10_000;
        builder.energy = 1.0;
        let cost = BuildingKind::Bridge.construction_cost();
        builder.inv_wood = cost.wood as u8;
        builder.inv_stone = cost.stone as u8;
        builder.wealth = cost.wealth;
        sim.organisms.push(builder);

        assert!(construction_site_is_valid(&sim, BuildingKind::Bridge, x, y));
        assert!(!construction_site_is_valid(&sim, BuildingKind::Bridge, x, y + 2));
        assert!(!construction_site_is_valid(&sim, BuildingKind::Hut, x + 1, y));
        assert!(try_start_building_at(
            &mut sim,
            "lineage-a",
            BuildingKind::Bridge,
            x,
            y
        ));
        assert_eq!(sim.grid.get(x + 1, y), Tile::Water);
        assert_eq!(sim.grid.trail_at(x + 1, y, TrailKind::Path), 0.0);

        sim.buildings[0].condition = 0.99;
        sim.tick_count = 20;
        tick_building_progress(&mut sim);

        assert!(sim.buildings[0].is_operational());
        for tile_x in x..=x + 3 {
            assert_eq!(sim.grid.trail_at(tile_x, y, TrailKind::Path), 5.0);
        }
        for tile_x in x + 1..=x + 2 {
            assert_eq!(sim.grid.get(tile_x, y), Tile::Sand);
            assert_eq!(sim.grid.depth_at(tile_x, y), 0.0);
            assert!(sim.grid.get(tile_x, y).walkable());
        }

        let mut path = std::env::temp_dir();
        path.push(format!(
            "thehumanbox-bridge-save-test-{}.json",
            std::process::id()
        ));
        let path_s = path.to_string_lossy().to_string();
        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));

        sim.save_result(&path_s).unwrap();
        let loaded = Simulation::load_or_new(0x0BAD_5EED, &path_s);
        assert!(loaded
            .buildings
            .iter()
            .any(|building| building.kind == BuildingKind::Bridge && building.is_operational()));
        assert_eq!(loaded.grid.get(x + 1, y), Tile::Sand);
        assert!(loaded.grid.trail_at(x + 1, y, TrailKind::Path) > 0.0);

        let _ = std::fs::remove_file(&path_s);
        let _ = std::fs::remove_file(format!("{}.tmp", path_s));
    }

    #[test]
    fn incomplete_buildings_grant_no_aura() {
        let mut sim = Simulation::new(0xA0AA);
        sim.organisms.clear();
        sim.buildings.clear();
        let mut patient = test_org("patient", "Patient", "lineage-a", 10.0, 10.0);
        patient.infection = 0.8;
        patient.health = 0.5;
        sim.organisms.push(patient);
        let mut hospital = Building::new(1, BuildingKind::Hospital, 10, 10, Some("lineage-a".into()), 0);
        hospital.condition = 0.99;
        sim.buildings.push(hospital);

        tick_building_auras(&mut sim);
        assert_eq!(sim.organisms[0].infection, 0.8);
        assert_eq!(sim.organisms[0].health, 0.5);

        sim.buildings[0].condition = 1.0;
        tick_building_auras(&mut sim);
        assert!(sim.organisms[0].infection < 0.8);
        assert!(sim.organisms[0].health > 0.5);

        sim.organisms[0].infection = 0.8;
        sim.organisms[0].health = 0.5;
        sim.buildings[0].decorative = true;
        tick_building_auras(&mut sim);
        assert_eq!(sim.organisms[0].infection, 0.8);
        assert_eq!(sim.organisms[0].health, 0.5);
    }
}
