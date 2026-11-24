# How tribes invent their own languages in a Rust civilization sim

[The Human Box](https://thehumanbox.com) is a civilization sim that runs in your browser. Stone Age people wander a small world, find food, pair up, form tribes, fight, and eventually build cities. The whole simulation is Rust compiled to WebAssembly, and the code is MIT-licensed on GitHub: [1homsi/thehumanbox](https://github.com/1homsi/thehumanbox).

One system people ask about is language. Tribes start with words nobody designed, and over generations, neighbouring tribes end up calling food, fire and home different things. There's no linguistics model behind it. It's a handful of small rules in one file, [`crates/sim-core/src/organism/vocabulary.rs`](https://github.com/1homsi/thehumanbox/blob/main/crates/sim-core/src/organism/vocabulary.rs), plus the places in the sim that call them. This post walks through those rules and the code.

## A fixed list of concepts, a word per concept

Every person carries a `Vocabulary`: one slot per concept in a fixed list called `CONCEPTS`. The list currently has 417 entries, starting with the basics and moving on to things like weather, feelings, kin terms and landforms:

```rust
pub const CONCEPTS: &[&str] = &[
    "food",
    "water",
    "fire",
    "danger",
    "friend",
    "foe",
    "shelter",
    // ... 417 in total
];
```

Concepts are shared by everyone. What differs between people is the word in each slot. A word is one or two consonant-vowel syllables, drawn from a small sound inventory:

```rust
const CONSONANTS: &[u8] = b"bdfghjklmnprstvwz";
const VOWELS: &[u8] = b"aeiou";

fn gen_syllable(rng: &mut impl Rng) -> String {
    let mut s = String::new();
    s.push(CONSONANTS[rng.random_range(0..CONSONANTS.len())] as char);
    s.push(VOWELS[rng.random_range(0..VOWELS.len())] as char);
    s
}

fn gen_word(rng: &mut impl Rng) -> String {
    let syllables = rng.random_range(1usize..=2);
    (0..syllables).map(|_| gen_syllable(rng)).collect()
}
```

That gives words like `ka`, `mibo` or `zute`. With 17 consonants and 5 vowels there are 85 one-syllable words and 7,225 two-syllable ones, so two founders rarely land on the same word for the same thing, though it does happen.

When the world spawns its first people, each one gets a fresh `Vocabulary::generate`, a random word for every concept. At that moment people mostly don't understand each other, apart from the odd chance match. Everything after that is about how words get copied, changed and forgotten.

## Inheritance with mutation

When a child is born, it copies its mother's vocabulary (`growth.rs` calls `Vocabulary::inherit_from`). Each word has a 3% chance of picking up a single sound change:

```rust
for i in 0..child.slots.len() {
    if child.slots[i].is_empty() {
        continue;
    }
    if rng.random::<f32>() < 0.03 {
        let bytes = child.text(i).as_bytes().to_vec();
        let pos = rng.random_range(0..bytes.len());
        let mut mutated = bytes;
        if pos % 2 == 0 {
            mutated[pos] = CONSONANTS[rng.random_range(0..CONSONANTS.len())];
        } else {
            mutated[pos] = VOWELS[rng.random_range(0..VOWELS.len())];
        }
        child.set(i, &String::from_utf8_lossy(&mutated));
    }
}
```

Because words are always consonant-vowel pairs, even positions are consonants and odd positions are vowels. A mutation swaps a consonant for a consonant or a vowel for a vowel, so `mibo` can become `migo` or `mubo`, but never something unpronounceable in the sim's sound system. Words keep their shape while they drift.

Across a few hundred concepts, 3% per word means a typical child is born speaking slightly differently from its mother. On its own that would make every family a dialect of one. What holds a tribe together is the next two rules.

## Borrowing: picking up one word at a time

Whenever two people interact in certain ways, the listener may borrow a word from the speaker. That's `absorb_from`:

```rust
pub fn absorb_from(&mut self, other: &Vocabulary, rng: &mut impl Rng) {
    let differing = (0..CONCEPTS.len())
        .filter(|&i| self.differs_from(other, i))
        .count();
    if differing == 0 {
        return;
    }
    if rng.random::<f32>() < 0.06 {
        let pick = rng.random_range(0..differing);
        let chosen = concept_order()
            .iter()
            .copied()
            .filter(|&i| self.differs_from(other, i))
            .nth(pick);
        if let Some(i) = chosen {
            self.ensure_capacity();
            self.set(i, other.text(i));
        }
    }
}
```

Six percent of the time, the listener takes over one of the words where the two of them disagree. It's slow on purpose. A single conversation barely changes anyone, but a person who hears the same neighbours every day ends up sounding like them.

`absorb_from` is called from a few places in the sim:

- **Food calls and alarms** (`social/signals.rs`). When someone signals food, everyone within 12 tiles hears it and may absorb a word. Alarms reach 14 tiles.
- **Gifts between tribes** (`social/knowledge.rs`). If a gift leaves the two sides on good enough terms, both absorb from each other.
- **Teaching**, where a student absorbs from the teacher.
- **One of the calming social actions** in the per-person act step, where everyone within 6 tiles absorbs from the speaker.

That's how loanwords happen. Two tribes that trade and gift pick up each other's words. Two tribes that only ever fight barely do.

## Convergence: the majority wins inside a group

Borrowing alone is too slow to keep a camp speaking one language. The stronger force is `converge_with`, which runs when people share what they know (food spots, water, danger) with the people around them:

```rust
for (i, &concept) in CONCEPTS.iter().enumerate() {
    if rng.random::<f32>() >= adopt_rate {
        continue;
    }
    let mut counts: HashMap<&str, usize> = HashMap::default();
    for snap in snapshots {
        if let Some(w) = snap.get(concept) {
            *counts.entry(w.as_str()).or_insert(0) += 1;
        }
    }
    let majority = counts
        .iter()
        .max_by(|a, b| a.1.cmp(b.1).then_with(|| b.0.cmp(a.0)))
        .map(|(&w, _)| w);
    if let Some(majority) = majority {
        if self.text(i) != majority {
            self.set(i, majority);
            self.touch(i, tick);
        }
    }
}
```

`social_knowledge_share` calls this with an `adopt_rate` of 0.40: for each concept, a 40% chance to switch to whatever word most of the group uses. The group here is people within 4 tiles who are kin, named friends, trusted, or from a tribe this person likes. Strangers and enemies aren't in it.

So inside a camp, words converge quickly. Between camps that don't trust each other, they don't. Add the mutations from births and you get the result the game is built around: each tribe settles on its own word for food, and the words drift further apart the longer the tribes stay apart.

One detail in that snippet: the tie-break. An earlier version used `max_by_key` on the `HashMap`, which resolves ties in iteration order. With randomly seeded hashing that meant the winning word could change from one run to the next with the same world seed. Breaking ties on the word itself fixed that. The sim needs to be deterministic for saves and replays, and this was one of the places it quietly wasn't.

## Forgetting

Words you never use fade. Every vocabulary keeps a `last_used` tick per concept, and `decay` clears any word not used for more than 5,000 ticks:

```rust
let last = self.last_used[i];
if last == 0 {
    // Never explicitly used. Start the forgetting clock now
    self.last_used[i] = tick;
    continue;
}
if tick.saturating_sub(last) > threshold_ticks {
    self.set(i, "");
}
```

Speaking, hearing a call, or adopting a word through convergence all touch the concept and reset its clock. The `last == 0` branch is a bug fix that's still visible in the comment: at first, "never used" was read as "last used at tick 0", so the moment a world passed tick 5,000 everyone forgot every word they hadn't personally said.

A forgotten slot matters later. Borrowing only swaps words where both people already have one, so a forgotten word comes back through convergence: the person picks up whatever word the group they share knowledge with uses. If that group includes friendly neighbours, it may not be their own tribe's old word.

## Food calls: where drift has consequences

Language would be pure decoration if understanding didn't matter. In `signal_food`, a person who knows where food is calls it out. Listeners compare the speaker's word for "food" with their own:

```rust
let recognizes =
    signal_word.is_some() && organisms[ni].vocabulary.known_word("food") == signal_word.as_deref();
// ...
let strength = if recognizes {
    base_strength
} else {
    base_strength * 0.3
};
```

If you share the word, the food location goes into your memory at full strength. If you don't, you get 30% of it. Kin also hear more strongly than strangers. Alarms work the same way, with separate strengths for kin or stranger and for recognised or not.

`known_word` exists because of another bug. The older `word_for` falls back to the English concept name when a slot is empty. So two people who had both forgotten "food" compared `"food" == "food"` and counted as understanding each other. `known_word` returns `None` for a forgotten word, and a forgotten word never matches.

The effect is that a tribe whose food word has drifted away from its neighbours' is worse at using their calls, and the other way round. Nothing in the code says "tribes should have separate languages". Separate languages fall out of births, borrowing, convergence and forgetting, and the food calls make the result matter.

## Seeing it in one family

The person panel in the game shows a person's words next to their parents' and grandparents' words for eight everyday concepts (`organism/family_words.rs`): food, water, fire, home, friend, sun, river and danger. That's usually the easiest place to spot a mutation that stuck.

Drift takes generations, so a fresh world takes a while to show anything. The optional head-start world merged this week (PR #1156) starts tribes from one shared proto-language and has each tribe reshape the words for the land it lives on: wetland tribes change "water" and "river", desert tribes change "fire" and "sun", and so on. It's off by default.

## Keeping 400 words per person cheap

Every living person, and the dead ones the sim still keeps, carries one of these vocabularies, so the layout matters. A word is stored inline in an 8-byte slot instead of a `String` per concept:

```rust
#[derive(Clone, Copy, Default)]
struct Word {
    len: u8,
    bytes: [u8; Word::INLINE], // INLINE = 7
}
```

Generated words are at most four letters, so they always fit. Anything longer (only possible from an old save) goes into a small side list. According to the comment on `Vocabulary`, this keeps a vocabulary near 5 KB where a `String` per slot took 14 KB. The JSON format didn't change: for human-readable serializers, custom `Serialize`/`Deserialize` impls still read and write the old `HashMap<String, String>` shape (binary serializers get a packed word string instead). A test runs the compact and old representations side by side to check they stay identical and draw the same random numbers.

## The perf work merged this week

Language is a small part of each tick. Most of the time goes to movement, sensing and spatial lookups. Three changes landed on main this week:

- **SIMD kernels** ([#1157](https://github.com/1homsi/thehumanbox/pull/1157)). Movement integration, distance checks and spatial-grid bucketing run four lanes at a time with SSE2, NEON and wasm `simd128`. The kernels match the scalar path bit for bit: no fused multiply-add, same rounding. The web build ships both a SIMD and a scalar wasm module, and the page loads the SIMD one only when `WebAssembly.validate` accepts it.
- **Column layout for hot fields** ([#1158](https://github.com/1homsi/thehumanbox/pull/1158)). Position, velocity, needs, alive and lineage now also live in parallel columns next to the `Vec<Organism>`, rebuilt each tick. The spatial grid, crowd separation and sensing read the columns. On the included benchmark with 4,000 people it went from 423.7 µs to 396.7 µs per pass, about 1.07x. Modest, but it's the groundwork for more.
- **Read-only passes on worker threads** ([#1159](https://github.com/1homsi/thehumanbox/pull/1159)). Sensing, route planning, border contacts and town assignment only read the world, so they now run on worker threads. Results are applied in index order, and every write, including draws from the world RNG, stays in the original order. In a 2,000-person test, a tick on 4 threads went from 21.75 ms to 19.98 ms. The web build stays single-threaded.

The rule all three follow is the same one the vocabulary tie-break follows: a seed has to produce the same world. #1158 was checked against save fingerprints from main for several seeds and tick counts, and #1159 against a save that is byte-identical at 1, 4 and 6 threads. If a speedup changes what happens in the world, it doesn't go in as a pure perf change.

## Try it

You can play it at [thehumanbox.com](https://thehumanbox.com). There's nothing to install or sign up for, and worlds save locally. Click a person to see their family's words. The code is at [github.com/1homsi/thehumanbox](https://github.com/1homsi/thehumanbox): the language system is `crates/sim-core/src/organism/vocabulary.rs`, and the calls that use it are in `crates/sim-core/src/sim/agents/social/`. Issues and PRs are welcome, and if you liked this, a star helps other people find it.
