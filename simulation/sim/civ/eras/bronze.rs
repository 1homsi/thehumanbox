use super::EraSpec;

pub const SPEC: EraSpec = EraSpec {
    name: "bronze",
    discoveries: &["smelting", "agriculture", "pottery"],
    pop_threshold: 3,
};
