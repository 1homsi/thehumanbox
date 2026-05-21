use std::collections::{HashMap, HashSet};
use rand::Rng;
use crate::sim::age_stage::AgeStage;
use crate::sim::buildings::{Building, BuildingKind};
use crate::sim::culture::{Religion, ReligionKind, Artwork, ArtKind, Festival, FestivalKind, pick_religion_name};
use crate::sim::economy::{Specialty, currency_unit_for_era, elder_pension};
use crate::sim::era::Era;
use crate::sim::government::{Government, GovernmentKind, Law, LawKind};
use crate::sim::language_tech::{Book, BookTopic, pick_book_title};
use crate::sim::medicine::{ActiveDisease, DiseaseKind, Outbreak, pick_introduction};
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::sim::world_milestones::Milestone;

pub fn tick_civ(sim: &mut Simulation) {
    let tick = sim.tick_count;

    if tick % 60 == 0 {
        tick_age_stages(sim);
    }
    if tick % 120 == 0 {
        tick_specialties(sim);
        tick_wealth(sim);
    }
    if tick % 200 == 0 {
        tick_governments(sim);
        tick_milestones(sim);
    }
    if tick % 300 == 0 {
        tick_education(sim);
    }
    if tick % 400 == 0 {
        tick_buildings_construct(sim);
        tick_disease_spread(sim);
    }
    if tick % 1200 == 0 {
        tick_disease_introduce(sim);
        tick_religion_founding(sim);
        tick_artwork(sim);
        tick_books(sim);
    }
}

fn lineage_era(sim: &Simulation, lid: &str) -> Era {
    sim.lineage_eras.get(lid).copied().unwrap_or(Era::PreStone)
}

fn lineage_pop(sim: &Simulation, lid: &str) -> usize {
    sim.organisms.iter().filter(|o| o.alive && o.lineage_id == lid).count()
}

fn tick_age_stages(sim: &mut Simulation) {
    for org in sim.organisms.iter_mut() {
        if !org.alive { continue; }
        let stage = org.age_stage();
        if stage == AgeStage::Elder { org.is_elder = true; }
    }
}

fn tick_wealth(sim: &mut Simulation) {
    let era_map: HashMap<String, Era> = sim.lineage_eras.clone();
    for org in sim.organisms.iter_mut() {
        if !org.alive { continue; }
        if let Some(spec_name) = org.specialty.clone() {
            let earn = specialty_earn(&spec_name);
            org.wealth = org.wealth.saturating_add(earn);
        }
        let era = era_map.get(&org.lineage_id).copied().unwrap_or(Era::PreStone);
        if org.age_stage() == AgeStage::Elder {
            org.wealth = org.wealth.saturating_add(elder_pension(era));
        }
    }
}

fn specialty_earn(name: &str) -> u32 {
    match name {
        "farmer" | "hunter" | "miner" => 1,
        "smith" | "builder" | "weaver" | "baker" | "carpenter" | "mason" | "brewer" => 2,
        "merchant" | "sailor" | "healer" | "priest" | "artist" | "scribe" | "scholar" => 2,
        "engineer" | "teacher" | "soldier" => 4,
        "doctor" | "lawyer" | "banker" | "officer" => 6,
        "pilot" | "journalist" | "actor" | "athlete" | "politician" => 8,
        "programmer" => 12,
        _ => 0,
    }
}

fn tick_specialties(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    let traits_clone: Vec<(usize, f32, f32, f32, String, bool, Option<String>)> = sim.organisms.iter().enumerate()
        .filter_map(|(i, o)| if o.alive && o.age_stage() == AgeStage::Adult && o.specialty.is_none() {
            Some((i, o.traits.curiosity, o.traits.aggression, o.traits.social_tendency, o.lineage_id.clone(),
                  o.discoveries.contains(&"writing".to_string()), o.specialty.clone()))
        } else { None })
        .collect();

    for (i, curiosity, aggression, social, lid, has_writing, _) in traits_clone {
        if sim.rng.gen::<f32>() > 0.06 { continue; }
        let era = era_map.get(&lid).copied().unwrap_or(Era::PreStone);
        let candidates = candidate_specialties(era, curiosity, aggression, social, has_writing);
        if candidates.is_empty() { continue; }
        let pick = candidates[sim.rng.gen_range(0..candidates.len())];
        sim.organisms[i].specialty = Some(pick.name().to_string());
        let name = sim.organisms[i].name.clone();
        push_event(&mut sim.events, sim.tick_count, "specialty", &name,
                   &format!("became a {}", pick.name()));
    }
}

