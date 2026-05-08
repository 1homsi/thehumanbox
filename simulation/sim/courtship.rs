use rand::Rng;
use crate::organism::organism::{Organism, ConversationEntry};

// ── Conversation generation ────────────────────────────────────────────────────
// Builds a short exchange between two organisms using their own vocabulary.
// Each line pairs an utterance in the organisms' invented language with an
// English "meaning" caption so players can follow what is happening.

fn pick_word<'a>(vocab: &'a std::collections::HashMap<String, String>,
                 concepts: &[&str], rng: &mut impl Rng) -> &'a str {
    for _ in 0..8 {
        let c = concepts[rng.gen_range(0..concepts.len())];
        if let Some(w) = vocab.get(c) {
            return w.as_str();
        }
    }
    "~"
}

/// Returns (utterance_text, english_meaning).
fn utterance_with_meaning(
    speaker: &Organism,
    listener: &Organism,
    mood: u8,
    rng: &mut impl Rng,
) -> (String, String) {
    let v  = &speaker.vocabulary.words;
    let lv = &listener.vocabulary.words;

    match mood {
        // ── 0: greeting ──────────────────────────────────────────────────────
        0 => {
            let text = if rng.gen::<f32>() < 0.55 {
                listener.name.clone()
            } else {
                let w = pick_word(v, &["friend", "home", "day"], rng);
                format!("{} {}", listener.name, w)
            };
            (text, format!("Greeting {}", listener.name))
        }

        // ── 1: affection / warmth ─────────────────────────────────────────────
        1 => {
            let w1 = pick_word(v, &["friend", "home", "group", "alone"], rng);
            let text = if rng.gen::<f32>() < 0.45 {
                format!("{} {}", w1, listener.name)
            } else {
                let w2 = pick_word(lv, &["home", "night", "day", "shelter"], rng);
                format!("{} {}", w1, w2)
            };
            let meanings = [
                "Expressing warmth and companionship",
                "Saying they are glad to be together",
                "Sharing a moment of closeness",
                "Feeling safe together",
            ];
            (text, meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── 2: question / curiosity ───────────────────────────────────────────
        2 => {
            let w1 = pick_word(v, &["food", "hunt", "day", "water"], rng);
            let w2 = pick_word(v, &["home", "shelter", "group"], rng);
            let meanings = [
                "Asking where the food is",
                "Wondering about water nearby",
                "Curious about shelter for the night",
                "Asking if the hunt was good",
            ];
            (format!("{} {}", w1, w2), meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── 3: reassurance ────────────────────────────────────────────────────
        3 => {
            let w = pick_word(v, &["shelter", "home", "friend", "group"], rng);
            let text = if rng.gen::<f32>() < 0.4 {
                format!("{} {}", listener.name, w)
            } else {
                w.to_string()
            };
            let meanings = [
                "Offering comfort and safety",
                "Saying everything will be alright",
                "Promising to stay close",
                "Reminding them home is near",
            ];
            (text, meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── 4: farewell ───────────────────────────────────────────────────────
        4 => {
            let w = pick_word(v, &["alone", "night", "home"], rng);
            let meanings = [
                "Saying goodbye for now",
                "Wishing them safe travels",
                "Until they meet again",
            ];
            (format!("{} {}", listener.name, w),
             meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── 5: casual talk — resources / environment ──────────────────────────
        5 => {
            let topics: &[(&[&str], &[&str])] = &[
                (&["food", "hunt"], &[
                    "Talking about where to find food",
                    "Sharing news about the hunt",
                    "Pointing out a good foraging spot",
                ]),
                (&["water", "day"], &[
                    "Mentioning a water source they found",
                    "Talking about the weather",
                    "Discussing how the day went",
                ]),
                (&["fire", "shelter"], &[
                    "Talking about keeping the fire going",
                    "Discussing the shelter they built",
                    "Mentioning a warm spot to rest",
                ]),
            ];
            let (concepts, meanings) = topics[rng.gen_range(0..topics.len())];
            let w = pick_word(v, concepts, rng);
            (w.to_string(), meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── 6: social bonding — group / tribe ────────────────────────────────
        6 => {
            let w = pick_word(v, &["friend", "group", "day", "night"], rng);
            let meanings = [
                "Catching up on news from the tribe",
                "Talking about the others in the group",
                "Sharing a laugh about something that happened",
                "Gossiping about another member of the group",
                "Planning where to camp tonight",
            ];
            (w.to_string(), meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── 7: tension / dispute ──────────────────────────────────────────────
        7 => {
            let w1 = pick_word(v, &["danger", "fire", "hunt", "alone"], rng);
            let w2 = pick_word(v, &["home", "shelter", "water"], rng);
            let meanings = [
                "Arguing about who gets the food",
                "Disputing territory boundaries",
                "Complaining about a shared danger",
                "Disagreeing about which direction to go",
                "Accusing the other of taking too much",
            ];
            (format!("{} {}", w1, w2), meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── 8: excitement / discovery ─────────────────────────────────────────
        8 => {
            let w1 = pick_word(v, &["fire", "food", "day", "hunt"], rng);
            let w2 = pick_word(v, &["friend", "group", "shelter"], rng);
            let meanings = [
                "Excitedly sharing a discovery",
                "Telling them about something new they found",
                "Surprised by what they saw today",
                "Describing an amazing place they visited",
            ];
            (format!("{} {}", w1, w2), meanings[rng.gen_range(0..meanings.len())].to_string())
        }

        // ── default ───────────────────────────────────────────────────────────
        _ => ("~".to_string(), "".to_string()),
    }
}

/// Mood arc for each conversation kind.
fn mood_arc(kind: &str) -> Vec<u8> {
    match kind {
        "courtship" => vec![0, 1, 2, 1, 3, 1],
        "bonded"    => vec![0, 1, 3, 1],
        "farewell"  => vec![0, 4],
        "chat"      => vec![0, 5, 6, 5],
        "argue"     => vec![7, 7, 0, 7],
        "excited"   => vec![0, 8, 8, 5],
        _           => vec![0, 1],
    }
}

/// Generate a conversation between two organisms.
/// Returns a ConversationEntry for each participant (they each store their own copy).
pub fn generate_conversation(
    a: &Organism,
    b: &Organism,
    tick: u64,
    kind: &str,
    rng: &mut impl Rng,
) -> (ConversationEntry, ConversationEntry) {
    let n_lines = match kind {
        "courtship" | "excited" => rng.gen_range(4..=6),
        _                       => rng.gen_range(2..=4),
    };
    let moods = mood_arc(kind);

    let mut lines:   Vec<[String; 2]> = Vec::with_capacity(n_lines);
    let mut meanings: Vec<String>      = Vec::with_capacity(n_lines);

    for i in 0..n_lines {
        let mood = moods[i.min(moods.len() - 1)];
        let (speaker, listener) = if i % 2 == 0 { (a, b) } else { (b, a) };
        let (text, meaning) = utterance_with_meaning(speaker, listener, mood, rng);
        let speaker_name = if i % 2 == 0 { a.name.clone() } else { b.name.clone() };
        lines.push([speaker_name, text]);
        meanings.push(meaning);
    }

    let entry_a = ConversationEntry {
        tick,
        with_name: b.name.clone(),
        with_id:   b.id.clone(),
        kind:      kind.to_string(),
        lines:     lines.clone(),
        meanings:  meanings.clone(),
    };
    let entry_b = ConversationEntry {
        tick,
        with_name: a.name.clone(),
        with_id:   a.id.clone(),
        kind:      kind.to_string(),
        lines,
        meanings,
    };
    (entry_a, entry_b)
}
