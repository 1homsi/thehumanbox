use crate::sim::age_stage::AgeStage;
use crate::sim::buildings::{Building, BuildingKind};
use crate::sim::culture::{
    pick_religion_name, ArtKind, Artwork, Festival, FestivalKind, Religion, ReligionKind,
};
use crate::sim::economy::{currency_unit_for_era, elder_pension, Specialty};
use crate::sim::era::Era;
use crate::sim::government::{Government, GovernmentKind, Law, LawKind};
use crate::sim::language_tech::{pick_book_title, Book, BookTopic};
use crate::sim::medicine::{pick_introduction, ActiveDisease, DiseaseKind, Outbreak};
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use crate::sim::world_milestones::Milestone;
use rand::Rng;
use std::collections::{HashMap, HashSet};

pub fn tick_civ(sim: &mut Simulation) {
    let tick = sim.tick_count;

    if tick % 60 == 0 {
        tick_age_stages(sim);
    }
    if tick % 120 == 0 {
        tick_specialties(sim);
        tick_aspirations(sim);
        tick_wealth(sim);
    }
    if tick % 200 == 0 {
        tick_governments(sim);
        tick_milestones(sim);
    }
    if tick % 300 == 0 {
        tick_education(sim);
    }
    if tick % 240 == 0 {
        tick_buildings_construct(sim);
    }
    if tick % 400 == 0 {
        tick_disease_spread(sim);
    }
    if tick % 150 == 0 {
        tick_scatter_props(sim);
    }
    if tick % 400 == 0 {
        tick_religion_founding(sim);
        tick_artwork(sim);
        tick_books(sim);
    }
    if tick % 240 == 0 {
        tick_religion_adherents(sim);
        tick_religion_effects(sim);
    }
    if tick % 600 == 0 {
        tick_leader_influence(sim);
    }
    super::economy_tick::tick_economy(sim, tick);
    if tick % 1200 == 0 {
        tick_disease_introduce(sim);
    }
    if tick % 500 == 0 && tick > 0 {
        tick_cross_lineage_knowledge(sim);
    }
    if tick % 180 == 0 && tick > 0 {
        tick_building_auras(sim);
    }
    if tick % 1200 == 0 && tick > 0 {
        tick_home_furnishing(sim);
    }
    if tick % 60 == 0 && tick > 0 {
        tick_witnessed_events(sim);
    }
    if tick % 180 == 0 && tick > 0 {
        tick_sky_omens(sim);
    }
    if tick % 240 == 0 && tick > 0 {
        tick_reflections(sim);
    }
    if tick > 0 && tick % crate::sim::cosmos::DAY_LENGTH == 0 {
        tick_lunar_observation(sim);
    }
    if tick > 0 && tick % (crate::sim::cosmos::DAY_LENGTH * 6) == 0 {
        tick_maybe_eclipse(sim);
    }
    if tick > 0 && tick % 90 == 0 && sim.is_night() {
        tick_dreams(sim);
    }
    if tick > 0 && tick % 300 == 0 {
        tick_anniversaries(sim);
    }
    if tick > 0 && tick % 60 == 0 {
        tick_mood_contagion(sim);
    }
    if tick > 0 && tick % 180 == 0 {
        tick_meteor_shower(sim);
    }
    if tick > 0 && tick % 360 == 0 {
        tick_aurora_sighting(sim);
    }
    if tick > 0 && tick % 240 == 0 {
        tick_teaching(sim);
    }
    if tick > 0 && tick % 80 == 0 {
        tick_friend_gravitation(sim);
    }
    if tick > 0 && tick % 20 == 0 {
        tick_building_progress(sim);
    }
    if tick > 0 && tick % 40 == 0 {
        tick_evening_gathering(sim);
    }
    if tick > 0 && tick % 6 == 0 {
        tick_birth_celebrations(sim);
    }
    if tick > 0 && tick % 20 == 0 {
        tick_funerals(sim);
    }
    if tick > 0 && tick % 8 == 0 {
        tick_naming_ceremonies(sim);
    }
    if tick > 0 && tick % 1800 == 0 {
        tick_festivals(sim);
    }
    if tick > 0 && tick % 60 == 0 {
        tick_awe_marvels(sim);
    }
    if tick > 0 && tick % 30 == 0 {
        tick_gratitude_sharing(sim);
    }
    if tick > 0 && tick % 50 == 0 {
        tick_anger_outbursts(sim);
    }
    if tick > 0 && tick % 90 == 0 {
        tick_spiritual_pilgrimage(sim);
    }
    if tick > 0 && tick % 300 == 0 {
        tick_hopeful_aspiration(sim);
    }
    if tick > 0 && tick % 100 == 0 {
        tick_jealousy_rivalries(sim);
    }
    if tick > 0 && tick % 200 == 0 {
        tick_curiosity_exploration(sim);
    }
    if tick > 0 && tick % 600 == 0 {
        tick_weddings(sim);
    }
    if tick > 0 && tick % 120 == 0 {
        tick_dream_sharing(sim);
    }
    if tick > 0 && tick % 60 == 0 {
        tick_storyteller(sim);
    }
    tick_season_change(sim);
    if tick > 0 && tick % 600 == 0 && sim.is_night() {
        tick_partner_pillow_talk(sim);
    }
    if tick > 0 && tick % 240 == 0 {
        tick_grudge_recall(sim);
    }
}

fn tick_grudge_recall(sim: &mut Simulation) {
    use crate::organism::memory::MemoryKind;
    use std::collections::HashSet;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let mut snapshot: Vec<(usize, f32, f32, HashSet<String>)> = Vec::with_capacity(n / 4);
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        let mut foes: HashSet<String> = HashSet::with_capacity(4);
        for m in o.memories.entries.iter() {
            if foes.len() >= 4 {
                break;
            }
            if m.kind == MemoryKind::Bond && m.emotion <= -2 && m.salience > 0.5 {
                if let Some(rid) = &m.related_id {
                    foes.insert(rid.clone());
                }
            }
        }
        if !foes.is_empty() {
            snapshot.push((i, o.x, o.y, foes));
        }
    }

    for (i, x, y, foes) in snapshot {
        let mut bumps = 0u32;
        for j in 0..n {
            if j == i {
                continue;
            }
            let other = &sim.organisms[j];
            if !other.alive {
                continue;
            }
            if (other.x - x).abs() + (other.y - y).abs() > 6.0 {
                continue;
            }
            if foes.contains(&other.id) {
                bumps += 1;
            }
        }
        if bumps > 0 {
            let me = &mut sim.organisms[i];
            me.fear_level = (me.fear_level + 0.012 * bumps as f32).min(1.0);
            me.comfort = (me.comfort - 0.005 * bumps as f32).max(0.0);
        }
    }
}

