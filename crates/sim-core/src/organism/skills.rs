//! Know-how: what a person has learned to do, by doing it or by watching
//! someone who already can.
//!
//! Skill raises the odds that an attempt works and, for the practised, how
//! much it yields. Every attempt teaches a little, a failure less than a
//! success, and the young learn fastest. Someone working near kin or friends
//! shows them how: a child who grows up beside a fisher starts out ahead.

use crate::sim::age_stage::AgeStage;
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Skill {
    Woodcutting,
    Quarrying,
    Foraging,
    Fishing,
    Hunting,
    Farming,
    Building,
    Crafting,
    Healing,
}

impl Skill {
    pub const ALL: [Skill; 9] = [
        Skill::Woodcutting,
        Skill::Quarrying,
        Skill::Foraging,
        Skill::Fishing,
        Skill::Hunting,
        Skill::Farming,
        Skill::Building,
        Skill::Crafting,
        Skill::Healing,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Skill::Woodcutting => "woodcutting",
            Skill::Quarrying => "quarrying",
            Skill::Foraging => "foraging",
            Skill::Fishing => "fishing",
            Skill::Hunting => "hunting",
            Skill::Farming => "farming",
            Skill::Building => "building",
            Skill::Crafting => "crafting",
            Skill::Healing => "healing",
        }
    }

    pub fn from_name(name: &str) -> Option<Skill> {
        Skill::ALL.into_iter().find(|s| s.name() == name)
    }

    /// What someone who has mastered it is called.
    pub fn worker(self) -> &'static str {
        match self {
            Skill::Woodcutting => "woodcutter",
            Skill::Quarrying => "quarrier",
            Skill::Foraging => "forager",
            Skill::Fishing => "fisher",
            Skill::Hunting => "hunter",
            Skill::Farming => "farmer",
            Skill::Building => "builder",
            Skill::Crafting => "crafter",
            Skill::Healing => "healer",
        }
    }

    fn slot(self) -> usize {
        self as usize
    }
}

/// Levels at which a person is told apart: able, practised, and the best.
pub const HANDY: f32 = 0.35;
pub const SKILLED: f32 = 0.65;
pub const MASTER: f32 = 0.9;

/// What one successful attempt teaches a novice of average aptitude.
const PRACTICE_RATE: f32 = 0.012;
/// A failed attempt still teaches, but less.
const FAILURE_SHARE: f32 = 0.4;
/// What watching someone better at it teaches, per attempt seen, per unit of the gap.
const WATCH_RATE: f32 = 0.01;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Skills {
    levels: [f32; Skill::ALL.len()],
    /// How the person feels about each kind of work, from dread (-1) to a
    /// settled liking (`LIKING_CAP`). Grows with success; harm at the work
    /// turns it to dread, which fades over the seasons.
    feelings: [f32; Skill::ALL.len()],
    /// Where each kind of work has gone well for them, and how sure they are
    /// of the place (0 to 1). They go back there.
    spots: [Option<((i32, i32), f32)>; Skill::ALL.len()],
}

/// Most a person comes to like a kind of work.
pub const LIKING_CAP: f32 = 0.3;
/// Liking gained from one success at the work.
pub const LIKING_PER_SUCCESS: f32 = 0.003;
/// Where someone hurt at their work starts, and the line below which they avoid it.
pub const DREAD: f32 = -0.6;
/// How much dread fades each day.
pub const DREAD_FADE_PER_DAY: f32 = 0.006;

impl Skills {
    pub fn level(&self, skill: Skill) -> f32 {
        self.levels[skill.slot()]
    }

    pub fn set(&mut self, skill: Skill, level: f32) {
        self.levels[skill.slot()] = level.clamp(0.0, 1.0);
    }

    pub fn feeling(&self, skill: Skill) -> f32 {
        self.feelings[skill.slot()]
    }

    pub fn set_feeling(&mut self, skill: Skill, feeling: f32) {
        self.feelings[skill.slot()] = feeling.clamp(-1.0, LIKING_CAP);
    }

    /// Every feeling worth saving, by skill name, to three decimals.
    pub fn feelings_map(&self) -> BTreeMap<String, f32> {
        Skill::ALL
            .into_iter()
            .map(|s| (s, self.feeling(s)))
            .filter(|&(_, f)| f.abs() >= 0.001)
            .map(|(s, f)| (s.name().to_string(), (f * 1000.0).round() / 1000.0))
            .collect()
    }

    pub fn set_feelings_from_map(&mut self, map: &BTreeMap<String, f32>) {
        for (name, &f) in map {
            if let Some(skill) = Skill::from_name(name) {
                self.set_feeling(skill, f);
            }
        }
    }

    /// The place this work has gone well, if they remember one.
    pub fn good_spot(&self, skill: Skill) -> Option<((i32, i32), f32)> {
        self.spots[skill.slot()]
    }

