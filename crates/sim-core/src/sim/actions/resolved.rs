//! Action bands with their qualification gates resolved to bit masks.
//!
//! Every organism evaluates every band each tick, and the original
//! `qualifies` check did a string-keyed set lookup per discovery name. Here the
//! names used by any band are numbered once, an organism's discoveries are
//! folded into a mask once per evaluation, and each band's discovery and
//! specialty gates become a couple of AND/compare operations. `qualifies` stays
//! as the reference implementation and a test pins the two together.
use super::*;
use rustc_hash::FxHashMap;
use std::sync::OnceLock;

use crate::organism::organism::{DiscoveryMask as DiscMask, DISCOVERY_MASK_WORDS as DISC_WORDS};

pub(super) struct ResolvedQual {
    disc: DiscMask,
    has_discovery_gate: bool,
    all_discoveries: bool,
    specialties: u128,
    has_specialty_gate: bool,
    any_specialty: bool,
    leader: bool,
    min_literacy: f32,
    all_gates: bool,
}

pub(super) struct ResolvedBand {
    pub(super) band: ActionBand,
    qual: ResolvedQual,
}

pub(super) struct ResolvedTables {
    pub(super) base: Vec<ResolvedBand>,
    pub(super) banded: Vec<ResolvedBand>,
    pub(super) registered: Vec<ResolvedBand>,
    discoveries: FxHashMap<&'static str, u16>,
    specialties: FxHashMap<&'static str, u8>,
}

/// The per-organism inputs of every gate, computed once per evaluation.
pub(super) struct OrgGate {
    age_ok: [bool; 4],
    discoveries: DiscMask,
    specialty_bit: u128,
    has_specialty: bool,
    is_leader: bool,
    literacy: f32,
}

/// Bit position of a discovery name that some action band asks about.
pub(crate) fn discovery_bit(name: &str) -> Option<usize> {
    tables().discoveries.get(name).map(|&bit| usize::from(bit))
}

pub(super) fn tables() -> &'static ResolvedTables {
    static TABLES: OnceLock<ResolvedTables> = OnceLock::new();
    TABLES.get_or_init(ResolvedTables::build)
}

impl ResolvedTables {
    fn build() -> Self {
        let registered: Vec<ActionBand> = registry::bands().collect();
        let all = || {
            BASE_ACTION_BANDS
                .iter()
                .chain(ACTION_BANDS)
                .chain(registered.iter())
        };
        let mut discoveries: FxHashMap<&'static str, u16> = FxHashMap::default();
        let mut specialties: FxHashMap<&'static str, u8> = FxHashMap::default();
        for band in all() {
            for name in band.qualification.discoveries {
                let next = discoveries.len() as u16;
                discoveries.entry(name).or_insert(next);
            }
            for name in band.qualification.specialties {
                let next = specialties.len() as u8;
                specialties.entry(name).or_insert(next);
            }
        }
        assert!(
            discoveries.len() <= DISC_WORDS * 64,
            "too many discovery names for DiscMask"
        );
        assert!(
            specialties.len() <= 128,
            "too many specialty names for a u128 mask"
        );
        let resolve = |bands: &[ActionBand]| -> Vec<ResolvedBand> {
            bands
                .iter()
                .map(|&band| ResolvedBand {
                    band,
                    qual: ResolvedQual::new(band.qualification, &discoveries, &specialties),
                })
                .collect()
        };
        Self {
            base: resolve(BASE_ACTION_BANDS),
            banded: resolve(ACTION_BANDS),
            registered: resolve(&registered),
            discoveries,
            specialties,
        }
    }

    pub(super) fn org_gate(&self, org: &crate::organism::organism::Organism) -> OrgGate {
        let stage = org.age_stage();
        let specialty = org.specialty.as_deref();
        OrgGate {
            age_ok: [
                matches!(stage, AgeStage::Infant | AgeStage::Child),
                matches!(stage, AgeStage::Teen | AgeStage::Adult | AgeStage::Elder),
                matches!(stage, AgeStage::Adult | AgeStage::Elder),
                stage == AgeStage::Elder || org.is_elder,
            ],
            discoveries: *org.discoveries.mask(),
            specialty_bit: specialty
                .and_then(|name| self.specialties.get(name))
                .map_or(0, |&bit| 1u128 << bit),
            has_specialty: specialty.is_some(),
            is_leader: org.is_leader,
            literacy: org.literacy,
        }
    }
}