fn candidate_specialties(era: Era, curiosity: f32, aggression: f32, social: f32, has_writing: bool) -> Vec<Specialty> {
    let mut out = Vec::new();
    if era >= Era::Stone {
        out.push(Specialty::Farmer);
        if aggression > 0.5 { out.push(Specialty::Hunter); }
        out.push(Specialty::Builder);
        if curiosity > 0.6 { out.push(Specialty::Healer); }
        if curiosity > 0.55 { out.push(Specialty::Artist); }
        out.push(Specialty::Priest);
    }
    if era >= Era::Bronze {
        out.push(Specialty::Smith);
        if social > 0.5 { out.push(Specialty::Merchant); }
        if aggression > 0.55 { out.push(Specialty::Soldier); }
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
        if curiosity > 0.6 { out.push(Specialty::Doctor); }
        out.push(Specialty::Lawyer);
        out.push(Specialty::Banker);
    }
    if era >= Era::Modern && has_writing {
        if curiosity > 0.6 { out.push(Specialty::Pilot); }
        if curiosity > 0.5 { out.push(Specialty::Journalist); }
        if social > 0.6 { out.push(Specialty::Actor); }
        if social > 0.6 { out.push(Specialty::Politician); }
    }
    if era >= Era::Information && curiosity > 0.55 && has_writing {
        out.push(Specialty::Programmer);
    }
    out
}

fn tick_education(sim: &mut Simulation) {
    let school_positions: Vec<(i32, i32, String)> = sim.buildings.iter()
        .filter(|b| matches!(b.kind, BuildingKind::School))
        .map(|b| (b.x + b.kind.footprint().0 as i32 / 2, b.y + b.kind.footprint().1 as i32 / 2, b.owner_lineage.clone().unwrap_or_default()))
        .collect();
    let uni_positions: Vec<(i32, i32, String)> = sim.buildings.iter()
        .filter(|b| matches!(b.kind, BuildingKind::University))
        .map(|b| (b.x + b.kind.footprint().0 as i32 / 2, b.y + b.kind.footprint().1 as i32 / 2, b.owner_lineage.clone().unwrap_or_default()))
        .collect();

    let era_map = sim.lineage_eras.clone();
    let tick = sim.tick_count;
    let mut graduates: Vec<(String, String)> = Vec::new();

    for org in sim.organisms.iter_mut() {
        if !org.alive { continue; }
        let near_school = school_positions.iter().any(|(sx, sy, _)| {
            let dx = (org.x as i32) - sx; let dy = (org.y as i32) - sy;
            dx*dx + dy*dy <= 25
        });
        let near_uni = uni_positions.iter().any(|(sx, sy, _)| {
            let dx = (org.x as i32) - sx; let dy = (org.y as i32) - sy;
            dx*dx + dy*dy <= 36
        });

        if near_school && org.age_stage() != AgeStage::Infant {
            org.schooling_ticks = org.schooling_ticks.saturating_add(300);
            org.literacy = (org.literacy + 0.05).min(1.0);
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
        push_event(&mut sim.events, tick, "graduated", &name, &format!("earned a degree in {}", deg));
    }
}

fn pick_degree(era: Era, seed: u64) -> &'static str {
    let mut opts: Vec<&'static str> = vec!["philosophy", "arts", "law", "history", "literature"];
    if era >= Era::Classical { opts.extend(["medicine", "mathematics", "astronomy"]); }
    if era >= Era::Renaissance { opts.extend(["theology", "architecture"]); }
    if era >= Era::Industrial { opts.extend(["engineering", "economics"]); }
    if era >= Era::Modern { opts.push("science"); }
    opts[(seed as usize) % opts.len()]
}

