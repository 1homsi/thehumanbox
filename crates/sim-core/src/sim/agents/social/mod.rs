use crate::organism::organism::Organism;
use crate::sim::simulation::{Event, History};
use crate::sim::spatial::SpatialIndex;
use crate::sim::world_events::push_event;
use crate::world::tiles::Tile;
use rand::{Rng, RngExt};
use rustc_hash::FxHashMap;

mod encounters;
mod food;
mod knowledge;
mod signals;
#[cfg(test)]
mod tests;

pub use encounters::*;
pub use food::*;
pub use knowledge::*;
pub use signals::*;
