pub mod animal;
pub mod attributes;
pub mod choose_action;
pub mod columns;
pub mod decision_bias;
pub mod family_words;
pub mod lessons;
pub mod memory;
pub mod mind;
mod navigation;
pub(crate) use navigation::plan_route;
#[allow(clippy::module_inception)]
pub mod organism;
pub mod people_index;
pub mod personality;
pub mod skills;
pub mod traits;
pub mod vocabulary;
