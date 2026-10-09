use super::*;
use crate::math::DetMath;

pub(in crate::sim::civ) fn tick_mood(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let mut partner_pos: HashMap<String, (f32, f32, String)> = HashMap::default();
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

pub(in crate::sim::civ) fn tick_jealousy_rivalries(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_curiosity_exploration(sim: &mut Simulation) {
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
        let tx = (o.x + angle.det_sin() * dist).round() as i32;
        let ty = (o.y + angle.det_cos() * dist).round() as i32;
        o.wander_target = Some((tx.clamp(5, 595), ty.clamp(5, 295)));
        o.curiosity_drive = (o.curiosity_drive * 0.4).max(0.0);
    }
}

pub(in crate::sim::civ) fn tick_hopeful_aspiration(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_awe_marvels(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_gratitude_sharing(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_anger_outbursts(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_mood_contagion(sim: &mut Simulation) {
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
