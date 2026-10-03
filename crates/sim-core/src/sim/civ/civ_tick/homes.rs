use super::*;

pub(super) fn tick_home_furnishing(sim: &mut Simulation) {
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

pub(super) fn tick_building_auras(sim: &mut Simulation) {
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
