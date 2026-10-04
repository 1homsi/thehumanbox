use super::*;

pub fn scale_for_participants(n: usize) -> BattleScale {
    if n >= BattleScale::War.min_participants() {
        BattleScale::War
    } else if n >= BattleScale::Battle.min_participants() {
        BattleScale::Battle
    } else if n >= BattleScale::Siege.min_participants() {
        BattleScale::Siege
    } else if n >= BattleScale::Raid.min_participants() {
        BattleScale::Raid
    } else {
        BattleScale::Skirmish
    }
}

pub const MAX_BATTLE_TICKS: u64 = 200;
pub const STRENGTH_BREAK_FRAC: f32 = 0.30;
pub const RAID_CHECK_INTERVAL: u64 = 240;
pub const RAID_ATTITUDE_THRESHOLD: f32 = -0.45;
pub const RAID_MIN_POP: usize = 8;

pub fn try_spawn_raids(
    tick: u64,
    rng: &mut rand_chacha::ChaCha8Rng,
    organisms: &[crate::organism::organism::Organism],
    _territory: &HashMap<String, HashSet<(i32, i32)>>,
    treaties: &[Treaty],
    active_battles: &[Battle],
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
) -> Vec<Battle> {
    use rand::RngExt;
    let mut out = Vec::new();
    if !tick.is_multiple_of(RAID_CHECK_INTERVAL) {
        return out;
    }

    let mut pop_per_lineage: HashMap<String, Vec<usize>> = HashMap::default();
    for (i, o) in organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        pop_per_lineage.entry(o.lineage_id.clone()).or_default().push(i);
    }

    let mut already_engaged: HashSet<String> = HashSet::default();
    for b in active_battles {
        if b.ended_tick.is_some() {
            continue;
        }
        for l in b.attackers.iter().chain(b.defenders.iter()) {
            already_engaged.insert(l.clone());
        }
    }

    // Sorted: the loop below draws from `rng` per lineage, so HashMap order
    // decided the raid outcome and shifted the shared RNG stream.
    let mut lineage_ids: Vec<String> = pop_per_lineage.keys().cloned().collect();
    lineage_ids.sort();
    for a_lid in &lineage_ids {
        let a_pop = pop_per_lineage.get(a_lid).map(|v| v.len()).unwrap_or(0);
        if a_pop < RAID_MIN_POP {
            continue;
        }
        if already_engaged.contains(a_lid) {
            continue;
        }

        let attacker_org = pop_per_lineage[a_lid].iter().find_map(|&i| {
            if organisms[i].alive {
                Some(&organisms[i])
            } else {
                None
            }
        });
        let attacker_org = match attacker_org {
            Some(o) => o,
            None => continue,
        };

        let mut candidates: Vec<(String, f32)> = attacker_org
            .lineage_attitudes
            .iter()
            .filter(|(lid, att)| {
                **att <= RAID_ATTITUDE_THRESHOLD
                    && pop_per_lineage.get(*lid).map(|v| v.len()).unwrap_or(0) >= RAID_MIN_POP
                    && !already_engaged.contains(*lid)
                    && !has_active_treaty(treaties, a_lid, lid, tick)
                    && *lid != a_lid
            })
            .map(|(lid, att)| (lid.clone(), *att))
            .collect();
        if candidates.is_empty() {
            continue;
        }

        // `lineage_attitudes` is a std `HashMap`, so equal attitudes (very
        // common once values saturate) were tie-broken by per-process hash
        // order — i.e. the raid target changed run to run. Break ties on the
        // lineage id so the choice is reproducible.
        candidates.sort_by(|x, y| {
            x.1.partial_cmp(&y.1)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| x.0.cmp(&y.0))
        });
        let (b_lid, _) = candidates.remove(0);

        if rng.random::<f32>() > 0.35 {
            continue;
        }

        let a_centroid = lineage_centroid(organisms, a_lid);
        let b_centroid = lineage_centroid(organisms, &b_lid);
        let (ax, ay) = a_centroid;
        let (bx, by) = b_centroid;
        let loc = ((ax + bx) / 2, (ay + by) / 2);

        let n_per_side = 3 + (rng.random::<u32>() % 3) as usize;
        let attacker_orgs = pick_combatants(organisms, &pop_per_lineage, a_lid, n_per_side, loc, rng);
        let defender_orgs = pick_combatants(organisms, &pop_per_lineage, &b_lid, n_per_side, loc, rng);
        if attacker_orgs.is_empty() || defender_orgs.is_empty() {
            continue;
        }

        let id = format!("battle_{}_{}_{}", tick, a_lid, b_lid);
        let initial_a = attacker_orgs.len() as u32;
        let initial_d = defender_orgs.len() as u32;
        let battle = Battle {
            id: id.clone(),
            attackers: vec![a_lid.clone()],
            defenders: vec![b_lid.clone()],
            attacker_orgs,
            defender_orgs,
            scale: BattleScale::Raid,
            location: loc,
            started_tick: tick,
            ended_tick: None,
            casualties_a: 0,
            casualties_d: 0,
            outcome: None,
            initial_a,
            initial_d,
        };
        already_engaged.insert(a_lid.clone());
        already_engaged.insert(b_lid.clone());
        push_event(
            events,
            tick,
            "raid_started",
            a_lid,
            &format!("raid against {} at ({},{})", b_lid, loc.0, loc.1),
        );
        push_event(
            events,
            tick,
            "battle_began",
            &id,
            &format!("{} attacks {} ({})", a_lid, b_lid, BattleScale::Raid.name()),
        );
        out.push(battle);
    }
    out
}

