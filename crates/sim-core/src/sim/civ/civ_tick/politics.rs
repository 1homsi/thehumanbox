use super::*;

pub(super) fn tick_diplomacy(sim: &mut Simulation) {
    use crate::sim::civ::warfare::{
        establish_treaty, has_active_battle_between, has_active_treaty, TreatyKind,
    };
    let tick = sim.tick_count;
    let mut sums: HashMap<(String, String), (f32, u32)> = HashMap::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        for (other, att) in o.lineage_attitudes.iter() {
            if other == &o.lineage_id {
                continue;
            }
            let e = sums
                .entry((o.lineage_id.clone(), other.clone()))
                .or_insert((0.0, 0));
            e.0 += *att;
            e.1 += 1;
        }
    }
    let avg = |a: &str, b: &str| -> Option<f32> {
        sums.get(&(a.to_string(), b.to_string()))
            .map(|(s, n)| s / *n as f32)
    };
    let mut lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    lineages.sort();
    let mut formed = 0;
    for i in 0..lineages.len() {
        for j in (i + 1)..lineages.len() {
            if formed >= 2 {
                break;
            }
            let (a, b) = (&lineages[i], &lineages[j]);
            if has_active_treaty(&sim.treaties, a, b, tick) || has_active_battle_between(&sim.battles, a, b) {
                continue;
            }
            let warm = matches!((avg(a, b), avg(b, a)), (Some(x), Some(y)) if x > 0.35 && y > 0.35);
            if !warm {
                continue;
            }
            if !establish_treaty(
                &mut sim.treaties,
                &mut sim.organisms,
                a,
                b,
                TreatyKind::Alliance,
                tick,
                tick.saturating_add(12_000),
            ) {
                continue;
            }
            let na = sim.lineage_names.get(a).cloned().unwrap_or_else(|| a.clone());
            let nb = sim.lineage_names.get(b).cloned().unwrap_or_else(|| b.clone());
            let line = format!("\u{1F91D} {} and {} forged an alliance.", na, nb);
            push_event(&mut sim.events, tick, "treaty", "world", &line);
            sim.headlines.push_back((tick, line));
            while sim.headlines.len() > 80 {
                sim.headlines.pop_front();
            }
            formed += 1;
        }
    }
}

pub(super) fn tick_dynasty_watch(sim: &mut Simulation) {
    let mut pop_now: HashMap<String, u32> = HashMap::default();
    for o in sim.organisms.iter().filter(|o| o.alive) {
        *pop_now.entry(o.lineage_id.clone()).or_insert(0) += 1;
    }
    let tick = sim.tick_count;
    let tracked: Vec<String> = sim.lineage_peak_pop.keys().cloned().collect();
    for lid in tracked {
        let peak = sim.lineage_peak_pop.get(&lid).copied().unwrap_or(0);
        if pop_now.get(&lid).copied().unwrap_or(0) == 0 && peak >= 8 {
            let name = sim
                .lineage_names
                .get(&lid)
                .cloned()
                .unwrap_or_else(|| lid.clone());
            let line = format!(
                "\u{1F480} The {} dynasty has died out, after rising to {} strong.",
                name, peak
            );
            push_event(&mut sim.events, tick, "milestone", "world", &line);
            sim.headlines.push_back((tick, line));
            while sim.headlines.len() > 80 {
                sim.headlines.pop_front();
            }
            sim.lineage_peak_pop.remove(&lid);
        }
    }
    for (lid, n) in pop_now {
        let e = sim.lineage_peak_pop.entry(lid).or_insert(0);
        if n > *e {
            *e = n;
        }
    }
}

pub(super) fn seat_building_for(gov_kind: &str) -> Option<BuildingKind> {
    use BuildingKind::*;
    match gov_kind {
        "monarchy" | "empire" => Some(Castle),
        "republic" | "democracy" | "federation" => Some(CityHall),
        "theocracy" => Some(Temple),
        "corporate" => Some(OfficeTower),
        "chiefdom" => Some(GuildHall),
        _ => None,
    }
}

