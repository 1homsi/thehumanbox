use super::*;

pub(in crate::sim::civ) fn tick_daily_summary(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_dream_sharing(sim: &mut Simulation) {
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
    let mut by_id: HashMap<String, usize> = HashMap::default();
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

pub(in crate::sim::civ) fn tick_dreams(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_reflections(sim: &mut Simulation) {
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
