use super::*;

pub(in crate::sim::civ) fn tick_spiritual_pilgrimage(sim: &mut Simulation) {
    let n = sim.organisms.len();
    if n == 0 || sim.buildings.is_empty() {
        return;
    }
    let temples: Vec<(f32, f32, String)> = sim
        .buildings
        .iter()
        .filter(|b| {
            b.is_operational()
                && matches!(
                    b.kind,
                    crate::sim::tech::buildings::BuildingKind::Temple
                        | crate::sim::tech::buildings::BuildingKind::Shrine
                        | crate::sim::tech::buildings::BuildingKind::Cathedral
                )
        })
        .map(|b| {
            (
                b.x as f32 + 0.5,
                b.y as f32 + 0.5,
                b.owner_lineage.clone().unwrap_or_default(),
            )
        })
        .collect();
    if temples.is_empty() {
        return;
    }
    let mut moves: Vec<(usize, f32, f32)> = Vec::new();
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive || o.spiritual < 0.55 {
            continue;
        }
        let mut best: Option<(f32, f32, f32)> = None;
        for (tx, ty, tlid) in temples.iter() {
            if !tlid.is_empty() && tlid != &o.lineage_id {
                continue;
            }
            let d = (tx - o.x).abs() + (ty - o.y).abs();
            if !(2.0..=70.0).contains(&d) {
                continue;
            }
            if let Some((bd, _, _)) = best {
                if d < bd {
                    best = Some((d, *tx, *ty));
                }
            } else {
                best = Some((d, *tx, *ty));
            }
        }
        if let Some((_, tx, ty)) = best {
            let dx = (tx - o.x).signum() * 0.18;
            let dy = (ty - o.y).signum() * 0.18;
            moves.push((i, dx, dy));
        }
    }
    for (i, dx, dy) in moves {
        sim.organisms[i].x += dx;
        sim.organisms[i].y += dy;
    }
}

pub(in crate::sim::civ) fn tick_storyteller(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::spatial::SpatialIndex;
    let tick = sim.tick_count;
    let phase = tick % crate::sim::cosmos::DAY_LENGTH;
    let day_len = crate::sim::cosmos::DAY_LENGTH as f32;
    let evening_start = (day_len * 0.70) as u64;
    let evening_end = (day_len * 0.85) as u64;
    if phase < evening_start || phase > evening_end {
        return;
    }
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let storytellers: Vec<(usize, String, f32, f32, String)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.is_elder && o.spiritual > 0.5 && !o.memories.entries.is_empty())
        .map(|(i, o)| {
            let pick = o
                .memories
                .entries
                .iter()
                .max_by(|a, b| {
                    a.salience
                        .partial_cmp(&b.salience)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .map(|m| m.text.clone())
                .unwrap_or_default();
            (i, o.lineage_id.clone(), o.x, o.y, pick)
        })
        .filter(|(_, _, _, _, text)| !text.is_empty())
        .collect();
    if storytellers.is_empty() {
        return;
    }
    let spatial = SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    let mut inserts: Vec<(usize, String)> = Vec::new();
    for (si, lid, sx, sy, text) in storytellers.iter() {
        spatial.query_into(*sx as i32, *sy as i32, 4, &mut buf);
        let mut listeners = 0;
        for &j in buf.iter() {
            if j == *si {
                continue;
            }
            let o = &sim.organisms[j];
            if !o.alive || &o.lineage_id != lid {
                continue;
            }
            if (o.x - sx).abs() + (o.y - sy).abs() > 4.0 {
                continue;
            }
            if sim.rng.random::<f32>() > 0.15 {
                continue;
            }
            inserts.push((j, text.clone()));
            listeners += 1;
            if listeners >= 6 {
                break;
            }
        }
    }
    for (j, text) in inserts {
        let entry = MemoryEntry::new(MemoryKind::Fact, format!("an elder told us: {}", text), tick)
            .with_salience(0.5)
            .with_emotion(1);
        sim.organisms[j].memories.insert(entry);
    }
}

pub(in crate::sim::civ) fn tick_funerals(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if sim.organisms.is_empty() {
        return;
    }
    let recent_deaths: Vec<(String, f32, f32)> = sim
        .organisms
        .iter()
        .filter(|o| !o.alive && o.age > 800)
        .filter(|o| {
            let since = tick.saturating_sub(o.last_story_tick);
            since > 0 && since < 80
        })
        .map(|o| (o.lineage_id.clone(), o.x, o.y))
        .collect();
    if recent_deaths.is_empty() {
        return;
    }
    let spatial = crate::sim::spatial::SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(64);
    let mut bumps: Vec<usize> = Vec::new();
    for (lid, dx, dy) in recent_deaths.iter() {
        spatial.query_into(*dx as i32, *dy as i32, 12, &mut buf);
        let mut count = 0;
        for &j in buf.iter() {
            let o = &sim.organisms[j];
            if !o.alive || &o.lineage_id != lid {
                continue;
            }
            if (o.x - dx).abs() + (o.y - dy).abs() > 12.0 {
                continue;
            }
            bumps.push(j);
            count += 1;
            if count >= 8 {
                break;
            }
        }
    }
    for idx in bumps {
        sim.organisms[idx].grief_ticks = (sim.organisms[idx].grief_ticks + 60).min(400);
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "we mourned together — the wind carried our voices",
            tick,
        )
        .with_salience(0.85)
        .with_emotion(-2);
        sim.organisms[idx].memories.insert(entry);
    }
}

