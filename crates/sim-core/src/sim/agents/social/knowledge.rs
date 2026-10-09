use super::*;

pub fn gift_knowledge(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    history: &mut History,
    rng: &mut impl Rng,
) -> f32 {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id = organisms[org_idx].id.clone();

    let best = Organism::best_remembered(
        &organisms[org_idx].food_memory,
        organisms[org_idx].x,
        organisms[org_idx].y,
    );
    let Some((bx, by)) = best else {
        organisms[org_idx].think("gifting (nothing)", tick);
        return 0.0;
    };

    let target_idx = spatial
        .ordered_nearby(organisms, organisms[org_idx].x, organisms[org_idx].y, 6)
        .filter(|(i, o)| *i != org_idx && o.alive && o.lineage_id != org_lineage)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs() + (o.y - organisms[org_idx].y).abs() < 6.0)
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
    let target_id = organisms[ti].id.clone();
    let target_name = organisms[ti].name.clone();
    // The memory is written into the *recipient*, so scale it by the
    // recipient's recall, not the giver's.
    let mem_trait = organisms[ti].traits.memory_strength;

    let prev_att = organisms[org_idx].attitude_toward(&target_lid);
    Organism::remember(&mut organisms[ti].food_memory, bx, by, 0.4, mem_trait);

    organisms[org_idx].update_attitude(&target_lid, 0.015);
    organisms[ti].update_attitude(&org_lineage, 0.030);

    let t_trust = organisms[ti].org_trust.entry(org_id.clone()).or_insert(0.0);
    *t_trust = (*t_trust + 0.15).min(1.0);

    let o_trust = organisms[org_idx]
        .org_trust
        .entry(target_id.clone())
        .or_insert(0.0);
    *o_trust = (*o_trust + 0.05).min(1.0);

    let new_att = organisms[org_idx].attitude_toward(&target_lid);
    if prev_att < 0.25 && new_att >= 0.25 {
        push_event(
            events,
            tick,
            "treaty",
            &organisms[org_idx].name.clone(),
            &format!(
                "{} ↔ {}",
                &org_lineage[..4.min(org_lineage.len())],
                &target_lid[..4.min(target_lid.len())]
            ),
        );
        history.alliances_formed += 1;

        use crate::organism::memory::{MemoryEntry, MemoryKind};
        let target_name_for_mem = target_name.clone();
        let target_id_for_mem = target_id.clone();
        let actor_name = organisms[org_idx].name.clone();
        let actor_id = organisms[org_idx].id.clone();
        organisms[org_idx].memories.insert(
            MemoryEntry::new(
                MemoryKind::Bond,
                format!(
                    "I gave knowledge to {}, of another people — they took it",
                    target_name_for_mem
                ),
                tick,
            )
            .with_salience(0.82)
            .with_emotion(2)
            .with_related(target_id_for_mem),
        );
        organisms[ti].memories.insert(
            MemoryEntry::new(
                MemoryKind::Bond,
                format!(
                    "{} of another people taught me without asking for return",
                    actor_name
                ),
                tick,
            )
            .with_salience(0.85)
            .with_emotion(2)
            .with_related(actor_id),
        );
    }

    let reward_add = if new_att >= 0.0 { 0.014 } else { -0.003 };

    if new_att >= 0.25 {
        // `absorb_from` reads only the word slots, so a copy of each side as
        // it stands (taken before either absorbs) is what it needs.
        let their_vocabulary = organisms[ti].vocabulary.clone();
        let my_vocabulary = organisms[org_idx].vocabulary.clone();
        organisms[org_idx].vocabulary.absorb_from(&their_vocabulary, rng);
        organisms[ti].vocabulary.absorb_from(&my_vocabulary, rng);
    }

    let org_name = organisms[org_idx].name.clone();
    organisms[org_idx].think(
        &format!("gifting {}", &target_name[..4.min(target_name.len())]),
        tick,
    );
    push_event(
        events,
        tick,
        "gift",
        &org_name,
        &format!(
            "→ {} ({} ↔ {})",
            target_name,
            &org_lineage[..4.min(org_lineage.len())],
            &target_lid[..4.min(target_lid.len())]
        ),
    );
    history.gifts_total += 1;
    reward_add
}

