use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgeStage {
    Infant,
    Child,
    Teen,
    Adult,
    Elder,
}

impl AgeStage {
    pub fn name(self) -> &'static str {
        match self {
            AgeStage::Infant => "infant",
            AgeStage::Child => "child",
            AgeStage::Teen => "teen",
            AgeStage::Adult => "adult",
            AgeStage::Elder => "elder",
        }
    }

    pub fn from_age(age: u32, max_age: u32) -> Self {
        if max_age == 0 {
            return AgeStage::Adult;
        }
        let frac = age as f32 / max_age as f32;
        if frac < 0.10 {
            AgeStage::Infant
        } else if frac < 0.25 {
            AgeStage::Child
        } else if frac < 0.35 {
            AgeStage::Teen
        } else if frac < 0.75 {
            AgeStage::Adult
        } else {
            AgeStage::Elder
        }
    }

    pub fn can_combat(self) -> bool {
        matches!(self, AgeStage::Teen | AgeStage::Adult | AgeStage::Elder)
    }

    pub fn can_reproduce(self) -> bool {
        matches!(self, AgeStage::Adult)
    }

    pub fn can_teach(self) -> bool {
        matches!(self, AgeStage::Adult | AgeStage::Elder)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn boundaries() {
        let max = 1000;
        assert_eq!(AgeStage::from_age(50, max), AgeStage::Infant);
        assert_eq!(AgeStage::from_age(150, max), AgeStage::Child);
        assert_eq!(AgeStage::from_age(280, max), AgeStage::Teen);
        assert_eq!(AgeStage::from_age(500, max), AgeStage::Adult);
        assert_eq!(AgeStage::from_age(800, max), AgeStage::Elder);
    }

    #[test]
    fn zero_max_defaults_to_adult() {
        assert_eq!(AgeStage::from_age(123, 0), AgeStage::Adult);
    }
}
