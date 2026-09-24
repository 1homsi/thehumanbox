pub mod accept_apology;
pub mod brush_hair_of_loved;
pub mod bury_old_quarrel;
pub mod cradle_partner;
pub mod exchange_tokens;
pub mod forgive_old_grudge;
pub mod help_partner_dress;
pub mod hold_close_at_night;
pub mod hold_hand_at_sickbed;
pub mod hold_silent_company;
pub mod hold_through_storm;
pub mod hum_at_sickbed;
pub mod kiss_forehead;
pub mod knot_promise;
pub mod mail_apology;
pub mod make_peace_with_kin;
pub mod meet_for_first_time;
pub mod pass_down_blade;
pub mod pass_down_blessing;
pub mod pass_down_garden;
pub mod pass_down_pendant;
pub mod pass_down_recipe;
pub mod pass_down_song;
pub mod promise_at_dawn;
pub mod read_to_partner;
pub mod reaffirm_oath;
pub mod rebuild_friendship;
pub mod rebuild_trust;
pub mod renew_vows;
pub mod rub_partner_back;
pub mod share_childhood_memory;
pub mod share_grandparent_story;
pub mod share_grief;
pub mod share_joy;
pub mod sing_to_baby;
pub mod sit_with_dying;
pub mod sleep_intertwined;
pub mod stand_back_to_back;
pub mod steady_through_fight;
pub mod teach_kid_to_climb;
pub mod teach_kid_to_fish;
pub mod teach_kid_to_ride;
pub mod teach_kid_to_swim;
pub mod tie_friendship_cord;
pub mod trade_charms;
pub mod visit_old_friend;
pub mod wash_partner_feet;
pub mod wipe_brow_of_loved;
pub mod write_letter_to_estranged;
pub mod write_letter_to_lost_love;

use super::ctx::ActionCtx;
use crate::organism::organism::Organism;
use crate::sim::simulation::Simulation;

fn emotion_ticks(organism: &Organism, action: usize) -> u32 {
    match action {
        2220 => organism.grief_ticks,
        2221 => organism.joy_ticks,
        _ => 0,
    }
}

fn emotional_partner(sim: &Simulation, idx: usize, action: usize, nearby: &[usize]) -> Option<usize> {
    let actor = sim.organisms.get(idx)?;
    let actor_feels_it = emotion_ticks(actor, action) > 0;
    nearby
        .iter()
        .copied()
        .filter(|&other_idx| other_idx != idx)
        .filter(|&other_idx| {
            sim.organisms.get(other_idx).is_some_and(|other| {
                other.alive
                    && (other.x - actor.x).abs() + (other.y - actor.y).abs() <= 6.0
                    && (actor_feels_it || emotion_ticks(other, action) > 0)
            })
        })
        .min_by(|&left, &right| {
            let a = &sim.organisms[left];
            let b = &sim.organisms[right];
            let a_distance = (a.x - actor.x).abs() + (a.y - actor.y).abs();
            let b_distance = (b.x - actor.x).abs() + (b.y - actor.y).abs();
            (emotion_ticks(a, action) == 0)
                .cmp(&(emotion_ticks(b, action) == 0))
                .then_with(|| a_distance.total_cmp(&b_distance))
                .then_with(|| left.cmp(&right))
        })
}

pub fn action_is_possible(sim: &Simulation, idx: usize, action: usize, nearby: &[usize]) -> bool {
    !matches!(action, 2220 | 2221) || emotional_partner(sim, idx, action, nearby).is_some()
}

