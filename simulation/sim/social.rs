use rand::Rng;
use crate::organism::organism::Organism;
use crate::world::tiles::Tile;
use super::simulation::{Event, History};
use super::world_events::push_event;

pub fn signal_food(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    grid: &crate::world::grid::WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    rng: &mut impl Rng,
) -> f32 {
    let (ix, iy) = (organisms[org_idx].x as i32, organisms[org_idx].y as i32);
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id      = organisms[org_idx].id.clone();
    let signal_word = organisms[org_idx].vocabulary.word_for("food").to_string();

    let best = Organism::best_remembered(&organisms[org_idx].food_memory,
                                         organisms[org_idx].x, organisms[org_idx].y);
    let (bx, by) = match best {
        Some(p) => p,
        None if grid.get(ix, iy) == Tile::Food => (ix, iy),
        None => {
            organisms[org_idx].think("signaling (no food known)", tick);
            return 0.0;
        }
    };

    let nearby_indices: Vec<usize> = organisms.iter().enumerate()
        .filter(|(i, o)| *i != org_idx && o.alive)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs()+(o.y - organisms[org_idx].y).abs() <= 12.0)
        .map(|(i, _)| i)
        .collect();

    if nearby_indices.is_empty() {
        organisms[org_idx].think(&format!("\"{}\" (no one hears)", signal_word), tick);
        return 0.0;
    }

    let mem_trait = organisms[org_idx].traits.memory_strength;
    let my_vocab  = organisms[org_idx].vocabulary.clone();
    let mut reached = 0usize;
    let mut understood = 0usize;

    for &ni in &nearby_indices {
        let their_word = organisms[ni].vocabulary.word_for("food").to_string();
        let recognizes = their_word == signal_word;
        let is_kin     = organisms[ni].lineage_id == org_lineage;
        let trust      = *organisms[ni].org_trust.get(&org_id).unwrap_or(&0.0);

        let base_strength = if is_kin { (0.5 * (0.5 + trust)).max(0.20) } else { 0.10 };
        let strength = if recognizes { base_strength } else { base_strength * 0.3 };

        Organism::remember(&mut organisms[ni].food_memory, bx, by, strength, mem_trait);

        organisms[ni].vocabulary.absorb_from(&my_vocab, rng);
        if recognizes { understood += 1; }
        reached += 1;
    }

    organisms[org_idx].think(&format!("\"{}\" ({}/{})", signal_word, understood, reached), tick);
    push_event(events, tick, "signal", &organisms[org_idx].name.clone(),
               &format!("\"{}\" → {}/{} understood", signal_word, understood, reached));
    0.025 * (understood.min(4) as f32)
}

pub fn sound_alarm(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    grid: &crate::world::grid::WorldGrid,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    rng: &mut impl Rng,
) -> f32 {
    let (ix, iy) = (organisms[org_idx].x as i32, organisms[org_idx].y as i32);
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let on_fire = grid.get(ix, iy) == Tile::Fire;
    let concept = if on_fire { "fire" } else { "danger" };
    let signal_word = organisms[org_idx].vocabulary.word_for(concept).to_string();

    let danger_loc = if on_fire {
        Some((ix, iy))
    } else {
        Organism::best_remembered(&organisms[org_idx].danger_memory,
                                  organisms[org_idx].x, organisms[org_idx].y)
            .filter(|(cx, cy)| (cx - ix).abs() + (cy - iy).abs() <= 8)
    };

    let Some((dlx, dly)) = danger_loc else {
        organisms[org_idx].think("alarming (nothing)", tick);
        return 0.0;
    };

    let nearby_indices: Vec<usize> = organisms.iter().enumerate()
        .filter(|(i, o)| *i != org_idx && o.alive)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs()+(o.y - organisms[org_idx].y).abs() <= 14.0)
        .map(|(i, _)| i)
        .collect();

    if nearby_indices.is_empty() {
        organisms[org_idx].think(&format!("\"{}\" (silence)", signal_word), tick);
        return 0.0;
    }

    let mem_trait = organisms[org_idx].traits.memory_strength;
    let my_vocab  = organisms[org_idx].vocabulary.clone();
    let mut kin_warned = 0usize;

    for &ni in &nearby_indices {
        let their_word = organisms[ni].vocabulary.word_for(concept).to_string();
        let recognizes = their_word == signal_word;
        let is_kin     = organisms[ni].lineage_id == org_lineage;

        let strength = match (is_kin, recognizes) {
            (true,  true)  => 0.70,
            (true,  false) => 0.35,
            (false, true)  => 0.30,
            (false, false) => 0.08,
        };

        Organism::remember(&mut organisms[ni].danger_memory, dlx, dly, strength, mem_trait);

        organisms[ni].vocabulary.absorb_from(&my_vocab, rng);
        if is_kin { kin_warned += 1; }
    }

    organisms[org_idx].think(&format!("\"{}!\" ({} warned)", signal_word, kin_warned), tick);
    push_event(events, tick, "alarm", &organisms[org_idx].name.clone(),
               &format!("\"{}\" warned {}", signal_word, kin_warned));
    0.022 * (kin_warned.min(4) as f32)
}