pub const BORDER_WAR_CHECK_INTERVAL: u64 = 480;
pub const BORDER_WAR_ATTITUDE_THRESHOLD: f32 = -0.20;
pub const BORDER_WAR_MIN_POP: usize = 18;
pub const BORDER_WAR_BORDER_OVERLAP_MIN: usize = 6;

pub fn try_spawn_border_wars(
    tick: u64,
    rng: &mut rand_chacha::ChaCha8Rng,
    organisms: &[crate::organism::organism::Organism],
    territory: &HashMap<String, HashSet<(i32, i32)>>,
    treaties: &[Treaty],
    active_battles: &[Battle],
    events: &mut std::collections::VecDeque<crate::sim::simulation::Event>,
) -> Vec<Battle> {
    use rand::RngExt;
    let mut out = Vec::new();
    if tick == 0 || !tick.is_multiple_of(BORDER_WAR_CHECK_INTERVAL) {
        return out;
    }

    let mut pop_per_lineage: HashMap<String, Vec<usize>> = HashMap::default();
    for (i, o) in organisms.iter().enumerate() {
        if !o.alive {
            continue;
        }
        pop_per_lineage.entry(o.lineage_id.clone()).or_default().push(i);
    }

    let mut already_engaged: HashSet<String> = HashSet::default();
    for b in active_battles {
        if b.ended_tick.is_some() {
            continue;
        }
        for l in b.attackers.iter().chain(b.defenders.iter()) {
            already_engaged.insert(l.clone());
        }
    }

    // Sorted: the pair loop draws from `rng` and `break`s after the first
    // match, so HashMap order decided which pair went to war.
    let mut lineages: Vec<&String> = pop_per_lineage.keys().collect();
    lineages.sort();
    for i in 0..lineages.len() {
        let a_lid = lineages[i];
        let a_pop = pop_per_lineage.get(a_lid).map(|v| v.len()).unwrap_or(0);
        if a_pop < BORDER_WAR_MIN_POP || already_engaged.contains(a_lid) {
            continue;
        }
        let Some(a_terr) = territory.get(a_lid) else {
            continue;
        };
        if a_terr.is_empty() {
            continue;
        }
        let attacker_sample = pop_per_lineage[a_lid].iter().find_map(|&oi| {
            if organisms[oi].alive {
                Some(&organisms[oi])
            } else {
                None
            }
        });
        let Some(attacker_sample) = attacker_sample else {
            continue;
        };

        for j in (i + 1)..lineages.len() {
            let b_lid = lineages[j];
            if already_engaged.contains(b_lid) {
                continue;
            }
            if has_active_treaty(treaties, a_lid, b_lid, tick) {
                continue;
            }
            let b_pop = pop_per_lineage.get(b_lid).map(|v| v.len()).unwrap_or(0);
            if b_pop < BORDER_WAR_MIN_POP {
                continue;
            }
            let Some(b_terr) = territory.get(b_lid) else {
                continue;
            };
            if b_terr.is_empty() {
                continue;
            }
            let att_ab = attacker_sample
                .lineage_attitudes
                .get(b_lid)
                .copied()
                .unwrap_or(0.0);
            if att_ab > BORDER_WAR_ATTITUDE_THRESHOLD {
                continue;
            }
            let mut overlap = 0usize;
            for (x, y) in a_terr.iter() {
                for (dx, dy) in [(-1i32, 0), (1, 0), (0, -1), (0, 1), (0, 0)] {
                    if b_terr.contains(&(x + dx, y + dy)) {
                        overlap += 1;
                        break;
                    }
                }
                if overlap >= BORDER_WAR_BORDER_OVERLAP_MIN {
                    break;
                }
            }
            if overlap < BORDER_WAR_BORDER_OVERLAP_MIN {
                continue;
            }
            if rng.random::<f32>() > 0.55 {
                continue;
            }
            let (ax, ay) = lineage_centroid(organisms, a_lid);
            let (bx, by) = lineage_centroid(organisms, b_lid);
            let loc = ((ax + bx) / 2, (ay + by) / 2);
            let n_per_side = (8 + (rng.random::<u32>() % 6) as usize)
                .min(a_pop / 2)
                .min(b_pop / 2);
            let attacker_orgs = pick_combatants(organisms, &pop_per_lineage, a_lid, n_per_side, loc, rng);
            let defender_orgs = pick_combatants(organisms, &pop_per_lineage, b_lid, n_per_side, loc, rng);
            if attacker_orgs.is_empty() || defender_orgs.is_empty() {
                continue;
            }
            let total = attacker_orgs.len() + defender_orgs.len();
            let scale = scale_for_participants(total);
            let id = format!("border_war_{}_{}_{}", tick, a_lid, b_lid);
            let initial_a = attacker_orgs.len() as u32;
            let initial_d = defender_orgs.len() as u32;
            out.push(Battle {
                id: id.clone(),
                attackers: vec![a_lid.clone()],
                defenders: vec![b_lid.clone()],
                attacker_orgs,
                defender_orgs,
                scale,
                location: loc,
                started_tick: tick,
                ended_tick: None,
                casualties_a: 0,
                casualties_d: 0,
                outcome: None,
                initial_a,
                initial_d,
            });
            already_engaged.insert(a_lid.clone());
            already_engaged.insert(b_lid.clone());
            push_event(
                events,
                tick,
                "war_declared",
                a_lid,
                &format!(
                    "{} declared {} on {} over the border at ({},{})",
                    a_lid,
                    scale.name(),
                    b_lid,
                    loc.0,
                    loc.1
                ),
            );
            push_event(
                events,
                tick,
                "battle_began",
                &id,
                &format!(
                    "{} attacks {} ({}, {} v {})",
                    a_lid,
                    b_lid,
                    scale.name(),
                    initial_a,
                    initial_d
                ),
            );
            break;
        }
    }
    out
}

