pub mod actions;
pub mod calendar;
pub mod command;
pub mod config;
pub mod cosmos;
pub mod goals;
pub mod seasons;
pub mod simulation;
pub mod spatial;
pub mod storage;
pub mod utils;
pub mod world_events;

pub mod agents;
pub mod civ;
pub mod tech;

// Storage keeps its old paths (sim::persistence, sim::serialize).
pub use storage::{persistence, serialize};

pub use agents::age_stage;
pub use agents::courtship;
pub use agents::growth;
pub use agents::memory_pressure;
pub use agents::social;

pub use civ::civ_tick;
pub use civ::culture;
pub use civ::economy;
pub use civ::era;
pub use civ::government;
pub use civ::warfare;
pub use civ::world_milestones;

pub use tech::agriculture;
pub use tech::buildings;
pub use tech::language_tech;
pub use tech::medicine;
pub use tech::tech_progress;
pub use tech::transportation;