pub fn teach(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    rng: &mut impl Rng,
) -> f32 {
    // Any organism with knowledge can teach, not just elders.
    // Elders pass on richer memory alongside discoveries.
    let is_elder = organisms[org_idx].is_elder;
    let disc_count = organisms[org_idx].discoveries.len();
    if disc_count < 1 && !is_elder {
        return 0.0;
    }

    let org_lineage = organisms[org_idx].lineage_id.clone();
    let (ox, oy) = (organisms[org_idx].x, organisms[org_idx].y);
    let friend_ids: crate::hashing::FxHashSet<String> = organisms[org_idx].friends.keys().cloned().collect();
    let high_trust: crate::hashing::FxHashSet<String> = organisms[org_idx]
        .org_trust
        .iter()
        .filter(|(_, &v)| v >= 0.55)
        .map(|(k, _)| k.clone())
        .collect();

    // Knowledge transmits to kin OR named friends OR strong-trust orgs.
    // Previously only same-lineage kin could learn from elders/peers, so
    // discoveries died at tribe boundaries even when cross-lineage friendship
    // bonds had formed.
    let target_idx = spatial
        .ordered_nearby(organisms, ox, oy, 5)
        .filter(|(i, o)| {
            if *i == org_idx || !o.alive {
                return false;
            }
            let same_lineage = o.lineage_id == org_lineage;
            let close_enough = (o.x - ox).abs() + (o.y - oy).abs() <= 5.0;
            let has_less = o.discoveries.len() < disc_count;
            let bonded = friend_ids.contains(&o.id) || high_trust.contains(&o.id);
            (same_lineage || bonded) && close_enough && (has_less || o.age < 400)
        })
        .min_by_key(|(_, o)| o.discoveries.len())
        .map(|(i, _)| i);

    let Some(ti) = target_idx else {
        return 0.0;
    };

    let target_name = organisms[ti].name.clone();
    // Shared memories land in the student's store, so use the student's
    // recall trait.
    let mem_trait = organisms[ti].traits.memory_strength;

    // Elders share full memory banks; knowledgeable non-elders share a subset
    if is_elder {
        let food_share: Vec<((i32, i32), f32)> = organisms[org_idx]
            .food_memory
            .iter()
            .filter(|(_, &v)| v > 0.4)
            .take(6)
            .map(|(&k, &v)| (k, v))
            .collect();
        let water_share: Vec<((i32, i32), f32)> = organisms[org_idx]
            .water_memory
            .iter()
            .filter(|(_, &v)| v > 0.4)
            .take(4)
            .map(|(&k, &v)| (k, v))
            .collect();
        let danger_share: Vec<((i32, i32), f32)> = organisms[org_idx]
            .danger_memory
            .iter()
            .filter(|(_, &v)| v > 0.3)
            .take(4)
            .map(|(&k, &v)| (k, v))
            .collect();
        for &((x, y), v) in &food_share {
            Organism::remember(&mut organisms[ti].food_memory, x, y, v * 0.5, mem_trait);
        }
        for &((x, y), v) in &water_share {
            Organism::remember(&mut organisms[ti].water_memory, x, y, v * 0.5, mem_trait);
        }
        for &((x, y), v) in &danger_share {
            Organism::remember(&mut organisms[ti].danger_memory, x, y, v * 0.4, mem_trait);
        }
    }

    let teacher_vocab = organisms[org_idx].vocabulary.clone();
    organisms[ti].vocabulary.absorb_from(&teacher_vocab, rng);

    // Transfer discoveries - elders have higher transmission rate
    let transfer_chance = if is_elder { 0.06 } else { 0.025 };
    let teacher_disc: Vec<String> = organisms[org_idx].discoveries.iter().cloned().collect();
    let mut learned = Vec::new();
    for disc in &teacher_disc {
        if !organisms[ti].discoveries.contains(disc.as_str()) && rng.random::<f32>() < transfer_chance {
            organisms[ti].discoveries.insert(disc.clone());
            learned.push(disc.clone());
        }
    }
    for disc in &learned {
        let teacher_short = organisms[org_idx].name.clone();
        let ti_id_str = organisms[ti].id.clone();
        let _ = ti_id_str; // suppress warning
        organisms[ti].log_life(
            tick,
            "discovery",
            format!("learned {} from {}", disc, teacher_short),
        );
    }

    let org_id2 = organisms[org_idx].id.clone();
    let org_name = organisms[org_idx].name.clone();
    let ti_id = organisms[ti].id.clone();

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
    organisms[org_idx].think(
        &format!("teaching {}", &target_name[..4.min(target_name.len())]),
        tick,
    );
    organisms[ti].think(
        &format!("learning from {}", &org_name[..4.min(org_name.len())]),
        tick,
    );
    organisms[ti].log_life(tick, "discovery", format!("mentored by {} {}", role, org_name));

    if !learned.is_empty() || organisms[ti].age < 200 {
        push_event(
            events,
            tick,
            "teach",
            &org_name,
            &format!(
                "→ {} ({})",
                target_name,
                if learned.is_empty() {
                    "mentoring".to_string()
                } else {
                    learned.join(", ")
                }
            ),
        );
    }
    0.018
}