pub fn gift_knowledge(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    history: &mut History,
    rng: &mut impl Rng,
) -> f32 {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id      = organisms[org_idx].id.clone();

    let best = Organism::best_remembered(&organisms[org_idx].food_memory,
                                         organisms[org_idx].x, organisms[org_idx].y);
    let Some((bx, by)) = best else {
        organisms[org_idx].think("gifting (nothing)", tick);
        return 0.0;
    };

    let target_idx = organisms.iter().enumerate()
        .filter(|(i, o)| *i != org_idx && o.alive && o.lineage_id != org_lineage)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs()+(o.y - organisms[org_idx].y).abs() < 6.0)
        .filter(|(_, o)| (o.x as i32 - bx).abs() + (o.y as i32 - by).abs() < 25)
        .min_by(|(_, a), (_, b)| {
            let da = (a.x - organisms[org_idx].x).abs() + (a.y - organisms[org_idx].y).abs();
            let db = (b.x - organisms[org_idx].x).abs() + (b.y - organisms[org_idx].y).abs();
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(i, _)| i);

    let Some(ti) = target_idx else {
        organisms[org_idx].think("gifting (nobody)", tick);
        return 0.0;
    };

    let target_lid = organisms[ti].lineage_id.clone();
    let target_id  = organisms[ti].id.clone();
    let target_name = organisms[ti].name.clone();
    let mem_trait = organisms[org_idx].traits.memory_strength;

    let prev_att = organisms[org_idx].attitude_toward(&target_lid);
    Organism::remember(&mut organisms[ti].food_memory, bx, by, 0.4, mem_trait);

    organisms[org_idx].update_attitude(&target_lid, 0.015);
    organisms[ti].update_attitude(&org_lineage, 0.030);

    let t_trust = organisms[ti].org_trust.entry(org_id.clone()).or_insert(0.0);
    *t_trust = (*t_trust + 0.15).min(1.0);

    let o_trust = organisms[org_idx].org_trust.entry(target_id).or_insert(0.0);
    *o_trust = (*o_trust + 0.05).min(1.0);

    let new_att = organisms[org_idx].attitude_toward(&target_lid);
    if prev_att < 0.25 && new_att >= 0.25 {
        push_event(events, tick, "treaty", &organisms[org_idx].name.clone(),
                   &format!("{} ↔ {}", &org_lineage[..4.min(org_lineage.len())],
                            &target_lid[..4.min(target_lid.len())]));
        history.alliances_formed += 1;
    }

    let reward_add = if new_att >= 0.0 { 0.014 } else { -0.003 };

    if new_att >= 0.25 {
        let their_snap = organisms[ti].vocabulary.as_hashmap();
        let my_snap    = organisms[org_idx].vocabulary.as_hashmap();
        organisms[org_idx].vocabulary.absorb_from(
            &crate::organism::vocabulary::Vocabulary::from_hashmap(&their_snap), rng);
        organisms[ti].vocabulary.absorb_from(
            &crate::organism::vocabulary::Vocabulary::from_hashmap(&my_snap), rng);
    }

    let org_name = organisms[org_idx].name.clone();
    organisms[org_idx].think(&format!("gifting {}", &target_name[..4.min(target_name.len())]), tick);
    push_event(events, tick, "gift", &org_name,
               &format!("→ {} ({} ↔ {})", target_name,
                        &org_lineage[..4.min(org_lineage.len())],
                        &target_lid[..4.min(target_lid.len())]));
    history.gifts_total += 1;
    reward_add
}

