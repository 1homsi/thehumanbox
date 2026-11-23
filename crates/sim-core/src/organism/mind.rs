use super::organism::{Organism, DIRECTIONS};
use crate::world::{grid::WorldGrid, tiles::Tile};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Purpose {
    Water,
    Food,
    Shelter,
    Home,
    Wood,
    Stone,
    Work,
    Duty,
    Company,
    Roam,
    Play,
}

impl Purpose {
    pub fn is_need(self) -> bool {
        matches!(self, Purpose::Water | Purpose::Food)
    }

    pub fn fits_night(self) -> bool {
        matches!(
            self,
            Purpose::Water | Purpose::Food | Purpose::Shelter | Purpose::Home | Purpose::Duty
        )
    }

    pub fn is_leisure(self) -> bool {
        matches!(self, Purpose::Roam | Purpose::Company | Purpose::Play)
    }

    pub fn fits_storm(self) -> bool {
        matches!(self, Purpose::Shelter | Purpose::Home)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Intent {
    pub purpose: Purpose,
    pub target: (i32, i32),
    pub reach: i32,
    pub arrive: Option<usize>,
    pub thought: &'static str,
    pub since: u64,
    pub until: u64,
    pub stays: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub enum IntentOp {
    #[default]
    Keep,
    Set(Intent),
    Done,
    Rethink,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Pursuit {
    Step(usize),
    Arrived(Option<usize>),
    Dropped,
}

pub fn chebyshev(a: (i32, i32), b: (i32, i32)) -> i32 {
    (a.0 - b.0).abs().max((a.1 - b.1).abs())
}

pub fn travel_ticks(from: (i32, i32), to: (i32, i32)) -> u64 {
    chebyshev(from, to).max(0) as u64
}

pub fn arrival_thought(action: usize) -> &'static str {
    match action {
        8 => "eating",
        9 => "drinking at the water's edge",
        14 => "gathering wood",
        27 => "chopping wood",
        29 => "quarrying stone",
        _ => "resting",
    }
}

pub const SIGHT: i32 = 8;
pub const ERRAND_REACH: i32 = 48;
pub const JOURNEY_REST: u64 = 2400;

pub const NIGHT_STARTS: u64 = 420;
pub const DAY: u64 = 600;

pub fn ticks_until_night(tick: u64) -> u64 {
    NIGHT_STARTS.saturating_sub(tick % DAY)
}

pub const DAWN: u64 = 60;

pub fn ticks_until_dawn(tick: u64) -> u64 {
    let phase = tick % DAY;
    if phase < DAWN {
        DAWN - phase
    } else {
        DAY - phase + DAWN
    }
}

impl Intent {
    pub fn new(
        purpose: Purpose,
        from: (i32, i32),
        target: (i32, i32),
        reach: i32,
        arrive: Option<usize>,
        thought: &'static str,
        tick: u64,
    ) -> Self {
        Intent {
            purpose,
            target,
            reach,
            arrive,
            thought,
            since: tick,
            until: tick + travel_ticks(from, target) * 3 + 40,
            stays: false,
        }
    }

    pub fn staying(mut self, ticks: u64) -> Self {
        self.until = self.until.max(self.since + ticks);
        self.stays = true;
        self
    }

    pub fn arrived(&self, here: (i32, i32), grid: &WorldGrid) -> bool {
        if self.purpose == Purpose::Water {
            return grid.get(here.0, here.1) == Tile::Water
                || grid.water_beside(here.0, here.1).is_some()
                || grid.ice_beside(here.0, here.1).is_some();
        }
        chebyshev(here, self.target) <= self.reach
    }

    pub fn still_worth_it(&self, o: &Organism, grid: &WorldGrid) -> bool {
        let at = grid.get(self.target.0, self.target.1);
        let in_sight = chebyshev((o.x as i32, o.y as i32), self.target) <= SIGHT;
        match self.purpose {
            Purpose::Water => o.hydration < 0.9,
            Purpose::Food => o.energy < 0.95 && (!in_sight || at == Tile::Food),
            Purpose::Wood => o.carrying == 0 && matches!(at, Tile::Grass | Tile::Food),
            Purpose::Stone => matches!(at, Tile::Rock | Tile::Mineral),
            _ => true,
        }
    }
}

impl Organism {
    pub(crate) fn pursue(&self, intent: &Intent, grid: &WorldGrid, tick: u64, dry_only: bool) -> Pursuit {
        if tick >= intent.until {
            return Pursuit::Dropped;
        }
        let here = (self.x as i32, self.y as i32);
        if intent.arrived(here, grid) {
            self.route
                .borrow_mut()
                .settles(intent.target, chebyshev(here, intent.target), intent.reach);
            return Pursuit::Arrived(intent.arrive);
        }
        if !intent.still_worth_it(self, grid) || self.route.borrow().recently_blocked(intent.target) {
            return Pursuit::Dropped;
        }
        if !dry_only {
            return Pursuit::Step(self.toward(intent.target, grid));
        }
        match self.dry_way(intent.purpose, intent.target, grid) {
            Some(action) => Pursuit::Step(action),
            None => Pursuit::Dropped,
        }
    }

    pub(crate) fn dry_way(&self, purpose: Purpose, target: (i32, i32), grid: &WorldGrid) -> Option<usize> {
        let action = self.toward(target, grid);
        let &(dx, dy) = DIRECTIONS.get(action)?;
        let (x, y) = (self.x as i32 + dx, self.y as i32 + dy);
        let tile = grid.get(x, y);
        if tile.walkable() && (purpose == Purpose::Water || !grid.is_wet(tile, x, y)) {
            return Some(action);
        }
        let mut route = self.route.borrow_mut();
        if !route.recently_blocked(target) {
            route.mark_blocked(target);
        }
        None
    }

    pub(crate) fn stroll_target(&self, direction: usize, grid: &WorldGrid) -> Option<(i32, i32)> {
        let &(dx, dy) = DIRECTIONS.get(direction)?;
        let here = (self.x as i32, self.y as i32);
        let reach = 6 + (self.traits.curiosity.clamp(0.0, 1.0) * 8.0) as i32;
        (3..=reach).rev().find_map(|n| {
            let (x, y) = (here.0 + dx * n, here.1 + dy * n);
            let tile = grid.get(x, y);
            (tile.walkable() && !grid.is_wet(tile, x, y)).then_some((x, y))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn night_is_counted_down_from_the_day_phase() {
        assert_eq!(ticks_until_night(0), 420);
        assert_eq!(ticks_until_night(600 + 400), 20);
        assert_eq!(ticks_until_night(430), 0);
        assert_eq!(ticks_until_dawn(430), 230);
        assert_eq!(ticks_until_dawn(20), 40);
    }

    #[test]
    fn an_intent_lasts_long_enough_to_walk_there() {
        let i = Intent::new(Purpose::Wood, (0, 0), (10, 4), 0, Some(14), "seeking wood", 100);
        assert_eq!(i.until, 100 + 30 + 40);
        assert_eq!(i.staying(20).until, 170);
        assert_eq!(i.staying(300).until, 400);
        assert!(!Purpose::Wood.fits_night());
        assert!(Purpose::Home.fits_storm());
    }
}
