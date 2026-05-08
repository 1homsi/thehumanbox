/// Local trait-weighted resolver for classification scenarios.
///
/// Every scenario that asks for ONE word from a fixed list is resolved here,
/// instantly, using the organism's trait values as weights.
/// Only `elder_teaching` is left to Groq since it actually generates free text.
use rand::Rng;
use crate::sim::simulation::ThinkTrigger;

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Weighted random pick over (value, weight) pairs.
/// Weights don't need to sum to 1 — they're normalised internally.
fn weighted_pick<'a>(rng: &mut impl Rng, options: &[(&'a str, f32)]) -> &'a str {
    let total: f32 = options.iter().map(|(_, w)| w.max(0.0)).sum();
    if total <= 0.0 {
        return options[rng.gen_range(0..options.len())].0;
    }
    let mut roll = rng.gen::<f32>() * total;
    for (val, w) in options {
        roll -= w.max(0.0);
        if roll <= 0.0 { return val; }
    }
    options.last().unwrap().0
}

// ── Public ────────────────────────────────────────────────────────────────────

pub struct LocalResult {
    pub word:            &'static str,
    pub thought:         &'static str,
    pub directive:       Option<&'static str>,
    pub directive_ticks: u64,
    pub attitude_delta:  Option<f32>,
    pub trait_name:      Option<&'static str>,
    pub trait_delta:     Option<f32>,
    pub strategy:        Option<&'static str>,
    pub alliance:        Option<&'static str>,
    pub discovery:       Option<String>,
}

impl Default for LocalResult {
    fn default() -> Self {
        LocalResult {
            word: "", thought: "", directive: None, directive_ticks: 0,
            attitude_delta: None, trait_name: None, trait_delta: None,
            strategy: None, alliance: None, discovery: None,
        }
    }
}

