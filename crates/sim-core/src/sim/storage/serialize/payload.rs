/// One frame's top-level object, ready to be encoded.
///
/// It is the same sorted JSON object `state_json*` returns, except that the
/// two sections that dominate a delta frame (the grid and the hot organism
/// arrays: thousands of small `[row, col, value]` triples and parallel number
/// arrays) stay typed. Converting them to `serde_json::Value` first allocated
/// one `Value` per number (and one `Vec` per triple) only to walk the tree
/// again when encoding; written from the typed form they cost a fraction of
/// that. `Serialize` merges the typed sections into the sorted key order, and
/// both structs serialise only integers, strings and bools, which encode to
/// the same bytes whether they come from a `Value` or from the typed field.
/// `into_value` gives the original `Value` for consumers that want one.
pub struct FramePayload {
    rest: serde_json::Map<String, serde_json::Value>,
    pub(super) grid: Option<crate::world::grid::GridJson>,
    pub(super) organisms_hot: Option<crate::organism::organism::OrgsHotSoa>,
    buildings: Option<Vec<BuildingJson>>,
}

/// An `f32` as `serde_json::Value` holds it: widened to `f64`, or `null` when
/// it is not finite. Typed sections use it so they encode to the same bytes
/// as the `Value` they replace.
pub(super) struct Num32(pub(super) f32);

impl serde::Serialize for Num32 {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if self.0.is_finite() {
            serializer.serialize_f64(f64::from(self.0))
        } else {
            serializer.serialize_unit()
        }
    }
}

/// One building as a frame carries it (every frame after a building changed,
/// and every full frame). Fields are declared alphabetically: that is the key
/// order of the sorted `Value` object this replaces.
#[derive(serde::Serialize)]
pub struct BuildingJson {
    // `condition` is retained for older clients. It is construction progress,
    // not structural health.
    condition: Num32,
    construction_progress: Num32,
    damage: Num32,
    fh: u8,
    function: &'static str,
    fw: u8,
    id: u32,
    integrity: Num32,
    kind: &'static str,
    last_damage_tick: Option<u64>,
    last_repair_tick: Option<u64>,
    lineage_id: String,
    repairing: bool,
    ruined: bool,
    ruined_at_tick: Option<u64>,
    x: i32,
    y: i32,
}

impl BuildingJson {
    pub(super) fn new(b: &crate::sim::buildings::Building, tick: u64) -> Self {
        let (fw, fh) = b.kind.footprint();
        BuildingJson {
            condition: Num32(b.condition),
            construction_progress: Num32(b.condition),
            damage: Num32(b.damage_fraction()),
            fh,
            function: b.kind.function().label(),
            fw,
            id: b.id,
            integrity: Num32(b.integrity()),
            kind: b.kind.name(),
            last_damage_tick: b.last_damage_tick,
            last_repair_tick: b.last_repair_tick,
            lineage_id: b.owner_lineage.clone().unwrap_or_default(),
            repairing: b.is_repairing_at(tick),
            ruined: b.is_ruined(),
            ruined_at_tick: b.ruined_at_tick,
            x: b.x,
            y: b.y,
        }
    }
}

impl FramePayload {
    /// Set the typed buildings section.
    pub fn set_buildings(&mut self, buildings: Vec<BuildingJson>) {
        self.buildings = Some(buildings);
    }

    pub fn as_object_mut(&mut self) -> Option<&mut serde_json::Map<String, serde_json::Value>> {
        Some(&mut self.rest)
    }

    /// Set the typed grid section.
    pub fn set_grid(&mut self, grid: crate::world::grid::GridJson) {
        self.grid = Some(grid);
    }

    /// Add or replace a top-level entry (the transport stamps frame metadata
    /// this way).
    pub fn insert(&mut self, key: &str, value: serde_json::Value) {
        self.rest.insert(key.to_string(), value);
    }

    pub fn into_value(self) -> serde_json::Value {
        let FramePayload {
            mut rest,
            grid,
            organisms_hot,
            buildings,
        } = self;
        if let Some(grid) = grid {
            rest.insert("grid".to_string(), serde_json::to_value(grid).unwrap());
        }
        if let Some(soa) = organisms_hot {
            rest.insert("organisms_hot".to_string(), serde_json::to_value(&soa).unwrap());
        }
        if let Some(buildings) = buildings {
            rest.insert("buildings".to_string(), serde_json::to_value(&buildings).unwrap());
        }
        serde_json::Value::Object(rest)
    }
}

/// A frame is always a JSON object; anything else becomes an empty one.
impl From<serde_json::Value> for FramePayload {
    fn from(value: serde_json::Value) -> Self {
        let rest = match value {
            serde_json::Value::Object(map) => map,
            _ => serde_json::Map::new(),
        };
        FramePayload {
            rest,
            grid: None,
            organisms_hot: None,
            buildings: None,
        }
    }
}

/// One top-level entry of a [`FramePayload`].
pub enum FrameEntry<'a> {
    Json(&'a serde_json::Value),
    Grid(&'a crate::world::grid::GridJson),
    HotOrganisms(&'a crate::organism::organism::OrgsHotSoa),
    Buildings(&'a [BuildingJson]),
}

impl serde::Serialize for FrameEntry<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            FrameEntry::Json(value) => value.serialize(serializer),
            FrameEntry::Grid(grid) => grid.serialize(serializer),
            FrameEntry::HotOrganisms(soa) => soa.serialize(serializer),
            FrameEntry::Buildings(list) => list.serialize(serializer),
        }
    }
}

impl FramePayload {
    /// The top-level entries in key order (the order `Serialize` writes them).
    pub fn entries(&self) -> Vec<(&str, FrameEntry<'_>)> {
        // `rest` is already sorted (a `BTreeMap`); slot the typed sections in.
        let mut entries: Vec<(&str, FrameEntry<'_>)> = Vec::with_capacity(self.rest.len() + 2);
        entries.extend(self.rest.iter().map(|(k, v)| (k.as_str(), FrameEntry::Json(v))));
        if let Some(grid) = &self.grid {
            entries.push(("grid", FrameEntry::Grid(grid)));
        }
        if let Some(soa) = &self.organisms_hot {
            entries.push(("organisms_hot", FrameEntry::HotOrganisms(soa)));
        }
        if let Some(list) = &self.buildings {
            entries.push(("buildings", FrameEntry::Buildings(list)));
        }
        entries.sort_by(|a, b| a.0.cmp(b.0));
        entries
    }
}

impl serde::Serialize for FramePayload {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let entries = self.entries();
        let mut map = serializer.serialize_map(Some(entries.len()))?;
        for (key, entry) in &entries {
            map.serialize_entry(key, entry)?;
        }
        map.end()
    }
}

/// The organism section `entity_head` receives: the full list as `Value`s, or
/// the hot arrays, which stay typed.
pub(super) enum HeadOrganisms {
    Full(Vec<serde_json::Value>),
    Hot(Box<crate::organism::organism::OrgsHotSoa>),
}
