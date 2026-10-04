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

/// What a band needs from the situation, as masks over `ctx` bits (see
/// `ctx_bits` in `eligibility.rs`) and workspace kinds, plus the few gates that
/// are costly enough to be worked out only when everything else has passed.
#[derive(Clone, Copy)]
pub(super) struct GateReq {
    pub(super) ctx: u32,
    pub(super) workspaces: u32,
    pub(super) lazy: u8,
}

pub(super) const LAZY_NEAR_HUT: u8 = 1;
pub(super) const LAZY_BRIDGE_SITE: u8 = 2;
pub(super) const LAZY_BRIDGE_MATERIALS: u8 = 4;

pub(super) struct ResolvedBand {
    pub(super) band: ActionBand,
    pub(super) req: GateReq,
    qual: ResolvedQual,
}

pub(super) struct ResolvedTables {
    pub(super) base: Vec<ResolvedBand>,
    pub(super) banded: Vec<ResolvedBand>,
    pub(super) registered: Vec<ResolvedBand>,
    /// Every positive `min_literacy` any band asks for, ascending.
    literacy_thresholds: Vec<f32>,
    discoveries: FxHashMap<&'static str, u16>,
    specialties: FxHashMap<&'static str, u8>,
}

/// See `ResolvedTables::gate_key`.
#[derive(Clone, PartialEq)]
pub(super) struct GateKey {
    era: u8,
    age_ok: [bool; 4],
    discoveries: DiscMask,
    specialty_bit: u128,
    has_specialty: bool,
    is_leader: bool,
    literacy_cleared: u8,
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
                    req: GateReq::new(band),
                    qual: ResolvedQual::new(band.qualification, &discoveries, &specialties),
                })
                .collect()
        };
        let mut literacy_thresholds: Vec<f32> = all()
            .map(|band| band.qualification.min_literacy)
            .filter(|&t| t > 0.0)
            .collect();
        literacy_thresholds.sort_by(|a, b| a.total_cmp(b));
        literacy_thresholds.dedup();
        Self {
            base: resolve(BASE_ACTION_BANDS),
            banded: resolve(ACTION_BANDS),
            registered: resolve(&registered),
            literacy_thresholds,
            discoveries,
            specialties,
        }
    }

    /// How many bands there are in all: base, then banded, then registered.
    pub(super) fn band_count(&self) -> usize {
        self.base.len() + self.banded.len() + self.registered.len()
    }

    /// Band `index` in that order.
    pub(super) fn band(&self, index: usize) -> &ResolvedBand {
        let (base, banded) = (self.base.len(), self.banded.len());
        if index < base {
            &self.base[index]
        } else if index < base + banded {
            &self.banded[index - base]
        } else {
            &self.registered[index - base - banded]
        }
    }

    /// Everything about an organism that the era, age and qualification gates
    /// of any band read, with literacy reduced to the thresholds it clears. The
    /// bands those gates let through are the same while this is.
    pub(super) fn gate_key(&self, gate: &OrgGate, era: Era) -> GateKey {
        GateKey {
            era: era as u8,
            age_ok: gate.age_ok,
            discoveries: gate.discoveries,
            specialty_bit: gate.specialty_bit,
            has_specialty: gate.has_specialty,
            is_leader: gate.is_leader,
            literacy_cleared: self
                .literacy_thresholds
                .iter()
                .filter(|&&t| gate.literacy >= t)
                .count() as u8,
        }
    }

    /// A bit per band (in `band` order) for those the era, age and qualification
    /// gates let through for this organism.
    pub(super) fn org_pass_mask(&self, gate: &OrgGate, era: Era, mask: &mut [u64]) {
        mask.fill(0);
        for index in 0..self.band_count() {
            let resolved = self.band(index);
            let band = &resolved.band;
            if era >= band.min_era && gate.age_ok(band.age) && resolved.passes(gate) {
                mask[index / 64] |= 1 << (index % 64);
            }
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

impl GateReq {
    fn new(band: ActionBand) -> Self {
        use crate::sim::actions::eligibility::ctx;
        let mut req = Self {
            ctx: 0,
            workspaces: 0,
            lazy: 0,
        };
        req.ctx |= match band.social {
            SocialGate::None => 0,
            SocialGate::Anyone => ctx::ANYONE,
            SocialGate::Kin => ctx::KIN,
            SocialGate::KinCount(count) => ctx::kin_count_at_least(count),
            SocialGate::Stranger => ctx::STRANGER,
            SocialGate::KinAndStranger => ctx::KIN_AND_STRANGER,
        };
        match band.place {
            PlaceGate::Anywhere => {}
            PlaceGate::BuildableLand => req.ctx |= ctx::TILE_BUILDABLE,
            PlaceGate::Home => req.ctx |= ctx::NEAR_HOME,
            PlaceGate::WildLand => req.ctx |= ctx::WILD_LAND,
            PlaceGate::Water => req.ctx |= ctx::NEAR_WATER,
            PlaceGate::BridgeSite => req.lazy |= LAZY_BRIDGE_SITE,
            PlaceGate::Rock => req.ctx |= ctx::NEAR_ROCK,
            PlaceGate::Fire => req.ctx |= ctx::NEAR_FIRE,
            PlaceGate::Hut => req.ctx |= ctx::TILE_HUT,
            PlaceGate::NearHut => req.lazy |= LAZY_NEAR_HUT,
            PlaceGate::HutOrRock => req.ctx |= ctx::HUT_OR_ROCK,
            PlaceGate::Workspace(workspace) => req.workspaces |= 1 << (workspace as u32),
            PlaceGate::FireAndWorkspace(workspace) => {
                req.ctx |= ctx::NEAR_FIRE;
                req.workspaces |= 1 << (workspace as u32);
            }
            PlaceGate::ExperimentWorkspace(workspace) => {
                req.ctx |= ctx::FIRE_OR_WATER;
                req.workspaces |= 1 << (workspace as u32);
            }
            PlaceGate::HomeAndWater => req.ctx |= ctx::HOME_AND_WATER,
        }
        match band.resource {
            ResourceGate::None => {}
            ResourceGate::Food => req.ctx |= ctx::HAS_FOOD,
            ResourceGate::CarriedFood => req.ctx |= ctx::HAS_CARRIED_FOOD,
            ResourceGate::Materials => req.ctx |= ctx::HAS_MATERIALS,
            ResourceGate::BridgeMaterials => req.lazy |= LAZY_BRIDGE_MATERIALS,
            ResourceGate::TradeGoods => req.ctx |= ctx::HAS_TRADE_GOODS,
            ResourceGate::Wealth => req.ctx |= ctx::HAS_WEALTH,
            ResourceGate::Wood => req.ctx |= ctx::HAS_WOOD,
            ResourceGate::WoodAndStone => req.ctx |= ctx::HAS_WOOD_AND_STONE,
            ResourceGate::Stone => req.ctx |= ctx::HAS_STONE,
            ResourceGate::Metalworking => req.ctx |= ctx::HAS_METALWORKING_INPUTS,
        }
        req
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