fn tick_buildings_construct(sim: &mut Simulation) {
    let mut new_buildings: Vec<Building> = Vec::new();
    let alive_lineages: HashSet<String> = sim.organisms.iter().filter(|o| o.alive).map(|o| o.lineage_id.clone()).collect();
    for lid in alive_lineages {
        let era = lineage_era(sim, &lid);
        let pop = lineage_pop(sim, &lid);
        if pop < 5 { continue; }
        let existing: HashSet<BuildingKind> = sim.buildings.iter()
            .filter(|b| b.owner_lineage.as_deref() == Some(&lid))
            .map(|b| b.kind)
            .collect();
        let target = next_target_building(era, pop, &existing);
        let Some(kind) = target else { continue };
        let (cx, cy) = lineage_center(sim, &lid);
        if cx == 0 && cy == 0 { continue; }
        let offset_x = (sim.next_building_id as i32 * 3) % 12 - 6;
        let offset_y = (sim.next_building_id as i32 * 5) % 10 - 5;
        let id = sim.next_building_id;
        sim.next_building_id += 1;
        new_buildings.push(Building::new(id, kind, cx + offset_x, cy + offset_y, Some(lid.clone()), sim.tick_count));
        let kn = kind.name().to_string();
        push_event(&mut sim.events, sim.tick_count, "built", &lid, &format!("built a {}", kn));
    }
    sim.buildings.extend(new_buildings);
}

fn next_target_building(era: Era, pop: usize, existing: &HashSet<BuildingKind>) -> Option<BuildingKind> {
    use BuildingKind::*;
    let mut wishlist: Vec<BuildingKind> = Vec::new();
    if era >= Era::Stone && pop >= 5 { wishlist.push(Hut); }
    if era >= Era::Bronze && pop >= 8 { wishlist.push(House); wishlist.push(Forge); wishlist.push(Granary); }
    if era >= Era::Bronze && pop >= 12 { wishlist.push(Temple); }
    if era >= Era::Iron && pop >= 15 { wishlist.push(Market); wishlist.push(Workshop); }
    if era >= Era::Classical && pop >= 18 { wishlist.push(School); wishlist.push(Library); wishlist.push(Bridge); }
    if era >= Era::Classical && pop >= 22 { wishlist.push(Aqueduct); wishlist.push(Observatory); }
    if era >= Era::Medieval && pop >= 25 { wishlist.push(Manor); wishlist.push(Mill); wishlist.push(Castle); }
    if era >= Era::Medieval && pop >= 30 { wishlist.push(Cathedral); wishlist.push(Inn); wishlist.push(Bakery); wishlist.push(Windmill); }
    if era >= Era::Renaissance && pop >= 40 { wishlist.push(University); wishlist.push(TownHouse); wishlist.push(Theatre); }
    if era >= Era::Renaissance && pop >= 45 { wishlist.push(Port); wishlist.push(Bank); }
    if era >= Era::Industrial && pop >= 60 { wishlist.push(Factory); wishlist.push(TrainStation); wishlist.push(Barracks); }
    if era >= Era::Industrial && pop >= 70 { wishlist.push(Museum); }
    if era >= Era::Modern && pop >= 100 { wishlist.push(Hospital); wishlist.push(Apartment); wishlist.push(Stadium); }
    if era >= Era::Modern && pop >= 120 { wishlist.push(Airport); }
    for k in wishlist { if !existing.contains(&k) { return Some(k); } }
    None
}

fn lineage_center(sim: &Simulation, lid: &str) -> (i32, i32) {
    let mut sx = 0i64; let mut sy = 0i64; let mut n = 0i64;
    for o in &sim.organisms {
        if o.alive && o.lineage_id == lid {
            sx += o.x as i64; sy += o.y as i64; n += 1;
        }
    }
    if n == 0 { return (0, 0); }
    ((sx / n) as i32, (sy / n) as i32)
}

