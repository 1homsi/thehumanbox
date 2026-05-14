use rand::Rng;
use crate::organism::organism::{Organism, ConversationEntry};

// ── Conversation generation ────────────────────────────────────────────────────
// Builds a short exchange between two organisms using their own vocabulary.
// Each line pairs an utterance in the organisms' invented language with an
// English "meaning" caption.
//
// Design rule (added 2026-05): one concept = one gloss. When a speaker
// says the word for "food", the gloss says "food", every time. Earlier
// the gloss was picked at random from a small pool that *only loosely*
// corresponded to the speaker's word - so the same coined word "miba"
// could appear glossed as "food" in one chat and "the hunt" in another,
// and a single-word utterance was often glossed as a full English
// sentence. Caption now reads directly from the concept(s) the speaker
// actually used, optionally wrapped in mood framing.

/// Canonical English gloss for each concept the vocabulary covers.
/// Mirrors CONCEPTS in organism::vocabulary so the dialogue layer is
/// the single source of truth for "what does this concept mean in
/// English".
fn concept_gloss(concept: &str) -> &'static str {
    match concept {
        "food"    => "food",
        "water"   => "water",
        "fire"    => "fire",
        "danger"  => "danger",
        "friend"  => "friend",
        "foe"     => "enemy",
        "shelter" => "shelter",
        "hunt"    => "the hunt",
        "night"   => "night",
        "day"     => "day",
        "sick"    => "sickness",
        "home"    => "home",
        "group"   => "the tribe",
        "alone"   => "alone",
        "sun"     => "the sun",
        "moon"    => "the moon",
        "star"    => "a star",
        "sky"     => "the sky",
        "rain"    => "rain",
        "storm"   => "the storm",
        "wind"    => "the wind",
        "snow"    => "snow",
        "ice"     => "ice",
        "cloud"   => "the clouds",
        "river"   => "the river",
        "lake"    => "the lake",
        "sea"     => "the sea",
        "mountain"=> "the mountain",
        "forest"  => "the forest",
        "tree"    => "a tree",
        "grass"   => "the grass",
        "stone"   => "stone",
        "sand"    => "sand",
        "earth"   => "the earth",
        "cave"    => "the cave",
        "path"    => "the path",
        "world"   => "the world",
        "hunger"  => "hunger",
        "thirst"  => "thirst",
        "pain"    => "pain",
        "tired"   => "tiredness",
        "strong"  => "strength",
        "weak"    => "weakness",
        "hurt"    => "being hurt",
        "heal"    => "healing",
        "rest"    => "rest",
        "sleep"   => "sleep",
        "breath"  => "breath",
        "blood"   => "blood",
        "old"     => "old age",
        "young"   => "youth",
        "born"    => "birth",
        "death"   => "death",
        "life"    => "life",
        "fear"    => "fear",
        "joy"     => "joy",
        "anger"   => "anger",
        "sad"     => "sadness",
        "love"    => "love",
        "hate"    => "hatred",
        "calm"    => "calm",
        "brave"   => "bravery",
        "lonely"  => "loneliness",
        "hope"    => "hope",
        "trust"   => "trust",
        "grief"   => "grief",
        "pride"   => "pride",
        "shame"   => "shame",
        "curious" => "curiosity",
        "kin"     => "kin",
        "child"   => "a child",
        "mother"  => "mother",
        "father"  => "father",
        "elder"   => "an elder",
        "mate"    => "a mate",
        "stranger"=> "a stranger",
        "leader"  => "the leader",
        "tribe"   => "the tribe",
        "ally"    => "an ally",
        "gift"    => "a gift",
        "share"   => "sharing",
        "help"    => "help",
        "teach"   => "teaching",
        "learn"   => "learning",
        "story"   => "a story",
        "song"    => "a song",
        "dance"   => "a dance",
        "play"    => "play",
        "talk"    => "talking",
        "listen"  => "listening",
        "greet"   => "a greeting",
        "fight"   => "a fight",
        "war"     => "war",
        "peace"   => "peace",
        "trade"   => "trade",
        "go"      => "going",
        "come"    => "coming",
        "stay"    => "staying",
        "run"     => "running",
        "climb"   => "climbing",
        "swim"    => "swimming",
        "dig"     => "digging",
        "build"   => "building",
        "break"   => "breaking",
        "carry"   => "carrying",
        "give"    => "giving",
        "find"    => "finding",
        "see"     => "seeing",
        "hear"    => "hearing",
        "hide"    => "hiding",
        "watch"   => "watching",
        "follow"  => "following",
        "lead"    => "leading",
        "gather"  => "gathering",
        "plant"   => "planting",
        "make"    => "making",
        "cold"    => "the cold",
        "warm"    => "warmth",
        "dark"    => "darkness",
        "light"   => "light",
        "big"     => "the great",
        "small"   => "the small",
        "near"    => "the near",
        "far"     => "the far",
        "many"    => "the many",
        "good"    => "good",
        "bad"     => "bad",
        "new"     => "the new",
        "here"    => "here",
        "there"   => "there",
        "meat"    => "meat",
        "berry"   => "berries",
        "root"    => "roots",
        "wood"    => "wood",
        "tool"    => "a tool",
        "trap"    => "a trap",
        "spear"   => "a spear",
        "basket"  => "a basket",
        "medicine"=> "medicine",
        "farm"    => "the farm",
        "nest"    => "a nest",
        "name"    => "a name",
        "time"    => "time",
        "season"  => "the season",
        // Unknown concept - fall back to a generic gloss rather than
        // returning the input ref (would force a non-static lifetime).
        _         => "something",
    }
}