    /// Work at `spot` went well (or not): the place is remembered, more surely
    /// with each success, and forgotten after enough empty tries.
    pub fn note_spot(&mut self, skill: Skill, spot: (i32, i32), went_well: bool) {
        let slot = &mut self.spots[skill.slot()];
        match (*slot, went_well) {
            (Some((p, sure)), true) if p == spot => *slot = Some((p, (sure + 0.1).min(1.0))),
            // A success somewhere new replaces a place they were less sure of.
            (Some((_, sure)), true) if sure < 0.3 => *slot = Some((spot, 0.2)),
            (None, true) => *slot = Some((spot, 0.2)),
            (Some((p, sure)), false) if p == spot => {
                *slot = (sure > 0.06).then_some((p, sure - 0.05));
            }
            _ => {}
        }
    }

    /// Every remembered spot, by skill name, for saves.
    pub fn spots_map(&self) -> BTreeMap<String, [f32; 3]> {
        Skill::ALL
            .into_iter()
            .filter_map(|s| {
                self.good_spot(s)
                    .map(|((x, y), sure)| (s, [x as f32, y as f32, sure]))
            })
            .map(|(s, v)| (s.name().to_string(), v))
            .collect()
    }

    pub fn set_spots_from_map(&mut self, map: &BTreeMap<String, [f32; 3]>) {
        for (name, &[x, y, sure]) in map {
            if let Some(skill) = Skill::from_name(name) {
                self.spots[skill.slot()] = Some(((x as i32, y as i32), sure.clamp(0.0, 1.0)));
            }
        }
    }

    /// One day passes: dread eases a little.
    pub fn ease_dread(&mut self) {
        for f in self.feelings.iter_mut().filter(|f| **f < 0.0) {
            *f = (*f + DREAD_FADE_PER_DAY).min(0.0);
        }
    }

