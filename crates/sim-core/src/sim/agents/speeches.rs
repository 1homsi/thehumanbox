//! Speeches. Every second day, in the late morning, the leader of a tribe that has a plaza walks to the
//! plaza and speaks, and the adults of the tribe who are near the plaza and idle walk over to listen (their
//! thought reads "listening to a speech"). The chronicle records each speech. A tribe with no plaza, or with
//! no leader, keeps its day as it always was.
//!
//! Each person looks once a minute, at their own minute of the hour, so the walks set out in a trickle.

use super::age_stage::AgeStage;
use super::family_outings::chebyshev;
use crate::sim::cosmos::DAY_LENGTH;
use crate::sim::simulation::Simulation;
use crate::sim::world_events::push_event;

/// A speech is given on every second day (the day index is odd).
const SPEECH_DAYS: u64 = 2;
const SPEECH_DAY: u64 = 1;
/// The speech runs from this fraction of the day to the second: one hour of the day, one check per person.
const SPEECH_HOURS: (f32, f32) = (0.30, 0.40);
/// A listener must be this close to the plaza (in tiles) to walk over.
const LISTEN_REACH: i32 = 16;
/// Only one adult in this many listens, so the crowd stays a few people from one tribe.
const LISTENER_SHARE: usize = 2;

impl Simulation {
    /// On a speech day, in the speech hour: the leader walks to the plaza and speaks, and nearby adults
    /// walk over to listen.
    pub(crate) fn assign_speech(&mut self, idx: usize) {
        let tick = self.tick_count;
        if tick % 60 != idx as u64 % 60 || (tick / DAY_LENGTH) % SPEECH_DAYS != SPEECH_DAY {
            return;
        }
        let phase = (tick % DAY_LENGTH) as f32 / DAY_LENGTH as f32;
        if !(SPEECH_HOURS.0..SPEECH_HOURS.1).contains(&phase) {
            return;
        }
        {
            let o = &self.organisms[idx];
            if !o.alive
                || o.journey.is_some()
                || o.wander_target.is_some()
                || o.energy < 0.35
                || o.hydration < 0.35
                || o.fear_level > 0.5
                || matches!(o.age_stage(), AgeStage::Infant | AgeStage::Child)
            {
                return;
            }
        }
        let lineage = self.organisms[idx].lineage_id.clone();
        let Some(plaza) = self.town_plazas.iter().find(|p| p.lineage == lineage) else {
            return;
        };
        let center = (plaza.center[0], plaza.center[1]);
        if !self.grid.get(center.0, center.1).walkable() {
            return;
        }
        let here = (self.organisms[idx].x as i32, self.organisms[idx].y as i32);
        if chebyshev(here, center) <= 3 {
            return;
        }
        let is_leader = self
            .governments
            .get(&lineage)
            .and_then(|g| g.leader_id.as_deref())
            == Some(self.organisms[idx].id.as_str());
        let target = (center.0 + (idx as i32 % 3) - 1, center.1 + (tick as i32 % 3) - 1);
        if is_leader {
            if chebyshev(here, center) > LISTEN_REACH * 4 {
                return;
            }
            self.organisms[idx].begin_journey(target, "going to give a speech", tick);
            let name = self
                .lineage_names
                .get(&lineage)
                .cloned()
                .unwrap_or_else(|| "A tribe".to_string());
            push_event(
                &mut self.events,
                tick,
                "speech",
                &name,
                "the leader gives a speech on the plaza",
            );
            return;
        }
        if !idx.is_multiple_of(LISTENER_SHARE) || chebyshev(here, center) > LISTEN_REACH {
            return;
        }
        self.organisms[idx].begin_journey(target, "listening to a speech", tick);
    }
}
