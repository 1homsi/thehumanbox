pub mod civ_tick;
pub mod moments;

pub mod divine;
pub mod land;
pub mod progress;
pub mod society;

// Every module keeps its old path (civ::graves, civ::era, ...).
pub use divine::{peril, prayers, rename, revive, teach, wards};
pub use eras as era;
pub use land::{building_damage, fields, smog};
pub use progress::{eras, world_milestones};
pub use society::{
    culture, economy, economy_tick, festivals, government, graves, orphans, refugees, settlements,
    trade_routes, vacancy, warfare,
};