pub(in crate::sim::civ) fn tick_naming_ceremonies(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let candidates: Vec<(usize, String, String, f32, f32)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.age == 40)
        .map(|(i, o)| (i, o.lineage_id.clone(), o.name.clone(), o.x, o.y))
        .collect();
    if candidates.is_empty() {
        return;
    }
    let spatial = crate::sim::spatial::SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    let mut events: Vec<(String, String)> = Vec::new();
    let mut bumps: Vec<usize> = Vec::new();
    for (idx, lid, name, cx, cy) in candidates.iter() {
        spatial.query_into(*cx as i32, *cy as i32, 6, &mut buf);
        let mut witnesses = 0;
        for &j in buf.iter() {
            if j == *idx {
                continue;
            }
            let o = &sim.organisms[j];
            if !o.alive || &o.lineage_id != lid {
                continue;
            }
            if (o.x - cx).abs() + (o.y - cy).abs() > 6.0 {
                continue;
            }
            bumps.push(j);
            witnesses += 1;
            if witnesses >= 5 {
                break;
            }
        }
        if witnesses >= 2 {
            events.push((name.clone(), lid.clone()));
        }
    }
    for idx in bumps {
        sim.organisms[idx].joy_ticks = (sim.organisms[idx].joy_ticks + 25).min(1200);
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "we welcomed a new soul into our people by name",
            tick,
        )
        .with_salience(0.7)
        .with_emotion(2);
        sim.organisms[idx].memories.insert(entry);
    }
    for (name, lid) in events {
        let lname = sim.lineage_names.get(&lid).cloned().unwrap_or(lid);
        push_event(
            &mut sim.events,
            tick,
            "born",
            &name,
            &format!("the {} gave {} their name", lname, name),
        );
    }
}

pub(in crate::sim::civ) fn tick_festivals(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if sim.organisms.is_empty() {
        return;
    }
    let mut lineage_stats: HashMap<String, (u32, u32, u32)> = HashMap::default();
    for o in sim.organisms.iter() {
        if !o.alive {
            continue;
        }
        let e = lineage_stats.entry(o.lineage_id.clone()).or_insert((0, 0, 0));
        e.0 += 1;
        if o.joy_ticks > 200 {
            e.1 += 1;
        }
        if o.comfort > 0.7 {
            e.2 += 1;
        }
    }
    let (festival_name, flavor) = match sim.season() {
        "abundance" => ("a Sun Feast", "drums, dancing, every belly full"),
        "decline" => ("a Fading-Light Rite", "lanterns lit against the coming dark"),
        "scarcity" => ("a Long-Night Vigil", "huddled close, sharing the last stores"),
        _ => ("a Greening Rite", "the first shoots blessed with song"),
    };
    let mut headlines: Vec<String> = Vec::new();
    let mut joy_targets: Vec<String> = Vec::new();
    for (lid, (pop, joyful, comfy)) in lineage_stats.iter() {
        if *pop < 8 {
            continue;
        }
        if (*joyful as f32) / (*pop as f32) < 0.45 {
            continue;
        }
        if (*comfy as f32) / (*pop as f32) < 0.4 {
            continue;
        }
        let lname = sim.lineage_names.get(lid).cloned().unwrap_or_else(|| lid.clone());
        headlines.push(format!("the {} held {} — {}", lname, festival_name, flavor));
        joy_targets.push(lid.clone());
    }
    for h in headlines {
        push_event(&mut sim.events, tick, "festival", "world", &h);
        sim.headlines.push_back((tick, h));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
    for lid in joy_targets {
        for o in sim.organisms.iter_mut() {
            if !o.alive || o.lineage_id != lid {
                continue;
            }
            o.joy_ticks = (o.joy_ticks + 30).min(1200);
            if sim.rng.random::<f32>() < 0.25 {
                let entry =
                    MemoryEntry::new(MemoryKind::Episode, "we held a festival — drums until dawn", tick)
                        .with_salience(0.78)
                        .with_emotion(2);
                o.memories.insert(entry);
            }
        }
    }
}

pub(in crate::sim::civ) fn tick_birth_celebrations(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if sim.organisms.is_empty() {
        return;
    }
    let newborns: Vec<(usize, String, f32, f32)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.age > 0 && o.age <= 6)
        .map(|(i, o)| (i, o.lineage_id.clone(), o.x, o.y))
        .collect();
    if newborns.is_empty() {
        return;
    }
    let spatial = crate::sim::spatial::SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    let mut bumps: Vec<usize> = Vec::new();
    for (newborn_idx, lid, nx, ny) in newborns.iter() {
        spatial.query_into(*nx as i32, *ny as i32, 8, &mut buf);
        let mut count = 0;
        for &j in buf.iter() {
            if j == *newborn_idx {
                continue;
            }
            let o = &sim.organisms[j];
            if !o.alive || o.lineage_id != *lid {
                continue;
            }
            if (o.x - nx).abs() + (o.y - ny).abs() > 8.0 {
                continue;
            }
            bumps.push(j);
            count += 1;
            if count >= 6 {
                break;
            }
        }
    }
    for idx in bumps {
        sim.organisms[idx].joy_ticks = (sim.organisms[idx].joy_ticks + 40).min(1200);
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "a new child arrived in our home — we all crowded close",
            tick,
        )
        .with_salience(0.80)
        .with_emotion(2);
        sim.organisms[idx].memories.insert(entry);
    }
}