/// Pick a concept from `concepts` whose word actually exists in `vocab`.
/// Returns both the concept (for glossing) and the spoken word so the
/// caller can tie the caption to the actual utterance.
fn pick_concept_and_word<'a>(
    vocab: &'a std::collections::HashMap<String, String>,
    concepts: &[&'a str],
    rng: &mut impl Rng,
) -> (&'a str, &'a str) {
    for _ in 0..8 {
        let c = concepts[rng.gen_range(0..concepts.len())];
        if let Some(w) = vocab.get(c) {
            return (c, w.as_str());
        }
    }
    (concepts.first().copied().unwrap_or("~"), "~")
}

/// Returns (utterance_text, english_meaning).
/// The English meaning is composed from the concept(s) the speaker
/// actually picked - so the gloss reflects the word that was said, not
/// a random sentence from a pool. Mood adds short framing words.
fn utterance_with_meaning(
    speaker: &Organism,
    listener: &Organism,
    mood: u8,
    rng: &mut impl Rng,
) -> (String, String) {
    let v  = &speaker.vocabulary.words;
    let lv = &listener.vocabulary.words;

    // Mood-prefixed gloss helper. Single-concept utterances become
    // "{mood-prefix} {concept gloss}", e.g. "calling: friend" instead
    // of a full sentence.
    fn one(prefix: &str, c: &str) -> String {
        format!("{}: {}", prefix, concept_gloss(c))
    }
    fn two(prefix: &str, c1: &str, c2: &str) -> String {
        let g1 = concept_gloss(c1);
        let g2 = concept_gloss(c2);
        if g1 == g2 {
            format!("{}: {}", prefix, g1)
        } else {
            format!("{}: {} + {}", prefix, g1, g2)
        }
    }

    match mood {
        // ── 0: greeting ──────────────────────────────────────────────────────
        0 => {
            if rng.gen::<f32>() < 0.55 {
                // Just the name
                (listener.name.clone(), format!("greeting {}", listener.name))
            } else {
                let (c, w) = pick_concept_and_word(v, &["friend", "home", "day"], rng);
                (format!("{} {}", listener.name, w),
                 format!("greeting {} ({})", listener.name, concept_gloss(c)))
            }
        }

        // ── 1: affection / warmth ─────────────────────────────────────────────
        1 => {
            let (c1, w1) = pick_concept_and_word(v, &["friend", "home", "group", "alone"], rng);
            if rng.gen::<f32>() < 0.45 {
                (format!("{} {}", w1, listener.name),
                 format!("warmth: {} ({})", concept_gloss(c1), listener.name))
            } else {
                let (c2, w2) = pick_concept_and_word(lv, &["home", "night", "day", "shelter"], rng);
                (format!("{} {}", w1, w2), two("warmth", c1, c2))
            }
        }

        // ── 2: question / curiosity ───────────────────────────────────────────
        2 => {
            let (c1, w1) = pick_concept_and_word(v, &["food", "hunt", "day", "water"], rng);
            let (c2, w2) = pick_concept_and_word(v, &["home", "shelter", "group"], rng);
            (format!("{} {}", w1, w2), two("asking about", c1, c2))
        }

        // ── 3: reassurance ────────────────────────────────────────────────────
        3 => {
            let (c, w) = pick_concept_and_word(v, &["shelter", "home", "friend", "group"], rng);
            if rng.gen::<f32>() < 0.4 {
                (format!("{} {}", listener.name, w),
                 format!("reassuring {} ({})", listener.name, concept_gloss(c)))
            } else {
                (w.to_string(), one("reassuring", c))
            }
        }

        // ── 4: farewell ───────────────────────────────────────────────────────
        4 => {
            let (c, w) = pick_concept_and_word(v, &["alone", "night", "home"], rng);
            (format!("{} {}", listener.name, w),
             format!("farewell to {} ({})", listener.name, concept_gloss(c)))
        }

        // ── 5: casual talk - resources / environment ──────────────────────────
        5 => {
            let (c, w) = pick_concept_and_word(v,
                &["food", "hunt", "water", "day", "fire", "shelter"], rng);
            (w.to_string(), one("talking about", c))
        }

        // ── 6: social bonding - group / tribe ────────────────────────────────
        6 => {
            let (c, w) = pick_concept_and_word(v, &["friend", "group", "day", "night"], rng);
            (w.to_string(), one("catching up", c))
        }

        // ── 7: tension / dispute ──────────────────────────────────────────────
        7 => {
            let (c1, w1) = pick_concept_and_word(v, &["danger", "fire", "hunt", "alone"], rng);
            let (c2, w2) = pick_concept_and_word(v, &["home", "shelter", "water"], rng);
            (format!("{} {}", w1, w2), two("arguing about", c1, c2))
        }

        // ── 8: excitement / discovery ─────────────────────────────────────────
        8 => {
            let (c1, w1) = pick_concept_and_word(v, &["fire", "food", "day", "hunt"], rng);
            let (c2, w2) = pick_concept_and_word(v, &["friend", "group", "shelter"], rng);
            (format!("{} {}", w1, w2), two("excited about", c1, c2))
        }

        // ── default ───────────────────────────────────────────────────────────
        _ => ("~".to_string(), String::new()),
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
    // Conversation length per kind. Courtship/excited get the most lines -
    // they're the dramatic moments players linger on. Argue/farewell stay short
    // so they feel sharp. Casual chat falls in the middle.
    let n_lines = match kind {
        "courtship" => rng.gen_range(6..=10),
        "excited"   => rng.gen_range(5..=8),
        "bonded"    => rng.gen_range(4..=7),
        "chat"      => rng.gen_range(3..=6),
        "argue"     => rng.gen_range(4..=6),
        "farewell"  => rng.gen_range(2..=3),
        _           => rng.gen_range(3..=5),
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