pub(super) fn tick_governments(sim: &mut Simulation) {
    // Sorted: `pick_leaders` (called below) rolls for coups against
    // `sim.rng`, so HashSet order decided who became monarch.
    let mut lineages: Vec<String> = sim
        .organisms
        .iter()
        .filter(|o| o.alive)
        .map(|o| o.lineage_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    lineages.sort();
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
            if let Some(government) = sim.governments.get_mut(lid) {
                government.transition_to(target_kind, sim.tick_count);
            } else {
                let government = Government::new(lid.clone(), target_kind, sim.tick_count);
                sim.governments.insert(lid.clone(), government);
            }
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
        // A government may be declared immediately, but its physical seat is
        // a real construction project. Retry on later government ticks when
        // the lineage initially lacks materials instead of granting it free.
        if let Some(seat) = seat_building_for(target_kind.name()) {
            let already = sim
                .buildings
                .iter()
                .any(|b| b.kind == seat && b.owner_lineage.as_deref() == Some(lid.as_str()));
            let (cx, cy) = lineage_center(sim, lid);
            if !already && (cx != 0 || cy != 0) {
                try_start_building(sim, lid, seat, cx, cy);
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

pub(super) fn try_enact_law(g: &mut Government, era: Era, tick: u64) {
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

pub(super) fn tick_leader_influence(sim: &mut Simulation) {
    let leader_attitudes: rustc_hash::FxHashMap<String, Vec<(String, f32)>> = {
        let mut out: rustc_hash::FxHashMap<String, Vec<(String, f32)>> = rustc_hash::FxHashMap::default();
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

pub(super) fn pick_leaders(sim: &mut Simulation, lineages: &[String]) {
    use rand::RngExt;
    let mut announcements: Vec<(u64, String)> = Vec::new();
    let tick = sim.tick_count;

    // Single O(n) pass: clear every leader flag and bucket eligible
    // (adult/elder) candidates by lineage, instead of re-scanning the whole
    // organism list once per lineage.
    let mut candidates_by_lineage: HashMap<String, Vec<(usize, f32)>> = HashMap::default();
    for i in 0..sim.organisms.len() {
        let o = &mut sim.organisms[i];
        o.is_leader = false;
        if !o.alive {
            continue;
        }
        let stage = o.age_stage();
        if stage != AgeStage::Adult && stage != AgeStage::Elder {
            continue;
        }
        let score =
            o.traits.social_tendency + o.traits.memory_strength + o.traits.curiosity + (o.literacy * 0.5);
        candidates_by_lineage
            .entry(o.lineage_id.clone())
            .or_default()
            .push((i, score));
    }

    for lid in lineages {
        let Some(g) = sim.governments.get(lid) else {
            continue;
        };
        let kind = g.kind;
        if kind.leader_count() == 0 {
            continue;
        }
        let want = kind.leader_count() as usize;
        let prev_leader_id = g.leader_id.clone();

        let Some(candidates) = candidates_by_lineage.get_mut(lid) else {
            continue;
        };
        if candidates.is_empty() {
            continue;
        }
        candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let prev_leader_alive = prev_leader_id
            .as_ref()
            .map(|pid| candidates.iter().any(|c| &sim.organisms[c.0].id == pid))
            .unwrap_or(false);

        // A living monarch reigns until death — but may be toppled in a coup.
        let coup = prev_leader_alive
            && kind.is_hereditary()
            && candidates.len() > 1
            && sim.rng.random::<f32>() < 0.02;

        let mut primary_idx = candidates[0].0;
        let mut event: Option<&str> = None;
        if prev_leader_alive && !coup {
            if let Some(pid) = &prev_leader_id {
                if let Some(c) = candidates.iter().find(|c| &sim.organisms[c.0].id == pid) {
                    primary_idx = c.0;
                }
            }
        } else if coup {
            // Highest-scoring challenger who is not the deposed ruler.
            if let Some(c) = candidates
                .iter()
                .find(|c| Some(&sim.organisms[c.0].id) != prev_leader_id.as_ref())
            {
                primary_idx = c.0;
            }
            event = Some("seized power in a coup");
        } else {
            // Vacant throne. Hereditary lines pass to an heir if one lives.
            if kind.is_hereditary() {
                if let Some(pid) = &prev_leader_id {
                    let heir = candidates.iter().find(|c| {
                        let o = &sim.organisms[c.0];
                        o.parent_id == *pid || o.father_id.as_deref() == Some(pid.as_str())
                    });
                    if let Some(h) = heir {
                        primary_idx = h.0;
                        event = Some("succeeds to the throne as heir");
                    } else {
                        event = Some("takes the throne, the old line ended");
                    }
                }
            }
        }

        let council_idx: Vec<usize> = candidates
            .iter()
            .map(|c| c.0)
            .filter(|&i| i != primary_idx)
            .take(want.saturating_sub(1))
            .collect();
        let leader_id = sim.organisms[primary_idx].id.clone();

        sim.organisms[primary_idx].is_leader = true;
        for &ci in &council_idx {
            sim.organisms[ci].is_leader = true;
        }
        let council_ids: Vec<String> = council_idx.iter().map(|&i| sim.organisms[i].id.clone()).collect();

        if let Some(verb) = event {
            let lname = sim.lineage_names.get(lid).cloned().unwrap_or_else(|| lid.clone());
            let leader_name = sim.organisms[primary_idx].name.clone();
            announcements.push((
                tick,
                format!("\u{1F451} {} of the {} {}.", leader_name, lname, verb),
            ));
        }

        if let Some(g) = sim.governments.get_mut(lid) {
            g.leader_id = Some(leader_id);
            g.council_ids = council_ids;
        }
    }
    for (t, line) in announcements {
        push_event(&mut sim.events, t, "government_changed", "world", &line);
        sim.headlines.push_back((t, line));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}
