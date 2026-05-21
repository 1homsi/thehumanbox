

pub mod build_wall;
pub mod build_well;
pub mod build_bridge;
pub mod build_road;
pub mod build_granary;
pub mod build_watchtower;
pub mod build_dock;
pub mod build_totem;
pub mod build_shrine;
pub mod build_fence;
pub mod build_hut;
pub mod fortify;
pub mod dig_well_deep;
pub mod build_aqueduct;
pub mod build_paved_road;
pub mod build_gate;
pub mod build_kiln;
pub mod build_forge;
pub mod build_market;
pub mod build_amphitheater;
pub mod build_library;
pub mod build_observatory;
pub mod build_temple;
pub mod build_irrigation_canal;
pub mod build_quay;
pub mod build_signal_fire;
pub mod build_drying_rack;
pub mod build_pasture;
pub mod build_lookout;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        39  => build_wall::apply(ctx),
        40  => build_well::apply(ctx),
        41  => build_bridge::apply(ctx),
        42  => build_road::apply(ctx),
        43  => build_granary::apply(ctx),
        44  => build_watchtower::apply(ctx),
        45  => build_dock::apply(ctx),
        46  => build_totem::apply(ctx),
        47  => build_shrine::apply(ctx),
        48  => build_fence::apply(ctx),
        49  => build_hut::apply(ctx),
        50  => fortify::apply(ctx),
        166 => dig_well_deep::apply(ctx),
        167 => build_aqueduct::apply(ctx),
        168 => build_paved_road::apply(ctx),
        169 => build_gate::apply(ctx),
        170 => build_kiln::apply(ctx),
        171 => build_forge::apply(ctx),
        172 => build_market::apply(ctx),
        173 => build_amphitheater::apply(ctx),
        174 => build_library::apply(ctx),
        175 => build_observatory::apply(ctx),
        176 => build_temple::apply(ctx),
        177 => build_irrigation_canal::apply(ctx),
        178 => build_quay::apply(ctx),
        179 => build_signal_fire::apply(ctx),
        180 => build_drying_rack::apply(ctx),
        536 => build_pasture::apply(ctx),
        537 => build_lookout::apply(ctx),
        _   => 0.0,
    }
}