    /// Every skill this person has begun to learn, best first.
    pub fn known(&self) -> Vec<(Skill, f32)> {
        let mut known: Vec<(Skill, f32)> = Skill::ALL
            .into_iter()
            .map(|s| (s, self.level(s)))
            .filter(|&(_, level)| level >= 0.01)
            .collect();
        known.sort_by(|a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
        known
    }

    pub fn best(&self) -> Option<(Skill, f32)> {
        self.known().into_iter().next()
    }

    /// The save form: only skills begun, by name, to three decimals.
    pub fn to_map(&self) -> BTreeMap<String, f32> {
        self.known()
            .into_iter()
            .map(|(s, level)| (s.name().to_string(), (level * 1000.0).round() / 1000.0))
            .collect()
    }

    pub fn from_map(map: &BTreeMap<String, f32>) -> Skills {
        let mut skills = Skills::default();
        for (name, &level) in map {
            if let Some(skill) = Skill::from_name(name) {
                skills.set(skill, level);
            }
        }
        skills
    }
}

/// Chance an attempt with base odds `base_p` works for someone at `level`.
/// A master closes most of the gap to certain; a novice gets the base odds.
pub fn success_chance(base_p: f32, level: f32) -> f32 {
    let base_p = base_p.clamp(0.0, 1.0);
    (base_p + (1.0 - base_p) * level.clamp(0.0, 1.0) * 0.6).min(base_p.max(0.97))
}

/// Chance a practised worker gets one more unit out of the same work.
pub fn extra_yield_chance(level: f32) -> f32 {
    ((level - 0.5) * 1.2).clamp(0.0, 0.6)
}

/// How quickly someone picks a skill up. Children and teens learn fastest,
/// elders slowest; a good memory and curiosity help.
pub fn aptitude(stage: AgeStage, memory_strength: f32, curiosity: f32) -> f32 {
    let age = match stage {
        AgeStage::Infant => 0.0,
        AgeStage::Child => 1.6,
        AgeStage::Teen => 1.4,
        AgeStage::Adult => 1.0,
        AgeStage::Elder => 0.6,
    };
    age * (0.7 + memory_strength.clamp(0.0, 1.0) * 0.3 + curiosity.clamp(0.0, 1.0) * 0.2)
}

/// Practice gained from one attempt. It slows as the learner nears mastery.
pub fn practice_gain(level: f32, succeeded: bool, aptitude: f32) -> f32 {
    let share = if succeeded { 1.0 } else { FAILURE_SHARE };
    PRACTICE_RATE * share * aptitude * (1.0 - level.clamp(0.0, 1.0))
}

/// What watching `worker` teaches someone at `watcher`. Nothing unless the
/// worker is clearly better, and watching alone never makes anyone better
/// than their teacher.
pub fn watching_gain(watcher: f32, worker: f32, aptitude: f32) -> f32 {
    let gap = worker - watcher;
    if gap <= 0.05 {
        return 0.0;
    }
    (WATCH_RATE * gap * aptitude).min(gap - 0.05)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Milestone {
    Handy,
    Skilled,
    Master,
}

/// The highest level passed between `before` and `after`, if any.
pub fn milestone_crossed(before: f32, after: f32) -> Option<Milestone> {
    [
        (MASTER, Milestone::Master),
        (SKILLED, Milestone::Skilled),
        (HANDY, Milestone::Handy),
    ]
    .into_iter()
    .find(|&(line, _)| before < line && after >= line)
    .map(|(_, m)| m)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn practice_makes_a_novice_better_and_slows_near_mastery() {
        let adult = aptitude(AgeStage::Adult, 0.5, 0.5);
        let mut level = 0.0;
        let mut attempts = 0;
        while level < SKILLED {
            level += practice_gain(level, true, adult);
            attempts += 1;
        }
        // Dozens of successes to become skilled, not a handful and not thousands.
        assert!((40..200).contains(&attempts), "{attempts} attempts");
        assert!(practice_gain(0.9, true, adult) < practice_gain(0.1, true, adult) / 5.0);
        assert!(practice_gain(0.2, false, adult) < practice_gain(0.2, true, adult));
    }

    #[test]
    fn the_young_learn_fastest_and_infants_not_at_all() {
        let child = aptitude(AgeStage::Child, 0.5, 0.5);
        let adult = aptitude(AgeStage::Adult, 0.5, 0.5);
        let elder = aptitude(AgeStage::Elder, 0.5, 0.5);
        assert!(child > adult && adult > elder);
        assert_eq!(aptitude(AgeStage::Infant, 1.0, 1.0), 0.0);
    }

    #[test]
    fn skill_raises_the_odds_without_making_anything_certain() {
        assert_eq!(success_chance(0.5, 0.0), 0.5);
        assert!(success_chance(0.5, 0.9) > 0.75);
        assert!(success_chance(0.12, 1.0) <= 0.97);
        // Something already near certain stays as it was.
        assert_eq!(success_chance(1.0, 1.0), 1.0);
        assert_eq!(extra_yield_chance(0.4), 0.0);
        assert!(extra_yield_chance(0.9) > 0.4);
    }

    #[test]
    fn watching_teaches_only_from_someone_better_and_never_past_them() {
        let child = aptitude(AgeStage::Child, 0.5, 0.5);
        assert_eq!(watching_gain(0.5, 0.52, child), 0.0);
        assert!(watching_gain(0.0, 0.8, child) > 0.0);
        let mut level = 0.0;
        for _ in 0..10_000 {
            level += watching_gain(level, 0.6, child);
        }
        assert!(level < 0.6, "watching made them better than the teacher: {level}");
        assert!(level > 0.5);
    }

    #[test]
    fn milestones_report_the_highest_line_crossed() {
        assert_eq!(milestone_crossed(0.30, 0.36), Some(Milestone::Handy));
        assert_eq!(milestone_crossed(0.60, 0.95), Some(Milestone::Master));
        assert_eq!(milestone_crossed(0.36, 0.40), None);
    }

    #[test]
    fn dread_fades_and_liking_is_capped() {
        let mut skills = Skills::default();
        skills.set_feeling(Skill::Hunting, DREAD);
        let mut days = 0;
        while skills.feeling(Skill::Hunting) < 0.0 {
            skills.ease_dread();
            days += 1;
        }
        assert!((60..=120).contains(&days), "{days} days");
        skills.set_feeling(Skill::Fishing, 5.0);
        assert_eq!(skills.feeling(Skill::Fishing), LIKING_CAP);
        let map = skills.feelings_map();
        let mut back = Skills::default();
        back.set_feelings_from_map(&map);
        assert_eq!(back.feeling(Skill::Fishing), LIKING_CAP);
    }

    #[test]
    fn a_good_spot_is_remembered_and_empty_tries_wear_it_out() {
        let mut skills = Skills::default();
        skills.note_spot(Skill::Fishing, (5, 5), true);
        skills.note_spot(Skill::Fishing, (5, 5), true);
        assert_eq!(skills.good_spot(Skill::Fishing).map(|(p, _)| p), Some((5, 5)));
        // A success elsewhere does not replace a place they are fairly sure of.
        skills.note_spot(Skill::Fishing, (9, 9), true);
        assert_eq!(skills.good_spot(Skill::Fishing).map(|(p, _)| p), Some((5, 5)));
        for _ in 0..20 {
            skills.note_spot(Skill::Fishing, (5, 5), false);
        }
        assert!(
            skills.good_spot(Skill::Fishing).is_none(),
            "an emptied spot is forgotten"
        );
        skills.note_spot(Skill::Fishing, (9, 9), true);
        let back = {
            let mut b = Skills::default();
            b.set_spots_from_map(&skills.spots_map());
            b
        };
        assert_eq!(back.good_spot(Skill::Fishing).map(|(p, _)| p), Some((9, 9)));
    }

    #[test]
    fn saves_keep_only_begun_skills_by_name() {
        let mut skills = Skills::default();
        skills.set(Skill::Fishing, 0.4567);
        skills.set(Skill::Hunting, 0.001);
        let map = skills.to_map();
        assert_eq!(map.len(), 1);
        assert_eq!(map["fishing"], 0.457);
        let back = Skills::from_map(&map);
        assert!((back.level(Skill::Fishing) - 0.457).abs() < 1e-6);
        assert_eq!(back.best().map(|(s, _)| s), Some(Skill::Fishing));
    }
}