pub(super) fn ranked_memory_share(
    memory: &FxHashMap<(i32, i32), f32>,
    origin: (i32, i32),
    min_strength: f32,
    max_distance: i32,
    limit: usize,
) -> Vec<((i32, i32), f32)> {
    let mut items: Vec<((i32, i32), f32, f32)> = memory
        .iter()
        .filter_map(|(&(x, y), &strength)| {
            if strength < min_strength {
                return None;
            }
            let dist = (x - origin.0).abs() + (y - origin.1).abs();
            if dist > max_distance {
                return None;
            }
            let score = strength - (dist as f32 / max_distance as f32) * 0.18;
            Some(((x, y), strength, score))
        })
        .collect();
    items.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    items
        .into_iter()
        .take(limit)
        .map(|(pos, strength, _)| (pos, strength))
        .collect()
}

pub(super) fn recipient_source_trust_factor(
    recipient: &Organism,
    speaker_id: &str,
    same_lineage: bool,
) -> f32 {
    let trust = recipient.org_trust.get(speaker_id).copied().unwrap_or(0.0);
    if trust < -0.35 {
        if same_lineage {
            0.45
        } else {
            0.25
        }
    } else if trust < -0.10 {
        0.60
    } else if trust > 0.50 {
        1.20
    } else if trust > 0.20 {
        1.08
    } else {
        0.85
    }
}

