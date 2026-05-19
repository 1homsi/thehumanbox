use std::collections::HashSet;
use rand::Rng;
use super::organism::Organism;

// ── Birth attributes ────────────────────────────────────────────────────────
// Each entry is (name, base_probability). Trait-gated ones are checked below.

pub const BIRTH_ATTRS_COMMON: &[(&str, f32)] = &[
    // physical appearance
    ("handsome",       0.14),
    ("beautiful",      0.14),
    ("tall",           0.20),
    ("short-statured", 0.12),
    ("stocky",         0.15),
    ("lithe",          0.15),
    ("wiry",           0.13),
    ("broad-shouldered", 0.14),
    ("long-limbed",    0.12),
    ("pale",           0.10),
    ("sun-dark",       0.12),
    ("ruddy",          0.12),
    ("freckled",       0.15),
    ("fair-haired",    0.14),
    ("dark-haired",    0.18),
    ("auburn-haired",  0.08),
    ("curly-haired",   0.12),
    ("keen-eyed",      0.16),
    ("sharp-eared",    0.12),
    ("keen-nosed",     0.10),
    ("deep-voiced",    0.12),
    ("soft-spoken",    0.10),
    ("left-handed",    0.10),
    ("swift",          0.15),
    ("nimble",         0.14),
    // innate personality (unconditional)
    ("dreamful",       0.12),
    ("intuitive",      0.15),
    ("methodical",     0.13),
    ("stubborn",       0.16),
    ("cheerful",       0.14),
    ("brooding",       0.10),
    ("tender",         0.13),
    ("headstrong",     0.14),
    ("secretive",      0.10),
    ("night-walker",   0.08),  // born active at night
    ("frost-born",     0.06),  // born in harsh season (adds resilience flavor)
    ("twin-born",      0.03),  // rare
];

// Assign birth attributes based on traits and random rolls.
// Called once right after an organism is created.
pub fn assign_birth_attributes(org: &mut Organism, rng: &mut impl Rng) {
    // Common random appearance/personality
    for &(attr, prob) in BIRTH_ATTRS_COMMON {
        // skip sex-specific ones for the wrong sex
        if attr == "handsome"  && org.sex == super::organism::Sex::Female { continue; }
        if attr == "beautiful" && org.sex == super::organism::Sex::Male   { continue; }
        if attr == "deep-voiced" && org.sex == super::organism::Sex::Female { continue; }
        if rng.gen::<f32>() < prob {
            org.attributes.insert(attr.to_string());
        }
    }

    // Trait-gated birth attributes
    if org.traits.curiosity > 0.62 {
        if rng.gen::<f32>() < 0.70 { org.attributes.insert("curious".to_string()); }
    }
    if org.traits.curiosity > 0.75 {
        if rng.gen::<f32>() < 0.55 { org.attributes.insert("quick-witted".to_string()); }
    }
    if org.traits.aggression > 0.65 {
        if rng.gen::<f32>() < 0.65 { org.attributes.insert("bold".to_string()); }
    }
    if org.traits.aggression > 0.78 {
        if rng.gen::<f32>() < 0.50 { org.attributes.insert("fierce".to_string()); }
    }
    if org.traits.aggression < 0.30 {
        if rng.gen::<f32>() < 0.60 { org.attributes.insert("gentle".to_string()); }
    }
    if org.traits.fear > 0.65 {
        if rng.gen::<f32>() < 0.55 { org.attributes.insert("cautious".to_string()); }
    }
    if org.traits.fear > 0.80 {
        if rng.gen::<f32>() < 0.40 { org.attributes.insert("anxious".to_string()); }
    }
    if org.traits.fear < 0.28 {
        if rng.gen::<f32>() < 0.60 { org.attributes.insert("brave".to_string()); }
    }
    if org.traits.social_tendency > 0.68 {
        if rng.gen::<f32>() < 0.60 { org.attributes.insert("talkative".to_string()); }
    }
    if org.traits.social_tendency < 0.28 {
        if rng.gen::<f32>() < 0.55 { org.attributes.insert("shy".to_string()); }
    }
    if org.traits.resilience > 0.72 {
        if rng.gen::<f32>() < 0.55 { org.attributes.insert("resilient".to_string()); }
    }
    if org.traits.memory_strength > 0.72 {
        if rng.gen::<f32>() < 0.50 { org.attributes.insert("patient".to_string()); }
    }
    if org.traits.curiosity > 0.70 && org.traits.social_tendency < 0.35 {
        if rng.gen::<f32>() < 0.45 { org.attributes.insert("wandering-heart".to_string()); }
    }
    if org.traits.resilience < 0.30 {
        if rng.gen::<f32>() < 0.45 { org.attributes.insert("delicate".to_string()); }
    }
    if org.traits.aggression < 0.25 && org.traits.social_tendency > 0.60 {
        if rng.gen::<f32>() < 0.45 { org.attributes.insert("serene".to_string()); }
    }
    if org.traits.aggression > 0.60 && org.traits.fear < 0.35 {
        if rng.gen::<f32>() < 0.40 { org.attributes.insert("restless".to_string()); }
    }
}