pub fn apply(action: usize, ctx: &mut ActionCtx) -> f32 {
    match action {
        2220 => share_grief::apply(ctx),
        2221 => share_joy::apply(ctx),
        2222 => hold_silent_company::apply(ctx),
        2223 => sit_with_dying::apply(ctx),
        2224 => brush_hair_of_loved::apply(ctx),
        2225 => read_to_partner::apply(ctx),
        2226 => help_partner_dress::apply(ctx),
        2227 => hold_hand_at_sickbed::apply(ctx),
        2228 => hum_at_sickbed::apply(ctx),
        2229 => wipe_brow_of_loved::apply(ctx),
        2230 => rub_partner_back::apply(ctx),
        2231 => wash_partner_feet::apply(ctx),
        2232 => sing_to_baby::apply(ctx),
        2233 => cradle_partner::apply(ctx),
        2234 => kiss_forehead::apply(ctx),
        2235 => hold_close_at_night::apply(ctx),
        2236 => sleep_intertwined::apply(ctx),
        2237 => hold_through_storm::apply(ctx),
        2238 => steady_through_fight::apply(ctx),
        2239 => stand_back_to_back::apply(ctx),
        2240 => promise_at_dawn::apply(ctx),
        2241 => renew_vows::apply(ctx),
        2242 => reaffirm_oath::apply(ctx),
        2243 => share_grandparent_story::apply(ctx),
        2244 => share_childhood_memory::apply(ctx),
        2245 => pass_down_pendant::apply(ctx),
        2246 => pass_down_blade::apply(ctx),
        2247 => pass_down_recipe::apply(ctx),
        2248 => pass_down_song::apply(ctx),
        2249 => pass_down_garden::apply(ctx),
        2250 => pass_down_blessing::apply(ctx),
        2251 => teach_kid_to_swim::apply(ctx),
        2252 => teach_kid_to_ride::apply(ctx),
        2253 => teach_kid_to_climb::apply(ctx),
        2254 => teach_kid_to_fish::apply(ctx),
        2255 => forgive_old_grudge::apply(ctx),
        2256 => bury_old_quarrel::apply(ctx),
        2257 => make_peace_with_kin::apply(ctx),
        2258 => write_letter_to_lost_love::apply(ctx),
        2259 => write_letter_to_estranged::apply(ctx),
        2260 => mail_apology::apply(ctx),
        2261 => accept_apology::apply(ctx),
        2262 => rebuild_trust::apply(ctx),
        2263 => rebuild_friendship::apply(ctx),
        2264 => visit_old_friend::apply(ctx),
        2265 => meet_for_first_time::apply(ctx),
        2266 => exchange_tokens::apply(ctx),
        2267 => trade_charms::apply(ctx),
        2268 => tie_friendship_cord::apply(ctx),
        2269 => knot_promise::apply(ctx),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;
    use crate::sim::actions::try_apply;
    use crate::sim::era::Era;
    use crate::sim::spatial::SpatialIndex;

    fn two_neighbors() -> (Simulation, SpatialIndex) {
        let mut sim = Simulation::new(0xe100);
        sim.organisms.clear();
        for (id, name, x) in [("a", "Ari", 40.0), ("b", "Bea", 41.0)] {
            let mut person = Organism::new(
                id.into(),
                name.into(),
                x,
                40.0,
                1,
                String::new(),
                "kin".into(),
                100_000,
                Traits::default(),
            );
            person.age = 40_000;
            sim.organisms.push(person);
        }
        sim.lineage_eras.insert("kin".into(), Era::Stone);
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        (sim, spatial)
    }

    #[test]
    fn sharing_grief_requires_a_present_feeling_neighbor_and_comforts_both_people() {
        let (mut sim, spatial) = two_neighbors();
        assert!(!action_is_possible(&sim, 0, 2220, &[1]));
        assert!(try_apply(&mut sim, 0, 2220, 40, 40, &spatial).is_none());
        assert!(sim.events.is_empty());

        sim.organisms[1].grief_ticks = 80;
        sim.organisms[0].loneliness = 0.50;
        sim.organisms[1].loneliness = 0.40;
        let actor_comfort = sim.organisms[0].comfort;
        let partner_comfort = sim.organisms[1].comfort;
        assert!(action_is_possible(&sim, 0, 2220, &[1]));
        assert!(try_apply(&mut sim, 0, 2220, 40, 40, &spatial).is_some());
        assert_eq!(sim.organisms[1].grief_ticks, 60);
        assert!(sim.organisms[0].comfort > actor_comfort);
        assert!(sim.organisms[1].comfort > partner_comfort);
        assert!(sim.organisms[0].loneliness < 0.50);
        assert!(sim.organisms[1].loneliness < 0.40);
        assert!(sim.organisms[0].thought.contains("Bea"));
        assert!(sim.organisms[1].thought.contains("Ari"));

        sim.organisms[1].x = 60.0;
        assert!(!action_is_possible(&sim, 0, 2220, &[1]));
    }

    #[test]
    fn sharing_joy_spreads_a_real_mood_to_a_neighbor() {
        let (mut sim, spatial) = two_neighbors();
        assert!(!action_is_possible(&sim, 0, 2221, &[1]));
        sim.organisms[0].joy_ticks = 90;
        assert!(action_is_possible(&sim, 0, 2221, &[1]));
        assert!(try_apply(&mut sim, 0, 2221, 40, 40, &spatial).is_some());
        assert_eq!(sim.organisms[0].joy_ticks, 100);
        assert_eq!(sim.organisms[1].joy_ticks, 30);

        sim.organisms[1].alive = false;
        assert!(!action_is_possible(&sim, 0, 2221, &[1]));
    }
}
