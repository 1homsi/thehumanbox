# How tribes invent their own languages in a Rust civilization sim

I'm building [The Human Box](https://thehumanbox.com), a civ sim that runs in the browser. Stone Age people wander around, find food, pair up, form tribes, fight, and eventually build towns. The sim is all Rust compiled to wasm, and it's MIT on GitHub: [1homsi/thehumanbox](https://github.com/1homsi/thehumanbox).

The thing people ask about most is the languages. Tribes start with words nobody designed, and a few generations later the tribe next door has a different word for food, fire and home. I don't have a linguistics model. It's a handful of small rules in one file, [`crates/sim-core/src/organism/vocabulary.rs`](https://github.com/1homsi/thehumanbox/blob/main/crates/sim-core/src/organism/vocabulary.rs), plus the few places in the sim that call them. Here's how it works.

## One slot per concept

Every person carries a `Vocabulary`, which is one slot per concept from a fixed list called `CONCEPTS`. Right now the list has 417 entries. It starts with the basics and goes on to weather, feelings, kin terms, animals and landforms:

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

Everyone has the same concepts. What's different is the word sitting in each slot. A word is one or two consonant-vowel syllables from a tiny sound set:

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

So you get words like `ka`, `mibo` or `zute`. With 17 consonants and 5 vowels there are 85 one-syllable words and 7,225 two-syllable ones. Two founders landing on the same word for the same thing is rare, but it happens.

The first people in a world each get `Vocabulary::generate`, a random word for every concept. At that point they mostly can't understand each other, apart from the odd lucky match. Everything after that is just words getting copied, changed and forgotten.

## Kids copy their mother, with typos

When a child is born, `growth.rs` calls `Vocabulary::inherit_from` on the mother's vocabulary. Each word has a 3% chance of picking up one sound change:

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

Words are always consonant-vowel pairs, so even positions are consonants and odd positions are vowels. A mutation swaps a consonant for a consonant or a vowel for a vowel. `mibo` can turn into `migo` or `mubo`, but never into something the sim's sound system can't produce. The words drift but keep their shape.

At 3% per word over a few hundred concepts, pretty much every kid is born talking a little differently from their mom. If that were the only rule, every family would end up with its own dialect. The next two rules are what hold a tribe together.

## Borrowing, one word at a time

When two people interact in certain ways, the listener might borrow a word from the speaker. That's `absorb_from`:

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

6% of the time, the listener takes one of the words the two of them disagree on. That's slow on purpose. One conversation barely changes anyone, but if you hear the same neighbours every day you end up sounding like them.

The sim calls `absorb_from` in a few places:

- **Food calls and alarms** (`social/signals.rs`). Someone calls out food and everyone within 12 tiles hears it and might borrow a word. Alarms carry 14 tiles.
- **Gifts between tribes** (`social/knowledge.rs`). If a gift leaves both sides on good enough terms, each borrows from the other.
- **Teaching.** The student borrows from the teacher.
- **One of the calming social actions** in the per-person act step. Everyone within 6 tiles borrows from the speaker.

That's where loanwords come from. Tribes that trade and give gifts pick up each other's words, and tribes that only fight barely do.

## Inside a group, the majority wins

Borrowing on its own is way too slow to keep a camp speaking one language. The bigger force is `converge_with`. It runs when people share what they know (food spots, water, danger) with the people around them:

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

`social_knowledge_share` calls it with an `adopt_rate` of 0.40. So for each concept there's a 40% chance you switch to whatever word most of the group uses. "The group" is anyone within 4 tiles who's kin, a named friend, someone you trust, or from a tribe you like. Strangers and enemies don't count.

Inside a camp, words converge fast. Between camps that don't trust each other, they don't. Add the birth mutations on top and you get the result I was after: each tribe settles on its own word for food, and the words drift further apart the longer the tribes stay apart.

That tie-break in the snippet is there because of a bug. The first version used `max_by_key` on the `HashMap`, which breaks ties in iteration order. The hasher is randomly seeded, so the same world seed could pick a different winning word on a different run. Breaking ties on the word itself fixed it. The sim has to be deterministic for saves to work, and this was one of the places it quietly wasn't.

## Forgetting

Words you don't use fade. Every vocabulary keeps a `last_used` tick per concept, and `decay` clears any word that hasn't been used in more than 5,000 ticks:

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

Speaking, hearing a call, or picking up a word through convergence all reset the clock for that concept. The `last == 0` branch is another bug fix, and you can still see it in the comment. Originally "never used" got read as "last used at tick 0", so the moment a world passed tick 5,000, everyone forgot every word they'd never personally said.

A forgotten word matters later. Borrowing only swaps words when both people already have one, so a forgotten word comes back through convergence. You pick up whatever your group says. If that group includes friendly neighbours, you might not get your own tribe's old word back.

## Food calls are where it actually matters

If understanding each other didn't matter, the languages would just be decoration. In `signal_food`, someone who knows where food is calls it out, and each listener compares the speaker's word for "food" with their own:

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

If you share the word, the food location goes into your memory at full strength. If you don't, you get 30% of it. Kin also hear more strongly than strangers. Alarms work the same way, with separate strengths for kin vs. stranger and for recognised vs. not.

`known_word` exists because of a third bug. The older `word_for` falls back to the English concept name when a slot is empty. So two people who'd both forgotten "food" ended up comparing `"food" == "food"` and counted as understanding each other. `known_word` returns `None` for a forgotten word, and `None` never matches.

So a tribe whose food word drifted away from its neighbours' is worse at using their calls, and the other way round. Nowhere in the code does it say "tribes should have separate languages". It falls out of births, borrowing, convergence and forgetting, and the food calls are what make it matter.

## Watching it in one family

In the game, the person panel shows someone's words next to their parents' and grandparents' words for eight everyday concepts: food, water, fire, home, friend, sun, river and danger. That's in `organism/family_words.rs`. It's usually the easiest place to catch a mutation that stuck.

Drift takes generations, so a fresh world doesn't show much at first. On Nov 22 I merged an optional head-start world ([#1156](https://github.com/1homsi/thehumanbox/pull/1156)). It starts tribes from one shared proto-language, and each tribe reshapes the words for the land it lives on: wetland tribes change "water" and "river", desert tribes change "fire" and "sun", and so on. It's off by default, except that people who arrive from a Reddit link with no save start in it ([#1165](https://github.com/1homsi/thehumanbox/pull/1165)).

## Keeping ~400 words per person cheap

Every living person carries one of these, and so do the dead people the sim still keeps around, so the memory layout matters. Each word sits inline in an 8-byte slot instead of being a `String` per concept:

```rust
#[derive(Clone, Copy, Default)]
struct Word {
    len: u8,
    bytes: [u8; Word::INLINE], // INLINE = 7
}
```

Generated words are at most four letters, so they always fit. Anything longer, which only an old save can bring in, goes into a small side list. The doc comment on `Vocabulary` puts this at about 5 KB per vocabulary, down from 14 KB with a `String` per slot. The JSON format stayed the same: for human-readable serializers, custom `Serialize`/`Deserialize` impls still read and write the old `HashMap<String, String>` shape, and binary serializers get a packed word string instead. A test runs the compact type and the old one side by side to check they stay identical and draw the same random numbers.

## Recent perf work

Language is a small slice of each tick. Most of the time goes to movement, sensing and spatial lookups. Three changes landed on main on Nov 22:

- **SIMD kernels** ([#1157](https://github.com/1homsi/thehumanbox/pull/1157)). Movement, distance checks and spatial-grid bucketing run four lanes at a time on SSE2, NEON and wasm `simd128`. The kernels match the scalar path bit for bit: no fused multiply-add, same rounding. The web build ships a SIMD wasm module and a scalar one, and the page only loads the SIMD one if `WebAssembly.validate` accepts it.
- **Column layout for hot fields** ([#1158](https://github.com/1homsi/thehumanbox/pull/1158)). Position, velocity, needs, alive and lineage now also live in parallel columns next to the `Vec<Organism>`, rebuilt every tick. The spatial grid, crowd separation and sensing read from those columns. On the included 4,000-person benchmark that went from 423.7 µs to 396.7 µs per pass, about 1.07x. Not huge, but it's groundwork.
- **Read-only passes on worker threads** ([#1159](https://github.com/1homsi/thehumanbox/pull/1159)). Sensing, route planning, border contacts and town assignment only read the world, so they run on worker threads now. Results get applied in index order, and every write, including draws from the world RNG, stays in the original order. In a 2,000-person test, a tick on 4 threads went from 21.75 ms to 19.98 ms. The web build stays single-threaded.

All three follow the same rule as that vocabulary tie-break: a seed has to produce the same world. #1158 was checked against save fingerprints from main for several seeds and tick counts, and #1159 against a save that's byte-identical at 1, 4 and 6 threads. If a speedup changes what happens in the world, it can't go in as just a perf change. One later PR did: [#1160](https://github.com/1homsi/thehumanbox/pull/1160) steps calm regions less often, which changes how a given seed plays out, so it was held for a separate decision instead of going in as a plain speedup.

## Try it

You can play it at [thehumanbox.com](https://thehumanbox.com). Nothing to install, no account, and worlds save locally. Click a person to see their family's words. The code is at [github.com/1homsi/thehumanbox](https://github.com/1homsi/thehumanbox). The language system is `crates/sim-core/src/organism/vocabulary.rs`, and the calls that use it are in `crates/sim-core/src/sim/agents/social/`. Issues and PRs are welcome, and if you liked this, a star helps other people find it.

*I use AI-assisted coding tools on this project. They helped with parts of the code, and an AI assistant helped draft this write-up.*
