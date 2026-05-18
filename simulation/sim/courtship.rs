use rand::Rng;
use crate::organism::organism::{Organism, ConversationEntry};

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
        "eye"     => "the eye",
        "ear"     => "the ear",
        "hand"    => "the hand",
        "foot"    => "the foot",
        "mouth"   => "the mouth",
        "skin"    => "skin",
        "heart"   => "the heart",
        "voice"   => "a voice",
        "scent"   => "a scent",
        "birth"   => "a birth",
        "wedding" => "a wedding",
        "funeral" => "a funeral",
        "ancestor"=> "an ancestor",
        "twin"    => "a twin",
        "orphan"  => "an orphan",
        "widow"   => "a widow",
        "sibling" => "a sibling",
        "blood-kin" => "blood kin",
        "lineage" => "the bloodline",
        "wolf"    => "a wolf",
        "bird"    => "a bird",
        "deer"    => "a deer",
        "bear"    => "a bear",
        "snake"   => "a snake",
        "insect"  => "an insect",
        "beast"   => "a beast",
        "prey"    => "prey",
        "predator"=> "a predator",
        "flock"   => "a flock",
        "pack"    => "a pack",
        "swarm"   => "a swarm",
        "cliff"   => "a cliff",
        "ridge"   => "a ridge",
        "plain"   => "the plains",
        "marsh"   => "the marsh",
        "swamp"   => "the swamp",
        "oasis"   => "an oasis",
        "dune"    => "the dunes",
        "glacier" => "a glacier",
        "shore"   => "the shore",
        "island"  => "an island",
        "crater"  => "a crater",
        "gorge"   => "a gorge",
        "meadow"  => "a meadow",
        "grove"   => "a grove",
        "thicket" => "a thicket",
        "clearing"=> "a clearing",
        "valley"  => "the valley",
        "hill"    => "a hill",
        "spring"  => "a spring",
        "dawn"    => "dawn",
        "dusk"    => "dusk",
        "twilight"=> "twilight",
        "fog"     => "fog",
        "frost"   => "frost",
        "hail"    => "hail",
        "thunder" => "thunder",
        "lightning"=> "lightning",
        "rainbow" => "a rainbow",
        "drought" => "the drought",
        "flood"   => "the flood",
        "heat"    => "the heat",
        "eclipse" => "an eclipse",
        "clay"    => "clay",
        "mud"     => "mud",
        "hide"    => "a hide",
        "fur"     => "fur",
        "feather" => "a feather",
        "shell"   => "a shell",
        "salt"    => "salt",
        "charcoal"=> "charcoal",
        "ore"     => "ore",
        "metal"   => "metal",
        "gem"     => "a gem",
        "flint"   => "flint",
        "thread"  => "thread",
        "truth"   => "truth",
        "lie"     => "a lie",
        "secret"  => "a secret",
        "promise" => "a promise",
        "oath"    => "an oath",
        "law"     => "the law",
        "custom"  => "a custom",
        "tradition"=> "tradition",
        "memory"  => "a memory",
        "dream"   => "a dream",
        "idea"    => "an idea",
        "plan"    => "a plan",
        "choice"  => "a choice",
        "fate"    => "fate",
        "luck"    => "luck",
        "omen"    => "an omen",
        "sign"    => "a sign",
        "mystery" => "a mystery",
        "wisdom"  => "wisdom",
        "honor"   => "honor",
        "duty"    => "duty",
        "freedom" => "freedom",
        "power"   => "power",
        "change"  => "change",
        "beginning"=> "a beginning",
        "ending"  => "an ending",
        "journey" => "a journey",
        "return"  => "the return",
        "loss"    => "loss",
        "gain"    => "gain",
        "debt"    => "a debt",
        "balance" => "balance",
        "bless"   => "a blessing",
        "curse"   => "a curse",
        "forgive" => "forgiveness",
        "betray"  => "betrayal",
        "protect" => "protection",
        "abandon" => "abandonment",
        "rescue"  => "a rescue",
        "sacrifice"=> "sacrifice",
        "scatter" => "scattering",
        "destroy" => "destruction",
        "create"  => "creation",
        "mend"    => "mending",
        "sharpen" => "sharpening",
        "carve"   => "carving",
        "weave"   => "weaving",
        "guard"   => "guarding",
        "chase"   => "the chase",
        "flee"    => "fleeing",
        "attack"  => "an attack",
        "defend"  => "defence",
        "one"     => "one",
        "two"     => "two",
        "three"   => "three",
        "half"    => "half",
        "whole"   => "the whole",
        "none"    => "none",
        "all"     => "all",
        "more"    => "more",
        "less"    => "less",
        "enough"  => "enough",
        "empty"   => "empty",
        "full"    => "full",
        "red"     => "red",
        "blue"    => "blue",
        "green"   => "green",
        "yellow"  => "yellow",
        "white"   => "white",
        "black"   => "black",
        "brown"   => "brown",
        "grey"    => "grey",
        "flower"  => "a flower",
        "leaf"    => "a leaf",
        "seed"    => "a seed",
        "vine"    => "a vine",
        "moss"    => "moss",
        "fern"    => "a fern",
        "reed"    => "reeds",
        "bark"    => "bark",
        "branch"  => "a branch",
        "thorn"   => "a thorn",
        "fruit"   => "fruit",
        "nut"     => "a nut",
        "herb"    => "an herb",
        "sprout"  => "a sprout",
        "blossom" => "a blossom",
        "morning" => "morning",
        "noon"    => "noon",
        "evening" => "evening",
        "midnight"=> "midnight",
        "year"    => "a year",
        "moment"  => "a moment",
        "forever" => "forever",
        "soon"    => "soon",
        "early"   => "early",
        "late"    => "late",
        "north"   => "north",
        "south"   => "south",
        "east"    => "east",
        "west"    => "west",
        "up"      => "up",
        "down"    => "down",
        "forward" => "forward",
        "back"    => "back",
        "between" => "between",
        "above"   => "above",
        "below"   => "below",
        "inside"  => "inside",
        "outside" => "outside",
        "around"  => "around",
        "cry"     => "a cry",
        "shout"   => "a shout",
        "whisper" => "a whisper",
        "laugh"   => "laughter",
        "roar"    => "a roar",
        "howl"    => "a howl",
        "call"    => "a call",
        "echo"    => "an echo",
        "silence" => "silence",
        "noise"   => "noise",
        "growl"   => "a growl",
        "hum"     => "a hum",
        "worry"   => "worry",
        "relief"  => "relief",
        "longing" => "longing",
        "envy"    => "envy",
        "gratitude"=> "gratitude",
        "regret"  => "regret",
        "awe"     => "awe",
        "disgust" => "disgust",
        "surprise"=> "surprise",
        "sorrow"  => "sorrow",
        "delight" => "delight",
        "dread"   => "dread",
        "yearning"=> "yearning",
        "serenity"=> "serenity",
        "council" => "the council",
        "clan"    => "the clan",
        "family"  => "family",
        "band"    => "a band",
        "gathering"=> "a gathering",
        "market"  => "a market",
        "border"  => "the border",
        "neighbor"=> "a neighbour",
        "kinship" => "kinship",
        "guest"   => "a guest",
        "jump"    => "jumping",
        "crawl"   => "crawling",
        "crouch"  => "crouching",
        "reach"   => "reaching",
        "grab"    => "grabbing",
        "throw"   => "throwing",
        "push"    => "pushing",
        "pull"    => "pulling",
        "kick"    => "kicking",
        "bite"    => "biting",
        "sniff"   => "sniffing",
        "blink"   => "blinking",
        "nod"     => "a nod",
        "point"   => "pointing",
        "wave"    => "a wave",
        "kneel"   => "kneeling",
        "question"=> "a question",
        "answer"  => "an answer",
        "word"    => "a word",
        "language"=> "language",
        "speech"  => "speech",
        "skill"   => "skill",
        "craft"   => "a craft",
        "work"    => "work",
        "effort"  => "effort",
        "ease"    => "ease",
        "meaning" => "meaning",
        "purpose" => "purpose",
        "reason"  => "a reason",
        "cause"   => "a cause",
        "heavy"   => "heavy",
        "hard"    => "hard",
        "soft"    => "soft",
        "sharp"   => "sharp",
        "dull"    => "dull",
        "smooth"  => "smooth",
        "rough"   => "rough",
        "wet"     => "wet",
        "dry"     => "dry",
        "hot"     => "hot",
        "fast"    => "fast",
        "slow"    => "slow",
        "loud"    => "loud",
        "quiet"   => "quiet",
        "bright"  => "bright",
        "deep"    => "deep",
        "shallow" => "shallow",
        "high"    => "high",
        "low"     => "low",
        "wide"    => "wide",
        _         => "something",
    }
}

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