pub fn social_knowledge_share(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    tick: u64,
    rng: &mut impl Rng,
) {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id = organisms[org_idx].id.clone();
    let (ox, oy) = (organisms[org_idx].x as i32, organisms[org_idx].y as i32);
    let food_to_share = ranked_memory_share(&organisms[org_idx].food_memory, (ox, oy), 0.45, 70, 4);
    let water_to_share = ranked_memory_share(&organisms[org_idx].water_memory, (ox, oy), 0.45, 70, 3);
    let danger_to_share = ranked_memory_share(&organisms[org_idx].danger_memory, (ox, oy), 0.35, 90, 4);
    if food_to_share.is_empty() && water_to_share.is_empty() && danger_to_share.is_empty() {
        return;
    }

    let friend_ids: crate::hashing::FxHashSet<String> = organisms[org_idx].friends.keys().cloned().collect();
    let high_trust: crate::hashing::FxHashSet<String> = organisms[org_idx]
        .org_trust
        .iter()
        .filter(|(_, &v)| v >= 0.50)
        .map(|(k, _)| k.clone())
        .collect();

    let share_targets: Vec<(usize, f32)> = spatial
        .ordered_nearby(organisms, organisms[org_idx].x, organisms[org_idx].y, 4)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs() + (o.y - organisms[org_idx].y).abs() <= 4.0)
        .filter_map(|(i, o)| {
            if i == org_idx || !o.alive {
                return None;
            }
            let same_lineage = o.lineage_id == org_lineage;
            let named_friend = friend_ids.contains(&o.id);
            let trusted = high_trust.contains(&o.id);
            let attitude = organisms[org_idx].attitude_toward(&o.lineage_id);
            if !same_lineage && !named_friend && !trusted && attitude < 0.35 {
                return None;
            }
            if !same_lineage && attitude < -0.15 {
                return None;
            }
            let trust = organisms[org_idx].org_trust.get(&o.id).copied().unwrap_or(0.0);
            let strength = if same_lineage {
                0.11 + organisms[org_idx].traits.social_tendency * 0.03
            } else if named_friend {
                0.08 + trust.max(0.0) * 0.04
            } else if trusted {
                0.055 + trust.max(0.0) * 0.03
            } else {
                0.035 + attitude.max(0.0) * 0.025
            };
            Some((i, strength.min(0.15)))
        })
        .collect();

    if share_targets.is_empty() {
        return;
    }

    let my_vocab = organisms[org_idx].vocabulary.clone();

    let mut shared_any = false;
    for &(ki, relationship_strength) in &share_targets {
        let recipient_memory = organisms[ki].traits.memory_strength;
        let same_lineage = organisms[ki].lineage_id == org_lineage;
        let source_factor = recipient_source_trust_factor(&organisms[ki], &org_id, same_lineage);
        let resource_strength = relationship_strength * source_factor;
        let danger_strength = relationship_strength * source_factor.max(0.60);
        for &((x, y), v) in &food_to_share {
            Organism::remember(
                &mut organisms[ki].food_memory,
                x,
                y,
                v * resource_strength,
                recipient_memory,
            );
            shared_any = true;
        }
        for &((x, y), v) in &water_to_share {
            Organism::remember(
                &mut organisms[ki].water_memory,
                x,
                y,
                v * resource_strength,
                recipient_memory,
            );
            shared_any = true;
        }
        for &((x, y), v) in &danger_to_share {
            Organism::remember(
                &mut organisms[ki].danger_memory,
                x,
                y,
                v * danger_strength * 1.25,
                recipient_memory,
            );
            shared_any = true;
        }
        let ki_id = organisms[ki].id.clone();
        let t = organisms[ki].org_trust.entry(org_id.clone()).or_insert(0.0);
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
            organisms[ki].add_friend(&oi, &on, tick);
        }
        if my_trust_after >= FRIEND_THRESHOLD {
            let ki_name = organisms[ki].name.clone();
            organisms[org_idx].add_friend(&ki_id, &ki_name, tick);
        }
    }

    if shared_any {
        organisms[org_idx].think("sharing what I know", tick);
    }

    // `words`, not `as_hashmap`: `converge_with` only ever looks a real
    // concept up in these maps, so carrying the reserved clock blob would
    // cost a ~400-number string per peer per conversation for nothing.
    let peer_snapshots: Vec<crate::hashing::FxHashMap<String, String>> = share_targets
        .iter()
        .map(|&(ki, _)| organisms[ki].vocabulary.words())
        .collect();
    organisms[org_idx]
        .vocabulary
        .converge_with(&peer_snapshots, rng, 0.40, tick);
    let mut all_snapshots = peer_snapshots.clone();
    all_snapshots.push(my_vocab.words());
    for &(ki, _) in &share_targets {
        organisms[ki]
            .vocabulary
            .converge_with(&all_snapshots, rng, 0.40, tick);
    }
}
