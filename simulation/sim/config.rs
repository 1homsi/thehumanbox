pub const MAX_POPULATION: usize = 200;
pub const DAY_LENGTH:     u64   = 600;
pub const SEASON_LENGTH:  u64   = 3000;

pub const SEASONS: [&str; 4] = ["abundance", "decline", "scarcity", "recovery"];

pub fn season_growth(season: &str) -> f32 {
    match season {
        "abundance" => 2.0,
        "decline"   => 1.0,
        "scarcity"  => 0.28,
        "recovery"  => 0.65,
        _           => 1.0,
    }
}

pub const DROUGHT_DURATION:  u64   = 1500;
pub const DROUGHT_BASE_PROB: f32   = 0.00004;
pub const OUTBREAK_BASE_PROB: f32  = 0.000025;
