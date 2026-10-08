//! Personality in words. A person's traits (fixed at birth, inherited from
//! their parents with a little variation) are shown as the words that fit
//! them: brave, shy, curious, fierce, kind, steadfast. A person can have
//! several, or none when their traits are all in the middle.

use super::traits::Traits;

/// The words for a person's traits, strongest first.
pub fn personality_words(t: &Traits) -> Vec<&'static str> {
    let mut words: Vec<(f32, &'static str)> = Vec::new();
    if t.fear < 0.3 && t.resilience > 0.5 {
        words.push((t.resilience - t.fear, "brave"));
    }
    if t.social_tendency < 0.3 {
        words.push((0.3 - t.social_tendency, "shy"));
    }
    if t.curiosity > 0.7 {
        words.push((t.curiosity - 0.7, "curious"));
    }
    if t.aggression > 0.7 {
        words.push((t.aggression - 0.7, "fierce"));
    }
    if t.social_tendency > 0.7 && t.aggression < 0.3 {
        words.push((t.social_tendency - 0.7, "kind"));
    }
    words.sort_by(|a, b| b.0.total_cmp(&a.0));
    words.into_iter().map(|(_, w)| w).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn traits(curiosity: f32, aggression: f32, fear: f32, social: f32, resilience: f32) -> Traits {
        Traits {
            curiosity,
            aggression,
            fear,
            memory_strength: 0.5,
            social_tendency: social,
            resilience,
        }
    }

    #[test]
    fn a_middling_person_has_no_special_words() {
        assert!(personality_words(&traits(0.5, 0.5, 0.5, 0.5, 0.5)).is_empty());
    }

    #[test]
    fn traits_show_as_words_strongest_first() {
        // brave 0.8 (resilience minus fear), curious 0.25, shy 0.2.
        let words = personality_words(&traits(0.95, 0.1, 0.1, 0.1, 0.9));
        assert_eq!(words, vec!["brave", "curious", "shy"]);
    }

    #[test]
    fn fierce_and_kind_are_not_both_claimed() {
        let fierce = personality_words(&traits(0.5, 0.9, 0.5, 0.2, 0.5));
        assert!(fierce.contains(&"fierce") && !fierce.contains(&"kind"));
        let kind = personality_words(&traits(0.5, 0.1, 0.5, 0.9, 0.5));
        assert!(kind.contains(&"kind") && !kind.contains(&"fierce"));
    }
}