fn utterance_with_meaning(
    speaker: &Organism,
    listener: &Organism,
    mood: u8,
    rng: &mut impl Rng,
) -> (String, String) {
    let v  = &speaker.vocabulary.words;
    let lv = &listener.vocabulary.words;

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
        0 => {
            if rng.gen::<f32>() < 0.55 {
                (listener.name.clone(), format!("greeting {}", listener.name))
            } else {
                let (c, w) = pick_concept_and_word(v, &["friend", "home", "day"], rng);
                (format!("{} {}", listener.name, w),
                 format!("greeting {} ({})", listener.name, concept_gloss(c)))
            }
        }

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

        2 => {
            let (c1, w1) = pick_concept_and_word(v, &["food", "hunt", "day", "water"], rng);
            let (c2, w2) = pick_concept_and_word(v, &["home", "shelter", "group"], rng);
            (format!("{} {}", w1, w2), two("asking about", c1, c2))
        }

        3 => {
            let (c, w) = pick_concept_and_word(v, &["shelter", "home", "friend", "group"], rng);
            if rng.gen::<f32>() < 0.4 {
                (format!("{} {}", listener.name, w),
                 format!("reassuring {} ({})", listener.name, concept_gloss(c)))
            } else {
                (w.to_string(), one("reassuring", c))
            }
        }

        4 => {
            let (c, w) = pick_concept_and_word(v, &["alone", "night", "home"], rng);
            (format!("{} {}", listener.name, w),
             format!("farewell to {} ({})", listener.name, concept_gloss(c)))
        }

        5 => {
            let (c, w) = pick_concept_and_word(v,
                &["food", "hunt", "water", "day", "fire", "shelter"], rng);
            (w.to_string(), one("talking about", c))
        }

        6 => {
            let (c, w) = pick_concept_and_word(v, &["friend", "group", "day", "night"], rng);
            (w.to_string(), one("catching up", c))
        }

        7 => {
            let (c1, w1) = pick_concept_and_word(v, &["danger", "fire", "hunt", "alone"], rng);
            let (c2, w2) = pick_concept_and_word(v, &["home", "shelter", "water"], rng);
            (format!("{} {}", w1, w2), two("arguing about", c1, c2))
        }

        8 => {
            let (c1, w1) = pick_concept_and_word(v, &["fire", "food", "day", "hunt"], rng);
            let (c2, w2) = pick_concept_and_word(v, &["friend", "group", "shelter"], rng);
            (format!("{} {}", w1, w2), two("excited about", c1, c2))
        }

        _ => ("~".to_string(), String::new()),
    }
}

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

pub fn generate_conversation(
    a: &Organism,
    b: &Organism,
    tick: u64,
    kind: &str,
    rng: &mut impl Rng,
) -> (ConversationEntry, ConversationEntry) {
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