fn tick_partner_pillow_talk(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let pairs: Vec<(usize, usize)> = {
        let mut by_id: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for (i, o) in sim.organisms.iter().enumerate() {
            if o.alive {
                by_id.insert(o.id.as_str(), i);
            }
        }
        let mut out: Vec<(usize, usize)> = Vec::new();
        let mut seen: std::collections::HashSet<(usize, usize)> = std::collections::HashSet::new();
        for (i, o) in sim.organisms.iter().enumerate() {
            if !o.alive {
                continue;
            }
            let Some(ref pid) = o.partner_id else { continue };
            let Some(&j) = by_id.get(pid.as_str()) else {
                continue;
            };
            if i == j {
                continue;
            }
            let p = &sim.organisms[j];
            if !p.alive {
                continue;
            }
            if (p.x - o.x).abs() + (p.y - o.y).abs() > 2.5 {
                continue;
            }
            let key = if i < j { (i, j) } else { (j, i) };
            if seen.insert(key) {
                out.push(key);
            }
        }
        out
    };

    for (a, b) in pairs {
        let from_a = sim.organisms[a]
            .memories
            .pick_for_reflection(Some(true))
            .map(|m| (m.text.clone(), m.emotion));
        let from_b = sim.organisms[b]
            .memories
            .pick_for_reflection(Some(true))
            .map(|m| (m.text.clone(), m.emotion));

        if let Some((text, emotion)) = from_a {
            let a_name = sim.organisms[a].name.clone();
            let a_id = sim.organisms[a].id.clone();
            let lower = text.trim_end_matches('.').to_lowercase();
            let entry = MemoryEntry::new(
                MemoryKind::Bond,
                format!("at night, {} told me — {}", a_name, lower),
                tick,
            )
            .with_salience(0.65)
            .with_emotion((emotion as i32 / 2).clamp(-2, 2) as i8)
            .with_related(a_id);
            sim.organisms[b].memories.insert(entry);
            sim.organisms[b].comfort = (sim.organisms[b].comfort + 0.01).min(1.0);
        }
        if let Some((text, emotion)) = from_b {
            let b_name = sim.organisms[b].name.clone();
            let b_id = sim.organisms[b].id.clone();
            let lower = text.trim_end_matches('.').to_lowercase();
            let entry = MemoryEntry::new(
                MemoryKind::Bond,
                format!("at night, {} told me — {}", b_name, lower),
                tick,
            )
            .with_salience(0.65)
            .with_emotion((emotion as i32 / 2).clamp(-2, 2) as i8)
            .with_related(b_id);
            sim.organisms[a].memories.insert(entry);
            sim.organisms[a].comfort = (sim.organisms[a].comfort + 0.01).min(1.0);
        }
    }
}

fn tick_maybe_eclipse(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::cosmos::{moon_phase_at, MoonPhase};
    let tick = sim.tick_count;
    let phase = moon_phase_at(tick);
    let is_eligible = matches!(phase, MoonPhase::FullMoon | MoonPhase::NewMoon);
    if !is_eligible {
        return;
    }
    let r: f32 = sim.rng.random();
    if r > 0.04 {
        return;
    }
    let (text, emotion, salience, is_solar) = match phase {
        MoonPhase::NewMoon => ("the sun was eaten by the moon at midday", -2, 0.95, true),
        _ => ("the moon ran red in the night sky", -1, 0.90, false),
    };
    for o in sim.organisms.iter_mut() {
        if !o.alive {
            continue;
        }
        let entry = MemoryEntry::new(MemoryKind::Episode, text, tick)
            .with_salience(salience)
            .with_emotion(emotion);
        o.memories.insert(entry);
        o.fear_level = (o.fear_level + if is_solar { 0.18 } else { 0.10 }).min(1.0);
        o.joy_ticks = o.joy_ticks.saturating_sub(40);
        o.grief_ticks = (o.grief_ticks + 10).min(400);
    }
    let label = if is_solar {
        "solar eclipse"
    } else {
        "lunar eclipse"
    };
    push_event(
        &mut sim.events,
        tick,
        "sky",
        "world",
        &format!("{}: {}", label, text),
    );
    sim.headlines
        .push_back((tick, format!("a {} stunned the people: {}", label, text)));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
}

fn tick_season_change(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::config::{SEASONS, SEASON_LENGTH};
    let tick = sim.tick_count;
    if tick == 0 {
        return;
    }
    let prev = ((tick - 1) / SEASON_LENGTH) as usize % SEASONS.len();
    let now = (tick / SEASON_LENGTH) as usize % SEASONS.len();
    if prev == now {
        return;
    }
    let s = SEASONS[now];
    let (headline, mem_text, emotion, salience) = match s {
        "abundance" => (
            "the world quickens — green covers the hills again",
            "warmth returned, and the earth gave fresh shoots",
            2i8,
            0.7,
        ),
        "decline" => (
            "leaves turn — the long descent into colder days begins",
            "the air thinned and the leaves began to fall",
            0i8,
            0.55,
        ),
        "scarcity" => (
            "frost takes the land — winter is here",
            "the first frost arrived and the cold settled in my bones",
            -1i8,
            0.75,
        ),
        "recovery" => (
            "the thaw begins — meltwater runs in the gullies",
            "the snow softened, the streams ran fast and cold",
            1i8,
            0.65,
        ),
        _ => return,
    };
    push_event(&mut sim.events, tick, "season", "world", headline);
    sim.headlines.push_back((tick, headline.to_string()));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
    let alive_n = sim.organisms.iter().filter(|o| o.alive).count();
    if alive_n == 0 {
        return;
    }
    let pick_n = (alive_n / 10).max(1).min(20);
    let mut picked = 0usize;
    for o in sim.organisms.iter_mut() {
        if !o.alive || picked >= pick_n {
            continue;
        }
        if sim.rng.random::<f32>() > pick_n as f32 / alive_n as f32 {
            continue;
        }
        let entry = MemoryEntry::new(MemoryKind::Episode, mem_text, tick)
            .with_salience(salience)
            .with_emotion(emotion);
        o.memories.insert(entry);
        picked += 1;
    }
}