fn tick_governments(sim: &mut Simulation) {
    let lineages: Vec<String> = sim.organisms.iter().filter(|o| o.alive).map(|o| o.lineage_id.clone()).collect::<HashSet<_>>().into_iter().collect();
    for lid in &lineages {
        let pop = lineage_pop(sim, lid);
        if pop < 8 { continue; }
        let era = lineage_era(sim, lid);
        let literacy_avg = lineage_literacy(sim, lid);
        let target_kind = Government::pick_kind_for(era, pop, literacy_avg);
        let existing = sim.governments.get(lid).map(|g| g.kind);
        if existing != Some(target_kind) {
            let g = Government::new(lid.clone(), target_kind, sim.tick_count);
            sim.governments.insert(lid.clone(), g);
            push_event(&mut sim.events, sim.tick_count, "government_changed", lid,
                       &format!("formed a {}", target_kind.name()));
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
    let mut sum = 0.0; let mut n = 0;
    for o in &sim.organisms {
        if o.alive && o.lineage_id == *lid {
            sum += o.literacy; n += 1;
        }
    }
    if n == 0 { 0.0 } else { sum / n as f32 }
}

fn try_enact_law(g: &mut Government, era: Era, tick: u64) {
    use LawKind::*;
    let candidates = [NoMurder, NoTheft, Marriage, Inheritance, Worship, PropertyRights, Religion, MilitaryService, Taxation, Education, FreedomOfSpeech, NoSlavery, SafetyNet, Healthcare, EqualRights, ChildLabour, EnvironmentalProtection, DigitalRights, Suffrage];
    for k in candidates {
        if k.era_appearance() <= era && !g.laws.iter().any(|l| l.kind == k) {
            g.laws.push(Law { kind: k, enacted_tick: tick });
            return;
        }
    }
}

fn pick_leaders(sim: &mut Simulation, lineages: &[String]) {
    for lid in lineages {
        let Some(g) = sim.governments.get(lid) else { continue };
        let kind = g.kind;
        if kind.leader_count() == 0 { continue; }
        let want = kind.leader_count() as usize;
        let mut candidates: Vec<(usize, f32)> = Vec::new();
        for (i, o) in sim.organisms.iter().enumerate() {
            if !o.alive || o.lineage_id != *lid { continue; }
            if o.age_stage() != AgeStage::Adult && o.age_stage() != AgeStage::Elder { continue; }
            let score = o.traits.social_tendency + o.traits.memory_strength + o.traits.curiosity + (o.literacy * 0.5);
            candidates.push((i, score));
        }
        candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let leaders: Vec<usize> = candidates.iter().take(want).map(|c| c.0).collect();
        for o in sim.organisms.iter_mut() {
            if o.lineage_id == *lid { o.is_leader = false; }
        }
        let leader_id = leaders.first().map(|&i| sim.organisms[i].id.clone());
        let council_ids: Vec<String> = leaders.iter().skip(1).map(|&i| sim.organisms[i].id.clone()).collect();
        for &i in &leaders {
            sim.organisms[i].is_leader = true;
        }
        if let Some(g) = sim.governments.get_mut(lid) {
            g.leader_id = leader_id;
            g.council_ids = council_ids;
        }
    }
}

fn tick_religion_founding(sim: &mut Simulation) {
    let lineages: Vec<String> = sim.organisms.iter().filter(|o| o.alive).map(|o| o.lineage_id.clone()).collect::<HashSet<_>>().into_iter().collect();
    for lid in lineages {
        let pop = lineage_pop(sim, &lid);
        if pop < 12 { continue; }
        let era = lineage_era(sim, &lid);
        let existing_kinds: HashSet<ReligionKind> = sim.religions.iter().filter(|r| r.founder_lineage == lid).map(|r| r.kind).collect();
        let candidates = [ReligionKind::Animism, ReligionKind::Polytheism, ReligionKind::Monotheism, ReligionKind::Philosophical, ReligionKind::Secular];
        for k in candidates {
            if k.era_unlock() <= era && !existing_kinds.contains(&k) {
                if sim.rng.gen::<f32>() < 0.18 {
                    let id = format!("rel{}", sim.next_religion_id);
                    sim.next_religion_id += 1;
                    let name = pick_religion_name(sim.tick_count + (lid.len() as u64)).to_string();
                    sim.religions.push(Religion {
                        id: id.clone(), kind: k, name: name.clone(),
                        founded_tick: sim.tick_count, founder_lineage: lid.clone(), adherents: 1,
                    });
                    push_event(&mut sim.events, sim.tick_count, "religion_founded", &lid,
                               &format!("founded {} ({})", name, k.name()));
                    break;
                }
            }
        }
    }
}

fn tick_artwork(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    let mut new_artworks: Vec<Artwork> = Vec::new();
    for o in &sim.organisms {
        if !o.alive { continue; }
        if o.age_stage() == AgeStage::Infant || o.age_stage() == AgeStage::Child { continue; }
        if o.traits.curiosity < 0.6 { continue; }
        if sim.rng.gen::<f32>() > 0.04 { continue; }
        let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::Stone);
        let kind = pick_art_kind(era);
        let id = sim.next_artwork_id;
        sim.next_artwork_id += 1;
        let title = format!("Untitled {} no.{}", kind.name(), id);
        new_artworks.push(Artwork {
            id, kind, creator_id: o.id.clone(), creator_name: o.name.clone(),
            location: [o.x as i32, o.y as i32], tick: sim.tick_count, title,
        });
    }
    for a in &new_artworks {
        push_event(&mut sim.events, sim.tick_count, "artwork_created", &a.creator_name,
                   &format!("created {} '{}'", a.kind.name(), a.title));
    }
    sim.artworks.extend(new_artworks);
    while sim.artworks.len() > 200 {
        sim.artworks.remove(0);
    }
}

fn pick_art_kind(era: Era) -> ArtKind {
    if era >= Era::Information { ArtKind::Digital }
    else if era >= Era::Modern { ArtKind::Film }
    else if era >= Era::Industrial { ArtKind::Photograph }
    else if era >= Era::Renaissance { ArtKind::Painting }
    else if era >= Era::Classical { ArtKind::Fresco }
    else if era >= Era::Bronze { ArtKind::Sculpture }
    else { ArtKind::CavePainting }
}

fn tick_books(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    let mut new_books: Vec<Book> = Vec::new();
    for o in &sim.organisms {
        if !o.alive || o.literacy < 0.7 { continue; }
        if o.age_stage() != AgeStage::Adult && o.age_stage() != AgeStage::Elder { continue; }
        if sim.rng.gen::<f32>() > 0.05 { continue; }
        let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::Iron);
        if era < Era::Iron { continue; }
        let id = sim.next_book_id;
        sim.next_book_id += 1;
        let title = pick_book_title(sim.tick_count + id as u64);
        let topic = pick_topic(era, sim.tick_count + id as u64);
        new_books.push(Book {
            id, title: title.clone(), author_org_id: o.id.clone(),
            author_name: o.name.clone(), written_tick: sim.tick_count,
            lineage_id: o.lineage_id.clone(), topic, copies: if era >= Era::Renaissance { 50 } else { 1 },
        });
    }
    for b in &new_books {
        push_event(&mut sim.events, sim.tick_count, "book_written", &b.author_name,
                   &format!("wrote '{}'", b.title));
    }
    sim.books.extend(new_books);
    while sim.books.len() > 500 {
        sim.books.remove(0);
    }
}