/// Returns Some(LocalResult) for classification scenarios, None for elder_teaching
/// (which still needs real LLM generation).
pub fn resolve(trigger: &ThinkTrigger, rng: &mut impl Rng) -> Option<LocalResult> {
    let ag = trigger.aggression;    // 0-1
    let fe = trigger.fear;          // 0-1
    let so = trigger.social_tendency; // 0-1
    let cu = trigger.curiosity;     // 0-1
    let re = trigger.resilience;    // 0-1
    let ki = trigger.kin_count as f32;

    match trigger.scenario.as_str() {
        // ── first_contact ─────────────────────────────────────────────────────
        // Aggressive organisms are more likely to be hostile; social ones friendly.
        "first_contact" => {
            let word = weighted_pick(rng, &[
                ("friendly",  so * 1.2 + (1.0 - ag) * 0.6),
                ("cautious",  0.8),
                ("hostile",   ag * 1.4 + fe * 0.4),
            ]);
            let (delta, thought) = match word {
                "friendly" => (0.35f32,  "curious about them"),
                "hostile"  => (-0.4f32, "wary of strangers"),
                _          => (0.0f32,  "watching the stranger"),
            };
            Some(LocalResult { word, thought, attitude_delta: Some(delta), ..Default::default() })
        }

        // ── council ───────────────────────────────────────────────────────────
        // Curious tribes explore; social ones settle; aggressive ones hunt.
        "council" => {
            let word = weighted_pick(rng, &[
                ("settle",  so * 1.2 + re * 0.5),
                ("hunt",    ag * 1.0 + (1.0 - cu) * 0.4),
                ("explore", cu * 1.4 + (1.0 - so) * 0.3),
            ]);
            let strategy = match word { "settle" => "settle", "hunt" => "hunt", _ => "explore" };
            Some(LocalResult {
                word, thought: "the tribe council has spoken",
                strategy: Some(strategy), ..Default::default()
            })
        }

        // ── survival_crisis ───────────────────────────────────────────────────
        // Parse the context for clues; fall back to energy_avg.
        "survival_crisis" => {
            let ctx = trigger.context.to_lowercase();
            let directive = if ctx.contains("starv") || ctx.contains("food") || trigger.energy_avg < 0.15 {
                "seek_food"
            } else if ctx.contains("thirst") || ctx.contains("water") || ctx.contains("dehydr") {
                "seek_water"
            } else {
                if trigger.energy_avg < 0.2 { "seek_food" } else { "seek_water" }
            };
            let need = directive.trim_start_matches("seek_");
            Some(LocalResult {
                word: need, thought: "desperate for survival",
                directive: Some(directive), directive_ticks: 300, ..Default::default()
            })
        }

        // ── abundance ─────────────────────────────────────────────────────────
        // Social organisms want to be with others; curious ones explore; industrious build.
        "abundance" => {
            let word = weighted_pick(rng, &[
                ("socialize", so * 1.5 + ki.min(5.0) * 0.1),
                ("explore",   cu * 1.2 + (1.0 - so) * 0.4),
                ("build",     re * 0.8 + (1.0 - cu) * 0.4),
            ]);
            let directive = match word { "build" => "explore", _ => word }; // "build" maps to explore directive
            Some(LocalResult {
                word, thought: "content but curious",
                directive: Some(directive), directive_ticks: 400, ..Default::default()
            })
        }

        // ── threat ────────────────────────────────────────────────────────────
        // Aggressive with allies: fight. Fearful: flee. Social with allies: trade.
        "threat" => {
            let ally_bonus = (ki / 5.0).min(1.0);
            let word = weighted_pick(rng, &[
                ("fight", ag * 1.2 + ally_bonus * 0.6),
                ("flee",  fe * 1.2 + (1.0 - ally_bonus) * 0.5),
                ("trade", so * 0.9 + (1.0 - ag) * 0.5),
            ]);
            Some(LocalResult {
                word, thought: "facing a threat",
                directive: Some(word), directive_ticks: 250, ..Default::default()
            })
        }

        // ── lonely ────────────────────────────────────────────────────────────
        "lonely" => {
            let word = weighted_pick(rng, &[
                ("family",   so * 1.4 + re * 0.3),
                ("stranger", cu * 0.9 + (1.0 - fe) * 0.4),
                ("wander",   (1.0 - so) * 0.8 + cu * 0.3),
            ]);
            let directive = match word { "family" | "stranger" => "socialize", _ => "explore" };
            Some(LocalResult {
                word, thought: "longing for company",
                directive: Some(directive), directive_ticks: 500, ..Default::default()
            })
        }

        // ── restless ──────────────────────────────────────────────────────────
        "restless" => {
            let word = weighted_pick(rng, &[
                ("explore", cu * 1.5),
                ("build",   re * 0.9 + (1.0 - cu) * 0.5),
                ("create",  cu * 0.8 + so * 0.4),
            ]);
            Some(LocalResult {
                word, thought: "restless energy",
                directive: Some("explore"), directive_ticks: 500, ..Default::default()
            })
        }

        // ── invention ─────────────────────────────────────────────────────────
        // Candidates are already pre-filtered by the sim; just pick one randomly.
        "invention" => {
            let candidates: Vec<&str> = trigger.context.split(", ").collect();
            if candidates.is_empty() { return None; }
            let pick = candidates[rng.gen_range(0..candidates.len())].to_string();
            Some(LocalResult {
                word: "invention", thought: "a sudden realisation",
                discovery: Some(pick), ..Default::default()
            })
        }

        // ── reflection ────────────────────────────────────────────────────────
        // Weight trait growth by the organism's lowest trait (they improve weak spots)
        // and by what their emotional state hints at.
        "reflection" => {
            let em = trigger.emotional_state.to_lowercase();
            let (trait_name, delta): (&'static str, f32) = if em.contains("fear") || em.contains("terri") {
                ("fear", -0.06)          // scary life → become braver
            } else if em.contains("lone") || em.contains("isol") {
                ("social_tendency", 0.05) // lonely life → become more social
            } else if em.contains("mourn") || em.contains("grief") {
                ("resilience", 0.05)      // loss → become more resilient
            } else {
                // Otherwise: weighted toward whichever trait is currently lowest
                weighted_pick(rng, &[
                    ("curiosity",       (1.0 - cu) * 1.1),
                    ("social_tendency", (1.0 - so) * 0.9),
                    ("resilience",      (1.0 - re) * 0.9),
                    ("aggression",      ag          * 0.4),  // rare
                    ("fear",            fe          * 0.3),  // rare (becomes braver)
                ]);
                let t = weighted_pick(rng, &[
                    ("curiosity",       (1.0 - cu) * 1.1),
                    ("social_tendency", (1.0 - so) * 0.9),
                    ("resilience",      (1.0 - re) * 0.9),
                ]);
                match t {
                    "curiosity"       => ("curiosity",       0.05),
                    "social_tendency" => ("social_tendency", 0.05),
                    _                 => ("resilience",      0.04),
                }
            };
            Some(LocalResult {
                word: trait_name, thought: "reflecting on life",
                trait_name: Some(trait_name), trait_delta: Some(delta), ..Default::default()
            })
        }

        // ── negotiation ───────────────────────────────────────────────────────
        // What agreement makes sense given each tribe's discoveries?
        "negotiation" => {
            let has_fire   = trigger.discoveries.iter().any(|d| d == "fire" || d == "cooking");
            let has_stone  = trigger.discoveries.iter().any(|d| d == "stone" || d == "masonry");
            let they_have  = !trigger.other_discoveries.is_empty();
            let alliance = weighted_pick(rng, &[
                ("food_sharing",       so * 1.1 + if has_fire { 0.4 } else { 0.0 }),
                ("defense_pact",       ag * 0.8 + if has_stone { 0.4 } else { 0.0 }),
                ("knowledge_exchange", cu * 1.2 + if they_have { 0.5 } else { 0.0 }),
                ("territory",          re * 0.7 + (1.0 - so) * 0.4),
            ]);
            Some(LocalResult {
                word: alliance, thought: "a deal was struck",
                alliance: Some(alliance), ..Default::default()
            })
        }

        // ── grief ─────────────────────────────────────────────────────────────
        "grief" => {
            let word = weighted_pick(rng, &[
                ("mourn",  re * 0.8 + so * 0.5),
                ("rage",   ag * 1.2 + (1.0 - re) * 0.5),
                ("endure", re * 1.1 + (1.0 - fe) * 0.4),
            ]);
            let thought = match word { "mourn" => "lost someone close", "rage" => "grieving in anger", _ => "enduring the loss" };
            Some(LocalResult { word, thought, ..Default::default() })
        }

        // ── illness ───────────────────────────────────────────────────────────
        "illness" => {
            let word = weighted_pick(rng, &[
                ("rest",      re * 1.0 + fe * 0.4),
                ("isolate",   (1.0 - so) * 0.9 + fe * 0.3),
                ("seek_help", so * 1.2 + (1.0 - fe) * 0.3),
            ]);
            let thought = match word { "rest" => "resting to recover", "isolate" => "isolating (sick)", _ => "seeking help (sick)" };
            Some(LocalResult {
                word, thought,
                directive: Some(word), directive_ticks: 200, ..Default::default()
            })
        }

        // ── migration ─────────────────────────────────────────────────────────
        "migration" => {
            let ctx = trigger.context.to_lowercase();
            let starving = ctx.contains("starv") || ctx.contains("scarce");
            let word = weighted_pick(rng, &[
                ("migrate", cu * 0.9 + if ki < 5.0 { 0.5 } else { 0.2 } + if starving { 0.6 } else { 0.0 }),
                ("forage",  (1.0 - cu) * 0.8 + re * 0.4),
                ("wait",    re * 0.7 + (1.0 - starving as u8 as f32) * 0.5),
            ]);
            let (directive, thought) = match word {
                "migrate" => ("explore",   "time to move on"),
                "forage"  => ("seek_food", "foraging for food"),
                _         => ("rest",      "waiting out scarcity"),
            };
            Some(LocalResult {
                word, thought,
                directive: Some(directive), directive_ticks: 400, ..Default::default()
            })
        }

        // ── discovery ─────────────────────────────────────────────────────────
        "discovery" => {
            let word = weighted_pick(rng, &[
                ("excited",  cu * 1.4 + (1.0 - fe) * 0.4),
                ("grateful", so * 0.9 + re * 0.4),
                ("cautious", fe * 1.0 + (1.0 - cu) * 0.5),
            ]);
            Some(LocalResult { word, thought: "a new discovery", ..Default::default() })
        }

        // elder_teaching → needs real LLM generation, don't resolve locally
        "elder_teaching" => None,

        _ => None,
    }
}
