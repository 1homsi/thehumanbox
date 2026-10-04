use super::*;

pub(super) const DAMAGE_TICK_INTERVAL: u64 = 5;
pub(super) const REPAIR_TICK_INTERVAL: u64 = 20;
pub(super) const REPAIR_TICK_OFFSET: u64 = 10;
pub(super) const REPAIR_REACH: f32 = 18.0;
pub(super) const RUIN_REOPEN_DAMAGE: f32 = 0.001;
pub(super) const FIRE_STATION_RANGE: i32 = 14;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DamageCause {
    Fire,
    Flood,
    Storm,
    Battle,
    Age,
    Meteor,
    Lightning,
    Quake,
    Lava,
    Frost,
    Buried,
    Dragonfire,
}

impl DamageCause {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::Fire => "fire",
            Self::Flood => "flooding",
            Self::Storm => "a storm",
            Self::Battle => "battle",
            Self::Age => "age and neglect",
            Self::Meteor => "a falling star",
            Self::Lightning => "lightning",
            Self::Quake => "an earthquake",
            Self::Lava => "lava",
            Self::Frost => "the weight of snow",
            Self::Buried => "the rising rock",
            Self::Dragonfire => "dragonfire",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(super) struct Exposure {
    pub(super) amount: f32,
    pub(super) cause: DamageCause,
}

#[derive(Clone, Copy)]
pub(super) struct RepairPlan {
    pub(super) wood: u32,
    pub(super) stone: u32,
    pub(super) wealth: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RepairUnit {
    Wood,
    Stone,
    Wealth,
}

pub(super) fn supports_damage(kind: BuildingKind) -> bool {
    // These two completion effects permanently rewrite terrain. They need an
    // original-terrain record before destruction can be represented honestly.
    !matches!(kind, BuildingKind::Bridge | BuildingKind::Well)
}

pub(super) fn repair_plan(kind: BuildingKind) -> RepairPlan {
    let construction = kind.construction_cost();
    RepairPlan {
        wood: u32::from(construction.wood).div_ceil(2),
        stone: u32::from(construction.stone).div_ceil(2),
        wealth: construction.wealth.div_ceil(2),
    }
}

impl RepairPlan {
    pub(super) fn total_units(self) -> u32 {
        self.wood + self.stone + self.wealth
    }

    pub(super) fn next_unit(self, damage: f32) -> Option<RepairUnit> {
        let total = self.total_units();
        if total == 0 {
            return None;
        }
        // Derive the next bill item from remaining damage rather than
        // accumulating a separate cursor. The epsilon keeps exact unit
        // boundaries stable across f32 subtraction (for example 2/3 * 3).
        let remaining_units = (damage.clamp(0.0, 1.0) * total as f32 - 0.000_1)
            .ceil()
            .clamp(1.0, total as f32) as u32;
        let repaired_units = total.saturating_sub(remaining_units);
        let index = repaired_units.min(total - 1);
        if index < self.wood {
            Some(RepairUnit::Wood)
        } else if index < self.wood + self.stone {
            Some(RepairUnit::Stone)
        } else {
            Some(RepairUnit::Wealth)
        }
    }
}

pub(super) fn can_repair(org: &crate::organism::organism::Organism) -> bool {
    org.alive && org.age_stage() == AgeStage::Adult && org.energy > 0.20 && org.health > 0.25
}

pub(super) fn pooled_resource_available(sim: &Simulation, lineage: &str, unit: RepairUnit) -> bool {
    sim.organisms
        .iter()
        .filter(|org| org.alive && org.lineage_id == lineage)
        .any(|org| match unit {
            RepairUnit::Wood => org.inv_wood > 0,
            RepairUnit::Stone => org.inv_stone > 0,
            RepairUnit::Wealth => org.wealth > 0,
        })
}

pub(super) fn consume_pooled_resource(sim: &mut Simulation, lineage: &str, unit: RepairUnit) {
    let org = sim
        .organisms
        .iter_mut()
        .filter(|org| org.alive && org.lineage_id == lineage)
        .find(|org| match unit {
            RepairUnit::Wood => org.inv_wood > 0,
            RepairUnit::Stone => org.inv_stone > 0,
            RepairUnit::Wealth => org.wealth > 0,
        })
        .expect("resource availability checked before repair payment");
    match unit {
        RepairUnit::Wood => org.inv_wood -= 1,
        RepairUnit::Stone => org.inv_stone -= 1,
        RepairUnit::Wealth => org.wealth -= 1,
    }
}
