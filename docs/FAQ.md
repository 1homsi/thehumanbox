# FAQ

Short answers to questions people ask about the world, checked against the simulation code
(`crates/sim-core`). Where the code doesn't do something, the answer says so.

## The language

### What is a "word" in The Human Box?

Every person carries a vocabulary: one made-up word, a syllable or two, for each of **417 concepts**
(`CONCEPTS` in `crates/sim-core/src/organism/vocabulary.rs`). The concepts cover:

- everyday things: food, water, fire, danger, shelter, tree, river, stone;
- people and kinship: mother, child, elder, stranger, tribe, ally;
- actions: hunt, build, trade, carry, flee, teach;
- qualities and quantities: big, far, wet, one, many, half;
- feelings and abstract ideas: grief, hope, truth, promise, law, memory, freedom, cause, meaning.

The first people in a world each get words made up at random.

### How do words change over time?

- **Children** start with a copy of their mother's words. Each word has a 3% chance of one sound
  changing on the way, so words drift a little every generation.
- **Talking** spreads words. When two people share knowledge, or one person hears another's call,
  each has a chance to take one word that differs from the speaker's.
- **Groups** settle on shared words. People who spend time together sometimes swap their own word for
  the one most of the group uses.
- **Unused words are forgotten.** A word a person hasn't used for 5,000 ticks is dropped. They can
  pick it up again later when their group settles on shared words. Until then, a call for that thing is
  one nobody recognises.

Together this means tribes that live apart drift into different languages, and tribes that meet and
trade come to share words.

### Are words used for anything, or are they just labels?

Some are used directly; most are not.

- **Used directly:** the calls people make. When someone finds food, or sees danger or fire, they call
  out their word for it, and everyone nearby remembers the place. How strongly depends on whether the
  listener's word for that thing matches the speaker's (`crates/sim-core/src/sim/agents/social/signals.rs`):
  - **Food:** a listener with a different word keeps 30% of the memory a matching word would give.
  - **Danger and fire:** strength depends on kinship as well as the word. Kin who share the word take in
    0.70, kin with a different word 0.35, outsiders who share the word 0.30, and outsiders with a different
    word 0.08.

  So two tribes with different words really do help and warn each other less well.
- **Not used directly:** the other concepts don't change what anyone does. Those words drift, spread
  and get forgotten, and you can read them in a person's panel, but nobody acts differently because of
  their word for "honor".

### Is there grammar?

**No.** There are no sentences, no word order, no tense and no grammar rules. A call is a single word.
The language is a lexicon (a word for each concept) that changes as it's inherited and spoken.

### Do they develop words for abstract ideas, or only practical ones?

Both exist from the start: the 417 concepts include abstract ones like truth, law, promise, memory,
fate, freedom, purpose and cause. People don't invent new concepts beyond the 417. What changes is the
*words* for them, not which ideas exist. As the answer above says, only a few practical words (food,
danger, fire) change what people do.

## Tribes, states and wars

### Do tribes settle into states?

Partly. Each tribe (a lineage):

- claims territory on the map;
- grows its settlement through six tiers: wilderness, camp, hamlet, village, town, city;
- takes a form of government that changes as its era, size and literacy allow: tribal, chiefdom,
  monarchy, empire, republic, democracy, then federation. (The code also names theocracy and corporate
  rule, but nothing in a running world chooses them yet.);
- enacts laws and collects taxes once it has a law for them.

Tribes sign treaties with each other: non-aggression, alliance, trade, defensive pacts, and vassalage,
where one tribe is subject to another. There is no larger "state" made of several tribes beyond what
those treaties describe.

### Do they have wars?

Yes. Tribes fight at five scales:

- skirmish;
- raid;
- siege;
- battle;
- war.

The weapons change by era, from brawling and spears to swords, pikes, muskets, rifles and modern arms.
Battles have attackers, defenders, a place and an outcome, and armies march. Tribes can build field
fortifications (`crates/sim-core/src/sim/civ/society/warfare/`). Every death in battle makes a tribe
wearier of war; a weary tribe often calls off a raid, and two weary tribes that have fought make peace
(`crates/sim-core/src/sim/civ/society/war_weariness.rs`).
