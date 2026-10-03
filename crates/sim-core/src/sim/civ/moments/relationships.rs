use super::*;

pub(in crate::sim::civ) fn tick_grudge_recall(sim: &mut Simulation) {
    use crate::organism::memory::MemoryKind;
    use rustc_hash::FxHashSet as HashSet;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let mut snapshot: Vec<(usize, f32, f32, HashSet<String>)> = Vec::with_capacity(n / 4);
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        let mut foes: HashSet<String> = HashSet::with_capacity_and_hasher(4, Default::default());
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

pub(in crate::sim::civ) fn tick_partner_pillow_talk(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let pairs: Vec<(usize, usize)> = {
        let mut by_id: rustc_hash::FxHashMap<&str, usize> = rustc_hash::FxHashMap::default();
        for (i, o) in sim.organisms.iter().enumerate() {
            if o.alive {
                by_id.insert(o.id.as_str(), i);
            }
        }
        let mut out: Vec<(usize, usize)> = Vec::new();
        let mut seen: rustc_hash::FxHashSet<(usize, usize)> = rustc_hash::FxHashSet::default();
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

pub(in crate::sim::civ) fn tick_arguments(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_reconciliations(sim: &mut Simulation) {
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

pub(in crate::sim::civ) fn tick_separations(sim: &mut Simulation) {
    use rand::RngExt;
    let tick = sim.tick_count;
    let mut by_id: HashMap<String, usize> = HashMap::default();
    for (i, o) in sim.organisms.iter().enumerate() {
        if o.alive {
            by_id.insert(o.id.clone(), i);
        }
    }
    let mut seen: HashSet<(usize, usize)> = HashSet::default();
    let mut strained: Vec<(usize, usize, String, String)> = Vec::new();
    for (i, o) in sim.organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        let Some(ref pid) = o.partner_id else { continue };
        let Some(&j) = by_id.get(pid) else { continue };
        if i == j {
            continue;
        }
        let key = if i < j { (i, j) } else { (j, i) };
        if !seen.insert(key) {
            continue;
        }
        let p = &sim.organisms[j];
        let a_trust = o.org_trust.get(&p.id).copied().unwrap_or(0.0);
        let b_trust = p.org_trust.get(&o.id).copied().unwrap_or(0.0);
        if a_trust < -0.05 || b_trust < -0.05 {
            strained.push((i, j, o.name.clone(), p.name.clone()));
        }
    }
    for (i, j, a_name, b_name) in strained {
        if sim.rng.random::<f32>() >= 0.05 {
            continue;
        }
        let lid = sim.organisms[i].lineage_id.clone();
        sim.organisms[i].partner_id = None;
        sim.organisms[j].partner_id = None;
        sim.organisms[i].comfort = (sim.organisms[i].comfort - 0.1).max(0.0);
        sim.organisms[j].comfort = (sim.organisms[j].comfort - 0.1).max(0.0);
        let bid = sim.organisms[j].id.clone();
        let aid = sim.organisms[i].id.clone();
        sim.organisms[i].log_life_rel(
            tick,
            "farewell",
            format!("parted ways with {}", b_name),
            Some(bid),
            Some(b_name.clone()),
        );
        sim.organisms[j].log_life_rel(
            tick,
            "farewell",
            format!("parted ways with {}", a_name),
            Some(aid),
            Some(a_name.clone()),
        );
        let h = format!("\u{1F494} {} and {} parted ways.", a_name, b_name);
        push_event(&mut sim.events, tick, "marriage", &lid, &h);
        sim.headlines.push_back((tick, h));
        while sim.headlines.len() > 80 {
            sim.headlines.pop_front();
        }
    }
}

pub(in crate::sim::civ) fn tick_weddings(sim: &mut Simulation) {
    use crate::organism::memory::{MemoryEntry, MemoryKind};
    let tick = sim.tick_count;
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    let pairs: Vec<(usize, usize, String, f32, f32)> = {
        let mut seen: HashSet<(usize, usize)> = HashSet::default();
        let mut out: Vec<(usize, usize, String, f32, f32)> = Vec::new();
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

pub(in crate::sim::civ) fn tick_friend_gravitation(sim: &mut Simulation) {
    let n = sim.organisms.len();
    if n == 0 {
        return;
    }
    // O(1) friend resolution instead of a full organisms scan per friend.
    let mut id_to_idx: HashMap<&str, usize> = HashMap::with_capacity_and_hasher(n, Default::default());
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
        // `friends` is a std HashMap and the `d >= b` guard keeps the
        // *first* candidate at the minimal distance, so equal-distance
        // friends (common on a grid) were picked by hash order. Sort for a
        // reproducible walk target.
        let mut friend_ids: Vec<&String> = o.friends.keys().collect();
        friend_ids.sort();
        for friend_id in friend_ids {
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

pub(in crate::sim::civ) fn tick_teaching(sim: &mut Simulation) {
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