fn tick_spiritual_pilgrimage(sim: &mut Simulation) {
    let n = sim.organisms.len();
    if n == 0 || sim.buildings.is_empty() {
        return;
    }
    let temples: Vec<(f32, f32, String)> = sim
        .buildings
        .iter()
        .filter(|b| {
            (b.condition >= 0.5)
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
            if d > 70.0 || d < 2.0 {
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

fn tick_dream_sharing(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if !sim.is_night() {
        return;
    }
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let mut shares: Vec<(usize, usize)> = Vec::new();
    let mut by_id: HashMap<String, usize> = HashMap::new();
    for (i, o) in sim.organisms.iter().enumerate() {
        if o.alive {
            by_id.insert(o.id.clone(), i);
        }
    }
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        if o.spiritual < 0.3 && o.awe < 0.3 {
            continue;
        }
        let Some(ref pid) = o.partner_id else { continue };
        let Some(&j) = by_id.get(pid) else { continue };
        if i == j {
            continue;
        }
        let p = &sim.organisms[j];
        if !p.alive {
            continue;
        }
        if (p.x - o.x).abs() + (p.y - o.y).abs() > 2.0 {
            continue;
        }
        if sim.rng.random::<f32>() > 0.04 {
            continue;
        }
        shares.push((i, j));
    }
    for (i, j) in shares {
        let entry = MemoryEntry::new(
            MemoryKind::Dream,
            "we shared a dream tonight — bright shapes that neither of us could name",
            tick,
        )
        .with_salience(0.6)
        .with_emotion(2);
        sim.organisms[i].memories.insert(entry.clone());
        sim.organisms[j].memories.insert(entry);
        sim.organisms[i].spiritual = (sim.organisms[i].spiritual + 0.02).min(1.0);
        sim.organisms[j].spiritual = (sim.organisms[j].spiritual + 0.02).min(1.0);
    }
}

fn tick_storyteller(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
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
        .filter(|(_, o)| {
            o.alive
                && o.is_elder
                && o.spiritual > 0.5
                && !o.memories.entries.is_empty()
        })
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
    for (si, lid, sx, sy, text) in storytellers.iter() {
        let mut listeners = 0;
        for (j, o) in sim.organisms.iter_mut().enumerate() {
            if j == *si || !o.alive || &o.lineage_id != lid {
                continue;
            }
            if (o.x - sx).abs() + (o.y - sy).abs() > 4.0 {
                continue;
            }
            if sim.rng.random::<f32>() > 0.15 {
                continue;
            }
            let entry = MemoryEntry::new(
                MemoryKind::Fact,
                format!("an elder told us: {}", text),
                tick,
            )
            .with_salience(0.5)
            .with_emotion(1);
            o.memories.insert(entry);
            listeners += 1;
            if listeners >= 6 {
                break;
            }
        }
    }
}

fn tick_weddings(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let pairs: Vec<(usize, usize, String, f32, f32)> = {
        let mut seen: HashSet<(usize, usize)> = HashSet::new();
        let mut out: Vec<(usize, usize, String, f32, f32)> = Vec::new();
        let mut by_id: HashMap<String, usize> = HashMap::new();
        for (i, o) in sim.organisms.iter().enumerate() {
            if o.alive {
                by_id.insert(o.id.clone(), i);
            }
        }
        for (i, o) in sim.organisms.iter().enumerate() {
            if !o.alive {
                continue;
            }
            let Some(ref pid) = o.partner_id else { continue };
            let Some(&j) = by_id.get(pid) else { continue };
            if i == j {
                continue;
            }
            let p = &sim.organisms[j];
            if !p.alive {
                continue;
            }
            let key = if i < j { (i, j) } else { (j, i) };
            if !seen.insert(key) {
                continue;
            }
            if (o.x - p.x).abs() + (o.y - p.y).abs() > 2.0 {
                continue;
            }
            let attr = ((o.id.bytes().fold(0u32, |a, b| a.wrapping_add(b as u32))
                + p.id.bytes().fold(0u32, |a, b| a.wrapping_add(b as u32))) as u64
                * 17)
                % 30_000;
            if tick.saturating_sub(attr) % 30_000 != 0 {
                continue;
            }
            out.push((i, j, o.lineage_id.clone(), (o.x + p.x) * 0.5, (o.y + p.y) * 0.5));
        }
        out
    };
    if pairs.is_empty() {
        return;
    }
    let mut bumps: Vec<usize> = Vec::new();
    let mut headlines: Vec<String> = Vec::new();
    for (i, j, lid, cx, cy) in pairs.iter() {
        let mut witnesses = 0;
        for (k, o) in sim.organisms.iter().enumerate() {
            if !o.alive || k == *i || k == *j || &o.lineage_id != lid {
                continue;
            }
            if (o.x - cx).abs() + (o.y - cy).abs() > 6.0 {
                continue;
            }
            bumps.push(k);
            witnesses += 1;
            if witnesses >= 6 {
                break;
            }
        }
        let n1 = sim.organisms[*i].name.clone();
        let n2 = sim.organisms[*j].name.clone();
        headlines.push(format!("{} and {} pledged themselves to each other", n1, n2));
        bumps.push(*i);
        bumps.push(*j);
    }
    for idx in bumps {
        sim.organisms[idx].joy_ticks = (sim.organisms[idx].joy_ticks + 35).min(1200);
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "we celebrated a pairing — vows, dance, and food until the stars dimmed",
            tick,
        )
        .with_salience(0.78)
        .with_emotion(2);
        sim.organisms[idx].memories.insert(entry);
    }
    for h in headlines {
        push_event(&mut sim.events, tick, "marriage", "world", &h);
        sim.headlines.push_back((tick, h));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}

fn tick_jealousy_rivalries(sim: &mut Simulation) {
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let mut attitude_drops: Vec<(usize, String, f32)> = Vec::new();
    for i in 0..n {
        let o = &sim.organisms[i];
        if !o.alive || o.jealousy < 0.6 {
            continue;
        }
        let (my_x, my_y, my_lid) = (o.x, o.y, o.lineage_id.clone());
        for j in 0..n {
            if i == j {
                continue;
            }
            let other = &sim.organisms[j];
            if !other.alive || other.lineage_id == my_lid {
                continue;
            }
            if (other.x - my_x).abs() + (other.y - my_y).abs() > 8.0 {
                continue;
            }
            attitude_drops.push((i, other.lineage_id.clone(), -0.004));
            break;
        }
    }
    for (idx, rival_lid, delta) in attitude_drops {
        let entry = sim.organisms[idx]
            .lineage_attitudes
            .entry(rival_lid)
            .or_insert(0.0);
        *entry = (*entry + delta).max(-1.0);
    }
}

fn tick_curiosity_exploration(sim: &mut Simulation) {
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    for i in 0..n {
        let o = &mut sim.organisms[i];
        if !o.alive || o.curiosity_drive < 0.6 || o.wander_target.is_some() {
            continue;
        }
        if o.energy < 0.5 {
            continue;
        }
        let hash = o
            .id
            .bytes()
            .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        let angle = ((hash ^ sim.tick_count) as f32) * 0.0000014;
        let dist = 200.0 + o.curiosity_drive * 350.0;
        let tx = (o.x + angle.sin() * dist).round() as i32;
        let ty = (o.y + angle.cos() * dist).round() as i32;
        o.wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
        o.curiosity_drive = (o.curiosity_drive * 0.4).max(0.0);
    }
}

fn tick_hopeful_aspiration(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let aspirations = [
        "to build a great hall",
        "to remember every name",
        "to never be hungry again",
        "to keep my kin safe",
        "to see the far shore",
        "to write our story down",
        "to learn the night sky",
        "to be remembered well",
    ];
    for o in sim.organisms.iter_mut() {
        if !o.alive || o.age < 600 {
            continue;
        }
        if !o.aspiration.is_empty() {
            continue;
        }
        if o.hope < 0.65 {
            continue;
        }
        let r: f32 = sim.rng.random();
        if r > 0.001 {
            continue;
        }
        let pick = aspirations[sim.rng.random_range(0..aspirations.len())];
        o.aspiration = pick.to_string();
        let oname = o.name.clone();
        push_event(
            &mut sim.events,
            tick,
            "aspiration",
            &oname,
            &format!("decided: {}", pick),
        );
    }
}

fn tick_awe_marvels(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if !sim.is_night() {
        return;
    }
    for o in sim.organisms.iter_mut() {
        if !o.alive || o.awe < 0.55 {
            continue;
        }
        let r: f32 = sim.rng.random();
        if r > 0.008 {
            continue;
        }
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "I marvelled at the stars tonight — the world felt impossibly large",
            tick,
        )
        .with_salience(0.7)
        .with_emotion(2);
        o.memories.insert(entry);
        o.spiritual = (o.spiritual + 0.04).min(1.0);
    }
}

fn tick_gratitude_sharing(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let givers: Vec<(usize, String, f32, f32, f32, f32)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.gratitude > 0.5 && o.energy > 0.5)
        .map(|(i, o)| (i, o.lineage_id.clone(), o.x, o.y, o.energy, o.hydration))
        .collect();
    if givers.is_empty() {
        return;
    }
    let mut transfers: Vec<(usize, usize, f32, f32)> = Vec::new();
    for (gi, lid, gx, gy, ge, gh) in givers.iter() {
        for (j, o) in sim.organisms.iter().enumerate() {
            if !o.alive || j == *gi || &o.lineage_id != lid {
                continue;
            }
            if (o.x - gx).abs() + (o.y - gy).abs() > 3.0 {
                continue;
            }
            if o.energy < 0.3 && *ge > 0.55 {
                transfers.push((*gi, j, 0.05, 0.0));
                break;
            }
            if o.hydration < 0.3 && *gh > 0.55 {
                transfers.push((*gi, j, 0.0, 0.05));
                break;
            }
        }
    }
    for (gi, ri, e, h) in transfers {
        sim.organisms[gi].energy = (sim.organisms[gi].energy - e).max(0.0);
        sim.organisms[gi].hydration = (sim.organisms[gi].hydration - h).max(0.0);
        sim.organisms[ri].energy = (sim.organisms[ri].energy + e).min(1.0);
        sim.organisms[ri].hydration = (sim.organisms[ri].hydration + h).min(1.0);
        sim.organisms[gi].gratitude = (sim.organisms[gi].gratitude * 0.7).max(0.0);
        sim.organisms[ri].joy_ticks = (sim.organisms[ri].joy_ticks + 8).min(1200);
        let gname = sim.organisms[gi].name.clone();
        push_event(
            &mut sim.events,
            tick,
            "build",
            &gname,
            "shared their food with kin",
        );
    }
}

fn tick_anger_outbursts(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    for o in sim.organisms.iter_mut() {
        if !o.alive || o.anger < 0.7 {
            continue;
        }
        let r: f32 = sim.rng.random();
        if r > 0.05 {
            continue;
        }
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "I lost my temper — words I cannot take back",
            tick,
        )
        .with_salience(0.7)
        .with_emotion(-2);
        o.memories.insert(entry);
        o.fear_level = (o.fear_level + 0.05).min(1.0);
        o.regret = (o.regret + 0.15).min(1.0);
        o.anger = (o.anger * 0.4).max(0.0);
    }
}

