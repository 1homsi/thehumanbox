use rustc_hash::{FxHashMap as HashMap, FxHashSet as HashSet};

use serde_json::json;

use crate::sim::config::DAY_LENGTH;
use crate::sim::simulation::Simulation;

mod entry;
mod frame;
mod helpers;
mod payload;
#[cfg(test)]
mod tests;

use helpers::*;
pub use payload::*;
