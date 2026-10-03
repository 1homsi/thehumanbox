use super::*;

pub(super) fn tick_religion_schism(sim: &mut Simulation) {
    use crate::sim::actions::religion_expanded::{create_religion, recount_religion_adherents};
    use rand::RngExt;
    let mut counts: HashMap<String, u32> = HashMap::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if let Some(rid) = o.religion_id.as_ref() {
            *counts.entry(rid.clone()).or_insert(0) += 1;
        }
    }
    // `max_by_key` returns the *last* maximum in iteration order, so a tie
    // between equally-followed faiths was resolved by HashMap order. Break
    // ties on the religion id.
    let big = counts
        .iter()
        .filter(|(_, n)| **n >= 12)
        .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)));
    let Some((parent_id, _)) = big else {
        return;
    };
    let parent_id = parent_id.clone();
    if sim.rng.random::<f32>() >= 0.05 {
        return;
    }
    let Some(parent) = sim.religions.iter().find(|r| r.id == parent_id) else {
        return;
    };
    let kind = parent.kind;
    let parent_name = parent.name.clone();

    let converts: Vec<usize> = sim
        .organisms
        .iter()
        .enumerate()
        .filter(|(_, o)| o.alive && o.religion_id.as_deref() == Some(parent_id.as_str()))
        .map(|(i, _)| i)
        .collect();
    let mut chosen: Vec<usize> = Vec::new();
    for i in converts {
        if sim.rng.random::<f32>() < 0.4 {
            chosen.push(i);
        }
    }
    if chosen.len() == counts.get(&parent_id).copied().unwrap_or(0) as usize {
        chosen.pop();
    }
    if chosen.len() < 3 {
        return;
    }

    let founder_lineage = sim.organisms[chosen[0]].lineage_id.clone();
    let tick = sim.tick_count;
    let name_seed = tick.wrapping_add(chosen.len() as u64).wrapping_add(7);
    let sect_id = create_religion(sim, kind, &founder_lineage, tick, name_seed);
    for &i in &chosen {
        sim.organisms[i].religion_id = Some(sect_id.clone());
    }
    recount_religion_adherents(sim);
    let sect_name = sim
        .religions
        .iter()
        .find(|religion| religion.id == sect_id)
        .map(|religion| religion.name.clone())
        .unwrap_or_else(|| sect_id.clone());
    let line = format!(
        "\u{271D}\u{FE0F} A schism splits {}: the {} sect breaks away with {} believers.",
        parent_name,
        sect_name,
        chosen.len()
    );
    push_event(&mut sim.events, tick, "religion", "world", &line);
    sim.headlines.push_back((tick, line));
    while sim.headlines.len() > 80 {
        sim.headlines.pop_front();
    }
}

