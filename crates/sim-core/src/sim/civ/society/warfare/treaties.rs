use super::*;

pub fn has_active_treaty(treaties: &[Treaty], a: &str, b: &str, tick: u64) -> bool {
    if a.is_empty() || b.is_empty() || a == b {
        return false;
    }
    treaties.iter().any(|t| {
        t.signed_tick <= tick
            && t.expires_tick > tick
            && ((t.lineage_a == a && t.lineage_b == b) || (t.lineage_a == b && t.lineage_b == a))
    })
}

pub fn has_active_battle_between(battles: &[Battle], lineage_a: &str, lineage_b: &str) -> bool {
    if lineage_a.is_empty() || lineage_b.is_empty() || lineage_a == lineage_b {
        return false;
    }
    battles.iter().any(|battle| {
        battle.ended_tick.is_none()
            && ((battle.attackers.iter().any(|lineage| lineage == lineage_a)
                && battle.defenders.iter().any(|lineage| lineage == lineage_b))
                || (battle.attackers.iter().any(|lineage| lineage == lineage_b)
                    && battle.defenders.iter().any(|lineage| lineage == lineage_a)))
    })
}

pub fn treaty_attitude_bonus(kind: TreatyKind) -> f32 {
    match kind {
        TreatyKind::Alliance => 0.4,
        TreatyKind::Defensive => 0.25,
        TreatyKind::Trade => 0.15,
        TreatyKind::NonAggression => 0.05,
        TreatyKind::Vassalage => -0.10,
    }
}

pub(super) fn treaty_matches_lineages(treaty: &Treaty, lineage_a: &str, lineage_b: &str) -> bool {
    (treaty.lineage_a == lineage_a && treaty.lineage_b == lineage_b)
        || (treaty.lineage_a == lineage_b && treaty.lineage_b == lineage_a)
}

pub(super) fn treaty_pair(treaty: &Treaty) -> (&str, &str) {
    if treaty.lineage_a <= treaty.lineage_b {
        (&treaty.lineage_a, &treaty.lineage_b)
    } else {
        (&treaty.lineage_b, &treaty.lineage_a)
    }
}

pub(super) fn treaty_kind_priority(kind: TreatyKind) -> u8 {
    match kind {
        TreatyKind::NonAggression => 1,
        TreatyKind::Trade => 2,
        TreatyKind::Defensive => 3,
        TreatyKind::Alliance => 4,
        TreatyKind::Vassalage => 5,
    }
}

/// Remove inactive or malformed agreements and deterministically retain one
/// current agreement per unordered lineage pair. The most recently signed
/// record wins; expiry, kind priority, and stored orientation break malformed
/// import ties without changing the direction of vassalage records.
///
/// Returns the number of removed records so direct autonomous, post-battle,
/// and load callers can report or test repairs without reimplementing them.
pub fn consolidate_treaties(treaties: &mut Vec<Treaty>, tick: u64) -> usize {
    let before = treaties.len();
    treaties.retain(|treaty| {
        !treaty.lineage_a.is_empty()
            && !treaty.lineage_b.is_empty()
            && treaty.lineage_a != treaty.lineage_b
            && treaty.signed_tick <= tick
            && treaty.signed_tick < treaty.expires_tick
            && treaty.expires_tick > tick
    });
    treaties.sort_by(|left, right| {
        let left_pair = treaty_pair(left);
        let right_pair = treaty_pair(right);
        left_pair
            .0
            .cmp(right_pair.0)
            .then_with(|| left_pair.1.cmp(right_pair.1))
            .then_with(|| right.signed_tick.cmp(&left.signed_tick))
            .then_with(|| right.expires_tick.cmp(&left.expires_tick))
            .then_with(|| treaty_kind_priority(right.kind).cmp(&treaty_kind_priority(left.kind)))
            .then_with(|| left.lineage_a.cmp(&right.lineage_a))
            .then_with(|| left.lineage_b.cmp(&right.lineage_b))
    });

    let mut consolidated: Vec<Treaty> = Vec::with_capacity(treaties.len());
    for treaty in treaties.drain(..) {
        if consolidated
            .last()
            .is_some_and(|previous| treaty_matches_lineages(previous, &treaty.lineage_a, &treaty.lineage_b))
        {
            continue;
        }
        consolidated.push(treaty);
    }
    *treaties = consolidated;
    before.saturating_sub(treaties.len())
}

