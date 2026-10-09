use super::*;

pub const REPAIR_ACTIVITY_TICKS: u64 = 40;

/// Saves from a short-lived build carried 1,050 named era-home kinds (for
/// example `MedievalTwinTimberHall`). Those homes now draw their era style
/// from the owning tribe, so an unknown name loads as the closest plain home
/// instead of failing the whole save.
pub(super) fn kind_or_legacy_home<'de, D: serde::Deserializer<'de>>(d: D) -> Result<BuildingKind, D::Error> {
    let name = String::deserialize(d)?;
    if let Ok(kind) = serde_json::from_value(serde_json::Value::String(name.clone())) {
        return Ok(kind);
    }
    Ok(legacy_home_kind(&name))
}

pub(crate) fn legacy_home_kind(name: &str) -> BuildingKind {
    if name.starts_with("PreStone") || name.starts_with("Stone") {
        BuildingKind::Hut
    } else if name.contains("Enclosed") {
        BuildingKind::Manor
    } else {
        BuildingKind::House
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Building {
    pub id: u32,
    #[serde(deserialize_with = "kind_or_legacy_home")]
    pub kind: BuildingKind,
    pub x: i32,
    pub y: i32,
    pub owner_lineage: Option<String>,
    pub occupants: Vec<String>,
    pub built_at_tick: u64,
    pub condition: f32,
    /// Structural damage is separate from construction progress. `0.0` is
    /// intact and `1.0` is destroyed; lowering `condition` would incorrectly
    /// turn a damaged building back into a construction site and replay its
    /// completion rewards.
    #[serde(default)]
    pub damage: f32,
    /// Ruins stay non-operational until repairs cross the rebuild threshold.
    /// This prevents a single repair action from instantly restoring a city.
    #[serde(default)]
    pub ruined_at_tick: Option<u64>,
    #[serde(default)]
    pub last_damage_tick: Option<u64>,
    #[serde(default)]
    pub last_repair_tick: Option<u64>,
    /// True only for ambient settlement scenery. Decorative buildings
    /// may be rotated out to keep long-running worlds fast; functional
    /// buildings and wonders are permanent world history.
    #[serde(default)]
    pub decorative: bool,
    /// Grain kept in a granary, in measures. Other buildings keep none.
    #[serde(default)]
    pub stock: u32,
}

impl Building {
    pub fn new(id: u32, kind: BuildingKind, x: i32, y: i32, owner: Option<String>, tick: u64) -> Self {
        Building {
            id,
            kind,
            x,
            y,
            owner_lineage: owner,
            occupants: Vec::new(),
            built_at_tick: tick,
            condition: 0.0,
            damage: 0.0,
            ruined_at_tick: None,
            last_damage_tick: None,
            last_repair_tick: None,
            decorative: false,
            stock: 0,
        }
    }

    pub fn is_complete(&self) -> bool {
        self.condition >= 1.0
    }

    pub fn damage_fraction(&self) -> f32 {
        if self.damage.is_finite() {
            self.damage.clamp(0.0, 1.0)
        } else {
            0.0
        }
    }

    pub fn integrity(&self) -> f32 {
        1.0 - self.damage_fraction()
    }

    pub fn is_damaged(&self) -> bool {
        self.damage_fraction() > 0.001
    }

    pub fn is_ruined(&self) -> bool {
        self.ruined_at_tick.is_some() || self.damage_fraction() >= 1.0
    }

    pub fn is_repairing_at(&self, tick: u64) -> bool {
        !self.decorative
            && self.is_complete()
            && self.is_damaged()
            && self.last_repair_tick.is_some_and(|repair_tick| {
                repair_tick >= self.last_damage_tick.unwrap_or(0)
                    && tick.saturating_sub(repair_tick) <= REPAIR_ACTIVITY_TICKS
            })
    }

    /// Only constructed, functional buildings may influence organisms or
    /// civilization systems. Decorative props remain visual world detail.
    pub fn is_operational(&self) -> bool {
        !self.decorative && self.is_complete() && !self.is_ruined()
    }

    pub fn footprint(&self) -> (u8, u8) {
        self.kind.footprint()
    }
    pub fn function(&self) -> BuildingFunction {
        self.kind.function()
    }

    /// A completed housing building can shelter its owning lineage. Buildings
    /// without an owner are shared world structures; unfinished and decorative
    /// buildings never grant shelter effects.
    pub fn provides_shelter_for(&self, lineage: &str) -> bool {
        self.is_operational()
            && self.function() == BuildingFunction::Housing
            && self
                .owner_lineage
                .as_deref()
                .map(|owner| owner == lineage)
                .unwrap_or(true)
    }

    /// Whether this is an unfinished housing project already owned by a
    /// lineage. This is deliberately separate from `provides_shelter_for`:
    /// callers may avoid opening duplicate projects without treating a work
    /// site as weather protection or a home.
    pub fn is_shelter_project_for(&self, lineage: &str) -> bool {
        !self.decorative
            && !self.is_complete()
            && self.function() == BuildingFunction::Housing
            && self.owner_lineage.as_deref() == Some(lineage)
    }

    /// The closest tile in this building's footprint to a world position.
    pub fn closest_footprint_tile(&self, x: i32, y: i32) -> (i32, i32) {
        let (width, height) = self.footprint();
        (
            x.clamp(self.x, self.x + i32::from(width) - 1),
            y.clamp(self.y, self.y + i32::from(height) - 1),
        )
    }

    pub fn contains(&self, x: i32, y: i32) -> bool {
        let (w, h) = self.kind.footprint();
        x >= self.x && x < self.x + w as i32 && y >= self.y && y < self.y + h as i32
    }
}
