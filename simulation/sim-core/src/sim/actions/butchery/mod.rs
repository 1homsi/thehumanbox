pub mod age_carcass;
pub mod break_carcass;
pub mod brine_belly;
pub mod brine_corn_beef;
pub mod brine_ham;
pub mod case_sausage;
pub mod cold_smoke_sausage;
pub mod cure_dry_age;
pub mod cure_with_salt;
pub mod cut_brisket_meat;
pub mod cut_chop;
pub mod cut_chuck;
pub mod cut_flank;
pub mod cut_loin;
pub mod cut_plate;
pub mod cut_primal;
pub mod cut_rib;
pub mod cut_roast;
pub mod cut_round;
pub mod cut_shank;
pub mod cut_skirt;
pub mod cut_steak;
pub mod cut_subprimal;
pub mod dry_age_carcass;
pub mod grind_brisket;
pub mod grind_chuck;
pub mod grind_for_sausage;
pub mod grind_sirloin;
pub mod grind_with_fat;
pub mod gut_carcass;
pub mod hang_carcass;
pub mod head_off_carcass;
pub mod label_package;
pub mod package_ground;
pub mod package_roasts;
pub mod package_steaks;
pub mod portion_cut;
pub mod quarter_carcass;
pub mod skin_carcass;
pub mod smoke_sausage;
pub mod split_brisket;
pub mod split_pelvis;
pub mod stuff_sausage;
pub mod tie_sausage;
pub mod trim_fat;
pub mod trim_silver_skin;
pub mod trim_sinew;
pub mod trim_tendon;
pub mod vacuum_seal;
pub mod wet_age_carcass;

use super::ctx::ActionCtx;

pub const OUTPUT_CAP: u8 = 12;

pub fn output_key(action: usize) -> Option<&'static str> {
    Some(match action {
        5820..=5821 | 5824..=5830 => "carcass",
        5822 => "pelvis",
        5823 | 5852 => "brisket",
        5831 => "primal",
        5832 => "subprimal",
        5833 => "steak",
        5834 => "chop",
        5835 => "roast",
        5836 => "loin",
        5837 => "rib",
        5838 => "shank",
        5839 => "meat",
        5840 | 5850 => "chuck",
        5841 => "round",
        5842 => "flank",
        5843 => "plate",
        5844 => "skirt",
        5845 | 5853 => "fat",
        5846 => "skin",
        5847 => "tendon",
        5848 => "sinew",
        5849 => "cut",
        5851 => "sirloin",
        5854..=5859 => "sausage",
        5860 => "belly",
        5861 => "ham",
        5862 => "beef",
        5863 => "age",
        5864 => "salt",
        5865 => "steaks",
        5866 => "roasts",
        5867 => "ground",
        5868 => "seal",
        5869 => "package",
        _ => return None,
    })
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    let Some(output) = output_key(action) else {
        return 0.0;
    };
    if ctx.org().tools.get(output).copied().unwrap_or(0) >= OUTPUT_CAP {
        return 0.0;
    }

    match action {
        5820 => skin_carcass::apply(ctx),
        5821 => head_off_carcass::apply(ctx),
        5822 => split_pelvis::apply(ctx),
        5823 => split_brisket::apply(ctx),
        5824 => gut_carcass::apply(ctx),
        5825 => hang_carcass::apply(ctx),
        5826 => age_carcass::apply(ctx),
        5827 => dry_age_carcass::apply(ctx),
        5828 => wet_age_carcass::apply(ctx),
        5829 => quarter_carcass::apply(ctx),
        5830 => break_carcass::apply(ctx),
        5831 => cut_primal::apply(ctx),
        5832 => cut_subprimal::apply(ctx),
        5833 => cut_steak::apply(ctx),
        5834 => cut_chop::apply(ctx),
        5835 => cut_roast::apply(ctx),
        5836 => cut_loin::apply(ctx),
        5837 => cut_rib::apply(ctx),
        5838 => cut_shank::apply(ctx),
        5839 => cut_brisket_meat::apply(ctx),
        5840 => cut_chuck::apply(ctx),
        5841 => cut_round::apply(ctx),
        5842 => cut_flank::apply(ctx),
        5843 => cut_plate::apply(ctx),
        5844 => cut_skirt::apply(ctx),
        5845 => trim_fat::apply(ctx),
        5846 => trim_silver_skin::apply(ctx),
        5847 => trim_tendon::apply(ctx),
        5848 => trim_sinew::apply(ctx),
        5849 => portion_cut::apply(ctx),
        5850 => grind_chuck::apply(ctx),
        5851 => grind_sirloin::apply(ctx),
        5852 => grind_brisket::apply(ctx),
        5853 => grind_with_fat::apply(ctx),
        5854 => grind_for_sausage::apply(ctx),
        5855 => case_sausage::apply(ctx),
        5856 => stuff_sausage::apply(ctx),
        5857 => tie_sausage::apply(ctx),
        5858 => smoke_sausage::apply(ctx),
        5859 => cold_smoke_sausage::apply(ctx),
        5860 => brine_belly::apply(ctx),
        5861 => brine_ham::apply(ctx),
        5862 => brine_corn_beef::apply(ctx),
        5863 => cure_dry_age::apply(ctx),
        5864 => cure_with_salt::apply(ctx),
        5865 => package_steaks::apply(ctx),
        5866 => package_roasts::apply(ctx),
        5867 => package_ground::apply(ctx),
        5868 => vacuum_seal::apply(ctx),
        5869 => label_package::apply(ctx),
        _ => 0.0,
    }
}