pub fn challenge_stranger(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    history: &mut History,
) -> f32 {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id      = organisms[org_idx].id.clone();

    let target_idx = organisms.iter().enumerate()
        .filter(|(i, o)| *i != org_idx && o.alive && o.lineage_id != org_lineage)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs()+(o.y - organisms[org_idx].y).abs() < 3.0)
        .min_by(|(_, a), (_, b)| {
            let da = (a.x - organisms[org_idx].x).abs() + (a.y - organisms[org_idx].y).abs();
            let db = (b.x - organisms[org_idx].x).abs() + (b.y - organisms[org_idx].y).abs();
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(i, _)| i);

    let Some(ti) = target_idx else {
        organisms[org_idx].think("challenging (nobody)", tick);
        return 0.0;
    };

    let target_lid = organisms[ti].lineage_id.clone();
    let target_name = organisms[ti].name.clone();

    let kin_backing = organisms.iter()
        .filter(|o| o.alive && o.lineage_id == org_lineage)
        .filter(|o| (o.x - organisms[org_idx].x).abs()+(o.y - organisms[org_idx].y).abs() <= 4.0)
        .count().saturating_sub(1);

    let allied_backing = organisms.iter()
        .filter(|o| o.alive && o.lineage_id != org_lineage && o.lineage_id != target_lid)
        .filter(|o| organisms[org_idx].attitude_toward(&o.lineage_id) >= 0.4)
        .filter(|o| (o.x - organisms[org_idx].x).abs()+(o.y - organisms[org_idx].y).abs() <= 5.0)
        .count();
    let kin_backing = kin_backing + allied_backing;

    organisms[org_idx].last_challenged = tick;

    let (damage, reward, thought) = if kin_backing >= 2 {
        (0.025, 0.025, "challenging")
    } else if kin_backing >= 1 {
        (0.015, 0.010, "challenging")
    } else {
        (0.005, -0.005, "challenging alone")
    };

    organisms[ti].health = (organisms[ti].health - damage).max(0.0);

    organisms[org_idx].update_attitude(&target_lid, -0.20);
    organisms[ti].update_attitude(&org_lineage, -0.30);

    let t_trust = organisms[ti].org_trust.entry(org_id).or_insert(0.0);
    *t_trust = (*t_trust - 0.20).max(-1.0);

    let (tx, ty) = (organisms[ti].x as i32, organisms[ti].y as i32);
    let att_after   = organisms[ti].attitude_toward(&org_lineage);
    let ti_mem_trait = organisms[ti].traits.memory_strength;
    let mem_strength = (0.55 + (-att_after).max(0.0) * 0.35).min(1.0);
    Organism::remember(&mut organisms[ti].danger_memory, tx, ty, mem_strength, ti_mem_trait);

    let target_kin = organisms.iter()
        .filter(|o| o.alive && o.lineage_id == target_lid)
        .filter(|o| (o.x - organisms[ti].x).abs()+(o.y - organisms[ti].y).abs() <= 4.0)
        .count().saturating_sub(1);

    if organisms[ti].health > 0.5 && target_kin >= 2 {
        organisms[org_idx].health = (organisms[org_idx].health - 0.015).max(0.0);
    }

    let org_name = organisms[org_idx].name.clone();
    organisms[org_idx].think(thought, tick);
    history.challenges_total += 1;

    if kin_backing >= 1 {
        push_event(events, tick, "challenge", &org_name,
                   &format!("vs {} ({} kin backing)", target_name, kin_backing));
    }

    reward * (0.5 + organisms[org_idx].traits.aggression)
}

