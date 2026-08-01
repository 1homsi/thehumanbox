use super::organism::Organism;
use rand::{Rng, RngExt};
use std::collections::HashSet;

// ─────────────────────────────────────────────────────────────────────────────
// INHERITABLE SETS
// Only birth attributes (physical / innate personality) pass to children.
// Earned, circumstantial, and sad/tragic traits are never inherited.
// ─────────────────────────────────────────────────────────────────────────────

pub const INHERITABLE_PHYSICAL: &[&str] = &[
    "handsome",
    "beautiful",
    "tall",
    "short-statured",
    "stocky",
    "lithe",
    "wiry",
    "broad-shouldered",
    "long-limbed",
    "pale",
    "sun-dark",
    "ruddy",
    "freckled",
    "fair-haired",
    "dark-haired",
    "auburn-haired",
    "curly-haired",
    "raven-haired",
    "silver-streaked",
    "amber-eyed",
    "pale-eyed",
    "keen-eyed",
    "sharp-eared",
    "keen-nosed",
    "deep-voiced",
    "soft-spoken",
    "high-voiced",
    "left-handed",
    "nimble",
    "swift",
    "strong",
    "sturdy",
    "graceful",
    "marked",
    "hollow-cheeked",
    "broad-browed",
    "sharp-featured",
    "heavy-set",
    "lean",
    "sun-kissed",
];

pub const INHERITABLE_PERSONALITY: &[&str] = &[
    "curious",
    "bold",
    "cautious",
    "patient",
    "restless",
    "stubborn",
    "gentle",
    "fierce",
    "serene",
    "anxious",
    "cheerful",
    "brooding",
    "intuitive",
    "methodical",
    "dreamful",
    "watchful",
    "talkative",
    "shy",
    "headstrong",
    "tender",
    "brave",
    "resilient",
    "quick-witted",
    "wandering-heart",
    "delicate",
    "iron-willed",
    "warm-hearted",
    "cold-hearted",
    "fiery",
    "even-tempered",
    "mercurial",
    "night-walker",
    "secretive",
    "open-hearted",
    "suspicious",
];

// ─────────────────────────────────────────────────────────────────────────────
// BIRTH ATTRIBUTES
// ─────────────────────────────────────────────────────────────────────────────

pub const BIRTH_ATTRS_COMMON: &[(&str, f32)] = &[
    // ── physical appearance ──────────────────────────────────
    ("handsome", 0.14),
    ("beautiful", 0.14),
    ("tall", 0.20),
    ("short-statured", 0.12),
    ("stocky", 0.15),
    ("lithe", 0.15),
    ("wiry", 0.13),
    ("strong", 0.16),
    ("sturdy", 0.14),
    ("graceful", 0.12),
    ("lean", 0.15),
    ("heavy-set", 0.10),
    ("broad-shouldered", 0.14),
    ("long-limbed", 0.12),
    ("hollow-cheeked", 0.10),
    ("broad-browed", 0.11),
    ("sharp-featured", 0.10),
    ("marked", 0.05), // rare - distinctive birthmark or feature
    ("pale", 0.10),
    ("sun-dark", 0.12),
    ("ruddy", 0.12),
    ("freckled", 0.15),
    ("sun-kissed", 0.12),
    ("fair-haired", 0.14),
    ("dark-haired", 0.18),
    ("auburn-haired", 0.08),
    ("curly-haired", 0.12),
    ("raven-haired", 0.07),
    ("silver-streaked", 0.04), // born with grey streaks - rare
    ("amber-eyed", 0.08),
    ("pale-eyed", 0.07),
    ("keen-eyed", 0.16),
    ("sharp-eared", 0.12),
    ("keen-nosed", 0.10),
    ("deep-voiced", 0.12),
    ("high-voiced", 0.10),
    ("soft-spoken", 0.10),
    ("left-handed", 0.10),
    ("swift", 0.15),
    ("nimble", 0.14),
    // ── innate personality (unconditional) ───────────────────
    ("dreamful", 0.12),
    ("intuitive", 0.15),
    ("methodical", 0.13),
    ("stubborn", 0.16),
    ("cheerful", 0.14),
    ("brooding", 0.10),
    ("tender", 0.13),
    ("headstrong", 0.14),
    ("secretive", 0.10),
    ("open-hearted", 0.12),
    ("suspicious", 0.11),
    ("warm-hearted", 0.13),
    ("cold-hearted", 0.07),
    ("fiery", 0.11),
    ("even-tempered", 0.12),
    ("mercurial", 0.09),
    ("watchful", 0.13),
    ("night-walker", 0.08),
    ("frost-born", 0.06),
    ("twin-born", 0.03), // very rare
];