/// Ticks between checks for a coming of age. A person's first adult ticks are the six ages
/// just past the teen years, and exactly one of any six consecutive ticks is checked.
const COMING_OF_AGE_STEP: u32 = 6;

/// A teen grows into an adult with a rite: the kin who are close by gather round, and the
/// young one hears the year and the company in the life story. Nothing is chronicled, so the
/// tribe's own memory of each rite is the biography and the joy of those who gathered.
pub(in crate::sim::civ) fn tick_coming_of_age(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::age_stage::AgeStage;
    use crate::sim::spatial::SpatialIndex;
    let tick = sim.tick_count;
    let arrivals: Vec<(usize, String, f32, f32)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| {
            o.alive
                && o.age >= COMING_OF_AGE_STEP
                && o.age_stage() == AgeStage::Adult
                && AgeStage::from_age(o.age - COMING_OF_AGE_STEP, o.max_age) != AgeStage::Adult
        })
        .map(|(i, o)| (i, o.lineage_id.clone(), o.x, o.y))
        .collect();
    if arrivals.is_empty() {
        return;
    }
    let spatial = SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    for (idx, lid, x, y) in arrivals {
        spatial.query_into(x as i32, y as i32, 8, &mut buf);
        let mut gathered: Vec<usize> = Vec::new();
        for &j in buf.iter() {
            if j == idx {
                continue;
            }
            let o = &sim.organisms[j];
            if !o.alive || o.lineage_id != lid || (o.x - x).abs() + (o.y - y).abs() > 8.0 {
                continue;
            }
            gathered.push(j);
            if gathered.len() >= 6 {
                break;
            }
        }
        for &j in gathered.iter() {
            let witness = &mut sim.organisms[j];
            witness.joy_ticks = (witness.joy_ticks + 30).min(1200);
            witness.memories.insert(
                MemoryEntry::new(
                    MemoryKind::Episode,
                    "a young one of our people came of age, and we gathered to see them stand",
                    tick,
                )
                .with_salience(0.6)
                .with_emotion(2),
            );
        }
        let years = crate::sim::calendar::whole_years_of(u64::from(sim.organisms[idx].age));
        let o = &mut sim.organisms[idx];
        o.joy_ticks = (o.joy_ticks + 60).min(1200);
        o.memories.insert(
            MemoryEntry::new(
                MemoryKind::Episode,
                "I came of age, and my people gathered for me",
                tick,
            )
            .with_salience(0.8)
            .with_emotion(2),
        );
        let line = if gathered.is_empty() {
            format!("came of age at {years} years, alone")
        } else {
            format!(
                "came of age at {years} years, with {} of their people gathered round",
                gathered.len()
            )
        };
        o.log_life(tick, "life", line);
    }
}