fn tick_funerals(sim: &mut Simulation) {
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
    let mut bumps: Vec<usize> = Vec::new();
    for (lid, dx, dy) in recent_deaths.iter() {
        let mut count = 0;
        for (j, o) in sim.organisms.iter().enumerate() {
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

fn tick_naming_ceremonies(sim: &mut Simulation) {
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
    let mut events: Vec<(String, String)> = Vec::new();
    let mut bumps: Vec<usize> = Vec::new();
    for (idx, lid, name, cx, cy) in candidates.iter() {
        let mut witnesses = 0;
        for (j, o) in sim.organisms.iter().enumerate() {
            if j == *idx || !o.alive || &o.lineage_id != lid {
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
    let lineage_names = sim.lineage_names.clone();
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
        let lname = lineage_names.get(&lid).cloned().unwrap_or(lid);
        push_event(
            &mut sim.events,
            tick,
            "born",
            &name,
            &format!("the {} gave {} their name", lname, name),
        );
    }
}

fn tick_festivals(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if sim.organisms.is_empty() {
        return;
    }
    let mut lineage_stats: HashMap<String, (u32, u32, u32)> = HashMap::new();
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
        let lname = sim
            .lineage_names
            .get(lid)
            .cloned()
            .unwrap_or_else(|| lid.clone());
        headlines.push(format!("the {} held a festival — drums, dancing, every belly full", lname));
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
                let entry = MemoryEntry::new(
                    MemoryKind::Episode,
                    "we held a festival — drums until dawn",
                    tick,
                )
                .with_salience(0.78)
                .with_emotion(2);
                o.memories.insert(entry);
            }
        }
    }
}

fn tick_birth_celebrations(sim: &mut Simulation) {
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
    let mut bumps: Vec<usize> = Vec::new();
    for (newborn_idx, lid, nx, ny) in newborns.iter() {
        let mut count = 0;
        for (j, o) in sim.organisms.iter().enumerate() {
            if j == *newborn_idx || !o.alive || o.lineage_id != *lid {
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

fn tick_evening_gathering(sim: &mut Simulation) {
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
    let mut moves: Vec<(usize, f32, f32)> = Vec::new();
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive || o.age < 200 {
            continue;
        }
        let my_lid = &o.lineage_id;
        let mut best: Option<(f32, f32, f32)> = None;
        for b in sim.buildings.iter() {
            if b.condition < 0.4 {
                continue;
            }
            if let Some(owner) = &b.owner_lineage {
                if owner != my_lid {
                    continue;
                }
            } else {
                continue;
            }
            let bx = b.x as f32;
            let by = b.y as f32;
            let dist = (bx - o.x).abs() + (by - o.y).abs();
            if dist > 60.0 || dist < 2.0 {
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

fn tick_friend_gravitation(sim: &mut Simulation) {
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let mut moves: Vec<(usize, f32, f32)> = Vec::new();
    for i in 0..n {
        let o = &sim.organisms[i];
        if !o.alive {
            continue;
        }
        if o.loneliness < 0.4 {
            continue;
        }
        if o.energy < 0.2 {
            continue;
        }
        let friends = &o.friends;
        if friends.is_empty() {
            continue;
        }
        let (ox, oy) = (o.x, o.y);
        let my_lid = o.lineage_id.clone();
        let mut best: Option<(f32, f32, f32)> = None;
        for friend_id in friends.keys() {
            let f = sim.organisms.iter().find(|p| &p.id == friend_id);
            if let Some(f) = f {
                if !f.alive {
                    continue;
                }
                if f.lineage_id != my_lid {
                    continue;
                }
                let d = (f.x - ox).abs() + (f.y - oy).abs();
                if d > 80.0 || d < 6.0 {
                    continue;
                }
                if let Some((b, _, _)) = best {
                    if d < b {
                        best = Some((d, f.x, f.y));
                    }
                } else {
                    best = Some((d, f.x, f.y));
                }
            }
        }
        if let Some((_, fx, fy)) = best {
            let dx = (fx - ox).signum() * 0.4;
            let dy = (fy - oy).signum() * 0.4;
            moves.push((i, dx, dy));
        }
    }
    for (i, dx, dy) in moves {
        sim.organisms[i].x += dx;
        sim.organisms[i].y += dy;
    }
}

fn tick_teaching(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let mut transfers: Vec<(usize, String)> = Vec::with_capacity(8);
    for i in 0..n {
        let elder = &sim.organisms[i];
        if !elder.alive || elder.age_stage() != AgeStage::Elder && elder.age_stage() != AgeStage::Adult {
            continue;
        }
        if elder.discoveries.is_empty() {
            continue;
        }
        let elder_lid = elder.lineage_id.clone();
        let elder_x = elder.x;
        let elder_y = elder.y;
        let teach_strength = elder.traits.social_tendency * 0.5 + 0.3;
        for j in 0..n {
            if i == j {
                continue;
            }
            let child = &sim.organisms[j];
            if !child.alive {
                continue;
            }
            if child.lineage_id != elder_lid {
                continue;
            }
            if !matches!(child.age_stage(), AgeStage::Child | AgeStage::Teen) {
                continue;
            }
            let dist = (child.x - elder_x).abs() + (child.y - elder_y).abs();
            if dist > 4.0 {
                continue;
            }
            let r: f32 = sim.rng.random();
            if r > teach_strength * 0.20 {
                continue;
            }
            let known: Vec<String> = sim.organisms[i]
                .discoveries
                .difference(&sim.organisms[j].discoveries)
                .cloned()
                .collect();
            if known.is_empty() {
                continue;
            }
            let pick = known[sim.rng.random_range(0..known.len())].clone();
            transfers.push((j, pick));
        }
    }
    for (idx, name) in transfers {
        if sim.organisms[idx].discoveries.insert(name.clone()) {
            let oname = sim.organisms[idx].name.clone();
            push_event(
                &mut sim.events,
                tick,
                "build",
                &oname,
                &format!("learned {} from an elder", name.replace('_', " ")),
            );
        }
    }
}

fn tick_aurora_sighting(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if !sim.is_night() {
        return;
    }
    let season = sim.season();
    if season != "scarcity" && season != "recovery" {
        return;
    }
    let r: f32 = sim.rng.random();
    if r > 0.025 {
        return;
    }
    let alive_n = sim.organisms.iter().filter(|o| o.alive).count();
    if alive_n == 0 {
        return;
    }
    push_event(
        &mut sim.events,
        tick,
        "sky",
        "world",
        "the night sky rippled with green and violet curtains",
    );
    sim.headlines.push_back((
        tick,
        "the people watched green light dance across the cold sky".to_string(),
    ));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
    let pick_n = (alive_n / 6).max(1).min(40);
    let mut picked = 0usize;
    for o in sim.organisms.iter_mut() {
        if !o.alive || picked >= pick_n {
            continue;
        }
        if sim.rng.random::<f32>() > pick_n as f32 / alive_n as f32 {
            continue;
        }
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "I saw green and violet curtains breathing across the night sky",
            tick,
        )
        .with_salience(0.82)
        .with_emotion(2);
        o.memories.insert(entry);
        o.joy_ticks = (o.joy_ticks + 25).min(1200);
        picked += 1;
    }
}

fn tick_meteor_shower(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if !sim.is_night() {
        return;
    }
    let r: f32 = sim.rng.random();
    if r > 0.015 {
        return;
    }
    let alive_count = sim.organisms.iter().filter(|o| o.alive).count();
    if alive_count == 0 {
        return;
    }
    let pick_n = (alive_count / 8).max(1).min(20);
    let mut picked = 0;
    for o in sim.organisms.iter_mut() {
        if !o.alive || picked >= pick_n {
            continue;
        }
        if sim.rng.random::<f32>() > pick_n as f32 / alive_count as f32 {
            continue;
        }
        let entry = MemoryEntry::new(
            MemoryKind::Episode,
            "stars fell across the sky tonight — I made a wish",
            tick,
        )
        .with_salience(0.78)
        .with_emotion(2);
        o.memories.insert(entry);
        o.joy_ticks = (o.joy_ticks + 30).min(1200);
        picked += 1;
    }
    push_event(
        &mut sim.events,
        tick,
        "sky",
        "world",
        "a meteor shower lit the night",
    );
    sim.headlines
        .push_back((tick, "stars fell across the sky — many made wishes".to_string()));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
}

fn tick_mood_contagion(sim: &mut Simulation) {
    use crate::sim::spatial::SpatialIndex;
    let spatial = SpatialIndex::build(&sim.organisms, 10);
    let snapshot: Vec<(usize, f32, f32, String)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| (i, o.x, o.y, o.lineage_id.clone()))
        .collect();
    let mut deltas: Vec<(usize, i32, i32, f32)> = Vec::with_capacity(snapshot.len());
    let mut buf: Vec<usize> = Vec::with_capacity(16);
    for (i, x, y, lid) in &snapshot {
        buf.clear();
        spatial.query_into(*x as i32, *y as i32, 3, &mut buf);
        let mut kin_joy: u32 = 0;
        let mut kin_grief: u32 = 0;
        for &j in buf.iter() {
            if j == *i {
                continue;
            }
            let o = &sim.organisms[j];
            if !o.alive || o.lineage_id != *lid {
                continue;
            }
            if (o.x - x).abs() + (o.y - y).abs() > 3.0 {
                continue;
            }
            kin_joy = kin_joy.saturating_add(o.joy_ticks);
            kin_grief = kin_grief.saturating_add(o.grief_ticks);
        }
        let mut djoy = 0i32;
        let mut dgrief = 0i32;
        let mut dcomf = 0.0f32;
        if kin_joy > 600 {
            dgrief -= 1;
            djoy += 4;
            dcomf += 0.002;
        }
        if kin_grief > 200 {
            djoy -= 2;
            dcomf -= 0.001;
        }
        if djoy != 0 || dgrief != 0 || dcomf != 0.0 {
            deltas.push((*i, djoy, dgrief, dcomf));
        }
    }
    for (i, djoy, dgrief, dcomf) in deltas {
        let me = &mut sim.organisms[i];
        if djoy < 0 {
            me.joy_ticks = me.joy_ticks.saturating_sub((-djoy) as u32);
        } else if djoy > 0 {
            me.joy_ticks = (me.joy_ticks + djoy as u32).min(1200);
        }
        if dgrief < 0 {
            me.grief_ticks = me.grief_ticks.saturating_sub((-dgrief) as u32);
        } else if dgrief > 0 {
            me.grief_ticks = (me.grief_ticks + dgrief as u32).min(400);
        }
        if dcomf != 0.0 {
            me.comfort = (me.comfort + dcomf).clamp(0.0, 1.0);
        }
    }
}

fn tick_anniversaries(sim: &mut Simulation) {
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

fn tick_dreams(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let slot = (tick / 90) as usize % 11;
    let mut dreamed = 0usize;
    for i in 0..n {
        if i % 11 != slot {
            continue;
        }
        let o = &sim.organisms[i];
        if !o.alive {
            continue;
        }
        if o.sleep_debt < 0.10 {
            continue;
        }

        let prompts: Vec<(crate::organism::memory::MemoryKind, String, i8)> = o
            .memories
            .top(8)
            .into_iter()
            .filter(|m| m.salience > 0.30)
            .map(|m| (m.kind, m.text.clone(), m.emotion))
            .collect();
        if prompts.len() < 2 {
            continue;
        }

        let (a_idx, b_idx) = (
            (tick as usize ^ i) % prompts.len(),
            (tick as usize ^ (i * 17 + 3)) % prompts.len(),
        );
        if a_idx == b_idx {
            continue;
        }
        let (_, ta, ea) = &prompts[a_idx];
        let (_, tb, _) = &prompts[b_idx];
        let lower_a = ta.trim_end_matches('.').to_lowercase();
        let lower_b = tb.trim_end_matches('.').to_lowercase();
        let dream_text = match (tick + i as u64) % 4 {
            0 => format!("a dream where {} and {}", lower_a, lower_b),
            1 => format!("a dream — {} and the {} together", lower_a, lower_b),
            2 => format!("a strange dream: {}, then {}", lower_a, lower_b),
            _ => format!("a dream of {}, somehow tangled with {}", lower_a, lower_b),
        };
        let entry = MemoryEntry::new(MemoryKind::Dream, dream_text, tick)
            .with_salience(0.30 + sim.organisms[i].sleep_debt * 0.3)
            .with_emotion((*ea as i32 / 2).clamp(-2, 2) as i8);
        sim.organisms[i].memories.insert(entry);
        sim.organisms[i].sleep_debt = (sim.organisms[i].sleep_debt - 0.02).max(0.0);
        dreamed += 1;
    }
    let _ = dreamed;
}

fn tick_lunar_observation(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::cosmos::{moon_phase_at, MoonPhase};
    let tick = sim.tick_count;
    let phase = moon_phase_at(tick);
    let yesterday_phase = moon_phase_at(tick.saturating_sub(crate::sim::cosmos::DAY_LENGTH));
    if phase == yesterday_phase {
        return;
    }
    let text = match phase {
        MoonPhase::FullMoon => "the moon stood full and bright",
        MoonPhase::NewMoon => "the moon went dark tonight",
        MoonPhase::FirstQuarter => "the moon hung half-lit, growing",
        MoonPhase::LastQuarter => "the moon hung half-lit, fading",
        MoonPhase::WaxingCrescent => "the moon returned, a thin curve",
        MoonPhase::WaxingGibbous => "the moon was nearly full",
        MoonPhase::WaningGibbous => "the moon was full no more",
        MoonPhase::WaningCrescent => "the moon thinned to a sliver",
    };
    let (mem_kind, emotion, salience) = match phase {
        MoonPhase::FullMoon => (MemoryKind::Episode, 1, 0.55),
        MoonPhase::NewMoon => (MemoryKind::Episode, -1, 0.45),
        _ => (MemoryKind::Fact, 0, 0.40),
    };
    let mut wrote = 0;
    for o in sim.organisms.iter_mut() {
        if !o.alive {
            continue;
        }
        let entry = MemoryEntry::new(mem_kind, text, tick)
            .with_salience(salience)
            .with_emotion(emotion);
        o.memories.insert(entry);
        if matches!(phase, MoonPhase::FullMoon) {
            o.joy_ticks = (o.joy_ticks + 18).min(1200);
        } else if matches!(phase, MoonPhase::NewMoon) {
            o.fear_level = (o.fear_level + 0.02).min(1.0);
        }
        wrote += 1;
    }
    if wrote > 0 {
        push_event(&mut sim.events, tick, "sky", "world", text);
        if matches!(phase, MoonPhase::FullMoon | MoonPhase::NewMoon) {
            sim.headlines.push_back((tick, text.to_string()));
            while sim.headlines.len() > 80 {
                sim.headlines.pop_front();
            }
        }
        if matches!(phase, MoonPhase::NewMoon) {
            let cycle_ticks = crate::sim::cosmos::LUNAR_CYCLE_TICKS;
            for o in sim.organisms.iter_mut() {
                if !o.alive {
                    continue;
                }
                if o.birth_tick == 0 || tick < o.birth_tick + cycle_ticks {
                    continue;
                }
                if o.attributes.contains("milestone:lunar_cycle") {
                    continue;
                }
                o.attributes.insert("milestone:lunar_cycle".to_string());
                o.memories.insert(
                    MemoryEntry::new(
                        MemoryKind::Fact,
                        "I have seen the moon turn its full circle",
                        tick,
                    )
                    .with_salience(0.90)
                    .with_emotion(2),
                );
                o.joy_ticks = (o.joy_ticks + 60).min(1200);
            }
        }
    }
}

fn tick_reflections(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let mut hashes: Vec<(usize, u8)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.age > 600)
        .map(|(i, o)| {
            let mut h: u64 = 1469598103934665603;
            for b in o.id.bytes() {
                h ^= b as u64;
                h = h.wrapping_mul(1099511628211);
            }
            (i, ((h ^ tick) % 7) as u8)
        })
        .collect();
    hashes.retain(|&(_, slot)| slot == 0);
    for (i, _) in hashes {
        sim.organisms[i].reflect_internally(tick);
    }
}

fn tick_sky_omens(sim: &mut Simulation) {
    if !sim.is_night() {
        return;
    }
    let r: f32 = sim.rng.random();
    let (label, joy_bump, fear_bump): (&str, u32, f32) = if r < 0.012 {
        ("a meteor split the sky", 40, 0.04)
    } else if r < 0.06 {
        ("a shooting star streaked overhead", 35, 0.0)
    } else if r < 0.10 {
        ("strange lights danced in the sky", 28, 0.0)
    } else {
        return;
    };

    let tick = sim.tick_count;
    let mut seen_any = false;
    for o in sim.organisms.iter_mut() {
        if !o.alive {
            continue;
        }
        let near_shelter_blocks = false;
        if near_shelter_blocks {
            continue;
        }
        o.joy_ticks = (o.joy_ticks + joy_bump).min(1200);
        if fear_bump > 0.0 {
            o.fear_level = (o.fear_level + fear_bump).min(1.0);
        }
        o.log_life(tick, "witnessed", label.to_string());
        seen_any = true;
    }
    if seen_any {
        push_event(&mut sim.events, tick, "sky", "world", label);
    }
}

/// Broadcast significant events to nearby kin via per-org life_log
/// entries. When something memorable happens — a birth, a partnership,
/// a discovery, a death — kin within range write it into their own
/// chronicle. Makes the world feel socially connected.
///
/// Reads sim.events for the last interval and projects events with a
/// recent tick onto kin in range. Tracks last broadcast tick on
/// Simulation so we don't double-broadcast.
fn tick_witnessed_events(sim: &mut Simulation) {
    let now = sim.tick_count;
    let last = sim.last_witness_tick;
    sim.last_witness_tick = now;
    if last == 0 {
        return;
    }

    let n = sim.organisms.len();
    let mut by_name: HashMap<String, usize> = HashMap::with_capacity(n);
    let mut by_lineage: HashMap<String, Vec<usize>> =
        HashMap::with_capacity(sim.lineage_names.len().max(8));
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        by_name.insert(o.name.clone(), i);
        by_lineage.entry(o.lineage_id.clone()).or_default().push(i);
    }

    // Pull recent broadcast-worthy events.
    let events_snapshot: Vec<(u64, String, String, String)> = sim
        .events
        .iter()
        .filter(|e| e.tick >= last)
        .filter(|e| {
            matches!(
                e.etype.as_str(),
                "born"
                    | "death"
                    | "religion_founded"
                    | "religion"
                    | "war_declared"
                    | "battle_began"
                    | "treaty"
                    | "build"
                    | "milestone"
                    | "specialty"
                    | "graduated"
                    | "government_changed"
                    | "aspiration"
            )
        })
        .map(|e| (e.tick, e.etype.clone(), e.actor.clone(), e.detail.clone()))
        .collect();

    if events_snapshot.is_empty() {
        return;
    }

    // For each event with an actor we can resolve to a living org,
    // broadcast a short witnessed entry to lineage-mates within radius.
    const WITNESS_RADIUS: f32 = 24.0;
    for (tick, etype, actor_name, detail) in events_snapshot {
        let Some(&actor_idx) = by_name.get(&actor_name) else {
            continue;
        };
        let (ax, ay) = (sim.organisms[actor_idx].x, sim.organisms[actor_idx].y);
        let lineage = sim.organisms[actor_idx].lineage_id.clone();
        let actor_id = sim.organisms[actor_idx].id.clone();
        let Some(kin) = by_lineage.get(&lineage) else {
            continue;
        };

        let phrase = match etype.as_str() {
            "born" => format!("saw {} take their first breath", actor_name),
            "death" => format!("watched {} pass", actor_name),
            "religion_founded" | "religion" => format!("learned of {}: {}", actor_name, detail),
            "war_declared" => format!("heard war drums from {}", actor_name),
            "battle_began" => format!("heard of battle: {}", detail),
            "treaty" => format!("heard of a treaty signed by {}", actor_name),
            "build" => format!("heard that {} {}", actor_name, detail),
            "milestone" => format!("witnessed an age turn: {}", detail),
            "specialty" => format!("saw {} take up a trade: {}", actor_name, detail),
            "graduated" => format!("heard {} earned a degree: {}", actor_name, detail),
            "government_changed" => format!("saw the people choose: {}", detail),
            "aspiration" => format!("noticed {} {}", actor_name, detail),
            _ => continue,
        };

        for &ki in kin {
            if ki == actor_idx {
                continue;
            }
            let (kx, ky) = (sim.organisms[ki].x, sim.organisms[ki].y);
            let d = (kx - ax).abs() + (ky - ay).abs();
            if d > WITNESS_RADIUS {
                continue;
            }
            sim.organisms[ki].log_life_rel(
                tick,
                "witnessed",
                phrase.clone(),
                Some(actor_id.clone()),
                Some(actor_name.clone()),
            );
            // Witnessing big moments stirs mood.
            match etype.as_str() {
                "born" | "religion_founded" | "build" | "specialty" | "graduated" | "milestone" => {
                    sim.organisms[ki].joy_ticks = (sim.organisms[ki].joy_ticks + 40).min(1200);
                }
                "death" => {
                    sim.organisms[ki].grief_ticks = (sim.organisms[ki].grief_ticks + 25).min(400);
                    sim.organisms[ki].comfort = (sim.organisms[ki].comfort - 0.04).max(0.0);
                }
                "war_declared" | "battle_began" => {
                    sim.organisms[ki].fear_level = (sim.organisms[ki].fear_level + 0.06).min(1.0);
                    sim.organisms[ki].comfort = (sim.organisms[ki].comfort - 0.03).max(0.0);
                }
                "treaty" => {
                    sim.organisms[ki].joy_ticks = (sim.organisms[ki].joy_ticks + 25).min(1200);
                    sim.organisms[ki].fear_level = (sim.organisms[ki].fear_level - 0.02).max(0.0);
                }
                _ => {}
            }
        }
    }
}

const FURNITURE_POOL: &[(&str, &[&str], &str)] = &[
    ("hearth", &[], "stone"),
    ("mat", &[], "pre-stone"),
    ("storage", &[], "stone"),
    ("bench", &[], "bronze"),
    ("loom", &["weaving"], "bronze"),
    ("anvil", &["smelting"], "bronze"),
    ("table", &[], "classical"),
    ("shelf", &[], "classical"),
    ("rug", &["weaving"], "classical"),
    ("oil_lamp", &["fire"], "iron"),
    ("clay_pot", &["pottery"], "bronze"),
    ("wine_jug", &["brewing"], "bronze"),
    ("painting", &[], "renaissance"),
    ("bookshelf", &["writing"], "iron"),
    ("writing_desk", &["writing"], "iron"),
    ("wardrobe", &["weaving"], "medieval"),
    ("mirror", &["glass"], "renaissance"),
    ("vase_flowers", &[], "classical"),
    ("potted_plant", &[], "renaissance"),
    ("fireplace", &["fire"], "medieval"),
    ("four_poster_bed", &[], "medieval"),
    ("armchair", &[], "industrial"),
    ("piano", &["printing"], "industrial"),
    ("gramophone", &["electricity_generation"], "industrial"),
    ("clock", &["mathematics"], "renaissance"),
    ("globe", &["cartography"], "renaissance"),
    ("telescope_decor", &["telescope"], "renaissance"),
    ("radio_set", &["radio"], "modern"),
    ("television", &["television"], "modern"),
    ("refrigerator", &["refrigeration"], "modern"),
    ("sofa", &[], "modern"),
    ("coffee_table", &[], "modern"),
    ("desk_lamp", &["electricity"], "modern"),
    ("computer_desk", &["computer"], "information"),
    ("monitor", &["computer"], "information"),
    ("smart_speaker", &["AI"], "information"),
    ("standing_plant", &[], "modern"),
    ("art_print", &["printing"], "industrial"),
    ("photo_frame", &["photography"], "industrial"),
    ("kitchen_stove", &["electricity"], "modern"),
];

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
                "telescope_decor" | "monitor" | "computer_desk" => curiosity > 0.55,
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

fn tick_cross_lineage_knowledge(sim: &mut Simulation) {
    let snapshot: Vec<(usize, f32, f32, String, Vec<String>)> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive)
        .map(|(i, o)| {
            (
                i,
                o.x,
                o.y,
                o.lineage_id.clone(),
                o.discoveries.iter().cloned().collect(),
            )
        })
        .collect();

    let mut to_grant: Vec<(usize, String)> = Vec::new();
    for i in 0..snapshot.len() {
        let (_, ax, ay, alid, _) = &snapshot[i];
        for j in 0..snapshot.len() {
            if i == j {
                continue;
            }
            let (_, bx, by, blid, bdisc) = &snapshot[j];
            if alid == blid {
                continue;
            }
            let d = (ax - bx).abs() + (ay - by).abs();
            if d > 4.0 {
                continue;
            }
            let (_, _, _, _, adisc) = &snapshot[i];
            let learnable: Vec<&String> = bdisc.iter().filter(|d| !adisc.contains(d)).collect();
            if learnable.is_empty() {
                continue;
            }
            let pick = learnable[(sim.tick_count as usize + i + j) % learnable.len()];
            if sim.rng.random::<f32>() < 0.08 {
                to_grant.push((snapshot[i].0, pick.clone()));
            }
            break;
        }
    }

    let tick_now = sim.tick_count;
    let mut events: Vec<(String, String, String)> = Vec::new();
    for (i, disc) in to_grant {
        let o = &mut sim.organisms[i];
        if !o.alive || o.discoveries.contains(&disc) {
            continue;
        }
        o.discoveries.insert(disc.clone());
        events.push((o.name.clone(), o.lineage_id.clone(), disc));
    }
    for (name, _lid, disc) in events {
        push_event(
            &mut sim.events,
            tick_now,
            "build",
            &name,
            &format!("learned {} from an outsider", disc.replace('_', " ")),
        );
    }
}

fn lineage_era(sim: &Simulation, lid: &str) -> Era {
    sim.lineage_eras.get(lid).copied().unwrap_or(Era::PreStone)
}

fn lineage_pop(sim: &Simulation, lid: &str) -> usize {
    sim.organisms
        .iter()
        .filter(|o| o.alive && o.lineage_id == lid)
        .count()
}

fn tick_age_stages(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
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

fn tick_wealth(sim: &mut Simulation) {
    let era_map: HashMap<String, Era> = sim.lineage_eras.clone();
    for org in sim.organisms.iter_mut() {
        if !org.alive {
            continue;
        }
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
            let s = workshop_pull(b.kind)?;
            let (fw, fh) = b.kind.footprint();
            let bx = b.x as f32 + fw as f32 / 2.0;
            let by = b.y as f32 + fh as f32 / 2.0;
            Some((bx, by, b.owner_lineage.clone(), s))
        })
        .collect();

    let traits_clone: Vec<(usize, f32, f32, f32, f32, f32, String, bool)> = sim
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
        .filter(|b| matches!(b.kind, BuildingKind::School))
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
        .filter(|b| matches!(b.kind, BuildingKind::University))
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

fn tick_buildings_construct(sim: &mut Simulation) {
    let mut new_buildings: Vec<Building> = Vec::new();
    let alive_lineages: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    for lid in alive_lineages {
        let era = lineage_era(sim, &lid);
        let pop = lineage_pop(sim, &lid);
        if pop < 5 {
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
            .filter(|b| b.owner_lineage.as_deref() == Some(&lid))
            .map(|b| b.kind)
            .collect();
        for _ in 0..builds_this_pass {
            let target = next_target_building(era, pop, &existing);
            let Some(kind) = target else { break };
            existing.insert(kind);
            let (cx, cy) = lineage_center(sim, &lid);
            if cx == 0 && cy == 0 {
                break;
            }
            let offset_x = (sim.next_building_id as i32 * 3) % 16 - 8;
            let offset_y = (sim.next_building_id as i32 * 5) % 14 - 7;
            let id = sim.next_building_id;
            sim.next_building_id += 1;
            new_buildings.push(Building::new(
                id,
                kind,
                cx + offset_x,
                cy + offset_y,
                Some(lid.clone()),
                sim.tick_count,
            ));
            let kn = kind.name().to_string();
            push_event(
                &mut sim.events,
                sim.tick_count,
                "built",
                &lid,
                &format!("built a {}", kn),
            );
        }
    }
    sim.buildings.extend(new_buildings);
    cap_buildings(sim);
}

fn cap_buildings(sim: &mut Simulation) {
    const BUILDINGS_CAP: usize = 1500;
    if sim.buildings.len() > BUILDINGS_CAP {
        let excess = sim.buildings.len() - BUILDINGS_CAP;
        sim.buildings.drain(0..excess);
    }
}

fn tick_building_progress(sim: &mut Simulation) {
    if sim.buildings.is_empty() {
        return;
    }
    let snapshot: Vec<(f32, f32, String)> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| (o.x, o.y, o.lineage_id.clone()))
        .collect();
    for b in sim.buildings.iter_mut() {
        if b.condition >= 1.0 {
            continue;
        }
        let owner = match &b.owner_lineage {
            Some(s) => s.clone(),
            None => continue,
        };
        let bx = b.x as f32;
        let by = b.y as f32;
        let mut workers = 0u32;
        for (ox, oy, lid) in snapshot.iter() {
            if lid != &owner {
                continue;
            }
            if (ox - bx).abs() + (oy - by).abs() < 5.0 {
                workers += 1;
            }
        }
        if workers == 0 {
            continue;
        }
        let progress = 0.015 * (workers as f32).sqrt().min(3.0);
        b.condition = (b.condition + progress).min(1.0);
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
        new_buildings.push(Building::new(
            id,
            kind,
            cx + dx,
            cy + dy,
            Some(lid.clone()),
            sim.tick_count,
        ));
    }
    sim.buildings.extend(new_buildings);
    cap_buildings(sim);
}

fn next_target_building(era: Era, pop: usize, existing: &HashSet<BuildingKind>) -> Option<BuildingKind> {
    use BuildingKind::*;
    let mut wishlist: Vec<BuildingKind> = Vec::new();
    if era >= Era::Stone && pop >= 3 {
        wishlist.push(Hut);
        wishlist.push(Tent);
        wishlist.push(Well);
        wishlist.push(Signpost);
        wishlist.push(Shrine);
    }
    if era >= Era::Stone && pop >= 6 {
        wishlist.push(Watchtower);
        wishlist.push(Fence);
        wishlist.push(Gate);
        wishlist.push(Cart);
    }
    if era >= Era::Bronze && pop >= 8 {
        wishlist.push(House);
        wishlist.push(Forge);
        wishlist.push(Granary);
        wishlist.push(MarketStall);
        wishlist.push(Smithy);
    }
    if era >= Era::Bronze && pop >= 10 {
        wishlist.push(Quarry);
        wishlist.push(Mine);
        wishlist.push(SawMill);
        wishlist.push(Tannery);
        wishlist.push(Stable);
    }
    if era >= Era::Bronze && pop >= 12 {
        wishlist.push(Temple);
        wishlist.push(Garden);
        wishlist.push(Orchard);
        wishlist.push(Pond);
        wishlist.push(Cemetery);
        wishlist.push(Monument);
        wishlist.push(Obelisk);
    }
    if era >= Era::Iron && pop >= 15 {
        wishlist.push(Market);
        wishlist.push(Workshop);
        wishlist.push(Plaza);
        wishlist.push(Port);
        wishlist.push(FoodCart);
    }
    if era >= Era::Iron && pop >= 18 {
        wishlist.push(Butcher);
        wishlist.push(Fishmonger);
        wishlist.push(Cheesemonger);
        wishlist.push(Herbalist);
        wishlist.push(Tailor);
        wishlist.push(Cobbler);
        wishlist.push(Goldsmith);
    }
    if era >= Era::Classical && pop >= 18 {
        wishlist.push(School);
        wishlist.push(Library);
        wishlist.push(Bridge);
        wishlist.push(Bathhouse);
        wishlist.push(Pyramid);
        wishlist.push(Ziggurat);
        wishlist.push(Coliseum);
        wishlist.push(TriumphalArch);
    }
    if era >= Era::Classical && pop >= 22 {
        wishlist.push(Aqueduct);
        wishlist.push(Observatory);
        wishlist.push(ClockTower);
        wishlist.push(Mausoleum);
        wishlist.push(Pavilion);
        wishlist.push(Gazebo);
        wishlist.push(Bandstand);
    }
    if era >= Era::Medieval && pop >= 25 {
        wishlist.push(Manor);
        wishlist.push(Mill);
        wishlist.push(Castle);
        wishlist.push(Tavern);
        wishlist.push(Brewery);
        wishlist.push(Apothecary);
        wishlist.push(Jeweler);
        wishlist.push(Scribe);
    }
    if era >= Era::Medieval && pop >= 30 {
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
    if era >= Era::Renaissance && pop >= 40 {
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
    if era >= Era::Renaissance && pop >= 45 {
        wishlist.push(Bank);
        wishlist.push(Courthouse);
        wishlist.push(CityHall);
        wishlist.push(PostOffice);
        wishlist.push(Greenhouse);
        wishlist.push(Marina);
        wishlist.push(Drydock);
    }
    if era >= Era::Industrial && pop >= 60 {
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
    if era >= Era::Industrial && pop >= 70 {
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
    if era >= Era::Modern && pop >= 100 {
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
    if era >= Era::Modern && pop >= 120 {
        wishlist.push(Airport);
        wishlist.push(Greenhouse2);
        wishlist.push(MushroomFarm);
        wishlist.push(Aquaculture);
    }
    if era >= Era::Information && pop >= 140 {
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
    if era >= Era::Atomic && pop >= 160 {
        wishlist.push(RadioTower);
        wishlist.push(SatelliteDish);
        wishlist.push(Spaceport);
        wishlist.push(SolarArray);
        wishlist.push(WindFarm);
    }
    if era >= Era::Digital && pop >= 180 {
        wishlist.push(NeuralHub);
        wishlist.push(AiCore);
        wishlist.push(ResearchLab);
        wishlist.push(HoloBoard);
    }
    if era >= Era::Fusion && pop >= 220 {
        wishlist.push(FusionPlant);
        wishlist.push(OrbitalLift);
        wishlist.push(Biodome);
        wishlist.push(Cryolab);
        wishlist.push(NanoFab);
    }
    if era >= Era::Solar && pop >= 240 {
        wishlist.push(Hyperloop);
        wishlist.push(Maglev);
        wishlist.push(Hospital2);
    }
    if era >= Era::Galactic && pop >= 450 {
        wishlist.push(Megastructure);
    }
    for k in wishlist {
        if !existing.contains(&k) {
            return Some(k);
        }
    }
    None
}

fn lineage_center(sim: &Simulation, lid: &str) -> (i32, i32) {
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
            let g = Government::new(lid.clone(), target_kind, sim.tick_count);
            sim.governments.insert(lid.clone(), g);
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
    for lid in lineages {
        let Some(g) = sim.governments.get(lid) else {
            continue;
        };
        let kind = g.kind;
        if kind.leader_count() == 0 {
            continue;
        }
        let want = kind.leader_count() as usize;
        let mut candidates: Vec<(usize, f32)> = Vec::new();
        for (i, o) in sim.organisms.iter().enumerate() {
            if !o.alive || o.lineage_id != *lid {
                continue;
            }
            if o.age_stage() != AgeStage::Adult && o.age_stage() != AgeStage::Elder {
                continue;
            }
            let score =
                o.traits.social_tendency + o.traits.memory_strength + o.traits.curiosity + (o.literacy * 0.5);
            candidates.push((i, score));
        }
        candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let leaders: Vec<usize> = candidates.iter().take(want).map(|c| c.0).collect();
        for o in sim.organisms.iter_mut() {
            if o.lineage_id == *lid {
                o.is_leader = false;
            }
        }
        let leader_id = leaders.first().map(|&i| sim.organisms[i].id.clone());
        let council_ids: Vec<String> = leaders
            .iter()
            .skip(1)
            .map(|&i| sim.organisms[i].id.clone())
            .collect();
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
            if k.era_unlock() <= era && !existing_kinds.contains(&k) {
                if sim.rng.random::<f32>() < 0.08 {
                    let id = format!("rel{}", sim.next_religion_id);
                    sim.next_religion_id += 1;
                    let name = pick_religion_name(sim.tick_count + (lid.len() as u64)).to_string();
                    sim.religions.push(Religion {
                        id: id.clone(),
                        kind: k,
                        name: name.clone(),
                        founded_tick: sim.tick_count,
                        founder_lineage: lid.clone(),
                        adherents: 1,
                        last_milestone: None,
                    });
                    push_event(
                        &mut sim.events,
                        sim.tick_count,
                        "religion_founded",
                        &lid,
                        &format!("founded {} ({})", name, k.name()),
                    );
                    let tick = sim.tick_count;
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
            }
        }
    }
    for r in sim.religions.iter_mut() {
        if let Some(n) = adherents_by_id.get(&r.id) {
            r.adherents = (*n).max(1);
        }
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
            matches!(
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
        .any(|b| matches!(b.kind, BuildingKind::School))
    {
        new_ms.push(Milestone::FirstSchool);
    }
    if sim
        .buildings
        .iter()
        .any(|b| matches!(b.kind, BuildingKind::University))
    {
        new_ms.push(Milestone::FirstUniversity);
    }
    if sim
        .buildings
        .iter()
        .any(|b| matches!(b.kind, BuildingKind::Factory))
    {
        new_ms.push(Milestone::FirstFactory);
    }
    if sim
        .buildings
        .iter()
        .any(|b| matches!(b.kind, BuildingKind::Hospital))
    {
        new_ms.push(Milestone::FirstHospital);
    }
    if sim
        .buildings
        .iter()
        .any(|b| matches!(b.kind, BuildingKind::TrainStation))
    {
        new_ms.push(Milestone::FirstTrain);
    }
    if sim
        .buildings
        .iter()
        .any(|b| matches!(b.kind, BuildingKind::Airport))
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