// Assign birth attributes. Called once on creation (in growth.rs).
pub fn assign_birth_attributes(org: &mut Organism, rng: &mut impl Rng) {
    for &(attr, prob) in BIRTH_ATTRS_COMMON {
        // sex-specific exclusions
        if attr == "handsome" && org.sex == super::organism::Sex::Female {
            continue;
        }
        if attr == "beautiful" && org.sex == super::organism::Sex::Male {
            continue;
        }
        if attr == "deep-voiced" && org.sex == super::organism::Sex::Female {
            continue;
        }
        if attr == "high-voiced" && org.sex == super::organism::Sex::Male {
            continue;
        }
        if rng.random::<f32>() < prob {
            org.attributes.insert(attr.to_string());
        }
    }

    // Trait-gated
    if org.traits.curiosity > 0.62 && rng.random::<f32>() < 0.70 {
        org.attributes.insert("curious".into());
    }
    if org.traits.curiosity > 0.75 && rng.random::<f32>() < 0.55 {
        org.attributes.insert("quick-witted".into());
    }
    if org.traits.aggression > 0.65 && rng.random::<f32>() < 0.65 {
        org.attributes.insert("bold".into());
    }
    if org.traits.aggression > 0.78 && rng.random::<f32>() < 0.50 {
        org.attributes.insert("fierce".into());
    }
    if org.traits.aggression < 0.30 && rng.random::<f32>() < 0.60 {
        org.attributes.insert("gentle".into());
    }
    if org.traits.fear > 0.65 && rng.random::<f32>() < 0.55 {
        org.attributes.insert("cautious".into());
    }
    if org.traits.fear > 0.80 && rng.random::<f32>() < 0.40 {
        org.attributes.insert("anxious".into());
    }
    if org.traits.fear < 0.28 && rng.random::<f32>() < 0.60 {
        org.attributes.insert("brave".into());
    }
    if org.traits.social_tendency > 0.68 && rng.random::<f32>() < 0.60 {
        org.attributes.insert("talkative".into());
    }
    if org.traits.social_tendency < 0.28 && rng.random::<f32>() < 0.55 {
        org.attributes.insert("shy".into());
    }
    if org.traits.resilience > 0.72 && rng.random::<f32>() < 0.55 {
        org.attributes.insert("resilient".into());
    }
    if org.traits.resilience > 0.82 && rng.random::<f32>() < 0.45 {
        org.attributes.insert("iron-willed".into());
    }
    if org.traits.memory_strength > 0.72 && rng.random::<f32>() < 0.50 {
        org.attributes.insert("patient".into());
    }
    if org.traits.curiosity > 0.70 && org.traits.social_tendency < 0.35 && rng.random::<f32>() < 0.45 {
        org.attributes.insert("wandering-heart".into());
    }
    if org.traits.resilience < 0.30 && rng.random::<f32>() < 0.45 {
        org.attributes.insert("delicate".into());
    }
    if org.traits.aggression < 0.25 && org.traits.social_tendency > 0.60 && rng.random::<f32>() < 0.45 {
        org.attributes.insert("serene".into());
    }
    if org.traits.aggression > 0.60 && org.traits.fear < 0.35 && rng.random::<f32>() < 0.40 {
        org.attributes.insert("restless".into());
    }
    if org.traits.aggression > 0.55 && org.traits.social_tendency > 0.55 && rng.random::<f32>() < 0.35 {
        org.attributes.insert("fiery".into());
    }
    if org.traits.fear < 0.20 && org.traits.aggression > 0.70 && rng.random::<f32>() < 0.40 {
        org.attributes.insert("reckless".into());
    }
    if org.traits.memory_strength > 0.80 && org.traits.curiosity > 0.65 && rng.random::<f32>() < 0.40 {
        org.attributes.insert("deep-minded".into());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// INHERITANCE
// Called after assign_birth_attributes() when a child has known parents.
// Physical traits: inherit if parent has it (30% one parent, 55% both).
// Personality traits: inherit if parent has it (20% one parent, 40% both).
// ─────────────────────────────────────────────────────────────────────────────

pub fn inherit_attributes_from_parents(
    child: &mut Organism,
    mother_attrs: &HashSet<String>,
    father_attrs: &HashSet<String>,
    rng: &mut impl Rng,
) {
    for attr in INHERITABLE_PHYSICAL {
        let from_mother = mother_attrs.contains(*attr);
        let from_father = father_attrs.contains(*attr);
        let prob = match (from_mother, from_father) {
            (true, true) => 0.55,
            (true, false) | (false, true) => 0.28,
            (false, false) => 0.0,
        };
        if prob > 0.0 && rng.random::<f32>() < prob {
            child.attributes.insert(attr.to_string());
        }
    }

    for attr in INHERITABLE_PERSONALITY {
        let from_mother = mother_attrs.contains(*attr);
        let from_father = father_attrs.contains(*attr);
        let prob = match (from_mother, from_father) {
            (true, true) => 0.40,
            (true, false) | (false, true) => 0.18,
            (false, false) => 0.0,
        };
        if prob > 0.0 && rng.random::<f32>() < prob {
            child.attributes.insert(attr.to_string());
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EARNED ATTRIBUTES
// Checked every ~2000 ticks per organism.
// ─────────────────────────────────────────────────────────────────────────────

pub fn check_earned_attributes(org: &mut Organism) -> bool {
    let disc = &org.discoveries;
    let attrs = &mut org.attributes;
    let prev = attrs.len();

    // ── Knowledge / learning ───────────────────────────────
    let disc_count = disc.len();
    if disc_count >= 1 {
        attrs.insert("learned".into());
    }
    if disc_count >= 5 {
        attrs.insert("scholar".into());
    }
    if disc_count >= 10 {
        attrs.insert("wise".into());
    }
    if disc_count >= 18 {
        attrs.insert("polymath".into());
    }
    if disc_count >= 25 {
        attrs.insert("sage".into());
    }
    if disc_count >= 35 {
        attrs.insert("oracle".into());
    }
    if disc.contains("writing") || disc.contains("symbols") || disc.contains("develop_symbol") {
        attrs.insert("literate".into());
    }
    if disc.contains("counting") || disc.contains("mathematics") {
        attrs.insert("numerate".into());
    }
    if disc.contains("medicine") || disc.contains("herbalism") {
        attrs.insert("herbalist".into());
    }
    if disc.contains("astronomy") || disc.contains("stargazing") {
        attrs.insert("astronomer".into());
    }
    if disc.contains("philosophy") || disc.contains("meaning") {
        attrs.insert("philosopher".into());
    }

    // ── Hunting / combat ───────────────────────────────────
    if disc.contains("trapping-game") || disc.contains("hunting") {
        attrs.insert("hunter".into());
    }
    if disc.contains("bow") {
        attrs.insert("archer".into());
    }
    if disc.contains("spear") {
        attrs.insert("spearman".into());
    }
    if disc.contains("spear") && disc.contains("bow") {
        attrs.insert("marksman".into());
    }
    if disc.contains("trap") {
        attrs.insert("trapper".into());
    }
    if disc.contains("warfare") || disc.contains("war_doctrine") {
        attrs.insert("warlord".into());
    }

    // ── Building / crafting ───────────────────────────────
    if disc.contains("fire-making") || disc.contains("fire") {
        attrs.insert("fire-keeper".into());
    }
    if disc.contains("toolmaking") || disc.contains("stone_tools") {
        attrs.insert("toolmaker".into());
    }
    if disc.contains("axe") {
        attrs.insert("woodcutter".into());
    }
    if disc.contains("woodcutting") && disc.contains("build_hut") {
        attrs.insert("carpenter".into());
    }
    if disc.contains("build_hut") || disc.contains("construction") {
        attrs.insert("builder".into());
    }
    if disc.contains("masonry") {
        attrs.insert("mason".into());
    }
    if disc.contains("weaving") || disc.contains("basket") {
        attrs.insert("weaver".into());
    }
    if disc.contains("metalworking") || disc.contains("smelting") {
        attrs.insert("smith".into());
    }
    if disc.contains("pottery") || disc.contains("clay") {
        attrs.insert("potter".into());
    }
    if disc.contains("carving") {
        attrs.insert("carver".into());
    }
    if disc.contains("alchemy") || (disc.contains("medicine") && disc.contains("fire-making")) {
        attrs.insert("alchemist".into());
    }
    if disc.contains("glassblowing") || disc.contains("glass") {
        attrs.insert("glassblower".into());
    }
    if disc.contains("leatherworking") || disc.contains("tanning") {
        attrs.insert("tanner".into());
    }

    // ── Agriculture / food ────────────────────────────────
    if disc.contains("farming") || disc.contains("agriculture") || disc.contains("horticulture") {
        attrs.insert("farmer".into());
    }
    if disc.contains("crop_rotation") {
        attrs.insert("cultivator".into());
    }
    if disc.contains("irrigation") {
        attrs.insert("irrigator".into());
    }
    if disc.contains("composting") {
        attrs.insert("composter".into());
    }
    if disc.contains("foraging") || disc.contains("gathering") {
        attrs.insert("forager".into());
    }
    if disc.contains("cooking") {
        attrs.insert("cook".into());
    }
    if disc.contains("brewing") || disc.contains("fermentation") {
        attrs.insert("brewer".into());
    }
    if disc.contains("fishing") {
        attrs.insert("fisher".into());
    }
    if disc.contains("beekeeping") || disc.contains("honey") {
        attrs.insert("beekeeper".into());
    }

    // ── Territory / exploration ───────────────────────────
    if disc.contains("quarrying") {
        attrs.insert("quarrier".into());
    }
    if disc.contains("borders") || disc.contains("establish_borders") {
        attrs.insert("border-lord".into());
    }
    if disc.contains("territory") || disc.contains("claim_land") {
        attrs.insert("frontiersman".into());
    }
    if disc.contains("navigation") || disc.contains("cartography") {
        attrs.insert("navigator".into());
    }
    if disc.contains("sailing") || disc.contains("seafaring") {
        attrs.insert("seafarer".into());
    }
    if disc.contains("mining") {
        attrs.insert("miner".into());
    }

    // ── Social / leadership ───────────────────────────────
    if disc.contains("storytelling") || disc.contains("oral_history") {
        attrs.insert("storyteller".into());
    }
    if disc.contains("song") || disc.contains("singing") {
        attrs.insert("singer".into());
    }
    if disc.contains("dance") || disc.contains("dancing") {
        attrs.insert("dancer".into());
    }
    if disc.contains("trade") || disc.contains("trading") {
        attrs.insert("trader".into());
    }
    if disc.contains("diplomacy") || disc.contains("treaty") {
        attrs.insert("diplomat".into());
    }
    if disc.contains("leadership") || disc.contains("governance") {
        attrs.insert("leader".into());
    }
    if disc.contains("law") || disc.contains("lawmaking") {
        attrs.insert("lawgiver".into());
    }
    if disc.contains("ritual") || disc.contains("ceremony") {
        attrs.insert("shaman".into());
    }
    if disc.contains("teaching") {
        attrs.insert("teacher".into());
    }
    if disc.contains("midwifery") || disc.contains("healing") {
        attrs.insert("healer".into());
    }

    // ── Life milestones ───────────────────────────────────
    if org.is_elder {
        attrs.insert("elder".into());
    }
    if org.age > 1800 {
        attrs.insert("long-lived".into());
    }
    if org.age > 3600 {
        attrs.insert("ancient".into());
    }
    if org.age > 6000 {
        attrs.insert("timeless".into());
    }
    if org.children_count >= 1 {
        let l = if org.sex == super::organism::Sex::Female {
            "mother"
        } else {
            "father"
        };
        attrs.insert(l.into());
    }
    if org.children_count >= 3 {
        let l = if org.sex == super::organism::Sex::Female {
            "mother-of-many"
        } else {
            "father-of-many"
        };
        attrs.insert(l.into());
    }
    if org.children_count >= 5 {
        let l = if org.sex == super::organism::Sex::Female {
            "matriarch"
        } else {
            "patriarch"
        };
        attrs.insert(l.into());
    }
    if org.children_count >= 8 {
        let l = if org.sex == super::organism::Sex::Female {
            "great-mother"
        } else {
            "great-father"
        };
        attrs.insert(l.into());
    }
    if org.generation == 0 {
        attrs.insert("founder".into());
    }
    if org.partner_id.is_some() {
        attrs.insert("bonded".into());
    }
    if !org.friends.is_empty() {
        attrs.insert("beloved".into());
    }
    if org.friends.len() >= 4 {
        attrs.insert("friend-to-all".into());
    }
    if org.friends.len() >= 7 {
        attrs.insert("heart-of-the-tribe".into());
    }
    // Held a partner but they're gone now - widowed
    if org.partner_id.is_none()
        && org
            .life_log
            .iter()
            .any(|e| e.category == "partnership" || e.text.contains("partner"))
        && org.age > 600
    {
        attrs.insert("widowed".into());
    }

    // ── Survival / hardship (dynamic - can appear and leave) ─
    // Grief
    if org.grief_ticks > 0 {
        attrs.insert("grieving".into());
    } else if attrs.contains("grieving") && org.age > 300 {
        attrs.remove("grieving");
        attrs.insert("grief-hardened".into());
    }
    // Wounds
    if org.health < 0.25 {
        attrs.insert("wounded".into());
    } else {
        attrs.remove("wounded");
    }
    // Recovered from critical health
    if org.health > 0.7 && attrs.contains("bloodied") {
        attrs.remove("bloodied");
        attrs.insert("twice-born".into());
    }
    if org.health < 0.18 {
        attrs.insert("bloodied".into());
    }
    // Disease
    if org.infection > 0.4 {
        attrs.insert("plague-stricken".into());
    } else if org.infection < 0.05 && attrs.contains("plague-stricken") {
        attrs.remove("plague-stricken");
        attrs.insert("plague-survivor".into());
    }
    // Sleep
    if org.sleep_debt > 0.6 {
        attrs.insert("exhausted".into());
    } else {
        attrs.remove("exhausted");
    }
    // Loneliness
    if org.loneliness > 0.8 {
        attrs.insert("lone-wolf".into());
    }
    if org.loneliness > 0.92 && org.friends.is_empty() && org.partner_id.is_none() {
        attrs.insert("forsaken".into());
    }
    // Fear / trauma
    if org.fear_level > 0.7 {
        attrs.insert("battle-worn".into());
    }
    if org.fear_level > 0.88 {
        attrs.insert("haunted".into());
    }
    // Combined tragic state
    if org.loneliness > 0.75 && org.grief_ticks > 0 && org.health < 0.45 {
        attrs.insert("desolate".into());
    } else if !attrs.contains("desolate") || org.loneliness < 0.50 {
        attrs.remove("desolate");
    }
    // Starvation mark
    if org.energy < 0.12 {
        attrs.insert("starving".into());
    } else {
        attrs.remove("starving");
    }
    if org.energy < 0.08 && org.hydration < 0.12 {
        attrs.insert("wasting".into());
    } else {
        attrs.remove("wasting");
    }
    // Old-age decay
    if org.is_elder && org.health < 0.35 && org.sleep_debt > 0.4 {
        attrs.insert("withered".into());
    }
    // Orphaned: logged as child, parent died while young
    if !org.parent_id.is_empty()
        && org
            .life_log
            .iter()
            .any(|e| e.category == "loss" || e.text.contains("lost kin"))
        && org.age < 2000
        && !attrs.contains("grief-hardened")
    {
        attrs.insert("orphaned".into());
    }
    // Shattered: grief + wounded + alone simultaneously
    if org.grief_ticks > 200 && org.loneliness > 0.70 && org.health < 0.40 {
        attrs.insert("shattered".into());
    } else if attrs.contains("shattered") && org.grief_ticks == 0 && org.health > 0.55 {
        attrs.remove("shattered");
        attrs.insert("mended".into());
    }
    // Hollow: had a partner who is now gone (different from widowed - more raw)
    if org.partner_id.is_none()
        && org
            .life_log
            .iter()
            .any(|e| e.text.contains("partner") || e.category == "partnership")
        && org.grief_ticks > 100
    {
        attrs.insert("hollow".into());
    }
    // Bitter: many hostile attitudes + high aggression drift
    let hostile_count = org.lineage_attitudes.values().filter(|&&v| v < -0.35).count();
    if hostile_count >= 3 {
        attrs.insert("bitter".into());
    }
    // Bloodthirsty
    if hostile_count >= 5 && org.traits.aggression > 0.70 {
        attrs.insert("bloodthirsty".into());
    }
    // Iron grief - had grief but fully recovered, now calloused
    if attrs.contains("grief-hardened") && org.grief_ticks == 0 && org.health > 0.70 {
        attrs.insert("iron-grief".into());
    }
    // Cursed - multiple tragedy markers at once
    let tragedy_count = [
        "desolate",
        "shattered",
        "hollow",
        "forsaken",
        "bloodied",
        "plague-stricken",
    ]
    .iter()
    .filter(|&&t| attrs.contains(t))
    .count();
    if tragedy_count >= 3 {
        attrs.insert("cursed".into());
    }
    // Memory count - lore-keeper potential
    let total_mem = org.food_memory.len() + org.water_memory.len() + org.danger_memory.len();
    if total_mem >= 60 {
        attrs.insert("memory-keeper".into());
    }
    // High trust network
    let trusted_by = org.org_trust.values().filter(|&&v| v >= 0.50).count();
    if trusted_by >= 5 {
        attrs.insert("trusted".into());
    }
    if trusted_by >= 10 {
        attrs.insert("silver-tongued".into());
    }
    // Positive attitudes - friend-of-many-tribes
    let ally_count = org.lineage_attitudes.values().filter(|&&v| v >= 0.30).count();
    if ally_count >= 3 {
        attrs.insert("bridge-builder".into());
    }
    // High danger memory - seen a lot of death and violence
    if org.danger_memory.len() >= 15 {
        attrs.insert("war-scarred".into());
    }
    if org.danger_memory.len() >= 25 {
        attrs.insert("blood-touched".into());
    }

    // ── Specialisation combos ─────────────────────────────
    if attrs.contains("builder") && attrs.contains("mason") && attrs.contains("carpenter") {
        attrs.insert("architect".into());
    }
    if attrs.contains("hunter") && attrs.contains("trapper") && attrs.contains("archer") {
        attrs.insert("tracker".into());
    }
    if attrs.contains("farmer") && attrs.contains("cultivator") && attrs.contains("irrigator") {
        attrs.insert("master-farmer".into());
    }
    if attrs.contains("wise") && attrs.contains("storyteller") && org.is_elder {
        attrs.insert("keeper-of-lore".into());
    }
    if disc_count >= 10 && attrs.contains("builder") && attrs.contains("farmer") {
        attrs.insert("civilizer".into());
    }
    if attrs.contains("smith") && attrs.contains("toolmaker") {
        attrs.insert("craftmaster".into());
    }
    if attrs.contains("diplomat") && attrs.contains("trader") {
        attrs.insert("peacemaker".into());
    }
    if attrs.contains("leader") && org.is_elder && org.children_count >= 2 {
        attrs.insert("chief".into());
    }
    if attrs.contains("healer") && attrs.contains("herbalist") && attrs.contains("alchemist") {
        attrs.insert("medicine-woman".into());
    }
    if attrs.contains("shaman") && attrs.contains("sage") {
        attrs.insert("high-priest".into());
    }
    if attrs.contains("singer") && attrs.contains("storyteller") && attrs.contains("dancer") {
        attrs.insert("bard".into());
    }
    if attrs.contains("keeper-of-lore") && attrs.contains("philosopher") {
        attrs.insert("elder-of-ages".into());
    }

    attrs.len() != prev
}
