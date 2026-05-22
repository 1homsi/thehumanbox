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

    pub fn move_speed_mult(self) -> f32 {
        match self {
            AgeStage::Infant => 0.40,
            AgeStage::Child => 0.70,
            AgeStage::Teen => 1.00,
            AgeStage::Adult => 1.00,
            AgeStage::Elder => 0.70,
        }
    }

    pub fn energy_decay_mult(self) -> f32 {
        match self {
            AgeStage::Infant => 1.5,
            AgeStage::Child => 0.9,
            AgeStage::Teen => 1.0,
            AgeStage::Adult => 1.0,
            AgeStage::Elder => 1.3,
        }
    }

    pub fn as_u8(self) -> u8 {
        match self {
            AgeStage::Infant => 0,
            AgeStage::Child => 1,
            AgeStage::Teen => 2,
            AgeStage::Adult => 3,
            AgeStage::Elder => 4,
        }
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
