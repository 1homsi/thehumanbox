use super::*;

#[derive(Clone, Copy)]
pub(super) struct ResourceSnapshot {
    pub(super) food: u8,
    pub(super) wood: u8,
    pub(super) stone: u8,
    pub(super) wealth: u32,
}

pub(super) fn reserve_action_resource(
    sim: &mut Simulation,
    idx: usize,
    resource: ResourceGate,
) -> Option<ResourceSnapshot> {
    let org = &mut sim.organisms[idx];
    let snapshot = ResourceSnapshot {
        food: org.inv_food,
        wood: org.inv_wood,
        stone: org.inv_stone,
        wealth: org.wealth,
    };
    let reserved = match resource {
        ResourceGate::None => true,
        ResourceGate::Food if org.inv_food > 0 => {
            org.inv_food -= 1;
            true
        }
        ResourceGate::CarriedFood if org.inv_food > 0 => {
            org.inv_food -= 1;
            true
        }
        ResourceGate::Materials if org.inv_wood > 0 => {
            org.inv_wood -= 1;
            true
        }
        ResourceGate::Materials if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        ResourceGate::TradeGoods if org.inv_food > 0 => {
            org.inv_food -= 1;
            true
        }
        ResourceGate::TradeGoods if org.inv_wood > 0 => {
            org.inv_wood -= 1;
            true
        }
        ResourceGate::TradeGoods if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        ResourceGate::TradeGoods if org.wealth > 0 => {
            org.wealth -= 1;
            true
        }
        ResourceGate::Wealth if org.wealth > 0 => {
            org.wealth -= 1;
            true
        }
        ResourceGate::Wood if org.inv_wood > 0 => {
            org.inv_wood -= 1;
            true
        }
        ResourceGate::WoodAndStone if org.inv_wood > 0 && org.inv_stone > 0 => {
            org.inv_wood -= 1;
            org.inv_stone -= 1;
            true
        }
        ResourceGate::Stone if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        ResourceGate::Metalworking if org.inv_stone > 0 && org.wealth > 0 => {
            org.inv_stone -= 1;
            org.wealth -= 1;
            true
        }
        _ => false,
    };
    reserved.then_some(snapshot)
}

pub(super) fn restore_action_resource(sim: &mut Simulation, idx: usize, snapshot: ResourceSnapshot) {
    let org = &mut sim.organisms[idx];
    org.inv_food = snapshot.food;
    org.inv_wood = snapshot.wood;
    org.inv_stone = snapshot.stone;
    org.wealth = snapshot.wealth;
}

pub(super) fn action_uses_atomic_reservation(action: usize) -> bool {
    matches!(
        action,
        1080..=1131 | 1200..=1249 | 2940..=2989 | 3480..=3525 | 5820..=5869
    )
}

/// Base actions with an immediate world effect use a deferred charge: their
/// contextual handler must succeed first, then the semantically declared
/// resource is consumed in the same simulation turn. Complex transfers,
/// construction projects, and crafting pipelines own their transaction in
/// their domain handler and are deliberately absent from this list.
pub(super) fn action_uses_deferred_resource_charge(action: usize) -> bool {
    matches!(
        action,
        42 | 46
            | 50
            | 276
            | 287
            | 291
            | 292
            | 348
            | 354
            | 406
            | 408
            | 413
            | 415
            | 427
            | 428
            | 439
            | 440
            | 449
            | 471
            | 477
            | 478
            | 507
            | 518
    )
}

pub(super) const BASE_SEMANTIC_VALIDATION: [bool; 540] = {
    let mut required = [false; 540];
    let mut index = 0;
    while index < BASE_ACTION_BANDS.len() {
        let band = &BASE_ACTION_BANDS[index];
        let mut action = band.start;
        while action <= band.end && action < required.len() {
            required[action] = true;
            action += 1;
        }
        index += 1;
    }
    required
};

pub(super) fn action_requires_semantic_validation(action: usize) -> bool {
    action >= BASE_SEMANTIC_VALIDATION.len() || BASE_SEMANTIC_VALIDATION[action]
}

pub(super) fn action_output_at_capacity(org: &crate::organism::organism::Organism, action: usize) -> bool {
    butchery::output_key(action)
        .is_some_and(|output| org.tools.get(output).copied().unwrap_or(0) >= butchery::OUTPUT_CAP)
}