pub(super) fn lineage_centroid(organisms: &[crate::organism::organism::Organism], lid: &str) -> (i32, i32) {
    let mut sx = 0.0f32;
    let mut sy = 0.0f32;
    let mut n = 0.0f32;
    for o in organisms {
        if !o.alive || o.lineage_id != lid {
            continue;
        }
        sx += o.x;
        sy += o.y;
        n += 1.0;
    }
    if n < 0.5 {
        (0, 0)
    } else {
        ((sx / n) as i32, (sy / n) as i32)
    }
}

pub(super) fn pick_combatants(
    organisms: &[crate::organism::organism::Organism],
    pop_per_lineage: &HashMap<String, Vec<usize>>,
    lid: &str,
    n: usize,
    near: (i32, i32),
    rng: &mut rand_chacha::ChaCha8Rng,
) -> Vec<String> {
    use rand::seq::SliceRandom;
    let mut ids: Vec<(String, f32)> = match pop_per_lineage.get(lid) {
        Some(v) => v
            .iter()
            .filter(|&&i| organisms[i].alive && organisms[i].age_stage().can_combat())
            .map(|&i| {
                let dx = organisms[i].x - near.0 as f32;
                let dy = organisms[i].y - near.1 as f32;
                (organisms[i].id.clone(), (dx * dx + dy * dy).sqrt())
            })
            .collect(),
        None => return Vec::new(),
    };
    ids.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    let take = n.min(ids.len());
    let mut chosen: Vec<String> = ids.into_iter().take(take * 2).map(|(s, _)| s).collect();
    chosen.shuffle(rng);
    chosen.truncate(take);
    chosen
}
