use rand::seq::IndexedRandom;
use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Era {
    Stone,
    Bronze,
    Iron,
    Classical,
    Medieval,
    Renaissance,
    Industrial,
    Modern,
    Information,
    Genesis,
    Equilibrium,
    Expansion,
    Decline,
    Collapse,
}

impl Era {
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Era {
        match s {
            "stone" => Era::Stone,
            "bronze" => Era::Bronze,
            "iron" => Era::Iron,
            "classical" => Era::Classical,
            "medieval" => Era::Medieval,
            "renaissance" => Era::Renaissance,
            "industrial" => Era::Industrial,
            "modern" => Era::Modern,
            "information" => Era::Information,
            "abundance" | "expansion" => Era::Expansion,
            "equilibrium" => Era::Equilibrium,
            "decline" | "drought" => Era::Decline,
            "collapse" | "extinction" => Era::Collapse,
            _ => Era::Genesis,
        }
    }

    pub fn rank(self) -> u8 {
        match self {
            Era::Genesis | Era::Collapse | Era::Decline => 0,
            Era::Stone | Era::Equilibrium => 1,
            Era::Bronze | Era::Expansion => 2,
            Era::Iron => 3,
            Era::Classical => 4,
            Era::Medieval => 5,
            Era::Renaissance => 6,
            Era::Industrial => 7,
            Era::Modern => 8,
            Era::Information => 9,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum DegreeKind {
    Philosophy,
    Medicine,
    Engineering,
    Law,
    Science,
    Arts,
    Theology,
    Economics,
    Architecture,
    Astronomy,
    Mathematics,
    History,
    Literature,
}

impl DegreeKind {
    pub fn name(self) -> &'static str {
        match self {
            DegreeKind::Philosophy => "Philosophy",
            DegreeKind::Medicine => "Medicine",
            DegreeKind::Engineering => "Engineering",
            DegreeKind::Law => "Law",
            DegreeKind::Science => "Science",
            DegreeKind::Arts => "Arts",
            DegreeKind::Theology => "Theology",
            DegreeKind::Economics => "Economics",
            DegreeKind::Architecture => "Architecture",
            DegreeKind::Astronomy => "Astronomy",
            DegreeKind::Mathematics => "Mathematics",
            DegreeKind::History => "History",
            DegreeKind::Literature => "Literature",
        }
    }

    pub fn era_unlock(self) -> Era {
        match self {
            DegreeKind::Philosophy => Era::Classical,
            DegreeKind::Theology => Era::Classical,
            DegreeKind::Mathematics => Era::Classical,
            DegreeKind::Astronomy => Era::Classical,
            DegreeKind::Literature => Era::Classical,
            DegreeKind::History => Era::Classical,
            DegreeKind::Medicine => Era::Medieval,
            DegreeKind::Law => Era::Medieval,
            DegreeKind::Architecture => Era::Medieval,
            DegreeKind::Arts => Era::Renaissance,
            DegreeKind::Engineering => Era::Renaissance,
            DegreeKind::Science => Era::Renaissance,
            DegreeKind::Economics => Era::Industrial,
        }
    }

    pub fn unlocked_by(self, era: Era) -> bool {
        era.rank() >= self.era_unlock().rank()
    }

    pub fn bonuses_to(self, role: &str) -> f32 {
        let m = match self {
            DegreeKind::Medicine => &[("healing", 0.6), ("doctor", 0.5)][..],
            DegreeKind::Engineering => &[("construction", 0.6), ("smith", 0.4)][..],
            DegreeKind::Law => &[("trade", 0.5), ("diplomacy", 0.4)][..],
            DegreeKind::Philosophy => &[("persuasion", 0.5), ("teaching", 0.4)][..],
            DegreeKind::Science => &[("invention", 0.6), ("discovery", 0.5)][..],
            DegreeKind::Arts => &[("art", 0.7), ("culture", 0.5)][..],
            DegreeKind::Theology => &[("ritual", 0.6), ("comfort", 0.4)][..],
            DegreeKind::Economics => &[("trade", 0.7), ("merchant", 0.5)][..],
            DegreeKind::Architecture => &[("construction", 0.5), ("shelter", 0.4)][..],
            DegreeKind::Astronomy => &[("navigation", 0.5), ("discovery", 0.3)][..],
            DegreeKind::Mathematics => &[("invention", 0.4), ("trade", 0.3)][..],
            DegreeKind::History => &[("teaching", 0.5), ("persuasion", 0.3)][..],
            DegreeKind::Literature => &[("teaching", 0.5), ("art", 0.3)][..],
        };
        for (k, v) in m {
            if *k == role {
                return *v;
            }
        }
        0.0
    }

    pub fn role_label(self) -> &'static str {
        match self {
            DegreeKind::Medicine => "Doctor",
            DegreeKind::Engineering => "Engineer",
            DegreeKind::Law => "Magistrate",
            DegreeKind::Philosophy => "Philosopher",
            DegreeKind::Science => "Scientist",
            DegreeKind::Arts => "Artist",
            DegreeKind::Theology => "Priest",
            DegreeKind::Economics => "Merchant",
            DegreeKind::Architecture => "Architect",
            DegreeKind::Astronomy => "Astronomer",
            DegreeKind::Mathematics => "Mathematician",
            DegreeKind::History => "Historian",
            DegreeKind::Literature => "Scholar",
        }
    }
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct EducationProgress {
    pub literacy: f32,
    pub schooling_ticks: u32,
    pub university_ticks: u32,
}

pub const ADULT_AGE_TICKS: u32 = 1200;
pub const LITERACY_THRESHOLD_BOOK: f32 = 0.6;
pub const LITERACY_THRESHOLD_UNIVERSITY: f32 = 0.7;
pub const UNIVERSITY_TICKS_FOR_DEGREE: u32 = 600;
pub const LITERATE_EVENT_THRESHOLD: f32 = 0.5;

pub fn advance_literacy(current: f32, has_teacher_nearby: bool, near_school: bool) -> f32 {
    if !near_school || !has_teacher_nearby {
        return current;
    }
    (current + 0.001).clamp(0.0, 1.0)
}

pub fn pick_degree_for_era<R: Rng>(era: Era, rng: &mut R) -> Option<DegreeKind> {
    let all = [
        DegreeKind::Philosophy,
        DegreeKind::Medicine,
        DegreeKind::Engineering,
        DegreeKind::Law,
        DegreeKind::Science,
        DegreeKind::Arts,
        DegreeKind::Theology,
        DegreeKind::Economics,
        DegreeKind::Architecture,
        DegreeKind::Astronomy,
        DegreeKind::Mathematics,
        DegreeKind::History,
        DegreeKind::Literature,
    ];
    let unlocked: Vec<DegreeKind> = all.iter().copied().filter(|d| d.unlocked_by(era)).collect();
    unlocked.choose(rng).copied()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    #[test]
    fn literacy_stays_in_unit_interval() {
        let mut lit = 0.0f32;
        for _ in 0..3000 {
            lit = advance_literacy(lit, true, true);
        }
        assert!(lit > 0.0);
        assert!(lit <= 1.0);
        let mut hi = 1.0f32;
        for _ in 0..100 {
            hi = advance_literacy(hi, true, true);
        }
        assert!(hi <= 1.0);
        let stable = advance_literacy(0.5, false, true);
        assert_eq!(stable, 0.5);
        let stable2 = advance_literacy(0.5, true, false);
        assert_eq!(stable2, 0.5);
    }

    #[test]
    fn degrees_respect_era_unlock() {
        assert!(!DegreeKind::Economics.unlocked_by(Era::Stone));
        assert!(DegreeKind::Philosophy.unlocked_by(Era::Classical));
        assert!(DegreeKind::Economics.unlocked_by(Era::Industrial));
    }

    #[test]
    fn pick_degree_filters_by_era() {
        let mut rng = StdRng::seed_from_u64(42);
        let stone = pick_degree_for_era(Era::Stone, &mut rng);
        assert!(stone.is_none());
        let classical = pick_degree_for_era(Era::Classical, &mut rng);
        assert!(classical.is_some());
        assert!(classical.unwrap().unlocked_by(Era::Classical));
    }

    #[test]
    fn bonuses_lookup() {
        assert!(DegreeKind::Medicine.bonuses_to("healing") > 0.0);
        assert_eq!(DegreeKind::Medicine.bonuses_to("unknown"), 0.0);
        assert!(DegreeKind::Engineering.bonuses_to("construction") > 0.0);
    }
}
