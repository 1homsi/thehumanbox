use super::*;

pub fn challenge_stranger(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    history: &mut History,
) -> f32 {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id = organisms[org_idx].id.clone();

    let target_idx = spatial
        .ordered_nearby(organisms, organisms[org_idx].x, organisms[org_idx].y, 3)
        .filter(|(i, o)| *i != org_idx && o.alive && o.lineage_id != org_lineage)
        .filter(|(_, o)| (o.x - organisms[org_idx].x).abs() + (o.y - organisms[org_idx].y).abs() < 3.0)
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

    let kin_backing = spatial
        .ordered_nearby(organisms, organisms[org_idx].x, organisms[org_idx].y, 4)
        .map(|(_, o)| o)
        .filter(|o| (o.x - organisms[org_idx].x).abs() + (o.y - organisms[org_idx].y).abs() <= 4.0)
        .filter(|o| o.alive && o.lineage_id == org_lineage)
        .count()
        .saturating_sub(1);

    let allied_backing = spatial
        .ordered_nearby(organisms, organisms[org_idx].x, organisms[org_idx].y, 5)
        .map(|(_, o)| o)
        .filter(|o| o.alive && o.lineage_id != org_lineage && o.lineage_id != target_lid)
        .filter(|o| organisms[org_idx].attitude_toward(&o.lineage_id) >= 0.4)
        .filter(|o| (o.x - organisms[org_idx].x).abs() + (o.y - organisms[org_idx].y).abs() <= 5.0)
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
    organisms[ti].mark_harm(crate::organism::organism::Harm::Fight, tick);

    organisms[org_idx].update_attitude(&target_lid, -0.20);
    organisms[ti].update_attitude(&org_lineage, -0.30);

    let t_trust = organisms[ti].org_trust.entry(org_id).or_insert(0.0);
    *t_trust = (*t_trust - 0.20).max(-1.0);

    let (tx, ty) = (organisms[ti].x as i32, organisms[ti].y as i32);
    let att_after = organisms[ti].attitude_toward(&org_lineage);
    let ti_mem_trait = organisms[ti].traits.memory_strength;
    let mem_strength = (0.55 + (-att_after).max(0.0) * 0.35).min(1.0);
    Organism::remember(
        &mut organisms[ti].danger_memory,
        tx,
        ty,
        mem_strength,
        ti_mem_trait,
    );

    let target_kin = spatial
        .ordered_nearby(organisms, organisms[ti].x, organisms[ti].y, 4)
        .map(|(_, o)| o)
        .filter(|o| (o.x - organisms[ti].x).abs() + (o.y - organisms[ti].y).abs() <= 4.0)
        .filter(|o| o.alive && o.lineage_id == target_lid)
        .count()
        .saturating_sub(1);

    if organisms[ti].health > 0.5 && target_kin >= 2 {
        organisms[org_idx].health = (organisms[org_idx].health - 0.015).max(0.0);
        organisms[org_idx].mark_harm(crate::organism::organism::Harm::Fight, tick);
    }

    let org_name = organisms[org_idx].name.clone();
    organisms[org_idx].think(thought, tick);
    history.challenges_total += 1;

    if kin_backing >= 1 {
        push_event(
            events,
            tick,
            "challenge",
            &org_name,
            &format!("vs {} ({} kin backing)", target_name, kin_backing),
        );
    }

    {
        use crate::organism::memory::{MemoryEntry, MemoryKind};
        let target_name_for_mem = target_name.clone();
        let attacker_name = org_name.clone();
        let target_id_for_mem = organisms[ti].id.clone();
        let attacker_id_for_mem = organisms[org_idx].id.clone();
        organisms[ti].memories.insert(
            MemoryEntry::new(
                MemoryKind::Bond,
                format!("{} struck me with their kin behind them", attacker_name),
                tick,
            )
            .with_salience(0.78)
            .with_emotion(-2)
            .with_related(attacker_id_for_mem),
        );
        organisms[org_idx].memories.insert(
            MemoryEntry::new(
                MemoryKind::Episode,
                format!("I challenged {}", target_name_for_mem),
                tick,
            )
            .with_salience(0.55)
            .with_emotion(0)
            .with_related(target_id_for_mem),
        );
    }

    reward * (0.5 + organisms[org_idx].traits.aggression)
}

pub fn groom(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
) -> f32 {
    let (ox, oy) = (organisms[org_idx].x, organisms[org_idx].y);
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let org_id = organisms[org_idx].id.clone();
    let friend_ids: crate::hashing::FxHashSet<String> = organisms[org_idx].friends.keys().cloned().collect();
    let high_trust: crate::hashing::FxHashSet<String> = organisms[org_idx]
        .org_trust
        .iter()
        .filter(|(_, &v)| v >= 0.55)
        .map(|(k, _)| k.clone())
        .collect();

    let target_idx = spatial
        .ordered_nearby(organisms, ox, oy, 3)
        .filter(|(i, o)| {
            if *i == org_idx || !o.alive {
                return false;
            }
            let same_lineage = o.lineage_id == org_lineage;
            let bonded = friend_ids.contains(&o.id) || high_trust.contains(&o.id);
            let not_hostile = same_lineage || organisms[org_idx].attitude_toward(&o.lineage_id) >= -0.15;
            (same_lineage || bonded) && not_hostile
        })
        .filter(|(_, o)| (o.x - ox).abs() + (o.y - oy).abs() <= 3.0)
        .min_by(|(_, a), (_, b)| {
            let a_needs_care = (a.infection > 0.05) as u8 + (a.grief_ticks > 0) as u8;
            let b_needs_care = (b.infection > 0.05) as u8 + (b.grief_ticks > 0) as u8;
            if a_needs_care != b_needs_care {
                return b_needs_care.cmp(&a_needs_care);
            }
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
    let ti_id = organisms[ti].id.clone();
    let target_lineage = organisms[ti].lineage_id.clone();
    let cross_lineage = target_lineage != org_lineage;

    organisms[org_idx].infection = (organisms[org_idx].infection * 0.94).max(0.0);
    organisms[ti].infection = (organisms[ti].infection * 0.94).max(0.0);

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

    if organisms[org_idx].grief_ticks > 0 {
        organisms[org_idx].grief_ticks = organisms[org_idx].grief_ticks.saturating_sub(8);
    }
    if organisms[ti].grief_ticks > 0 {
        organisms[ti].grief_ticks = organisms[ti].grief_ticks.saturating_sub(8);
    }
    if cross_lineage {
        organisms[org_idx].update_attitude(&target_lineage, 0.01);
        organisms[ti].update_attitude(&org_lineage, 0.018);
    }

    let org_name = organisms[org_idx].name.clone();
    organisms[org_idx].think(
        &format!("grooming {}", &target_name[..4.min(target_name.len())]),
        tick,
    );

    if organisms[ti].infection > 0.15 || cross_lineage {
        let detail = if cross_lineage {
            format!("grooming {} (trusted care)", target_name)
        } else {
            format!("grooming {} (healing touch)", target_name)
        };
        push_event(events, tick, "social", &org_name, &detail);
    }
    if cross_lineage {
        0.018
    } else {
        0.012
    }
}