fn pick_topic(era: Era, seed: u64) -> BookTopic {
    let mut opts = vec![BookTopic::History, BookTopic::Religion, BookTopic::Poetry];
    if era >= Era::Classical { opts.extend([BookTopic::Philosophy, BookTopic::Medicine, BookTopic::Mathematics, BookTopic::Geography]); }
    if era >= Era::Renaissance { opts.extend([BookTopic::Science, BookTopic::Astronomy, BookTopic::Engineering, BookTopic::Law]); }
    if era >= Era::Industrial { opts.extend([BookTopic::Fiction, BookTopic::Biography, BookTopic::Economics, BookTopic::Drama]); }
    opts[(seed as usize) % opts.len()]
}

fn tick_disease_introduce(sim: &mut Simulation) {
    let era = sim.lineage_eras.values().copied().max().unwrap_or(Era::PreStone);
    let Some(kind) = pick_introduction(era, sim.tick_count) else { return };
    let alive: Vec<usize> = sim.organisms.iter().enumerate().filter_map(|(i, o)| if o.alive { Some(i) } else { None }).collect();
    if alive.is_empty() { return; }
    let pick = alive[sim.rng.gen_range(0..alive.len())];
    let name = kind.name().to_string();
    let already = sim.organisms[pick].diseases.iter().any(|(d, _)| d == &name);
    let immune = sim.organisms[pick].disease_immunity.get(&name).copied().unwrap_or(0) > sim.tick_count;
    if already || immune { return; }
    sim.organisms[pick].diseases.push((name.clone(), sim.tick_count));
    let org_name = sim.organisms[pick].name.clone();
    push_event(&mut sim.events, sim.tick_count, "got_sick", &org_name, &format!("contracted {}", kind.name()));
}