pub(super) fn update_reciprocal_lineage_attitudes(
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    delta: f32,
) {
    for organism in organisms.iter_mut().filter(|organism| organism.alive) {
        if organism.lineage_id == lineage_a {
            organism.update_attitude(lineage_b, delta);
        } else if organism.lineage_id == lineage_b {
            organism.update_attitude(lineage_a, delta);
        }
    }
}

pub(super) fn cap_reciprocal_lineage_attitudes(
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    maximum: f32,
) {
    for organism in organisms.iter_mut().filter(|organism| organism.alive) {
        let other = if organism.lineage_id == lineage_a {
            lineage_b
        } else if organism.lineage_id == lineage_b {
            lineage_a
        } else {
            continue;
        };
        let current = organism.attitude_toward(other);
        if current > maximum {
            organism.update_attitude(other, maximum - current);
        }
    }
}

/// Create or renew the one active treaty between a pair of lineages.
///
/// The simulation treats any active treaty as a conflict gate, so duplicate
/// records could accidentally extend or stack diplomacy in surprising ways.
/// Consolidating the pair here gives actions and autonomous diplomacy the same
/// stable invariant: at most one active treaty per lineage pair.
pub fn establish_treaty(
    treaties: &mut Vec<Treaty>,
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    kind: TreatyKind,
    signed_tick: u64,
    expires_tick: u64,
) -> bool {
    if lineage_a.is_empty() || lineage_b.is_empty() || lineage_a == lineage_b || expires_tick <= signed_tick {
        return false;
    }

    let active_same_kind_expiry = treaties
        .iter()
        .filter(|treaty| {
            treaty_matches_lineages(treaty, lineage_a, lineage_b)
                && treaty.kind == kind
                && treaty.signed_tick <= signed_tick
                && treaty.expires_tick > signed_tick
        })
        .map(|treaty| treaty.expires_tick)
        .max();
    consolidate_treaties(treaties, signed_tick);
    treaties.retain(|treaty| !treaty_matches_lineages(treaty, lineage_a, lineage_b));
    treaties.push(Treaty {
        lineage_a: lineage_a.to_string(),
        lineage_b: lineage_b.to_string(),
        kind,
        signed_tick,
        expires_tick: active_same_kind_expiry
            .map(|existing_expiry| existing_expiry.max(expires_tick))
            .unwrap_or(expires_tick),
    });
    consolidate_treaties(treaties, signed_tick);
    if active_same_kind_expiry.is_none() {
        update_reciprocal_lineage_attitudes(organisms, lineage_a, lineage_b, treaty_attitude_bonus(kind));
    }
    true
}

/// Break active agreements between two lineages and make the declaration of
/// war known to both populations rather than only to the declaring actor.
pub fn declare_hostilities(
    treaties: &mut Vec<Treaty>,
    organisms: &mut [crate::organism::organism::Organism],
    lineage_a: &str,
    lineage_b: &str,
    tick: u64,
    attitude_penalty: f32,
) -> usize {
    if lineage_a.is_empty() || lineage_b.is_empty() || lineage_a == lineage_b {
        return 0;
    }

    consolidate_treaties(treaties, tick);
    let before = treaties.len();
    treaties.retain(|treaty| !treaty_matches_lineages(treaty, lineage_a, lineage_b));
    let invalidated = before - treaties.len();
    cap_reciprocal_lineage_attitudes(organisms, lineage_a, lineage_b, -attitude_penalty.abs());
    invalidated
}
