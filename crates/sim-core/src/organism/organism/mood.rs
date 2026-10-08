//! The mood a person shows: one word, from the states that already steer what
//! they do (grief, fear, hunger, thirst, anger, joy). The most pressing one
//! wins, so a grieving person who is also hungry reads as grieving first.

use super::Organism;

impl Organism {
    /// The word for how this person feels right now.
    pub fn mood(&self) -> &'static str {
        if self.grief_ticks > 200 {
            "grieving"
        } else if self.fear_level > 0.6 {
            "afraid"
        } else if self.energy < 0.3 {
            "hungry"
        } else if self.hydration < 0.3 {
            "thirsty"
        } else if self.anger > 0.5 {
            "angry"
        } else if self.joy_ticks > 300 {
            "joyful"
        } else if self.energy > 0.7 && self.hydration > 0.7 {
            "content"
        } else {
            "calm"
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::organism::traits::Traits;

    fn person() -> Organism {
        let mut o = Organism::new(
            "p".into(),
            "Ama".into(),
            0.0,
            0.0,
            0,
            String::new(),
            "lin".into(),
            9000,
            Traits::default(),
        );
        o.energy = 0.5;
        o.hydration = 0.5;
        o
    }

    #[test]
    fn a_plain_person_is_calm_and_a_well_fed_one_content() {
        let mut o = person();
        assert_eq!(o.mood(), "calm");
        o.energy = 0.9;
        o.hydration = 0.9;
        assert_eq!(o.mood(), "content");
    }

    #[test]
    fn grief_outranks_hunger_and_hunger_outranks_joy() {
        let mut o = person();
        o.energy = 0.1;
        o.grief_ticks = 300;
        assert_eq!(o.mood(), "grieving");
        o.grief_ticks = 0;
        assert_eq!(o.mood(), "hungry");
        o.energy = 0.5;
        o.joy_ticks = 400;
        assert_eq!(o.mood(), "joyful");
    }

    #[test]
    fn fear_thirst_and_anger_each_show() {
        let mut o = person();
        o.fear_level = 0.8;
        assert_eq!(o.mood(), "afraid");
        o.fear_level = 0.0;
        o.hydration = 0.1;
        assert_eq!(o.mood(), "thirsty");
        o.hydration = 0.5;
        o.anger = 0.6;
        assert_eq!(o.mood(), "angry");
    }
}
