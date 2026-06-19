use crate::sim::age_stage::AgeStage;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;
use rand::Rng;
use std::collections::{HashMap, HashSet};

pub(super) fn tick_mood(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let mut partner_pos: HashMap<String, (f32, f32, String)> = HashMap::new();
    for o in sim.organisms.iter() {
        if o.alive {
            partner_pos.insert(o.id.clone(), (o.x, o.y, o.name.clone()));
        }
    }
    for i in 0..sim.organisms.len() {
        if !sim.organisms[i].alive {
            continue;
        }
        let roll: f32 = sim.rng.random();
        let org = &mut sim.organisms[i];
        let grief = (org.grief_ticks as f32 / 900.0).min(1.0);
        let joy = (org.joy_ticks as f32 / 600.0).min(1.0);
        let partner_alive = org
            .partner_id
            .as_ref()
            .map(|p| partner_pos.contains_key(p))
            .unwrap_or(false);
        let hunger_pressure = if org.energy < 0.3 { 0.25 } else { 0.0 };
        let mood = joy * 0.5 + org.comfort * 0.35 + org.health * 0.2 + if partner_alive { 0.15 } else { 0.0 }
            - grief * 0.85
            - org.fear_level * 0.45
            - org.loneliness * 0.35
            - org.boredom * 0.2
            - hunger_pressure;
        org.mood = mood.clamp(-1.5, 1.5);

        if tick < org.directive_until {
            continue;
        }
        if mood < -0.75 && roll < 0.30 {
            org.directive = "isolate".to_string();
            org.directive_until = tick + 300;
            org.think("everything feels heavy — I need to be alone", tick);
            if roll < 0.15 {
                org.memories.insert(
                    MemoryEntry::new(
                        MemoryKind::Episode,
                        "a darkness settled over me and I withdrew from everyone",
                        tick,
                    )
                    .with_salience(0.7)
                    .with_emotion(-2),
                );
                org.log_life(
                    tick,
                    "hardship",
                    "withdrew beneath a weight of sorrow".to_string(),
                );
            }
        } else if mood < -0.35 && roll < 0.35 {
            if org.fear_level > 0.5 {
                org.directive = "seek_help".to_string();
                org.directive_until = tick + 240;
                org.think("I can't face this alone", tick);
            } else {
                org.directive = "rest".to_string();
                org.directive_until = tick + 240;
                org.think("worn thin — I need rest", tick);
            }
        } else if mood > 0.55 && roll < 0.30 {
            if org.loneliness > 0.35 || org.boredom > 0.45 {
                org.directive = "socialize".to_string();
                org.directive_until = tick + 240;
                org.think("feeling light — I want company", tick);
            } else if org.traits.curiosity > 0.6 {
                org.directive = "explore".to_string();
                org.directive_until = tick + 240;
                org.think("a good day to see what's beyond the ridge", tick);
            }
        }

        if partner_alive && mood > -0.35 && roll > 0.55 {
            if let Some(pid) = org.partner_id.clone() {
                if let Some(&(px, py, ref pname)) = partner_pos.get(&pid) {
                    let dist = (px - org.x).abs() + (py - org.y).abs();
                    if dist > 30.0 {
                        org.wander_target = Some((px as i32, py as i32));
                        org.think(&format!("I miss {} — going to find them", pname), tick);
                    }
                }
            }
        }
    }
}

pub(super) fn tick_grudge_recall(sim: &mut Simulation) {
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

    let tick = sim.tick_count;
    for (i, x, y, foes) in snapshot {
        let mut bumps = 0u32;
        let mut reconciled: Vec<(String, String)> = Vec::new();
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
                let warmed = sim.organisms[i].org_trust.get(&other.id).copied().unwrap_or(0.0) > 0.15;
                if warmed {
                    reconciled.push((other.id.clone(), other.name.clone()));
                } else {
                    bumps += 1;
                }
            }
        }
        let me = &mut sim.organisms[i];
        if bumps > 0 {
            me.fear_level = (me.fear_level + 0.012 * bumps as f32).min(1.0);
            me.comfort = (me.comfort - 0.005 * bumps as f32).max(0.0);
        }
        for (fid, fname) in &reconciled {
            let mut healed = false;
            for m in me.memories.entries.iter_mut() {
                if m.emotion <= -2 && m.related_id.as_deref() == Some(fid.as_str()) {
                    m.salience -= 0.12;
                    if m.salience < 0.4 {
                        m.emotion = 0;
                        healed = true;
                    }
                }
            }
            if healed {
                me.log_life_rel(
                    tick,
                    "friendship",
                    format!("made peace with {}", fname),
                    Some(fid.clone()),
                    Some(fname.clone()),
                );
            }
        }
    }
}

