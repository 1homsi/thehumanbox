use rand::Rng;
use rand_distr::{Normal, Distribution};
use serde::Serialize;

#[derive(Clone, Debug, Serialize, serde::Deserialize)]
pub struct Traits {
    pub curiosity:       f32,
    pub aggression:      f32,
    pub fear:            f32,
    pub memory_strength: f32,
    pub social_tendency: f32,
    pub resilience:      f32,
}

impl Default for Traits {
    fn default() -> Self {
        Traits {
            curiosity: 0.5, aggression: 0.5, fear: 0.5,
            memory_strength: 0.5, social_tendency: 0.5, resilience: 0.5,
        }
    }
}

fn clamp_trait(v: f32) -> f32 {
    v.max(0.1).min(0.9)
}

fn gauss(rng: &mut impl Rng, std: f32) -> f32 {
    Normal::new(0.0f32, std).unwrap().sample(rng)
}

impl Traits {
    pub fn random(rng: &mut impl Rng) -> Self {
        let std = 0.2f32;
        Traits {
            curiosity:       clamp_trait(0.5 + gauss(rng, std)),
            aggression:      clamp_trait(0.5 + gauss(rng, std)),
            fear:            clamp_trait(0.5 + gauss(rng, std)),
            memory_strength: clamp_trait(0.5 + gauss(rng, std)),
            social_tendency: clamp_trait(0.5 + gauss(rng, std)),
            resilience:      clamp_trait(0.5 + gauss(rng, std)),
        }
    }

    pub fn mutate(&self, rng: &mut impl Rng) -> Self {
        let std = 0.07f32;
        Traits {
            curiosity:       clamp_trait(self.curiosity       + gauss(rng, std)),
            aggression:      clamp_trait(self.aggression      + gauss(rng, std)),
            fear:            clamp_trait(self.fear            + gauss(rng, std)),
            memory_strength: clamp_trait(self.memory_strength + gauss(rng, std)),
            social_tendency: clamp_trait(self.social_tendency + gauss(rng, std)),
            resilience:      clamp_trait(self.resilience      + gauss(rng, std)),
        }
    }
}