impl ResolvedQual {
    fn new(
        requirement: Qualification,
        discoveries: &FxHashMap<&'static str, u16>,
        specialties: &FxHashMap<&'static str, u8>,
    ) -> Self {
        let mut disc = [0u64; DISC_WORDS];
        for name in requirement.discoveries {
            let bit = discoveries[name];
            disc[usize::from(bit) / 64] |= 1 << (bit % 64);
        }
        let mut specialty_mask = 0u128;
        for name in requirement.specialties {
            specialty_mask |= 1u128 << specialties[name];
        }
        Self {
            disc,
            has_discovery_gate: !requirement.discoveries.is_empty(),
            all_discoveries: requirement.all_discoveries,
            specialties: specialty_mask,
            has_specialty_gate: requirement.any_specialty
                || !requirement.specialties.is_empty()
                || requirement.leader,
            any_specialty: requirement.any_specialty,
            leader: requirement.leader,
            min_literacy: requirement.min_literacy,
            all_gates: matches!(requirement.mode, QualificationMode::All),
        }
    }

    /// Same answer as `eligibility::qualifies`.
    pub(super) fn passes(&self, org: &OrgGate) -> bool {
        let mut active_gates = 0;
        let mut passed_gates = 0;

        if self.has_discovery_gate {
            active_gates += 1;
            let mut any = false;
            let mut all = true;
            for (have, want) in org.discoveries.iter().zip(&self.disc) {
                any |= have & want != 0;
                all &= have & want == *want;
            }
            passed_gates += usize::from(if self.all_discoveries { all } else { any });
        }

        if self.has_specialty_gate {
            active_gates += 1;
            let has_specialty = (org.has_specialty
                && (self.any_specialty || org.specialty_bit & self.specialties != 0))
                || (self.leader && org.is_leader);
            passed_gates += usize::from(has_specialty);
        }

        if self.min_literacy > 0.0 {
            active_gates += 1;
            passed_gates += usize::from(org.literacy >= self.min_literacy);
        }

        if self.all_gates {
            passed_gates == active_gates
        } else {
            passed_gates > 0 || active_gates == 0
        }
    }
}

impl ResolvedBand {
    pub(super) fn passes(&self, org: &OrgGate) -> bool {
        self.qual.passes(org)
    }
}

impl OrgGate {
    pub(super) fn age_ok(&self, gate: AgeGate) -> bool {
        self.age_ok[gate as usize]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The mask-based gate must agree with the reference `qualifies` for
    /// every band, whatever an organism knows, specialises in, or reads.
    #[test]
    fn resolved_qualification_matches_the_reference_check() {
        let tables = tables();
        let mut names: Vec<&str> = tables.discoveries.keys().copied().collect();
        names.sort_unstable();
        let mut specialties: Vec<&str> = tables.specialties.keys().copied().collect();
        specialties.sort_unstable();

        let mut org = Simulation::new(0x51de).organisms.swap_remove(0);
        let mut state = 0x9e37_79b9_7f4a_7c15u64;
        let mut next = move || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };

        let all_bands = || tables.base.iter().chain(&tables.banded).chain(&tables.registered);
        for round in 0..400 {
            org.discoveries.clear();
            let density = next() % 5;
            for name in &names {
                if next() % 5 < density {
                    org.discoveries.insert((*name).to_string());
                }
            }
            org.discoveries.insert("not-in-any-band".to_string());
            org.specialty = match next() % 4 {
                0 => None,
                1 => Some("not-in-any-band".to_string()),
                _ => Some(specialties[(next() as usize) % specialties.len()].to_string()),
            };
            org.is_leader = next() % 3 == 0;
            org.literacy = (next() % 101) as f32 / 100.0;
            let gate = tables.org_gate(&org);
            for resolved in all_bands() {
                assert_eq!(
                    resolved.passes(&gate),
                    qualifies(&org, resolved.band.qualification),
                    "round {round}, band {}..={}",
                    resolved.band.start,
                    resolved.band.end,
                );
            }
        }
    }
}
