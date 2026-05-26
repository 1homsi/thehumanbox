use serde::{Deserialize, Serialize};

pub const DAY_LENGTH: u64 = 600;
pub const LUNAR_CYCLE_DAYS: u64 = 28;
pub const YEAR_LENGTH_DAYS: u64 = 84;
pub const LUNAR_CYCLE_TICKS: u64 = LUNAR_CYCLE_DAYS * DAY_LENGTH;
pub const YEAR_LENGTH_TICKS: u64 = YEAR_LENGTH_DAYS * DAY_LENGTH;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
pub enum MoonPhase {
    NewMoon,
    WaxingCrescent,
    FirstQuarter,
    WaxingGibbous,
    FullMoon,
    WaningGibbous,
    LastQuarter,
    WaningCrescent,
}

impl MoonPhase {
    pub fn label(self) -> &'static str {
        match self {
            MoonPhase::NewMoon          => "new_moon",
            MoonPhase::WaxingCrescent   => "waxing_crescent",
            MoonPhase::FirstQuarter     => "first_quarter",
            MoonPhase::WaxingGibbous    => "waxing_gibbous",
            MoonPhase::FullMoon         => "full_moon",
            MoonPhase::WaningGibbous    => "waning_gibbous",
            MoonPhase::LastQuarter      => "last_quarter",
            MoonPhase::WaningCrescent   => "waning_crescent",
        }
    }

    pub fn glyph(self) -> &'static str {
        match self {
            MoonPhase::NewMoon          => "🌑",
            MoonPhase::WaxingCrescent   => "🌒",
            MoonPhase::FirstQuarter     => "🌓",
            MoonPhase::WaxingGibbous    => "🌔",
            MoonPhase::FullMoon         => "🌕",
            MoonPhase::WaningGibbous    => "🌖",
            MoonPhase::LastQuarter      => "🌗",
            MoonPhase::WaningCrescent   => "🌘",
        }
    }

    pub fn illumination(self) -> f32 {
        match self {
            MoonPhase::NewMoon          => 0.00,
            MoonPhase::WaxingCrescent   => 0.25,
            MoonPhase::FirstQuarter     => 0.50,
            MoonPhase::WaxingGibbous    => 0.75,
            MoonPhase::FullMoon         => 1.00,
            MoonPhase::WaningGibbous    => 0.75,
            MoonPhase::LastQuarter      => 0.50,
            MoonPhase::WaningCrescent   => 0.25,
        }
    }
}

pub fn moon_phase_at(tick: u64) -> MoonPhase {
    let phase_ticks = LUNAR_CYCLE_TICKS / 8;
    let p = (tick % LUNAR_CYCLE_TICKS) / phase_ticks;
    match p {
        0 => MoonPhase::NewMoon,
        1 => MoonPhase::WaxingCrescent,
        2 => MoonPhase::FirstQuarter,
        3 => MoonPhase::WaxingGibbous,
        4 => MoonPhase::FullMoon,
        5 => MoonPhase::WaningGibbous,
        6 => MoonPhase::LastQuarter,
        _ => MoonPhase::WaningCrescent,
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug, Serialize, Deserialize)]
pub enum ZodiacSign {
    Ember,
    Wave,
    Stone,
    Root,
    Bough,
    Crane,
    Wolf,
    Dawn,
    Hearth,
    Veil,
    Spear,
    Seed,
}

impl ZodiacSign {
    pub const ALL: [ZodiacSign; 12] = [
        ZodiacSign::Ember, ZodiacSign::Wave, ZodiacSign::Stone, ZodiacSign::Root,
        ZodiacSign::Bough, ZodiacSign::Crane, ZodiacSign::Wolf, ZodiacSign::Dawn,
        ZodiacSign::Hearth, ZodiacSign::Veil, ZodiacSign::Spear, ZodiacSign::Seed,
    ];

    pub fn label(self) -> &'static str {
        match self {
            ZodiacSign::Ember  => "ember",
            ZodiacSign::Wave   => "wave",
            ZodiacSign::Stone  => "stone",
            ZodiacSign::Root   => "root",
            ZodiacSign::Bough  => "bough",
            ZodiacSign::Crane  => "crane",
            ZodiacSign::Wolf   => "wolf",
            ZodiacSign::Dawn   => "dawn",
            ZodiacSign::Hearth => "hearth",
            ZodiacSign::Veil   => "veil",
            ZodiacSign::Spear  => "spear",
            ZodiacSign::Seed   => "seed",
        }
    }

    pub fn glyph(self) -> &'static str {
        match self {
            ZodiacSign::Ember  => "🜂",
            ZodiacSign::Wave   => "🜄",
            ZodiacSign::Stone  => "🜃",
            ZodiacSign::Root   => "꙰",
            ZodiacSign::Bough  => "ᛉ",
            ZodiacSign::Crane  => "ᛯ",
            ZodiacSign::Wolf   => "ᛯ",
            ZodiacSign::Dawn   => "☼",
            ZodiacSign::Hearth => "ᚦ",
            ZodiacSign::Veil   => "ᛏ",
            ZodiacSign::Spear  => "ᛇ",
            ZodiacSign::Seed   => "᛫",
        }
    }

    pub fn flavor(self) -> &'static str {
        match self {
            ZodiacSign::Ember  => "warm-hearted and quick to act",
            ZodiacSign::Wave   => "fluid, patient, follows the moon",
            ZodiacSign::Stone  => "steady, slow to anger, slow to fall",
            ZodiacSign::Root   => "drawn deep, holds onto kin",
            ZodiacSign::Bough  => "reaches outward, growing always",
            ZodiacSign::Crane  => "watchful, long memory, careful step",
            ZodiacSign::Wolf   => "hunts in silence, trusts the pack",
            ZodiacSign::Dawn   => "born of light, restless until day",
            ZodiacSign::Hearth => "keeps the fire, tends the home",
            ZodiacSign::Veil   => "quiet, sees what others miss",
            ZodiacSign::Spear  => "true-aimed, blunt, unafraid",
            ZodiacSign::Seed   => "small now, but everything is coming",
        }
    }

    pub fn from_birth_tick(tick: u64) -> Self {
        let day_of_year = (tick / DAY_LENGTH) % YEAR_LENGTH_DAYS;
        let idx = (day_of_year * 12 / YEAR_LENGTH_DAYS) as usize;
        Self::ALL[idx.min(11)]
    }
}

pub fn current_year(tick: u64) -> u64 {
    tick / YEAR_LENGTH_TICKS
}

pub fn day_of_year(tick: u64) -> u64 {
    (tick / DAY_LENGTH) % YEAR_LENGTH_DAYS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lunar_cycle_visits_all_phases() {
        let mut seen = std::collections::HashSet::new();
        for d in 0..LUNAR_CYCLE_DAYS {
            seen.insert(moon_phase_at(d * DAY_LENGTH));
        }
        assert_eq!(seen.len(), 8, "every moon phase must appear inside one cycle");
    }

    #[test]
    fn moon_phase_wraps() {
        assert_eq!(moon_phase_at(0), moon_phase_at(LUNAR_CYCLE_TICKS));
        assert_eq!(moon_phase_at(123), moon_phase_at(LUNAR_CYCLE_TICKS + 123));
    }

    #[test]
    fn zodiac_covers_year() {
        let mut seen = std::collections::HashSet::new();
        for d in 0..YEAR_LENGTH_DAYS {
            seen.insert(ZodiacSign::from_birth_tick(d * DAY_LENGTH));
        }
        assert_eq!(seen.len(), 12, "all 12 signs must cover the year");
    }
}
