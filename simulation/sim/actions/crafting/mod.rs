

pub mod spear; pub mod basket; pub mod net; pub mod raft;
pub mod toolmaking; pub mod clothing; pub mod leatherwork; pub mod drum;
pub mod craft_medicine; pub mod cook_food; pub mod smoke_meat;
pub mod light_torch; pub mod pottery; pub mod rope; pub mod bow;
pub mod flute; pub mod carved_bone; pub mod fishing_hook;
pub mod fishing_line; pub mod knife; pub mod axe; pub mod sharpen_blade;
pub mod torch_pitch; pub mod lantern; pub mod craft_canoe;
pub mod paddle; pub mod sled; pub mod wheel; pub mod loom; pub mod mortar;

use super::ctx::ActionCtx;

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        51  => spear::apply(ctx),
        52  => basket::apply(ctx),
        53  => net::apply(ctx),
        54  => raft::apply(ctx),
        55  => toolmaking::apply(ctx),
        56  => clothing::apply(ctx),
        57  => leatherwork::apply(ctx),
        58  => drum::apply(ctx),
        59  => craft_medicine::apply(ctx),
        60  => cook_food::apply(ctx),
        61  => smoke_meat::apply(ctx),
        62  => light_torch::apply(ctx),
        63  => pottery::apply(ctx),
        64  => rope::apply(ctx),
        65  => bow::apply(ctx),
        151 => flute::apply(ctx),
        152 => carved_bone::apply(ctx),
        153 => fishing_hook::apply(ctx),
        154 => fishing_line::apply(ctx),
        155 => knife::apply(ctx),
        156 => axe::apply(ctx),
        157 => sharpen_blade::apply(ctx),
        158 => torch_pitch::apply(ctx),
        159 => lantern::apply(ctx),
        160 => craft_canoe::apply(ctx),
        161 => paddle::apply(ctx),
        162 => sled::apply(ctx),
        163 => wheel::apply(ctx),
        164 => loom::apply(ctx),
        165 => mortar::apply(ctx),
        _   => 0.0,
    }
}
