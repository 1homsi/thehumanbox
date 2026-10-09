use crate::hashing::{FxHashMap as HashMap, FxHashSet as HashSet};
use serde::{Deserialize, Serialize};

use super::government::{Government, LawKind};
use crate::sim::era::Era;
use crate::sim::tech::buildings::{Building, BuildingKind};
use crate::sim::world_events::push_event;
use crate::world::grid::WorldGrid;

mod battles;
mod spawning;
#[cfg(test)]
mod tests;
mod treaties;
mod types;

pub use battles::*;
pub use spawning::*;
pub use treaties::*;
pub use types::*;