// ── Earned attributes ───────────────────────────────────────────────────────
// Called every N ticks per organism to check for newly earned attributes.
// Returns true if any attribute was newly gained.

pub fn check_earned_attributes(org: &mut Organism) -> bool {
    let disc = &org.discoveries;
    let attrs = &mut org.attributes;
    let prev_len = attrs.len();

    // — Knowledge / learning —
    let disc_count = disc.len();
    if disc_count >= 1  { attrs.insert("learned".to_string()); }
    if disc_count >= 5  { attrs.insert("scholar".to_string()); }
    if disc_count >= 10 { attrs.insert("wise".to_string()); }
    if disc_count >= 18 { attrs.insert("polymath".to_string()); }
    if disc_count >= 25 { attrs.insert("sage".to_string()); }
    if disc.contains("writing") || disc.contains("symbols") || disc.contains("develop_symbol") {
        attrs.insert("literate".to_string());
    }
    if disc.contains("counting") || disc.contains("mathematics") {
        attrs.insert("numerate".to_string());
    }
    if disc.contains("medicine") || disc.contains("herbalism") {
        attrs.insert("herbalist".to_string());
    }
    if disc.contains("astronomy") || disc.contains("stargazing") {
        attrs.insert("astronomer".to_string());
    }

    // — Hunting / combat —
    if disc.contains("trapping-game") || disc.contains("hunting") {
        attrs.insert("hunter".to_string());
    }
    if disc.contains("bow") {
        attrs.insert("archer".to_string());
    }
    if disc.contains("spear") {
        attrs.insert("spearman".to_string());
    }
    if disc.contains("spear") && disc.contains("bow") {
        attrs.insert("marksman".to_string());
    }
    if disc.contains("trap") {
        attrs.insert("trapper".to_string());
    }

    // — Building / crafting —
    if disc.contains("fire-making") || disc.contains("fire") {
        attrs.insert("fire-keeper".to_string());
    }
    if disc.contains("toolmaking") || disc.contains("stone_tools") {
        attrs.insert("toolmaker".to_string());
    }
    if disc.contains("axe") {
        attrs.insert("woodcutter".to_string());
    }
    if disc.contains("woodcutting") && disc.contains("build_hut") {
        attrs.insert("carpenter".to_string());
    }
    if disc.contains("build_hut") || disc.contains("construction") {
        attrs.insert("builder".to_string());
    }
    if disc.contains("masonry") {
        attrs.insert("mason".to_string());
    }
    if disc.contains("weaving") || disc.contains("basket") {
        attrs.insert("weaver".to_string());
    }
    if disc.contains("metalworking") || disc.contains("smelting") {
        attrs.insert("smith".to_string());
    }
    if disc.contains("pottery") || disc.contains("clay") {
        attrs.insert("potter".to_string());
    }
    if disc.contains("carving") {
        attrs.insert("carver".to_string());
    }
    if disc.contains("alchemy") || (disc.contains("medicine") && disc.contains("fire-making")) {
        attrs.insert("alchemist".to_string());
    }

    // — Agriculture / food —
    if disc.contains("farming") || disc.contains("agriculture") || disc.contains("horticulture") {
        attrs.insert("farmer".to_string());
    }
    if disc.contains("crop_rotation") {
        attrs.insert("cultivator".to_string());
    }
    if disc.contains("irrigation") {
        attrs.insert("irrigator".to_string());
    }
    if disc.contains("composting") {
        attrs.insert("composter".to_string());
    }
    if disc.contains("foraging") || disc.contains("gathering") {
        attrs.insert("forager".to_string());
    }
    if disc.contains("cooking") {
        attrs.insert("cook".to_string());
    }
    if disc.contains("brewing") || disc.contains("fermentation") {
        attrs.insert("brewer".to_string());
    }

    // — Territory / exploration —
    if disc.contains("quarrying") {
        attrs.insert("quarrier".to_string());
    }
    if disc.contains("borders") || disc.contains("establish_borders") {
        attrs.insert("border-lord".to_string());
    }
    if disc.contains("territory") || disc.contains("claim_land") {
        attrs.insert("frontiersman".to_string());
    }
    if disc.contains("navigation") || disc.contains("cartography") {
        attrs.insert("navigator".to_string());
    }
    if disc.contains("sailing") || disc.contains("seafaring") {
        attrs.insert("seafarer".to_string());
    }

    // — Social / leadership —
    if disc.contains("storytelling") || disc.contains("oral_history") {
        attrs.insert("storyteller".to_string());
    }
    if disc.contains("song") || disc.contains("singing") {
        attrs.insert("singer".to_string());
    }
    if disc.contains("dance") || disc.contains("dancing") {
        attrs.insert("dancer".to_string());
    }
    if disc.contains("trade") || disc.contains("trading") {
        attrs.insert("trader".to_string());
    }
    if disc.contains("diplomacy") || disc.contains("treaty") {
        attrs.insert("diplomat".to_string());
    }
    if disc.contains("leadership") || disc.contains("governance") {
        attrs.insert("leader".to_string());
    }
    if disc.contains("law") || disc.contains("lawmaking") {
        attrs.insert("lawgiver".to_string());
    }
    if disc.contains("ritual") || disc.contains("ceremony") {
        attrs.insert("shaman".to_string());
    }
    if disc.contains("teaching") {
        attrs.insert("teacher".to_string());
    }
    if disc.contains("philosophy") || disc.contains("meaning") {
        attrs.insert("philosopher".to_string());
    }

    // — Life milestones —
    if org.is_elder {
        attrs.insert("elder".to_string());
    }
    if org.age > 1800 {  // 3 in-world days = very long-lived
        attrs.insert("long-lived".to_string());
    }
    if org.age > 3600 {
        attrs.insert("ancient".to_string());
    }
    if org.children_count >= 1 {
        let label = if org.sex == super::organism::Sex::Female { "mother" } else { "father" };
        attrs.insert(label.to_string());
    }
    if org.children_count >= 3 {
        let label = if org.sex == super::organism::Sex::Female { "mother-of-many" } else { "father-of-many" };
        attrs.insert(label.to_string());
    }
    if org.children_count >= 5 {
        let label = if org.sex == super::organism::Sex::Female { "matriarch" } else { "patriarch" };
        attrs.insert(label.to_string());
    }
    if org.generation == 0 {
        attrs.insert("founder".to_string());
    }
    if org.partner_id.is_some() {
        attrs.insert("bonded".to_string());
    }
    if !org.friends.is_empty() {
        attrs.insert("beloved".to_string());
    }
    if org.friends.len() >= 4 {
        attrs.insert("friend-to-all".to_string());
    }

    // — Survival / hardship —
    if org.grief_ticks > 0 || org.life_log.iter().any(|e| e.category == "grief") {
        attrs.insert("grieving".to_string());
    }
    // Mark recovered if grief_ticks is 0 but they previously had "grieving"
    if org.grief_ticks == 0 && attrs.contains("grieving") && org.age > 300 {
        attrs.remove("grieving");
        attrs.insert("survivor".to_string());
    }
    if org.health < 0.25 {
        attrs.insert("wounded".to_string());
    } else {
        attrs.remove("wounded");
    }
    if org.infection > 0.4 {
        attrs.insert("plague-stricken".to_string());
    } else if org.infection < 0.05 && attrs.contains("plague-stricken") {
        attrs.remove("plague-stricken");
        attrs.insert("plague-survivor".to_string());
    }
    if org.sleep_debt > 0.6 {
        attrs.insert("exhausted".to_string());
    } else {
        attrs.remove("exhausted");
    }
    if org.loneliness > 0.8 {
        attrs.insert("lone-wolf".to_string());
    }
    if org.fear_level > 0.7 {
        attrs.insert("battle-worn".to_string());
    }

    // — Specialisation combos —
    if attrs.contains("builder") && attrs.contains("mason") && attrs.contains("carpenter") {
        attrs.insert("architect".to_string());
    }
    if attrs.contains("hunter") && attrs.contains("trapper") && attrs.contains("archer") {
        attrs.insert("tracker".to_string());
    }
    if attrs.contains("farmer") && attrs.contains("cultivator") && attrs.contains("irrigator") {
        attrs.insert("master-farmer".to_string());
    }
    if attrs.contains("wise") && attrs.contains("storyteller") && org.is_elder {
        attrs.insert("keeper-of-lore".to_string());
    }
    if disc_count >= 10 && attrs.contains("builder") && attrs.contains("farmer") {
        attrs.insert("civilizer".to_string());
    }
    if attrs.contains("smith") && attrs.contains("toolmaker") {
        attrs.insert("craftmaster".to_string());
    }
    if attrs.contains("diplomat") && attrs.contains("trader") {
        attrs.insert("peacemaker".to_string());
    }
    if attrs.contains("leader") && org.is_elder && org.children_count >= 2 {
        attrs.insert("chief".to_string());
    }

    attrs.len() > prev_len
}