pub(in crate::sim::civ) fn tick_evening_gathering(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let phase = tick % crate::sim::cosmos::DAY_LENGTH;
    let day_len = crate::sim::cosmos::DAY_LENGTH as f32;
    let dusk_start = (day_len * 0.62) as u64;
    let dusk_end = (day_len * 0.74) as u64;
    if phase < dusk_start || phase > dusk_end {
        return;
    }
    if sim.organisms.is_empty() || sim.buildings.is_empty() {
        return;
    }
    // Group eligible buildings by owning lineage once, so each adult only
    // scans its own lineage's gathering spots instead of every building.
    let mut buildings_by_lineage: HashMap<&str, Vec<(f32, f32)>> = HashMap::default();
    for b in sim.buildings.iter() {
        if !b.is_operational() {
            continue;
        }
        if let Some(owner) = b.owner_lineage.as_deref() {
            buildings_by_lineage
                .entry(owner)
                .or_default()
                .push((b.x as f32, b.y as f32));
        }
    }
    let mut moves: Vec<(usize, f32, f32)> = Vec::new();
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive || o.age < 200 {
            continue;
        }
        let Some(spots) = buildings_by_lineage.get(o.lineage_id.as_str()) else {
            continue;
        };
        let mut best: Option<(f32, f32, f32)> = None;
        for &(bx, by) in spots.iter() {
            let dist = (bx - o.x).abs() + (by - o.y).abs();
            if !(2.0..=60.0).contains(&dist) {
                continue;
            }
            if let Some((d, _, _)) = best {
                if dist < d {
                    best = Some((dist, bx, by));
                }
            } else {
                best = Some((dist, bx, by));
            }
        }
        if let Some((_, bx, by)) = best {
            let dx = (bx - o.x).signum() * 0.25;
            let dy = (by - o.y).signum() * 0.25;
            moves.push((i, dx, dy));
        }
    }
    for (i, dx, dy) in moves {
        sim.organisms[i].x += dx;
        sim.organisms[i].y += dy;
    }
}

pub(in crate::sim::civ) fn tick_anniversaries(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let year_ticks = crate::sim::cosmos::YEAR_LENGTH_TICKS;
    for o in sim.organisms.iter_mut() {
        if !o.alive || o.birth_tick == 0 || tick <= o.birth_tick {
            continue;
        }
        let elapsed = tick - o.birth_tick;
        if elapsed < year_ticks {
            continue;
        }
        let last_year_mark = (elapsed - 300) / year_ticks;
        let this_year_mark = elapsed / year_ticks;
        if this_year_mark > last_year_mark {
            let years = this_year_mark;
            let text = match years {
                1 => "I have lived one full year in this world".to_string(),
                _ => format!("I have lived {} years in this world", years),
            };
            let entry = MemoryEntry::new(MemoryKind::Fact, text, tick)
                .with_salience(0.85)
                .with_emotion(2);
            o.memories.insert(entry);
            o.joy_ticks = (o.joy_ticks + 60).min(1200);
        }
    }
}

#[cfg(test)]
mod coming_of_age_tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;

    fn person(id: &str, x: f32, age: u32) -> Organism {
        let mut o = Organism::new(
            id.into(),
            id.into(),
            x,
            50.0,
            0,
            String::new(),
            "clan".into(),
            20_000,
            Traits::default(),
        );
        o.alive = true;
        o.age = age;
        o
    }

    fn has_rite(o: &Organism) -> bool {
        o.life_log
            .iter()
            .any(|e| e.category == "life" && e.text.contains("came of age"))
    }

    #[test]
    fn a_teen_who_grows_up_is_welcomed_by_the_kin_close_by() {
        let mut sim = Simulation::new(7);
        sim.organisms.clear();
        sim.tick_count = 6_000;
        sim.organisms.push(person("young", 60.0, 7_000));
        sim.organisms.push(person("kin1", 61.0, 9_000));
        sim.organisms.push(person("kin2", 62.0, 9_000));
        sim.organisms.push(person("far", 200.0, 9_000));
        tick_coming_of_age(&mut sim);
        let young = &sim.organisms[0];
        assert!(has_rite(young), "the rite is in the life story");
        assert!(young.joy_ticks >= 60);
        assert!(young
            .memories
            .entries
            .iter()
            .any(|m| m.text.contains("came of age")));
        assert!(sim.organisms[1].joy_ticks >= 30 && sim.organisms[2].joy_ticks >= 30);
        assert_eq!(sim.organisms[3].joy_ticks, 0, "kin out of reach do not gather");
    }

    #[test]
    fn only_the_first_adult_ticks_are_a_rite() {
        let mut sim = Simulation::new(7);
        sim.organisms.clear();
        sim.tick_count = 6_000;
        sim.organisms.push(person("still_teen", 60.0, 6_900));
        sim.organisms.push(person("grown", 61.0, 7_006));
        tick_coming_of_age(&mut sim);
        assert!(!has_rite(&sim.organisms[0]));
        assert!(!has_rite(&sim.organisms[1]));
    }

    #[test]
    fn a_lone_young_one_still_comes_of_age() {
        let mut sim = Simulation::new(7);
        sim.organisms.clear();
        sim.tick_count = 6_000;
        sim.organisms.push(person("alone", 60.0, 7_002));
        tick_coming_of_age(&mut sim);
        assert!(sim.organisms[0].life_log.iter().any(|e| e.text.contains("alone")));
    }
}