pub fn groom(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
) -> f32 {
    let (ox, oy) = (organisms[org_idx].x, organisms[org_idx].y);
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id      = organisms[org_idx].id.clone();

    let target_idx = organisms.iter().enumerate()
        .filter(|(i, o)| *i != org_idx && o.alive && o.lineage_id == org_lineage)
        .filter(|(_, o)| (o.x - ox).abs() + (o.y - oy).abs() <= 3.0)
        .min_by(|(_, a), (_, b)| {
            let da = (a.x - ox).abs() + (a.y - oy).abs();
            let db = (b.x - ox).abs() + (b.y - oy).abs();
            da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(i, _)| i);

    let Some(ti) = target_idx else {
        organisms[org_idx].think("grooming (alone)", tick);
        return 0.0;
    };

    let target_name = organisms[ti].name.clone();
    let ti_id       = organisms[ti].id.clone();

    organisms[org_idx].infection = (organisms[org_idx].infection * 0.94).max(0.0);
    organisms[ti].infection      = (organisms[ti].infection      * 0.94).max(0.0);

    organisms[org_idx].last_groomed = tick;

    let t = organisms[ti].org_trust.entry(org_id.clone()).or_insert(0.0);
    *t = (*t + 0.06).min(1.0);
    let ti_trust_after = *t;
    let o_t = organisms[org_idx].org_trust.entry(ti_id.clone()).or_insert(0.0);
    *o_t = (*o_t + 0.06).min(1.0);
    let my_trust_after = *o_t;

    // Promote to named friend once mutual trust is strong enough
    const FRIEND_THRESHOLD: f32 = 0.55;
    if ti_trust_after >= FRIEND_THRESHOLD {
        let oi = org_id.clone();
        let on = organisms[org_idx].name.clone();
        organisms[ti].add_friend(&oi, &on, tick);
    }
    if my_trust_after >= FRIEND_THRESHOLD {
        let ti2 = ti_id.clone();
        organisms[org_idx].add_friend(&ti2, &target_name, tick);
    }

    if organisms[org_idx].grief_ticks > 0 { organisms[org_idx].grief_ticks = organisms[org_idx].grief_ticks.saturating_sub(8); }
    if organisms[ti].grief_ticks > 0 { organisms[ti].grief_ticks = organisms[ti].grief_ticks.saturating_sub(8); }

    let org_name = organisms[org_idx].name.clone();
    organisms[org_idx].think(&format!("grooming {}", &target_name[..4.min(target_name.len())]), tick);

    if organisms[ti].infection > 0.15 {
        push_event(events, tick, "social", &org_name,
                   &format!("grooming {} (healing touch)", target_name));
    }
    0.012
}

pub fn teach(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    rng: &mut impl Rng,
) -> f32 {
    // Any organism with knowledge can teach, not just elders.
    // Elders pass on richer memory alongside discoveries.
    let is_elder      = organisms[org_idx].is_elder;
    let disc_count    = organisms[org_idx].discoveries.len();
    if disc_count < 1 && !is_elder { return 0.0; }

    let org_lineage = organisms[org_idx].lineage_id.clone();
    let (ox, oy) = (organisms[org_idx].x, organisms[org_idx].y);
    let friend_ids: std::collections::HashSet<String> =
        organisms[org_idx].friends.keys().cloned().collect();
    let high_trust: std::collections::HashSet<String> = organisms[org_idx].org_trust.iter()
        .filter(|(_, &v)| v >= 0.55)
        .map(|(k, _)| k.clone()).collect();

    // Knowledge transmits to kin OR named friends OR strong-trust orgs.
    // Previously only same-lineage kin could learn from elders/peers, so
    // discoveries died at tribe boundaries even when cross-lineage friendship
    // bonds had formed.
    let target_idx = organisms.iter().enumerate()
        .filter(|(i, o)| {
            if *i == org_idx || !o.alive { return false; }
            let same_lineage = o.lineage_id == org_lineage;
            let close_enough = (o.x - ox).abs() + (o.y - oy).abs() <= 5.0;
            let has_less = o.discoveries.len() < disc_count;
            let bonded   = friend_ids.contains(&o.id) || high_trust.contains(&o.id);
            (same_lineage || bonded) && close_enough && (has_less || o.age < 400)
        })
        .min_by_key(|(_, o)| o.discoveries.len())
        .map(|(i, _)| i);

    let Some(ti) = target_idx else { return 0.0; };

    let target_name = organisms[ti].name.clone();
    let mem_trait   = organisms[org_idx].traits.memory_strength;

    // Elders share full memory banks; knowledgeable non-elders share a subset
    if is_elder {
        let food_share: Vec<((i32,i32), f32)> = organisms[org_idx].food_memory.iter()
            .filter(|(_, &v)| v > 0.4).take(6).map(|(&k, &v)| (k, v)).collect();
        let water_share: Vec<((i32,i32), f32)> = organisms[org_idx].water_memory.iter()
            .filter(|(_, &v)| v > 0.4).take(4).map(|(&k, &v)| (k, v)).collect();
        let danger_share: Vec<((i32,i32), f32)> = organisms[org_idx].danger_memory.iter()
            .filter(|(_, &v)| v > 0.3).take(4).map(|(&k, &v)| (k, v)).collect();
        for &((x,y), v) in &food_share   { Organism::remember(&mut organisms[ti].food_memory,   x, y, v * 0.5, mem_trait); }
        for &((x,y), v) in &water_share  { Organism::remember(&mut organisms[ti].water_memory,  x, y, v * 0.5, mem_trait); }
        for &((x,y), v) in &danger_share { Organism::remember(&mut organisms[ti].danger_memory, x, y, v * 0.4, mem_trait); }
    }

    let teacher_vocab = organisms[org_idx].vocabulary.clone();
    organisms[ti].vocabulary.absorb_from(&teacher_vocab, rng);

    // Transfer discoveries — elders have higher transmission rate
    let transfer_chance = if is_elder { 0.06 } else { 0.025 };
    let teacher_disc: Vec<String> = organisms[org_idx].discoveries.iter().cloned().collect();
    let mut learned = Vec::new();
    for disc in &teacher_disc {
        if !organisms[ti].discoveries.contains(disc.as_str()) && rng.gen::<f32>() < transfer_chance {
            organisms[ti].discoveries.insert(disc.clone());
            learned.push(disc.clone());
        }
    }
    for disc in &learned {
        let teacher_short = organisms[org_idx].name.clone();
        let ti_id_str = organisms[ti].id.clone();
        let _ = ti_id_str; // suppress warning
        organisms[ti].log_life(tick, "discovery",
            format!("learned {} from {}", disc, teacher_short));
    }

    let org_id2  = organisms[org_idx].id.clone();
    let org_name = organisms[org_idx].name.clone();
    let ti_id    = organisms[ti].id.clone();

    // Teaching builds trust and friendship
    let t = organisms[ti].org_trust.entry(org_id2.clone()).or_insert(0.0);
    *t = (*t + 0.10).min(1.0);
    let ti_trust = *t;
    let o_t = organisms[org_idx].org_trust.entry(ti_id.clone()).or_insert(0.0);
    *o_t = (*o_t + 0.04).min(1.0);

    if ti_trust >= 0.55 {
        let on = org_name.clone();
        let oi = org_id2.clone();
        organisms[ti].add_friend(&oi, &on, tick);
        let tn = target_name.clone();
        organisms[org_idx].add_friend(&ti_id, &tn, tick);
    }

    let role = if is_elder { "elder" } else { "kin" };
    organisms[org_idx].think(&format!("teaching {}", &target_name[..4.min(target_name.len())]), tick);
    organisms[ti].think(&format!("learning from {}", &org_name[..4.min(org_name.len())]), tick);
    organisms[ti].log_life(tick, "discovery",
        format!("mentored by {} {}", role, org_name));

    if !learned.is_empty() || organisms[ti].age < 200 {
        push_event(events, tick, "teach", &org_name,
            &format!("→ {} ({})", target_name,
                if learned.is_empty() { "mentoring".to_string() }
                else { learned.join(", ") }));
    }
    0.018
}

pub fn share_food(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
) -> f32 {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let (ox, oy) = (organisms[org_idx].x, organisms[org_idx].y);

    let friend_ids: std::collections::HashSet<String> =
        organisms[org_idx].friends.keys().cloned().collect();
    let high_trust: std::collections::HashSet<String> = organisms[org_idx].org_trust.iter()
        .filter(|(_, &v)| v >= 0.55)
        .map(|(k, _)| k.clone()).collect();

    // Share with hungry kin OR hungry named friends / strong-trust orgs.
    // Recently-orphaned minors get prioritised by sorting them ahead
    // of all other candidates (they need adoption-tier care, not just
    // food).
    let target_idx = organisms.iter().enumerate()
        .filter(|(i, o)| *i != org_idx && o.alive && o.energy < 0.30)
        .filter(|(_, o)| o.lineage_id == org_lineage
            || friend_ids.contains(&o.id) || high_trust.contains(&o.id))
        .filter(|(_, o)| (o.x - ox).abs() + (o.y - oy).abs() <= 6.0)
        .min_by(|(_, a), (_, b)| {
            let a_recent_orphan = a.orphaned_tick > 0 && tick.saturating_sub(a.orphaned_tick) < 600;
            let b_recent_orphan = b.orphaned_tick > 0 && tick.saturating_sub(b.orphaned_tick) < 600;
            // Orphans first, then lowest-energy first.
            match (a_recent_orphan, b_recent_orphan) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.energy.partial_cmp(&b.energy).unwrap_or(std::cmp::Ordering::Equal),
            }
        })
        .map(|(i, _)| i);

    let Some(ti) = target_idx else { return 0.0; };

    let target_name = organisms[ti].name.clone();
    let share       = 0.09f32;

    organisms[org_idx].energy    = (organisms[org_idx].energy    - share).max(0.0);
    organisms[ti].energy         = (organisms[ti].energy         + share).min(1.0);
    organisms[org_idx].last_fed_kin = tick;

    let org_id2  = organisms[org_idx].id.clone();
    let org_name = organisms[org_idx].name.clone();
    let t = organisms[ti].org_trust.entry(org_id2).or_insert(0.0);
    *t = (*t + 0.10).min(1.0);

    organisms[org_idx].think(&format!("sharing food with {}", &target_name[..4.min(target_name.len())]), tick);
    organisms[ti].think("received food from kin", tick);
    organisms[ti].log_event(format!("fed by kin {}", &org_name[..4.min(org_name.len())]));

    push_event(events, tick, "gift", &org_name, &format!("fed starving {}", target_name));
    0.025
}