pub(super) fn tick_religion_founding(sim: &mut Simulation) {
    use crate::sim::actions::religion_expanded::{create_religion, recount_religion_adherents};

    // Sorted: this loop draws from `sim.rng` per candidate kind, so
    // HashSet order changed which faiths were founded and shifted the
    // shared RNG stream.
    let mut lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    lineages.sort();
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
            if k.era_unlock() <= era && !existing_kinds.contains(&k) && sim.rng.random::<f32>() < 0.08 {
                let Some(founder_idx) = sim
                    .organisms
                    .iter()
                    .position(|o| o.alive && o.lineage_id == lid && o.religion_id.is_none())
                    .or_else(|| sim.organisms.iter().position(|o| o.alive && o.lineage_id == lid))
                else {
                    break;
                };
                let tick = sim.tick_count;
                let name_seed = tick.wrapping_add(lid.len() as u64);
                let id = create_religion(sim, k, &lid, tick, name_seed);
                sim.organisms[founder_idx].religion_id = Some(id.clone());
                sim.organisms[founder_idx].piety = sim.organisms[founder_idx].piety.max(0.30);
                recount_religion_adherents(sim);
                let name = sim
                    .religions
                    .iter()
                    .find(|religion| religion.id == id)
                    .map(|religion| religion.name.clone())
                    .unwrap_or_else(|| id.clone());
                push_event(
                    &mut sim.events,
                    tick,
                    "religion_founded",
                    &lid,
                    &format!("founded {} ({})", name, k.name()),
                );
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

pub(super) fn tick_religion_adherents(sim: &mut Simulation) {
    if sim.religions.is_empty() {
        return;
    }
    let mut adherents_by_id: rustc_hash::FxHashMap<String, u32> = rustc_hash::FxHashMap::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        if let Some(rid) = o.religion_id.as_ref() {
            *adherents_by_id.entry(rid.clone()).or_insert(0) += 1;
        }
    }
    let mut religion_by_lineage: rustc_hash::FxHashMap<String, String> = rustc_hash::FxHashMap::default();
    for r in sim.religions.iter() {
        religion_by_lineage
            .entry(r.founder_lineage.clone())
            .or_insert(r.id.clone());
    }
    let total_followers: u32 = adherents_by_id.values().sum();
    // Tie-break on the religion id: `max_by_key` returns the last maximum in
    // iteration order, so undecided organisms converted to a
    // hash-order-dependent faith.
    let dominant: Option<(String, u32)> = adherents_by_id
        .iter()
        .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)))
        .map(|(id, n)| (id.clone(), *n));
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
                continue;
            }
        }
        if let Some((did, dn)) = dominant.as_ref() {
            if *dn >= 3 && total_followers > 0 {
                let share = (*dn as f32 / total_followers as f32).min(0.9);
                if sim.rng.random::<f32>()
                    < convert_chance * (0.4 + org.traits.social_tendency) * (0.5 + share)
                {
                    org.religion_id = Some(did.clone());
                    org.piety = 0.15 + org.traits.social_tendency * 0.20;
                    *adherents_by_id.entry(did.clone()).or_insert(0) += 1;
                }
            }
        }
    }
    for r in sim.religions.iter_mut() {
        r.adherents = adherents_by_id.get(&r.id).copied().unwrap_or(0);
    }
    forget_empty_faiths(sim);
}

/// A tribe that has died out holds no land and keeps no home: its claims
/// stayed on the territory map, and counted towards contested ground, long
/// after the last of its people was gone.
pub(super) fn forget_vanished_tribes(sim: &mut Simulation) {
    let living: HashSet<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect();
    let before = sim.territory.len();
    sim.territory.retain(|lineage, _| living.contains(lineage));
    sim.lineage_homes.retain(|lineage, _| living.contains(lineage));
    if sim.territory.len() != before {
        // Rebuild the map's territory on the next snapshot.
        sim.slow_compute_tick = 0;
    }
}

/// Ticks a faith lingers with no one keeping it before it is forgotten.
pub(super) const FAITH_FORGOTTEN_TICKS: u64 = 3_000;

/// A faith nobody keeps any more fades from the world. Before this every
/// faith ever founded stayed on the books: an old world counted 68 of them
/// for nine living tribes.
pub(super) fn forget_empty_faiths(sim: &mut Simulation) {
    let now = sim.tick_count;
    let mut forgotten: Vec<String> = Vec::new();
    for r in &sim.religions {
        if r.adherents > 0 {
            sim.faith_empty_since.remove(&r.id);
            continue;
        }
        let since = *sim.faith_empty_since.entry(r.id.clone()).or_insert(now);
        if now.saturating_sub(since) >= FAITH_FORGOTTEN_TICKS {
            forgotten.push(r.id.clone());
        }
    }
    if forgotten.is_empty() {
        return;
    }
    let names: Vec<String> = sim
        .religions
        .iter()
        .filter(|r| forgotten.contains(&r.id))
        .map(|r| r.name.clone())
        .collect();
    sim.religions.retain(|r| !forgotten.contains(&r.id));
    for id in &forgotten {
        sim.faith_empty_since.remove(id);
    }
    for name in names {
        push_event(
            &mut sim.events,
            now,
            "life",
            &name,
            "was forgotten: no one keeps the faith any more",
        );
    }
}

pub(super) fn tick_religion_effects(sim: &mut Simulation) {
    use crate::sim::tech::buildings::BuildingKind as BK;
    if sim.religions.is_empty() {
        return;
    }
    let temple_anchors: Vec<(f32, f32, Option<String>)> = sim
        .buildings
        .iter()
        .filter(|b| {
            b.is_operational()
                && matches!(
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
