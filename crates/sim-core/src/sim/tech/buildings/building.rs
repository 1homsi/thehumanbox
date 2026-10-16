use super::*;

pub const REPAIR_ACTIVITY_TICKS: u64 = 40;

/// The steps the client bakes a building's look at, kept in step with
/// `PROGRESS_STEPS` and `DAMAGE_STEPS` in
/// `apps/web/src/game/render/cf/buildings/building-visuals.ts` and with the
/// damage threshold in `apps/web/src/game/model/building-state.ts`. A field
/// that moves by less than one step paints the same pixels.
const PROGRESS_DISPLAY_STEPS: f32 = 48.0;
const DAMAGE_DISPLAY_STEPS: f32 = 32.0;
/// Below this structural damage the client draws a building as undamaged,
/// and below this integrity (equivalently, above damage 0.55) its sprite
/// takes the worn variant (`integrity < 0.45` in `building-visuals.ts`, the
/// `condBucket` in `building-draw/draw.ts`).
const VISIBLE_DAMAGE: f32 = 0.015;
const WORN_INTEGRITY: f32 = 0.45;
/// A ruin with more integrity than this is drawn as a building going back up,
/// its construction stages rising out of the old footprint
/// (`rebuilding = integrity > 0.08` in `building-draw/draw.ts`).
const REBUILD_INTEGRITY: f32 = 0.08;

/// What a frame shows of one building: the wire fields that reach pixels,
/// quantised to the steps the renderer bakes at, plus the flags and identity
/// it branches on. Two `BuildingDisplay`s that compare equal draw the same
/// pixels, so a frame where every building kept its display can leave the
/// buildings section off the wire.
///
/// Ruin age is deliberately absent: the client derives it from
/// `ruined_at_tick` and the live tick (`building-visuals.ts`,
/// `building-draw/draw.ts`), and re-describes every building each frame
/// (`buildings-driver.ts`), so only the ruin flag has to reach the wire.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BuildingDisplay {
    pub id: u32,
    pub kind: BuildingKind,
    pub x: i32,
    pub y: i32,
    pub owner: Option<String>,
    pub fw: u8,
    pub fh: u8,
    pub progress_step: u16,
    pub complete: bool,
    pub damage_step: u16,
    pub damaged: bool,
    /// The sprite took its worn variant (`integrity < 0.45`).
    pub worn: bool,
    pub ruined: bool,
    /// A ruin's integrity at `PROGRESS_STEPS`: the step its crumble and
    /// rebuild stages are drawn on. Zero when the building is not a ruin, so
    /// a whole building does not re-send on every 32nd of damage.
    pub rebuild_step: u16,
    /// A ruin being built back up (`integrity > 0.08`).
    pub rebuilding: bool,
    pub repairing: bool,
    pub slip: Option<u8>,
}

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
    /// The last tick a builder put labour into this site. A site nobody has worked on for a
    /// while is abandoned (palisade pieces, see `PALISADE_STALL_TICKS`). Not saved: a loaded
    /// site counts from its start tick, so the saved world and its fingerprint are unchanged.
    #[serde(skip)]
    pub last_work_tick: Option<u64>,
    /// True only for ambient settlement scenery. Decorative buildings
    /// may be rotated out to keep long-running worlds fast; functional
    /// buildings and wonders are permanent world history.
    #[serde(default)]
    pub decorative: bool,
    /// Grain kept in a granary, in measures. Other buildings keep none.
    #[serde(default)]
    pub stock: u32,
    /// The tick a blight, locusts, a flood or a dry spell last ruined this tribe's fields or
    /// grain. A granary left empty after one, with people going hungry, is a famine.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spoiled_tick: Option<u64>,
    /// Ticks of work a hull on a shipyard's slip still needs (see `tech/ports.rs`). `None` when no hull is on the slip.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hull_work: Option<u64>,
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
            last_work_tick: None,
            decorative: false,
            stock: 0,
            spoiled_tick: None,
            hull_work: None,
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

    /// The building as a client draws it, for the wire's change tracking: two
    /// displays that compare equal look identical (see `BuildingDisplay`).
    pub fn display(&self, tick: u64) -> BuildingDisplay {
        // A non-finite condition crosses the wire as `null`, which the
        // client's `unit(value, 1)` reads as a finished building.
        let progress = if self.condition.is_finite() {
            self.condition.clamp(0.0, 1.0)
        } else {
            1.0
        };
        let damage = self.damage_fraction();
        let integrity = 1.0 - damage;
        let ruined = self.is_ruined();
        let (fw, fh) = self.footprint();
        BuildingDisplay {
            id: self.id,
            kind: self.kind,
            x: self.x,
            y: self.y,
            owner: self.owner_lineage.clone(),
            fw,
            fh,
            progress_step: (progress * PROGRESS_DISPLAY_STEPS).round() as u16,
            complete: self.is_complete(),
            damage_step: (damage * DAMAGE_DISPLAY_STEPS).round() as u16,
            damaged: ruined || damage > VISIBLE_DAMAGE,
            worn: integrity < WORN_INTEGRITY,
            ruined,
            // The client draws a ruin's crumble and rebuild stages at
            // PROGRESS_STEPS, not the damage grid.
            rebuild_step: if ruined {
                (integrity * PROGRESS_DISPLAY_STEPS).round() as u16
            } else {
                0
            },
            rebuilding: ruined && integrity > REBUILD_INTEGRITY,
            repairing: self.is_repairing_at(tick),
            slip: crate::sim::tech::ports::slip_stage(self.hull_work),
        }
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