pub(super) fn tick_partner_pillow_talk(sim: &mut Simulation) {
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

pub(super) fn tick_maybe_eclipse(sim: &mut Simulation) {
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

pub(super) fn tick_season_change(sim: &mut Simulation) {
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
    let pick_n = (alive_n / 10).clamp(1, 20);
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

pub(super) fn tick_spiritual_pilgrimage(sim: &mut Simulation) {
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

pub(super) fn tick_daily_summary(sim: &mut Simulation) {
    let tick = sim.tick_count;
    let day_len = crate::sim::cosmos::DAY_LENGTH;
    let phase = tick % day_len;
    if phase != day_len - 1 {
        return;
    }
    let day_idx = tick / day_len;
    if day_idx == 0 {
        return;
    }
    let alive = sim.organisms.iter().filter(|o| o.alive).count() as u64;
    let births_today = sim
        .organisms
        .iter()
        .filter(|o| o.alive && (o.age as u64) <= day_len)
        .count() as u64;
    let deaths_today = sim
        .organisms
        .iter()
        .filter(|o| !o.alive && tick.saturating_sub(o.last_story_tick) <= day_len)
        .count() as u64;
    let joyful = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.joy_ticks > 200)
        .count() as u64;
    let grief = sim
        .organisms
        .iter()
        .filter(|o| o.alive && o.grief_ticks > 100)
        .count() as u64;
    let lineage_count = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect::<HashSet<_>>()
        .len() as u64;

    let summary = format!(
        "day {} ended: {} alive across {} lineages — {} born, {} lost, {} joyful, {} grieving",
        day_idx, alive, lineage_count, births_today, deaths_today, joyful, grief,
    );
    push_event(&mut sim.events, tick, "daily", "world", &summary);
}

pub(super) fn tick_arguments(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::spatial::SpatialIndex;
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    if !sim.organisms.iter().any(|o| o.alive && o.anger >= 0.3) {
        return;
    }
    let spatial = SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    let mut events: Vec<(usize, usize)> = Vec::new();
    for i in 0..n {
        let o = &sim.organisms[i];
        if !o.alive || o.anger < 0.3 {
            continue;
        }
        // Each unordered pair is initiated by the angry lower-index member
        // (j > i), matching the original (i+1..n) scan — just neighborhood-
        // limited instead of full N.
        spatial.query_into(o.x as i32, o.y as i32, 2, &mut buf);
        for &j in buf.iter() {
            if j <= i {
                continue;
            }
            let p = &sim.organisms[j];
            if !p.alive || p.lineage_id != o.lineage_id {
                continue;
            }
            if (p.x - o.x).abs() + (p.y - o.y).abs() > 2.0 {
                continue;
            }
            let trust_io = o.org_trust.get(&p.id).copied().unwrap_or(0.0);
            let trust_oi = p.org_trust.get(&o.id).copied().unwrap_or(0.0);
            if trust_io > -0.2 && trust_oi > -0.2 {
                continue;
            }
            if sim.rng.random::<f32>() > 0.03 {
                continue;
            }
            events.push((i, j));
            break;
        }
    }
    for (i, j) in events {
        let n1 = sim.organisms[i].name.clone();
        let n2 = sim.organisms[j].name.clone();
        for idx in [i, j] {
            let other_id = if idx == i {
                sim.organisms[j].id.clone()
            } else {
                sim.organisms[i].id.clone()
            };
            let entry = MemoryEntry::new(
                MemoryKind::Episode,
                "we argued — raised voices we'll both regret",
                tick,
            )
            .with_salience(0.65)
            .with_emotion(-2)
            .with_related(other_id.clone());
            sim.organisms[idx].memories.insert(entry);
            sim.organisms[idx].regret = (sim.organisms[idx].regret + 0.04).min(1.0);
            sim.organisms[idx].fear_level = (sim.organisms[idx].fear_level + 0.02).min(1.0);
            let trust = sim.organisms[idx].org_trust.entry(other_id).or_insert(0.0);
            *trust = (*trust - 0.08).max(-1.0);
        }
        push_event(
            &mut sim.events,
            tick,
            "argument",
            &n1,
            &format!("argued with {}", n2),
        );
    }
}

pub(super) fn tick_reconciliations(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    use crate::sim::spatial::SpatialIndex;
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    if !sim.organisms.iter().any(|o| o.alive && o.regret >= 0.4) {
        return;
    }
    let spatial = SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    let mut events: Vec<(usize, usize)> = Vec::new();
    for i in 0..n {
        let o = &sim.organisms[i];
        if !o.alive || o.regret < 0.4 {
            continue;
        }
        spatial.query_into(o.x as i32, o.y as i32, 2, &mut buf);
        let candidate: Option<usize> = buf.iter().copied().find(|&j| {
            if j == i {
                return false;
            }
            let p = &sim.organisms[j];
            p.alive
                && p.lineage_id == o.lineage_id
                && (p.x - o.x).abs() + (p.y - o.y).abs() <= 2.0
                && o.org_trust.get(&p.id).copied().unwrap_or(0.0) < -0.1
        });
        if let Some(j) = candidate {
            if sim.rng.random::<f32>() < 0.06 {
                events.push((i, j));
            }
        }
    }
    for (i, j) in events {
        let n1 = sim.organisms[i].name.clone();
        let n2 = sim.organisms[j].name.clone();
        for idx in [i, j] {
            let other_id = if idx == i {
                sim.organisms[j].id.clone()
            } else {
                sim.organisms[i].id.clone()
            };
            let entry = MemoryEntry::new(
                MemoryKind::Episode,
                "we made peace — words I'd carried for weeks finally rested",
                tick,
            )
            .with_salience(0.78)
            .with_emotion(2)
            .with_related(other_id.clone());
            sim.organisms[idx].memories.insert(entry);
            sim.organisms[idx].regret = (sim.organisms[idx].regret * 0.4).max(0.0);
            sim.organisms[idx].joy_ticks = (sim.organisms[idx].joy_ticks + 30).min(1200);
            sim.organisms[idx].gratitude = (sim.organisms[idx].gratitude + 0.15).min(1.0);
            let trust = sim.organisms[idx].org_trust.entry(other_id).or_insert(0.0);
            *trust = (*trust + 0.18).min(1.0);
        }
        push_event(
            &mut sim.events,
            tick,
            "reconcile",
            &n1,
            &format!("made peace with {}", n2),
        );
    }
}

pub(super) fn tick_dream_sharing(sim: &mut Simulation) {
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

pub(super) fn tick_storyteller(sim: &mut Simulation) {
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

pub(super) fn tick_weddings(sim: &mut Simulation) {
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
            // A couple's wedding day is one of the 50 cadence-aligned
            // slots in a 30000-tick window, picked deterministically from
            // their ids. tick_weddings only runs at multiples of 600, so
            // the slot MUST be a multiple of 600 too — otherwise the exact
            // match could never land (the old `% 30_000` attractor matched
            // ~1/600 of couples and silently barred the rest).
            let hashsum = o.id.bytes().fold(0u32, |a, b| a.wrapping_add(b as u32))
                + p.id.bytes().fold(0u32, |a, b| a.wrapping_add(b as u32));
            let slot = ((hashsum as u64).wrapping_mul(17) % 50) * 600;
            if tick % 30_000 != slot {
                continue;
            }
            out.push((i, j, o.lineage_id.clone(), (o.x + p.x) * 0.5, (o.y + p.y) * 0.5));
        }
        out
    };
    if pairs.is_empty() {
        return;
    }
    let spatial = crate::sim::spatial::SpatialIndex::build(&sim.organisms, 8);
    let mut wbuf: Vec<usize> = Vec::with_capacity(32);
    let mut bumps: Vec<usize> = Vec::new();
    let mut headlines: Vec<String> = Vec::new();
    for (i, j, lid, cx, cy) in pairs.iter() {
        spatial.query_into(*cx as i32, *cy as i32, 6, &mut wbuf);
        let mut witnesses = 0;
        for &k in wbuf.iter() {
            if k == *i || k == *j {
                continue;
            }
            let o = &sim.organisms[k];
            if !o.alive || &o.lineage_id != lid {
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
        let elder_of_pair = if sim.organisms[*i].age >= sim.organisms[*j].age {
            *i
        } else {
            *j
        };
        let (hx, hy) = (
            sim.organisms[elder_of_pair].home_x,
            sim.organisms[elder_of_pair].home_y,
        );
        for &p in [i, j].iter() {
            let org = &mut sim.organisms[*p];
            org.home_x = hx;
            org.home_y = hy;
            org.attributes.insert("left_home".to_string());
        }
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

pub(super) fn tick_jealousy_rivalries(sim: &mut Simulation) {
    use crate::sim::spatial::SpatialIndex;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    // Only jealous orgs need a neighborhood scan; a spatial index turns
    // the old full O(N^2) rival search into an ~8-radius bucket query.
    let any_jealous = sim.organisms.iter().any(|o| o.alive && o.jealousy >= 0.4);
    if !any_jealous {
        return;
    }
    let spatial = SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    let mut attitude_drops: Vec<(usize, String, f32)> = Vec::new();
    for i in 0..n {
        let o = &sim.organisms[i];
        if !o.alive || o.jealousy < 0.4 {
            continue;
        }
        let (my_x, my_y) = (o.x, o.y);
        let my_lid = o.lineage_id.as_str();
        spatial.query_into(my_x as i32, my_y as i32, 8, &mut buf);
        for &j in buf.iter() {
            if j == i {
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

pub(super) fn tick_curiosity_exploration(sim: &mut Simulation) {
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
        let hash =
            o.id.bytes()
                .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        let angle = ((hash ^ sim.tick_count) as f32) * 0.0000014;
        let dist = 200.0 + o.curiosity_drive * 350.0;
        let tx = (o.x + angle.sin() * dist).round() as i32;
        let ty = (o.y + angle.cos() * dist).round() as i32;
        o.wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
        o.curiosity_drive = (o.curiosity_drive * 0.4).max(0.0);
    }
}

pub(super) fn tick_hopeful_aspiration(sim: &mut Simulation) {
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

pub(super) fn tick_awe_marvels(sim: &mut Simulation) {
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

pub(super) fn tick_gratitude_sharing(sim: &mut Simulation) {
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
            "gift",
            &gname,
            "shared their food with kin",
        );
    }
}

pub(super) fn tick_anger_outbursts(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    for o in sim.organisms.iter_mut() {
        if !o.alive || o.anger < 0.5 {
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

pub(super) fn tick_funerals(sim: &mut Simulation) {
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

pub(super) fn tick_naming_ceremonies(sim: &mut Simulation) {
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

pub(super) fn tick_festivals(sim: &mut Simulation) {
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

pub(super) fn tick_birth_celebrations(sim: &mut Simulation) {
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

pub(super) fn tick_evening_gathering(sim: &mut Simulation) {
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
    let mut buildings_by_lineage: HashMap<&str, Vec<(f32, f32)>> = HashMap::new();
    for b in sim.buildings.iter() {
        if b.condition < 0.4 {
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

pub(super) fn tick_friend_gravitation(sim: &mut Simulation) {
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    // O(1) friend resolution instead of a full organisms scan per friend.
    let mut id_to_idx: HashMap<&str, usize> = HashMap::with_capacity(n);
    for (idx, o) in sim.organisms.iter().enumerate() {
        if o.alive {
            id_to_idx.insert(o.id.as_str(), idx);
        }
    }
    let mut moves: Vec<(usize, f32, f32)> = Vec::new();
    for i in 0..n {
        let o = &sim.organisms[i];
        if !o.alive || o.loneliness < 0.4 || o.energy < 0.2 || o.friends.is_empty() {
            continue;
        }
        let (ox, oy) = (o.x, o.y);
        let my_lid = o.lineage_id.as_str();
        let mut best: Option<(f32, f32, f32)> = None;
        for friend_id in o.friends.keys() {
            let Some(&fi) = id_to_idx.get(friend_id.as_str()) else {
                continue;
            };
            let f = &sim.organisms[fi];
            if !f.alive {
                continue;
            }
            let same_lineage = f.lineage_id == my_lid;
            let friendly_cross_lineage = !same_lineage && o.attitude_toward(&f.lineage_id) >= -0.15;
            if !same_lineage && !friendly_cross_lineage {
                continue;
            }
            let d = (f.x - ox).abs() + (f.y - oy).abs();
            if !(6.0..=80.0).contains(&d) {
                continue;
            }
            match best {
                Some((b, _, _)) if d >= b => {}
                _ => best = Some((d, f.x, f.y)),
            }
        }
        if let Some((_, fx, fy)) = best {
            let dx = fx - ox;
            let dy = fy - oy;
            let step_x = if dx.abs() < f32::EPSILON {
                0.0
            } else {
                dx.signum() * 0.4
            };
            let step_y = if dy.abs() < f32::EPSILON {
                0.0
            } else {
                dy.signum() * 0.4
            };
            moves.push((i, step_x, step_y));
        }
    }
    for (i, dx, dy) in moves {
        sim.organisms[i].x += dx;
        sim.organisms[i].y += dy;
    }
}

pub(super) fn tick_teaching(sim: &mut Simulation) {
    use crate::sim::spatial::SpatialIndex;
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let any_teacher = sim.organisms.iter().any(|o| {
        o.alive && !o.discoveries.is_empty() && matches!(o.age_stage(), AgeStage::Elder | AgeStage::Adult)
    });
    if !any_teacher {
        return;
    }
    let spatial = SpatialIndex::build(&sim.organisms, 8);
    let mut buf: Vec<usize> = Vec::with_capacity(32);
    let mut transfers: Vec<(usize, String)> = Vec::with_capacity(8);
    for i in 0..n {
        let elder = &sim.organisms[i];
        if !elder.alive || !matches!(elder.age_stage(), AgeStage::Elder | AgeStage::Adult) {
            continue;
        }
        if elder.discoveries.is_empty() {
            continue;
        }
        let elder_lid = elder.lineage_id.clone();
        let elder_x = elder.x;
        let elder_y = elder.y;
        let teach_strength = elder.traits.social_tendency * 0.5 + 0.3;
        spatial.query_into(elder_x as i32, elder_y as i32, 4, &mut buf);
        for k in 0..buf.len() {
            let j = buf[k];
            if i == j {
                continue;
            }
            let child = &sim.organisms[j];
            if !child.alive || child.lineage_id != elder_lid {
                continue;
            }
            if !matches!(child.age_stage(), AgeStage::Child | AgeStage::Teen) {
                continue;
            }
            if (child.x - elder_x).abs() + (child.y - elder_y).abs() > 4.0 {
                continue;
            }
            let r: f32 = sim.rng.random();
            if r > teach_strength * 0.20 {
                continue;
            }
            // Reservoir-pick one discovery the child lacks, without
            // allocating the full set difference.
            let elder_d = &sim.organisms[i].discoveries;
            let child_d = &sim.organisms[j].discoveries;
            let mut chosen: Option<&String> = None;
            let mut seen = 0u32;
            for d in elder_d.iter() {
                if child_d.contains(d) {
                    continue;
                }
                seen += 1;
                if sim.rng.random_range(0..seen) == 0 {
                    chosen = Some(d);
                }
            }
            if let Some(name) = chosen {
                transfers.push((j, name.clone()));
            }
        }
    }
    for (idx, name) in transfers {
        if sim.organisms[idx].discoveries.insert(name.clone()) {
            let oname = sim.organisms[idx].name.clone();
            push_event(
                &mut sim.events,
                tick,
                "teach",
                &oname,
                &format!("learned {} from an elder", name.replace('_', " ")),
            );
        }
    }
}

pub(super) fn tick_aurora_sighting(sim: &mut Simulation) {
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
    let pick_n = (alive_n / 6).clamp(1, 40);
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

pub(super) fn tick_meteor_shower(sim: &mut Simulation) {
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
    let pick_n = (alive_count / 8).clamp(1, 20);
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

pub(super) fn tick_mood_contagion(sim: &mut Simulation) {
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

pub(super) fn tick_anniversaries(sim: &mut Simulation) {
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

pub(super) fn tick_dreams(sim: &mut Simulation) {
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

pub(super) fn tick_lunar_observation(sim: &mut Simulation) {
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

pub(super) fn tick_reflections(sim: &mut Simulation) {
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

pub(super) fn tick_sky_omens(sim: &mut Simulation) {
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
pub(super) fn tick_witnessed_events(sim: &mut Simulation) {
    let now = sim.tick_count;
    let last = sim.last_witness_tick;
    sim.last_witness_tick = now;
    if last == 0 {
        return;
    }

    let n = sim.organisms.len();
    let mut by_name: HashMap<String, usize> = HashMap::with_capacity(n);
    let mut by_lineage: HashMap<String, Vec<usize>> = HashMap::with_capacity(sim.lineage_names.len().max(8));
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
                    | "gift"
                    | "teach"
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
            "build" | "gift" | "teach" => format!("heard that {} {}", actor_name, detail),
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
                "born" | "religion_founded" | "build" | "gift" | "teach" | "specialty" | "graduated"
                | "milestone" => {
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

pub(super) const FURNITURE_POOL: &[(&str, &[&str], &str)] = &[
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
