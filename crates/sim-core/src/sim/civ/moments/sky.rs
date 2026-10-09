use super::*;

pub(in crate::sim::civ) fn tick_maybe_eclipse(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_season_change(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_aurora_sighting(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_meteor_shower(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    if !sim.is_night() {
        return;
    }
    let r: f32 = sim.rng.random();
    if r > 0.015 * sim.goals.difficulty.disaster_mult() {
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

pub(in crate::sim::civ) fn tick_lunar_observation(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_sky_omens(sim: &mut Simulation) {
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
