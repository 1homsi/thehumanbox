use super::*;

pub(super) const MAX_TRADE_ROUTES: usize = 64;
pub(super) const MAX_CARAVANS: usize = 128;
pub(super) const MAX_CARAVANS_PER_ROUTE: usize = 4;
pub(super) const MAX_AUTOMATIC_DELIVERIES_PER_TICK: usize = 16;
pub(super) const TRADE_LOG_CAP: usize = 500;
pub(super) const AUTO_UNLOAD_GRACE_TICKS: u64 = 60;
pub(super) const STRANDED_CARAVAN_TICKS: u64 = 2_400;
pub(super) const ROUTE_REFRESH_TICKS: u64 = 120;
pub(super) const ROAD_MARK_TICKS: u64 = 10;
pub(super) const MAX_PAYMENT_PER_DELIVERY: u32 = 250;
pub(super) const MAX_CARAVAN_TRAVEL_TICKS: u64 = 1_200;
/// The share of travel time a caravan saves on a route that is all road (see `dispatch`).
pub(super) const CARAVAN_ROAD_HASTE: f64 = 0.35;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct TradeRoute {
    pub id: u32,
    pub lineage_a: String,
    pub lineage_b: String,
    pub a_center: [i32; 2],
    pub b_center: [i32; 2],
    pub established_tick: u64,
    pub last_dispatch_tick: u64,
    pub deliveries: u32,
    pub volume: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Caravan {
    pub id: u32,
    pub route_id: u32,
    pub sender_lineage: String,
    pub receiver_lineage: String,
    pub sender_org_id: String,
    pub cargo: String,
    pub amount: u32,
    pub unit_price: u32,
    pub departed_tick: u64,
    pub arrives_tick: u64,
    pub from: [i32; 2],
    pub to: [i32; 2],
    /// Q-learning state captured by the simulation immediately after action
    /// 288 successfully queues this caravan. It belongs in local saves so a
    /// reload cannot erase delayed credit, but it is deliberately omitted
    /// from the public wire payload.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub(crate) dispatch_state: String,
}
