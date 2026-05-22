use super::EraSpec;

pub const SPEC: EraSpec = EraSpec {
    name: "solar",
    discoveries: &["solar_grid", "battery_grid", "smart_grid", ],
    pop_threshold: 190,
};
