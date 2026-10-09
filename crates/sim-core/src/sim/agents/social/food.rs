use super::*;

/// Orphaned minors first, then the giver's kin, then the hungriest.
pub(super) fn food_recipient_order(
    a: &Organism,
    b: &Organism,
    me: &Organism,
    tick: u64,
) -> std::cmp::Ordering {
    let a_recent_orphan = a.orphaned_tick > 0 && tick.saturating_sub(a.orphaned_tick) < 600;
    let b_recent_orphan = b.orphaned_tick > 0 && tick.saturating_sub(b.orphaned_tick) < 600;
    let a_kin =
        a.parent_id == me.parent_id || a.parent_id == me.id || a.father_id.as_deref() == Some(me.id.as_str());
    let b_kin =
        b.parent_id == me.parent_id || b.parent_id == me.id || b.father_id.as_deref() == Some(me.id.as_str());
    match (a_recent_orphan, b_recent_orphan) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => match (a_kin, b_kin) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a
                .energy
                .partial_cmp(&b.energy)
                .unwrap_or(std::cmp::Ordering::Equal),
        },
    }
}

/// The hungry neighbour `org_idx` would feed, if any: kin, named friends and
/// strongly trusted people within reach; orphaned minors first, then the
/// giver's kin, then the hungriest, ties going to the lowest population index.
/// `candidates` is scratch space for the spatial query.
pub(super) fn pick_food_recipient(
    org_idx: usize,
    organisms: &[Organism],
    spatial: &SpatialIndex,
    tick: u64,
    candidates: &mut Vec<usize>,
) -> Option<usize> {
    let me = &organisms[org_idx];
    let (ox, oy) = (me.x, me.y);
    // The same candidates as `ordered_nearby(.., 6)`: the index is built
    // before movement, so it pads the radius by two. Filtering before the
    // population-order sort keeps the sort to the few who qualify.
    spatial.query_into(ox as i32, oy as i32, 8, candidates);
    candidates.retain(|&i| {
        let o = &organisms[i];
        i != org_idx
            && o.alive
            && o.energy < 0.30
            && (o.lineage_id == me.lineage_id
                || me.friends.contains_key(&o.id)
                || me.org_trust.get(&o.id).is_some_and(|&v| v >= 0.55))
            && (o.x - ox).abs() + (o.y - oy).abs() <= 6.0
    });
    candidates.sort_unstable();
    candidates
        .iter()
        .map(|&i| (i, &organisms[i]))
        .min_by(|(_, a), (_, b)| food_recipient_order(a, b, me, tick))
        .map(|(i, _)| i)
}

/// The selection as it was before the scratch buffer and the direct lookups,
/// kept to check the fast path against.
#[cfg(test)]
pub(super) fn pick_food_recipient_reference(
    org_idx: usize,
    organisms: &[Organism],
    spatial: &SpatialIndex,
    tick: u64,
) -> Option<usize> {
    let org_lineage = organisms[org_idx].lineage_id.clone();
    let (ox, oy) = (organisms[org_idx].x, organisms[org_idx].y);

    let friend_ids: rustc_hash::FxHashSet<String> = organisms[org_idx].friends.keys().cloned().collect();
    let high_trust: rustc_hash::FxHashSet<String> = organisms[org_idx]
        .org_trust
        .iter()
        .filter(|(_, &v)| v >= 0.55)
        .map(|(k, _)| k.clone())
        .collect();

    // Share with hungry kin OR hungry named friends / strong-trust orgs.
    // Recently-orphaned minors get prioritised by sorting them ahead
    // of all other candidates (they need adoption-tier care, not just
    // food).
    let my_parent_id = organisms[org_idx].parent_id.clone();
    let my_id = organisms[org_idx].id.clone();
    spatial
        .ordered_nearby(organisms, ox, oy, 6)
        .filter(|(i, o)| *i != org_idx && o.alive && o.energy < 0.30)
        .filter(|(_, o)| {
            o.lineage_id == org_lineage || friend_ids.contains(&o.id) || high_trust.contains(&o.id)
        })
        .filter(|(_, o)| (o.x - ox).abs() + (o.y - oy).abs() <= 6.0)
        .min_by(|(_, a), (_, b)| {
            let a_recent_orphan = a.orphaned_tick > 0 && tick.saturating_sub(a.orphaned_tick) < 600;
            let b_recent_orphan = b.orphaned_tick > 0 && tick.saturating_sub(b.orphaned_tick) < 600;
            let a_kin = a.parent_id == my_parent_id
                || a.parent_id == my_id
                || a.father_id.as_deref() == Some(my_id.as_str());
            let b_kin = b.parent_id == my_parent_id
                || b.parent_id == my_id
                || b.father_id.as_deref() == Some(my_id.as_str());
            match (a_recent_orphan, b_recent_orphan) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => match (a_kin, b_kin) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a
                        .energy
                        .partial_cmp(&b.energy)
                        .unwrap_or(std::cmp::Ordering::Equal),
                },
            }
        })
        .map(|(i, _)| i)
}

pub fn share_food(
    org_idx: usize,
    organisms: &mut [Organism],
    spatial: &SpatialIndex,
    tick: u64,
    events: &mut std::collections::VecDeque<Event>,
    candidates: &mut Vec<usize>,
) -> f32 {
    // Share with hungry kin OR hungry named friends / strong-trust orgs.
    // Recently-orphaned minors get prioritised ahead of all other
    // candidates (they need adoption-tier care, not just food).
    let target_idx = pick_food_recipient(org_idx, organisms, spatial, tick, candidates);

    let Some(ti) = target_idx else {
        return 0.0;
    };

    let target_name = organisms[ti].name.clone();
    let share = 0.09f32;

    organisms[org_idx].energy = (organisms[org_idx].energy - share).max(0.0);
    organisms[ti].energy = (organisms[ti].energy + share).min(1.0);
    organisms[org_idx].last_fed_kin = tick;

    let org_id2 = organisms[org_idx].id.clone();
    let org_name = organisms[org_idx].name.clone();
    let target_id = organisms[ti].id.clone();
    let t = organisms[ti].org_trust.entry(org_id2.clone()).or_insert(0.0);
    *t = (*t + 0.10).min(1.0);
    let received_trust = *t;
    // A shared meal builds trust both ways, so people who eat together become
    // friends (the friend line is the same one the other bonds use).
    let g = organisms[org_idx]
        .org_trust
        .entry(target_id.clone())
        .or_insert(0.0);
    *g = (*g + 0.04).min(1.0);
    let given_trust = *g;
    const FRIEND_THRESHOLD: f32 = 0.55;
    if received_trust >= FRIEND_THRESHOLD {
        organisms[ti].add_friend(&org_id2, &org_name, tick);
    }
    if given_trust >= FRIEND_THRESHOLD {
        organisms[org_idx].add_friend(&target_id, &target_name, tick);
    }

    organisms[org_idx].think(
        &format!("sharing food with {}", &target_name[..4.min(target_name.len())]),
        tick,
    );
    organisms[ti].think("received food from kin", tick);
    organisms[ti].log_event(format!("fed by kin {}", &org_name[..4.min(org_name.len())]));

    push_event(
        events,
        tick,
        "gift",
        &org_name,
        &format!("fed starving {}", target_name),
    );
    0.025
}
