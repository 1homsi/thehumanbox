use super::*;
use crate::math::DetMath;

pub(in crate::sim::civ) fn tick_mood(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let mut partner_pos: HashMap<String, (f32, f32, String)> = HashMap::default();
    for o in sim.organisms.iter() {
        if o.alive {
            partner_pos.insert(o.id.to_string(), (o.x, o.y, o.name.clone()));
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
            attitude_drops.push((i, other.lineage_id.to_string(), -0.004));
            break;
        }
    }
    for (idx, rival_lid, delta) in attitude_drops {
        let entry = sim.organisms[idx]
            .lineage_attitudes
            .entry(rival_lid.into())
            .or_insert(0.0);
        *entry = (*entry + delta).max(-1.0);
    }
}

fn curiosity_angle(hash: u64, tick: u64) -> f32 {
    ((hash ^ tick.wrapping_mul(0x9E37_79B9_7F4A_7C15)) % 6283) as f32 * 0.001
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
        let angle = curiosity_angle(hash, sim.tick_count);
        let dist = 200.0 + o.curiosity_drive * 350.0;
        let tx = (o.x + angle.det_sin() * dist).round() as i32;
        let ty = (o.y + angle.det_cos() * dist).round() as i32;
        o.wander_target = Some(crate::world::grid::clamp_to_map(tx, ty));
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
    let transfers = gratitude_transfers(&sim.organisms);
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

type Transfer = (usize, usize, f32, f32);

fn gratitude_givers(
    organisms: &[crate::organism::organism::Organism],
) -> Vec<(usize, &str, f32, f32, f32, f32)> {
    organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.gratitude > 0.5 && o.energy > 0.5)
        .map(|(i, o)| (i, o.lineage_id.as_str(), o.x, o.y, o.energy, o.hydration))
        .collect()
}

fn gratitude_transfers(organisms: &[crate::organism::organism::Organism]) -> Vec<Transfer> {
    let givers = gratitude_givers(organisms);
    if givers.is_empty() {
        return Vec::new();
    }
    let index = crate::sim::spatial::SpatialIndex::build(organisms, 8);
    let mut near = Vec::new();
    let mut transfers = Vec::new();
    for &(gi, lid, gx, gy, ge, gh) in &givers {
        index.query_into(gx as i32, gy as i32, 4, &mut near);
        let first = near
            .iter()
            .copied()
            .filter(|&j| {
                let o = &organisms[j];
                o.alive
                    && j != gi
                    && (o.x - gx).abs() + (o.y - gy).abs() <= 3.0
                    && ((o.energy < 0.3 && ge > 0.55) || (o.hydration < 0.3 && gh > 0.55))
                    && o.lineage_id == lid
            })
            .min();
        if let Some(j) = first {
            if organisms[j].energy < 0.3 && ge > 0.55 {
                transfers.push((gi, j, 0.05, 0.0));
            } else {
                transfers.push((gi, j, 0.0, 0.05));
            }
        }
    }
    transfers
}

#[cfg(test)]
fn gratitude_transfers_reference(organisms: &[crate::organism::organism::Organism]) -> Vec<Transfer> {
    let mut transfers = Vec::new();
    for (gi, lid, gx, gy, ge, gh) in gratitude_givers(organisms) {
        for (j, o) in organisms.iter().enumerate() {
            if !o.alive || j == gi || o.lineage_id != lid {
                continue;
            }
            if (o.x - gx).abs() + (o.y - gy).abs() > 3.0 {
                continue;
            }
            if o.energy < 0.3 && ge > 0.55 {
                transfers.push((gi, j, 0.05, 0.0));
                break;
            }
            if o.hydration < 0.3 && gh > 0.55 {
                transfers.push((gi, j, 0.0, 0.05));
                break;
            }
        }
    }
    transfers
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
        .map(|(i, o)| (i, o.x, o.y, o.lineage_id.to_string()))
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

#[cfg(test)]
mod curiosity_tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;
    use crate::world::grid::{HEIGHT, WIDTH};

    #[test]
    fn curiosity_angle_changes_with_the_tick() {
        let hash = "org-1234"
            .bytes()
            .fold(0u64, |a, b| a.wrapping_mul(31).wrapping_add(b as u64));
        let angles: std::collections::BTreeSet<u32> = (0..20u64)
            .map(|t| curiosity_angle(hash, 1_000 + t).to_bits())
            .collect();
        assert!(
            angles.len() > 10,
            "angles should vary with the tick, got {angles:?}"
        );
        for t in 0..20u64 {
            assert!((0.0..6.3).contains(&curiosity_angle(hash, t)));
        }
    }

    #[test]
    fn exploration_targets_reach_the_south_east_of_the_map() {
        let mut sim = Simulation::new(7);
        sim.organisms.clear();
        let mut o = Organism::new(
            "explorer",
            "explorer".into(),
            WIDTH as f32 - 20.0,
            HEIGHT as f32 - 20.0,
            0,
            String::new(),
            "clan",
            20_000,
            Traits::default(),
        );
        o.alive = true;
        o.energy = 1.0;
        sim.organisms.push(o);
        let mut south_east = 0;
        for t in 0..40u64 {
            sim.tick_count = 10_000 + t;
            sim.organisms[0].wander_target = None;
            sim.organisms[0].curiosity_drive = 1.0;
            tick_curiosity_exploration(&mut sim);
            let (tx, ty) = sim.organisms[0].wander_target.expect("curious and rested");
            assert!((5..=WIDTH as i32 - 5).contains(&tx) && (5..=HEIGHT as i32 - 5).contains(&ty));
            if tx > 595 && ty > 295 {
                south_east += 1;
            }
        }
        assert!(south_east > 0, "no target ever landed past the old 600x300 edge");
    }
}

#[cfg(test)]
mod gratitude_tests {
    use super::*;
    use crate::organism::organism::Organism;
    use crate::organism::traits::Traits;

    #[test]
    fn the_indexed_kin_search_finds_the_same_transfers_as_the_full_scan() {
        let mut state = 0x9E37_79B9_7F4A_7C15u64;
        let mut roll = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (state >> 40) as f32 / (1u64 << 24) as f32
        };
        let mut found = 0;
        for round in 0..20 {
            let mut organisms = Vec::new();
            for i in 0..400 {
                let lineage = format!("tribe-{}", (roll() * 3.0) as u32);
                let x = 100.0 + (roll() * 24.0).floor() + (roll() * 4.0).floor() * 0.25;
                let y = 80.0 + (roll() * 24.0).floor();
                let mut o = Organism::new(
                    format!("o{round}-{i}"),
                    format!("o{i}"),
                    x,
                    y,
                    0,
                    String::new(),
                    lineage,
                    20_000,
                    Traits::default(),
                );
                o.alive = roll() > 0.1;
                o.energy = roll();
                o.hydration = roll();
                o.gratitude = roll();
                organisms.push(o);
            }
            let fast = gratitude_transfers(&organisms);
            assert_eq!(fast, gratitude_transfers_reference(&organisms));
            found += fast.len();
        }
        assert!(found > 0);
    }
}