pub fn social_knowledge_share(
    org_idx: usize,
    organisms: &mut Vec<Organism>,
    tick: u64,
    rng: &mut impl Rng,
) {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id      = organisms[org_idx].id.clone();
    let (ox, oy) = (organisms[org_idx].x as i32, organisms[org_idx].y as i32);

    let kin_indices: Vec<usize> = organisms.iter().enumerate()
        .filter(|(i, o)| *i != org_idx && o.alive && o.lineage_id == org_lineage)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs()+(o.y - organisms[org_idx].y).abs() <= 4.0)
        .map(|(i, _)| i)
        .collect();

    if kin_indices.is_empty() { return; }

    let food_to_share: Vec<((i32,i32), f32)> = organisms[org_idx].food_memory.iter()
        .filter(|(&(x,y), &v)| v > 0.5 && (x-ox).abs()+(y-oy).abs() <= 20)
        .map(|(&k, &v)| (k, v))
        .collect();
    let water_to_share: Vec<((i32,i32), f32)> = organisms[org_idx].water_memory.iter()
        .filter(|(&(x,y), &v)| v > 0.5 && (x-ox).abs()+(y-oy).abs() <= 20)
        .map(|(&k, &v)| (k, v))
        .collect();
    let mem_trait = organisms[org_idx].traits.memory_strength;

    let my_vocab = organisms[org_idx].vocabulary.clone();

    for ki in &kin_indices {
        for &((x,y), v) in &food_to_share {
            Organism::remember(&mut organisms[*ki].food_memory, x, y, v * 0.03, mem_trait);
        }
        for &((x,y), v) in &water_to_share {
            Organism::remember(&mut organisms[*ki].water_memory, x, y, v * 0.03, mem_trait);
        }
        let ki_id = organisms[*ki].id.clone();
        let t = organisms[*ki].org_trust.entry(org_id.clone()).or_insert(0.0);
        *t = (*t + 0.008).min(1.0);
        let ki_trust_after = *t;
        let o_t = organisms[org_idx].org_trust.entry(ki_id.clone()).or_insert(0.0);
        *o_t = (*o_t + 0.008).min(1.0);
        let my_trust_after = *o_t;

        // Repeated socializing gradually builds friendship
        const FRIEND_THRESHOLD: f32 = 0.55;
        if ki_trust_after >= FRIEND_THRESHOLD {
            let on = organisms[org_idx].name.clone();
            let oi = org_id.clone();
            organisms[*ki].add_friend(&oi, &on, tick);
        }
        if my_trust_after >= FRIEND_THRESHOLD {
            let ki_name = organisms[*ki].name.clone();
            organisms[org_idx].add_friend(&ki_id, &ki_name, tick);
        }
    }

    let kin_snapshots: Vec<std::collections::HashMap<String, String>> = kin_indices.iter()
        .map(|&ki| organisms[ki].vocabulary.as_hashmap())
        .collect();
    organisms[org_idx].vocabulary.converge_with(&kin_snapshots, rng, 0.40);
    let mut all_snapshots = kin_snapshots.clone();
    all_snapshots.push(my_vocab.as_hashmap());
    for &ki in &kin_indices {
        organisms[ki].vocabulary.converge_with(&all_snapshots, rng, 0.40);
    }
}
