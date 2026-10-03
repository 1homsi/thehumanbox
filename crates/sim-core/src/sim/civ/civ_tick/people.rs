use super::*;

pub(super) fn tick_age_stages(sim: &mut Simulation) {
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

pub(super) fn workshop_pull(kind: BuildingKind) -> Option<Specialty> {
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

pub(super) fn tick_specialties(sim: &mut Simulation) {
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
pub(super) fn tick_aspirations(sim: &mut Simulation) {
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

pub(super) fn candidate_specialties(
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

pub(super) fn tick_education(sim: &mut Simulation) {
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

pub(super) fn pick_degree(era: Era, seed: u64) -> &'static str {
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
