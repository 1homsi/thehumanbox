//! The world's calendar. A day is `DAY_LENGTH` ticks, a season is five days
//! and a year is the four seasons (twenty days). Ages are counted in years,
//! so a birthday falls on the same day of the year every year.
//!
//! The calendar is derived from the tick count and stored nowhere, so saves
//! and frames need no new fields: the client computes the same date from
//! `world.tick` with the same constants (`apps/web/src/game/model/calendar.ts`).

use crate::sim::config::{SEASONS, SEASON_LENGTH};
use crate::sim::cosmos::{DAY_LENGTH, YEAR_LENGTH_TICKS};
use crate::sim::simulation::Simulation;

/// Ticks in one year (four seasons).
pub const YEAR_TICKS: u64 = YEAR_LENGTH_TICKS;
/// Days in one season.
pub const SEASON_DAYS: u64 = SEASON_LENGTH / DAY_LENGTH;

/// A moment on the calendar, for display.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CalendarDate {
    /// Year, counted from 1.
    pub year: u64,
    /// Season name as shown to people ("Spring", ...).
    pub season: &'static str,
    /// Day within the season, counted from 1.
    pub day_of_season: u64,
    /// Day within the year, counted from 0.
    pub day_of_year: u64,
}

/// The display name of a simulation season. The simulation names seasons by
/// what they do to food; the calendar uses the names people know. The world
/// starts in summer, when food is at its most plentiful.
pub fn season_label(season: &str) -> &'static str {
    match season {
        "abundance" => "Summer",
        "decline" => "Autumn",
        "scarcity" => "Winter",
        "recovery" => "Spring",
        _ => "Spring",
    }
}

/// The calendar date of a tick.
pub fn date_at(tick: u64) -> CalendarDate {
    let into_year = tick % YEAR_TICKS;
    let season_index = (into_year / SEASON_LENGTH) as usize % SEASONS.len();
    CalendarDate {
        year: tick / YEAR_TICKS + 1,
        season: season_label(SEASONS[season_index]),
        day_of_season: (tick % SEASON_LENGTH) / DAY_LENGTH + 1,
        day_of_year: into_year / DAY_LENGTH,
    }
}

/// An age in ticks, as fractional years.
pub fn years_of(age_ticks: u64) -> f32 {
    age_ticks as f32 / YEAR_TICKS as f32
}

/// Whole years lived, the number a person would say out loud.
pub fn whole_years_of(age_ticks: u64) -> u64 {
    age_ticks / YEAR_TICKS
}

impl Simulation {
    /// The calendar date of the current tick.
    pub fn calendar_date(&self) -> CalendarDate {
        date_at(self.tick_count)
    }

    /// Each new year is announced in the chronicle and the headlines.
    pub(crate) fn tick_new_year(&mut self) {
        let tick = self.tick_count;
        if tick == 0 || !tick.is_multiple_of(YEAR_TICKS) {
            return;
        }
        let year = date_at(tick).year;
        let detail = format!("Year {year} begins. The seasons turn again.");
        crate::sim::world_events::push_event(&mut self.events, tick, "calendar", "the sky", &detail);
        self.headlines
            .push_back((tick, format!("\u{1F4C5} Year {year} begins.")));
        while self.headlines.len() > 80 {
            self.headlines.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_year_is_four_seasons_of_five_days() {
        assert_eq!(YEAR_TICKS, 4 * SEASON_LENGTH);
        assert_eq!(SEASON_DAYS, 5);
        assert_eq!(YEAR_TICKS / DAY_LENGTH, 20);
    }

    #[test]
    fn the_world_starts_in_summer_of_year_one() {
        let d = date_at(0);
        assert_eq!(
            (d.year, d.season, d.day_of_season, d.day_of_year),
            (1, "Summer", 1, 0)
        );
    }

    #[test]
    fn seasons_turn_in_order_and_the_year_rolls_over() {
        let names: Vec<&str> = (0..4).map(|s| date_at(s * SEASON_LENGTH).season).collect();
        assert_eq!(names, ["Summer", "Autumn", "Winter", "Spring"]);
        let last_day = date_at(YEAR_TICKS - 1);
        assert_eq!(
            (last_day.year, last_day.season, last_day.day_of_season),
            (1, "Spring", 5)
        );
        let next = date_at(YEAR_TICKS);
        assert_eq!((next.year, next.season, next.day_of_year), (2, "Summer", 0));
    }

    #[test]
    fn the_calendar_agrees_with_the_weather_season() {
        for tick in (0..YEAR_TICKS * 3).step_by(997) {
            let sim_season = SEASONS[(tick / SEASON_LENGTH) as usize % SEASONS.len()];
            assert_eq!(date_at(tick).season, season_label(sim_season));
        }
    }

    #[test]
    fn ages_count_in_years() {
        assert_eq!(whole_years_of(YEAR_TICKS - 1), 0);
        assert_eq!(whole_years_of(YEAR_TICKS * 3 + 5), 3);
        assert!((years_of(YEAR_TICKS / 2) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn a_new_year_is_announced_once_in_the_chronicle() {
        let mut sim = Simulation::new(9);
        sim.events.clear();
        sim.headlines.clear();
        for tick in [YEAR_TICKS - 1, YEAR_TICKS, YEAR_TICKS + 1] {
            sim.tick_count = tick;
            sim.tick_new_year();
        }
        let years: Vec<&str> = sim
            .events
            .iter()
            .filter(|e| e.etype == "calendar")
            .map(|e| e.detail.as_str())
            .collect();
        assert_eq!(years, ["Year 2 begins. The seasons turn again."]);
        assert_eq!(sim.headlines.len(), 1);
    }
}
