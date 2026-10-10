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

pub(crate) fn workshop_pull(kind: BuildingKind) -> Option<Specialty> {
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

/// How close a person must live to a trading building of their tribe to take up trade.
const MERCHANT_DRIFT_REACH: f32 = 14.0;
/// Chance per specialty pass that a sociable person near a stall or market becomes a merchant.
const MERCHANT_DRIFT_CHANCE: f32 = 0.08;
/// How sociable a person must be to take up trade.
const MERCHANT_DRIFT_SOCIAL: f32 = 0.4;
/// Farmers a tribe keeps on the land before any of them may take up trade.
const MERCHANT_DRIFT_FARMERS_KEPT: usize = 4;

/// People who work a non-essential trade (or none) drift into trade when a
/// stall, market or other trading building of their tribe stands nearby. Farmers,
/// hunters and miners keep their work: food and metal come first.
pub(super) fn tick_merchant_drift(sim: &mut Simulation) {
    let anchors: Vec<(f32, f32, String)> = sim
        .buildings
        .iter()
        .filter(|b| {
            let stall = b.decorative && b.kind == crate::sim::tech::buildings::BuildingKind::MarketStall;
            (b.is_operational() || stall)
                && b.kind.function() == crate::sim::tech::buildings::BuildingFunction::Trade
        })
        .filter_map(|b| {
            let lid = b.owner_lineage.clone()?;
            let (fw, fh) = b.kind.footprint();
            Some((b.x as f32 + fw as f32 / 2.0, b.y as f32 + fh as f32 / 2.0, lid))
        })
        .collect();
    // A village (a settlement of tier 1 or more) has its market square at its
    // centre, so its people can take up trade there even before a stall stands.
    let mut anchors = anchors;
    for settlement in crate::sim::civ::settlements::snapshots(sim)
        .iter()
        .filter(|settlement| settlement.tier >= 1)
    {
        anchors.push((
            settlement.center[0] as f32,
            settlement.center[1] as f32,
            settlement.lineage_id.clone(),
        ));
    }
    if anchors.is_empty() {
        return;
    }
    let tick = sim.tick_count;
    // Farmers are only drawn into trade where the tribe has food to spare: a
    // tribe keeps at least this many farmers, whatever their social pull.
    let mut farmers: HashMap<String, usize> = HashMap::default();
    for org in sim
        .organisms
        .iter()
        .filter(|org| org.alive && org.specialty.as_deref() == Some("farmer"))
    {
        *farmers.entry(org.lineage_id.clone()).or_insert(0) += 1;
    }
    for i in 0..sim.organisms.len() {
        let org = &sim.organisms[i];
        if !org.alive
            || org.age_stage() != AgeStage::Adult
            || org.traits.social_tendency < MERCHANT_DRIFT_SOCIAL
        {
            continue;
        }
        let drifts = match org.specialty.as_deref() {
            None => true,
            Some("farmer") => {
                farmers.get(&org.lineage_id).copied().unwrap_or(0) > MERCHANT_DRIFT_FARMERS_KEPT
            }
            Some("artist" | "priest" | "carpenter" | "builder" | "weaver" | "baker" | "smith" | "brewer") => {
                true
            }
            _ => false,
        };
        if !drifts {
            continue;
        }
        let near = anchors.iter().any(|(bx, by, lid)| {
            *lid == org.lineage_id && (org.x - bx).abs() + (org.y - by).abs() <= MERCHANT_DRIFT_REACH
        });
        if !near || sim.rng.random::<f32>() >= MERCHANT_DRIFT_CHANCE {
            continue;
        }
        let name = sim.organisms[i].name.clone();
        let previous = sim.organisms[i].specialty.clone();
        sim.organisms[i].specialty = Some("merchant".to_string());
        let detail = match previous {
            Some(old) => format!("left {old} work to trade"),
            None => "became a merchant".to_string(),
        };
        push_event(
            &mut sim.events,
            tick,
            "specialty",
            &name,
            &format!("{name} {detail} at the market"),
        );
    }
}

/// How far a teen can be from a working parent and still learn their trade.
const APPRENTICE_REACH: f32 = 20.0;

/// Teens take up the trade of a working parent who lives within reach. A
/// teen with no trade of their own looks at their parents each pass, and
/// with a chance joins the nearer parent's trade, logged in their biography.
pub(super) fn tick_apprenticeships(sim: &mut Simulation) {
    let tick = sim.tick_count;
    for i in 0..sim.organisms.len() {
        let teen = &sim.organisms[i];
        if !teen.alive || teen.age_stage() != AgeStage::Teen || teen.specialty.is_some() {
            continue;
        }
        let (tx, ty) = (teen.x, teen.y);
        let parent_id = teen.parent_id.clone();
        let father_id = teen.father_id.clone();
        let mut best: Option<(f32, usize)> = None;
        for (j, k) in sim.organisms.iter().enumerate() {
            let is_parent = k.id == parent_id || father_id.as_deref() == Some(k.id.as_str());
            if j == i || !k.alive || !is_parent || k.specialty.is_none() {
                continue;
            }
            if !matches!(k.age_stage(), AgeStage::Adult | AgeStage::Elder) {
                continue;
            }
            let d = (k.x - tx).abs() + (k.y - ty).abs();
            if d > APPRENTICE_REACH {
                continue;
            }
            if best.is_none_or(|(bd, _)| d < bd) {
                best = Some((d, j));
            }
        }
        let Some((_, j)) = best else { continue };
        let trade = sim.organisms[j].specialty.clone().unwrap_or_default();
        let parent_name = sim.organisms[j].name.clone();
        let parent_id = sim.organisms[j].id.clone();
        let name = sim.organisms[i].name.clone();
        sim.organisms[i].specialty = Some(trade.clone());
        sim.organisms[i].log_life_rel(
            tick,
            "apprenticeship",
            format!("apprenticed to {parent_name} and took up their trade as a {trade}"),
            Some(parent_id),
            Some(parent_name.clone()),
        );
        push_event(
            &mut sim.events,
            tick,
            "specialty",
            &name,
            &format!("{name} apprenticed to {parent_name} as a {trade}"),
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
    opts[(seed % opts.len() as u64) as usize]
}

#[cfg(test)]
mod apprentice_tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;

    fn person(id: &str, age: u32, x: f32, y: f32) -> Organism {
        let mut o = Organism::new(
            id.into(),
            id.into(),
            x,
            y,
            0,
            String::new(),
            "lin".into(),
            9000,
            Traits::default(),
        );
        o.alive = true;
        o.max_age = 10_000;
        o.age = age;
        o
    }

    #[test]
    fn a_teen_takes_up_the_trade_of_a_working_parent_nearby() {
        let mut sim = Simulation::new(8);
        sim.organisms.clear();
        let mut parent = person("parent", 6000, 10.0, 10.0);
        parent.specialty = Some("baker".into());
        sim.organisms.push(parent);
        let mut teen = person("teen", 3000, 14.0, 10.0);
        teen.parent_id = "parent".into();
        sim.organisms.push(teen);
        for _ in 0..200 {
            tick_apprenticeships(&mut sim);
            sim.tick_count += 1;
            if sim.organisms[1].specialty.is_some() {
                break;
            }
        }
        assert_eq!(sim.organisms[1].specialty.as_deref(), Some("baker"));
        assert!(sim.organisms[1]
            .life_log
            .iter()
            .any(|e| e.text.contains("apprenticed to parent")));
    }

    #[test]
    fn a_parent_out_of_reach_teaches_nobody() {
        let mut sim = Simulation::new(8);
        sim.organisms.clear();
        let mut parent = person("parent", 6000, 10.0, 10.0);
        parent.specialty = Some("baker".into());
        sim.organisms.push(parent);
        let mut teen = person("teen", 3000, 90.0, 90.0);
        teen.parent_id = "parent".into();
        sim.organisms.push(teen);
        for _ in 0..200 {
            tick_apprenticeships(&mut sim);
            sim.tick_count += 1;
        }
        assert!(sim.organisms[1].specialty.is_none());
    }
}