fn tick_disease_spread(sim: &mut Simulation) {
    let snapshots: Vec<(usize, f32, f32, Vec<String>)> = sim.organisms.iter().enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (i, o.x, o.y, o.diseases.iter().map(|(k, _)| k.clone()).collect()))
        .collect();
    let mut new_infections: Vec<(usize, String)> = Vec::new();
    for (i, x, y, ds) in &snapshots {
        if ds.is_empty() { continue; }
        for (j, ox, oy, _) in &snapshots {
            if i == j { continue; }
            let dx = x - ox; let dy = y - oy;
            if dx*dx + dy*dy > 6.0 { continue; }
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
                if sim.rng.gen::<f32>() < kind.contagion() * 0.05 {
                    new_infections.push((*j, d.clone()));
                }
            }
        }
    }
    for (idx, name) in new_infections {
        let already = sim.organisms[idx].diseases.iter().any(|(d, _)| d == &name);
        let immune = sim.organisms[idx].disease_immunity.get(&name).copied().unwrap_or(0) > sim.tick_count;
        if already || immune { continue; }
        sim.organisms[idx].diseases.push((name, sim.tick_count));
    }

    let tick = sim.tick_count;
    let mut deaths: Vec<String> = Vec::new();
    for o in sim.organisms.iter_mut() {
        if !o.alive { continue; }
        let mut to_remove: Vec<usize> = Vec::new();
        for (idx, (kind_name, started)) in o.diseases.iter().enumerate() {
            let kind = match kind_name.as_str() {
                "cold" => DiseaseKind::Cold, "flu" => DiseaseKind::Flu, "fever" => DiseaseKind::Fever,
                "plague" => DiseaseKind::Plague, "cholera" => DiseaseKind::Cholera, "pox" => DiseaseKind::Pox,
                "tuberculosis" => DiseaseKind::Tuberculosis, "influenza" => DiseaseKind::Influenza,
                "malaria" => DiseaseKind::Malaria, "scurvy" => DiseaseKind::Scurvy,
                _ => continue,
            };
            o.health = (o.health - kind.lethality() * 0.05).max(0.0);
            if tick - started > kind.duration_ticks() as u64 {
                to_remove.push(idx);
                o.disease_immunity.insert(kind_name.clone(), tick + 50000);
            }
        }
        for &i in to_remove.iter().rev() { o.diseases.remove(i); }
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

    let any_discoveries = |key: &str| sim.organisms.iter().any(|o| o.alive && o.discoveries.contains(key));

    if any_discoveries("fire") { new_ms.push(Milestone::FirstFire); }
    if any_discoveries("stone_tools") { new_ms.push(Milestone::FirstTool); }
    if any_discoveries("shelter") { new_ms.push(Milestone::FirstShelter); }
    if any_discoveries("writing") { new_ms.push(Milestone::FirstWriting); }
    if !sim.books.is_empty() { new_ms.push(Milestone::FirstBook); }
    if !sim.religions.is_empty() { new_ms.push(Milestone::FirstReligion); }
    if !sim.battles.is_empty() { new_ms.push(Milestone::FirstWar); }
    if !sim.treaties.is_empty() { new_ms.push(Milestone::FirstTreaty); }

    if sim.buildings.iter().any(|b| matches!(b.kind, BuildingKind::School)) { new_ms.push(Milestone::FirstSchool); }
    if sim.buildings.iter().any(|b| matches!(b.kind, BuildingKind::University)) { new_ms.push(Milestone::FirstUniversity); }
    if sim.buildings.iter().any(|b| matches!(b.kind, BuildingKind::Factory)) { new_ms.push(Milestone::FirstFactory); }
    if sim.buildings.iter().any(|b| matches!(b.kind, BuildingKind::Hospital)) { new_ms.push(Milestone::FirstHospital); }
    if sim.buildings.iter().any(|b| matches!(b.kind, BuildingKind::TrainStation)) { new_ms.push(Milestone::FirstTrain); }
    if sim.buildings.iter().any(|b| matches!(b.kind, BuildingKind::Airport)) { new_ms.push(Milestone::FirstPlane); }

    if alive_count >= 100 { new_ms.push(Milestone::Pop100); }
    if alive_count >= 500 { new_ms.push(Milestone::Pop500); }
    if alive_count >= 1000 { new_ms.push(Milestone::Pop1000); }
    if alive_count >= 5000 { new_ms.push(Milestone::Pop5000); }

    if max_era >= Era::Renaissance { new_ms.push(Milestone::Renaissance); }
    if max_era >= Era::Industrial { new_ms.push(Milestone::Enlightenment); }
    if max_era >= Era::Information { new_ms.push(Milestone::InternetAge); }

    if sim.governments.values().any(|g| matches!(g.kind, GovernmentKind::Republic)) { new_ms.push(Milestone::RepublicBorn); }
    if sim.governments.values().any(|g| matches!(g.kind, GovernmentKind::Democracy | GovernmentKind::Federation)) { new_ms.push(Milestone::DemocracyBorn); }
    if sim.governments.values().any(|g| matches!(g.kind, GovernmentKind::Empire)) { new_ms.push(Milestone::EmpireBorn); }

    if !sim.outbreaks.is_empty() { new_ms.push(Milestone::FirstPlague); }

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
        while sim.headlines.len() > 30 { sim.headlines.pop_front(); }
    }
}
