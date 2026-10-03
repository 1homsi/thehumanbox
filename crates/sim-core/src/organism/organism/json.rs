use super::*;

impl Organism {
    pub fn to_json(&self) -> OrgJson {
        self.to_json_with(true)
    }

    pub(super) fn learning_summary(&self) -> LearningSummary {
        let states = self.q_table.len();
        let tried_actions = self.q_table.values().map(Vec::len).sum();
        // One scan of every row for its best value, shared by the promising
        // count and the confidence sum (each used to rescan every row).
        let best: Vec<f32> = self.q_table.values().map(|row| row.max_q()).collect();
        let promising_states = best.iter().filter(|&&q| q > 0.01).count();
        let confidence = if states == 0 {
            0.0
        } else {
            let total: f32 = best.iter().map(|&q| (q.max(0.0) / 0.25).clamp(0.0, 1.0)).sum();
            (total / states as f32 * 100.0).round() / 100.0
        };
        LearningSummary {
            states,
            tried_actions,
            promising_states,
            confidence,
        }
    }

    pub fn to_json_with(&self, include_cold: bool) -> OrgJson {
        OrgJson {
            id: self.id.clone(),
            x: (self.x * 10.0).round() / 10.0,
            y: (self.y * 10.0).round() / 10.0,
            energy: (self.energy * 1000.0).round() / 1000.0,
            hydration: (self.hydration * 1000.0).round() / 1000.0,
            health: (self.health * 1000.0).round() / 1000.0,
            age: self.age,
            alive: self.alive,
            thought: self.thought.clone(),
            infection: (self.infection * 1000.0).round() / 1000.0,
            fear_level: (self.fear_level * 100.0).round() / 100.0,
            carrying: self.carrying,
            carrying_type: self.carrying_type,
            pregnant: self.pregnant,
            partner_id: self.partner_id.clone(),
            attracted_to: self.attracted_to.clone(),

            attitudes: if include_cold {
                Some(
                    self.lineage_attitudes
                        .iter()
                        .filter(|(_, &v)| v.abs() > 0.1)
                        .map(|(k, &v)| (k.clone(), (v * 100.0).round() / 100.0))
                        .collect(),
                )
            } else {
                None
            },
            org_trust: if include_cold {
                Some(
                    self.org_trust
                        .iter()
                        .filter(|(_, &v)| v.abs() > 0.15)
                        .map(|(k, &v)| (k[..k.len().min(8)].to_string(), (v * 100.0).round() / 100.0))
                        .collect(),
                )
            } else {
                None
            },
            memory_count: if include_cold {
                Some(MemoryCount {
                    food: self.food_memory.len(),
                    water: self.water_memory.len(),
                    danger: self.danger_memory.len(),
                })
            } else {
                None
            },
            learning: if include_cold {
                Some(self.learning_summary())
            } else {
                None
            },
            loneliness: if include_cold {
                Some((self.loneliness * 100.0).round() / 100.0)
            } else {
                None
            },
            boredom: if include_cold {
                Some((self.boredom * 100.0).round() / 100.0)
            } else {
                None
            },
            comfort: if include_cold {
                Some((self.comfort * 100.0).round() / 100.0)
            } else {
                None
            },
            grief_ticks: if include_cold {
                Some(self.grief_ticks)
            } else {
                None
            },
            joy_ticks: if include_cold && self.joy_ticks > 0 {
                Some(self.joy_ticks)
            } else {
                None
            },
            hope: if include_cold {
                Some((self.hope * 100.0).round() / 100.0)
            } else {
                None
            },
            awe: if include_cold {
                Some((self.awe * 100.0).round() / 100.0)
            } else {
                None
            },
            gratitude: if include_cold {
                Some((self.gratitude * 100.0).round() / 100.0)
            } else {
                None
            },
            jealousy: if include_cold {
                Some((self.jealousy * 100.0).round() / 100.0)
            } else {
                None
            },
            anger: if include_cold {
                Some((self.anger * 100.0).round() / 100.0)
            } else {
                None
            },
            regret: if include_cold {
                Some((self.regret * 100.0).round() / 100.0)
            } else {
                None
            },
            curiosity_drive: if include_cold {
                Some((self.curiosity_drive * 100.0).round() / 100.0)
            } else {
                None
            },
            spiritual: if include_cold {
                Some((self.spiritual * 100.0).round() / 100.0)
            } else {
                None
            },
            aspiration: if include_cold && !self.aspiration.is_empty() {
                Some(self.aspiration.clone())
            } else {
                None
            },
            sleep_debt: if include_cold {
                Some((self.sleep_debt * 100.0).round() / 100.0)
            } else {
                None
            },
            children_count: if include_cold {
                Some(self.children_count)
            } else {
                None
            },
            conversation_count: if include_cold {
                Some(self.conversations.len())
            } else {
                None
            },

            name: if include_cold {
                Some(self.name.clone())
            } else {
                None
            },
            generation: if include_cold { Some(self.generation) } else { None },
            parent_id: if include_cold {
                Some(self.parent_id.clone())
            } else {
                None
            },
            father_id: if include_cold {
                Some(self.father_id.clone())
            } else {
                None
            },
            lineage_id: if include_cold {
                Some(self.lineage_id.clone())
            } else {
                None
            },
            max_age: if include_cold { Some(self.max_age) } else { None },
            sex: if include_cold {
                Some(self.sex.as_str().to_string())
            } else {
                None
            },
            traits: if include_cold {
                Some(TraitsJson {
                    curiosity: (self.traits.curiosity * 100.0).round() / 100.0,
                    aggression: (self.traits.aggression * 100.0).round() / 100.0,
                    fear: (self.traits.fear * 100.0).round() / 100.0,
                    memory_strength: (self.traits.memory_strength * 100.0).round() / 100.0,
                    social_tendency: (self.traits.social_tendency * 100.0).round() / 100.0,
                    resilience: (self.traits.resilience * 100.0).round() / 100.0,
                })
            } else {
                None
            },
            vocabulary: if include_cold {
                Some(self.vocabulary.words())
            } else {
                None
            },
            discoveries: if include_cold {
                Some(self.discoveries.iter().cloned().collect())
            } else {
                None
            },
            home_x: if include_cold {
                Some((self.home_x * 10.0).round() / 10.0)
            } else {
                None
            },
            home_y: if include_cold {
                Some((self.home_y * 10.0).round() / 10.0)
            } else {
                None
            },
            is_elder: if include_cold { Some(self.is_elder) } else { None },
            friends: if include_cold && !self.friends.is_empty() {
                Some(self.friends.clone().into_iter().collect())
            } else {
                None
            },
            attributes: if include_cold && !self.attributes.is_empty() {
                let mut v: Vec<String> = self.attributes.iter().cloned().collect();
                v.sort();
                Some(v)
            } else {
                None
            },
            anchor_events: if include_cold && !self.anchor_events.is_empty() {
                Some(self.anchor_events.clone())
            } else {
                None
            },
            tools: if include_cold && !self.tools.is_empty() {
                Some(self.tools.clone().into_iter().collect())
            } else {
                None
            },
            home_furniture: if include_cold && !self.home_furniture.is_empty() {
                Some(self.home_furniture.clone())
            } else {
                None
            },
            home_style_seed: if include_cold && self.home_style_seed > 0 {
                Some(self.home_style_seed)
            } else {
                None
            },
            zodiac: if include_cold && !self.zodiac.is_empty() {
                Some(self.zodiac.clone())
            } else {
                None
            },
            birth_tick: if include_cold && self.birth_tick > 0 {
                Some(self.birth_tick)
            } else {
                None
            },
        }
    }

    /// `serde_json::to_value(self.to_json_with(include_cold))`, built without
    /// the intermediate `OrgJson`.
    ///
    /// Frames convert every organism to a `Value`. Going through the struct
    /// cloned each string twice (into the struct, then into the `Value`),
    /// collected the attitude/trust/vocabulary maps into hash maps only to
    /// re-insert them key by key into `BTreeMap`s, and inserted the ~60 fields
    /// one at a time. Here the entries are collected once and the object is
    /// bulk-built (the `Map` constructor sorts them, so the result does not
    /// depend on the order they are listed in). `OrgJson` and its serde
    /// output stay as they are for the detail API; the tests keep the two in
    /// step.
    pub fn to_json_value_with(&self, include_cold: bool) -> serde_json::Value {
        use serde_json::Value;
        let r1 = |v: f32| Value::from((v * 10.0).round() / 10.0);
        let r2 = |v: f32| Value::from((v * 100.0).round() / 100.0);
        let r3 = |v: f32| Value::from((v * 1000.0).round() / 1000.0);
        let text = |s: &str| Value::String(s.to_string());
        let optional =
            |s: &Option<String>| s.as_deref().map_or(Value::Null, |s| Value::String(s.to_string()));
        let mut f: Vec<(String, Value)> = Vec::with_capacity(if include_cold { 64 } else { 16 });
        let mut put = |key: &str, value: Value| f.push((key.to_string(), value));

        put("id", text(&self.id));
        put("x", r1(self.x));
        put("y", r1(self.y));
        put("energy", r3(self.energy));
        put("hydration", r3(self.hydration));
        put("health", r3(self.health));
        put("age", Value::from(self.age));
        put("alive", Value::Bool(self.alive));
        put("thought", text(&self.thought));
        put("infection", r3(self.infection));
        put("fear_level", r2(self.fear_level));
        put("carrying", Value::from(self.carrying));
        put("carrying_type", Value::from(self.carrying_type));
        put("pregnant", Value::Bool(self.pregnant));
        put("partner_id", optional(&self.partner_id));
        put("attracted_to", optional(&self.attracted_to));

        if include_cold {
            put(
                "attitudes",
                Value::Object(
                    self.lineage_attitudes
                        .iter()
                        .filter(|(_, &v)| v.abs() > 0.1)
                        .map(|(k, &v)| (k.clone(), r2(v)))
                        .collect(),
                ),
            );
            put(
                "org_trust",
                Value::Object(
                    self.org_trust
                        .iter()
                        .filter(|(_, &v)| v.abs() > 0.15)
                        .map(|(k, &v)| (k[..k.len().min(8)].to_string(), r2(v)))
                        .collect(),
                ),
            );
            put(
                "memory_count",
                Value::Object(
                    [
                        ("food", self.food_memory.len()),
                        ("water", self.water_memory.len()),
                        ("danger", self.danger_memory.len()),
                    ]
                    .into_iter()
                    .map(|(k, n)| (k.to_string(), Value::from(n)))
                    .collect(),
                ),
            );
            let learning = self.learning_summary();
            put(
                "learning",
                Value::Object(
                    [
                        ("states", Value::from(learning.states)),
                        ("tried_actions", Value::from(learning.tried_actions)),
                        ("promising_states", Value::from(learning.promising_states)),
                        ("confidence", Value::from(learning.confidence)),
                    ]
                    .into_iter()
                    .map(|(k, v)| (k.to_string(), v))
                    .collect(),
                ),
            );
            put("loneliness", r2(self.loneliness));
            put("boredom", r2(self.boredom));
            put("comfort", r2(self.comfort));
            put("grief_ticks", Value::from(self.grief_ticks));
            if self.joy_ticks > 0 {
                put("joy_ticks", Value::from(self.joy_ticks));
            }
            put("hope", r2(self.hope));
            put("awe", r2(self.awe));
            put("gratitude", r2(self.gratitude));
            put("jealousy", r2(self.jealousy));
            put("anger", r2(self.anger));
            put("regret", r2(self.regret));
            put("curiosity_drive", r2(self.curiosity_drive));
            put("spiritual", r2(self.spiritual));
            if !self.aspiration.is_empty() {
                put("aspiration", text(&self.aspiration));
            }
            put("sleep_debt", r2(self.sleep_debt));
            put("children_count", Value::from(self.children_count));
            put("conversation_count", Value::from(self.conversations.len()));

            put("name", text(&self.name));
            put("generation", Value::from(self.generation));
            put("parent_id", text(&self.parent_id));
            put("father_id", optional(&self.father_id));
            put("lineage_id", text(&self.lineage_id));
            put("max_age", Value::from(self.max_age));
            put("sex", text(self.sex.as_str()));
            put(
                "traits",
                Value::Object(
                    [
                        ("curiosity", self.traits.curiosity),
                        ("aggression", self.traits.aggression),
                        ("fear", self.traits.fear),
                        ("memory_strength", self.traits.memory_strength),
                        ("social_tendency", self.traits.social_tendency),
                        ("resilience", self.traits.resilience),
                    ]
                    .into_iter()
                    .map(|(k, v)| (k.to_string(), r2(v)))
                    .collect(),
                ),
            );
            put("vocabulary", self.vocabulary.words_value());
            put(
                "discoveries",
                Value::Array(self.discoveries.iter().map(|d| text(d)).collect()),
            );
            put("home_x", r1(self.home_x));
            put("home_y", r1(self.home_y));
            put("is_elder", Value::Bool(self.is_elder));
            if !self.friends.is_empty() {
                put(
                    "friends",
                    Value::Object(self.friends.iter().map(|(k, v)| (k.clone(), text(v))).collect()),
                );
            }
            if !self.attributes.is_empty() {
                put(
                    "attributes",
                    Value::Array(self.attributes.iter().map(|a| text(a)).collect()),
                );
            }
            if !self.anchor_events.is_empty() {
                put(
                    "anchor_events",
                    Value::Array(
                        self.anchor_events
                            .iter()
                            .map(|(tick, what, weight)| {
                                Value::Array(vec![Value::from(*tick), text(what), Value::from(*weight)])
                            })
                            .collect(),
                    ),
                );
            }
            if !self.tools.is_empty() {
                put(
                    "tools",
                    Value::Object(
                        self.tools
                            .iter()
                            .map(|(k, &n)| (k.clone(), Value::from(n)))
                            .collect(),
                    ),
                );
            }
            if !self.home_furniture.is_empty() {
                put(
                    "home_furniture",
                    Value::Array(self.home_furniture.iter().map(|p| text(p)).collect()),
                );
            }
            if self.home_style_seed > 0 {
                put("home_style_seed", Value::from(self.home_style_seed));
            }
            if !self.zodiac.is_empty() {
                put("zodiac", text(&self.zodiac));
            }
            if self.birth_tick > 0 {
                put("birth_tick", Value::from(self.birth_tick));
            }
        }
        Value::Object(f.into_iter().collect())
    }

    pub fn to_detail_json(&self) -> OrgDetailJson {
        let thought_history: Vec<ThoughtJson> = self
            .thought_history
            .iter()
            .rev()
            .take(20)
            .rev()
            .map(|e| ThoughtJson {
                tick: e.tick,
                text: e.text.clone(),
            })
            .collect();
        let life_log: Vec<LifeEventJson> = self
            .life_log
            .iter()
            .map(|e| LifeEventJson {
                tick: e.tick,
                category: e.category.clone(),
                text: e.text.clone(),
                related_id: e.related_id.clone(),
                related_name: e.related_name.clone(),
            })
            .collect();
        let memories: Vec<MemoryJson> = self
            .memories
            .top(20)
            .into_iter()
            .map(|m| MemoryJson {
                kind: m.kind.label().to_string(),
                text: m.text.clone(),
                salience: (m.salience * 100.0).round() / 100.0,
                emotion: m.emotion,
                tick: m.tick_formed,
                related_id: m.related_id.clone(),
                recalls: m.recall_count,
            })
            .collect();
        OrgDetailJson {
            base: self.to_json(),
            thought_history,
            vocabulary: self.vocabulary.words(),
            life_log,
            conversations: self.conversations.iter().rev().take(25).rev().cloned().collect(),
            memories,
        }
    }

    pub fn to_life_json(&self) -> OrgLifeJson {
        let events: Vec<LifeEventJson> = self
            .life_log
            .iter()
            .map(|e| LifeEventJson {
                tick: e.tick,
                category: e.category.clone(),
                text: e.text.clone(),
                related_id: e.related_id.clone(),
                related_name: e.related_name.clone(),
            })
            .collect();

        let friend_names: Vec<String> = self.friends.values().cloned().collect();
        let partner_id = self.partner_id.clone();
        let discoveries: Vec<String> = self.discoveries.iter().cloned().collect();

        let emotional_state = if self.grief_ticks > 50 {
            "devastated"
        } else if self.grief_ticks > 0 {
            "grieving"
        } else if self.loneliness > 0.75 {
            "desperately lonely"
        } else if self.fear_level > 0.65 {
            "terrified"
        } else if self.loneliness > 0.50 {
            "lonely"
        } else if self.comfort > 0.80 {
            "content"
        } else if self.boredom > 0.65 {
            "restless"
        } else if self.energy < 0.25 {
            "starving"
        } else {
            "stable"
        };

        let memories: Vec<MemoryJson> = self
            .memories
            .top(20)
            .into_iter()
            .map(|m| MemoryJson {
                kind: m.kind.label().to_string(),
                text: m.text.clone(),
                salience: (m.salience * 100.0).round() / 100.0,
                emotion: m.emotion,
                tick: m.tick_formed,
                related_id: m.related_id.clone(),
                recalls: m.recall_count,
            })
            .collect();

        OrgLifeJson {
            id: self.id.clone(),
            name: self.name.clone(),
            age_ticks: self.age,
            generation: self.generation,
            lineage_id: self.lineage_id.clone(),
            sex: self.sex.as_str().to_string(),
            alive: self.alive,
            is_elder: self.is_elder,
            partner_id,
            children_count: self.children_count,
            friends: friend_names,
            discoveries,
            emotional_state: emotional_state.to_string(),
            events,
            thought_history: self
                .thought_history
                .iter()
                .map(|e| ThoughtJson {
                    tick: e.tick,
                    text: e.text.clone(),
                })
                .collect(),
            memories,
            zodiac: if !self.zodiac.is_empty() {
                Some(self.zodiac.clone())
            } else {
                None
            },
            aspiration: if !self.aspiration.is_empty() {
                Some(self.aspiration.clone())
            } else {
                None
            },
        }
    }
}

#[derive(Serialize)]
pub struct ThoughtJson {
    pub tick: u64,
    pub text: String,
}
#[derive(Serialize)]
pub struct MemoryCount {
    pub food: usize,
    pub water: usize,
    pub danger: usize,
}

#[derive(Serialize)]
pub struct LifeEventJson {
    pub tick: u64,
    pub category: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_name: Option<String>,
}

#[derive(Serialize)]
pub struct OrgLifeJson {
    pub id: String,
    pub name: String,
    pub age_ticks: u32,
    pub generation: u32,
    pub lineage_id: String,
    pub sex: String,
    pub alive: bool,
    pub is_elder: bool,
    pub partner_id: Option<String>,
    pub children_count: u32,
    pub friends: Vec<String>,
    pub discoveries: Vec<String>,
    pub emotional_state: String,
    pub events: Vec<LifeEventJson>,
    pub thought_history: Vec<ThoughtJson>,
    pub memories: Vec<MemoryJson>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zodiac: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aspiration: Option<String>,
}

/// Hot Structure-of-Arrays payload for delta (viewport) frames.
///
/// Ages and other slow-moving cold fields are *not* included here -
/// full frames carry ground truth for those and the client preserves
/// them across deltas. Sending 4 bytes per org per tick for a counter
/// that increments by 1 was pure waste.
/// Hot Structure-of-Arrays payload for delta (viewport) frames.
///
/// Several historically per-org fields are now sparse or dropped to
/// cut bandwidth. Specifically:
/// - `alives` is gone - delta orgs are filtered to alive on the server
///   already, so every entry was `true`. Client merge keeps the
///   cached alive flag.
/// - `thoughts` is now sparse `Vec<(u32 index, String)>` - most ticks
///   the same thought repeats verbatim, so we only ship entries
///   whose `thought_dirty` flag was set since the last delta.
/// - `partner_ids` / `attracted_tos` are sparse `Vec<(u32, String)>`
///   too - only a small minority of orgs have either at any tick.
///
/// Fields are declared in alphabetical order on purpose: frames are sorted
/// JSON maps, and `FramePayload` writes this struct to the wire directly, so
/// the declaration order is the key order. A test compares it with the
/// `serde_json::Value` path byte for byte.
#[derive(Serialize)]
pub struct OrgsHotSoa {
    /// Sparse: (index into ids, attracted_to id). Absent → no
    /// current attraction.
    pub attracted_tos: Vec<(u32, String)>,
    pub carrying_types: Vec<u8>,
    pub carryings: Vec<u8>,
    pub energies: Vec<u8>,
    pub fear_levels: Vec<u8>,
    pub healths: Vec<u8>,
    pub hydrations: Vec<u8>,
    pub ids: Vec<String>,
    pub infections: Vec<u8>,
    /// Sparse: (index into ids, partner_id). Absent → unpartnered.
    pub partner_ids: Vec<(u32, String)>,
    pub pregnants: Vec<bool>,
    pub target_xs: Vec<i16>,
    pub target_ys: Vec<i16>,
    /// Sparse: (index into ids, thought text). Only orgs whose thought
    /// changed this tick. Client merges into prev cached thought.
    pub thoughts: Vec<(u32, String)>,
    pub vxs: Vec<i16>,
    pub vys: Vec<i16>,
    pub xs: Vec<i16>,
    pub ys: Vec<i16>,
}

#[inline]
pub(super) fn q_pos(v: f32) -> i16 {
    (v * 10.0).round().clamp(i16::MIN as f32, i16::MAX as f32) as i16
}

#[inline]
pub(super) fn q_pct(v: f32) -> u8 {
    (v * 100.0).round().clamp(0.0, 100.0) as u8
}

impl OrgsHotSoa {
    pub fn with_capacity(n: usize) -> Self {
        OrgsHotSoa {
            ids: Vec::with_capacity(n),
            xs: Vec::with_capacity(n),
            ys: Vec::with_capacity(n),
            vxs: Vec::with_capacity(n),
            vys: Vec::with_capacity(n),
            target_xs: Vec::with_capacity(n),
            target_ys: Vec::with_capacity(n),
            energies: Vec::with_capacity(n),
            hydrations: Vec::with_capacity(n),
            healths: Vec::with_capacity(n),
            // Sparse fields start empty - only allocate slots actually used.
            thoughts: Vec::with_capacity(n / 4),
            infections: Vec::with_capacity(n),
            fear_levels: Vec::with_capacity(n),
            carryings: Vec::with_capacity(n),
            carrying_types: Vec::with_capacity(n),
            pregnants: Vec::with_capacity(n),
            partner_ids: Vec::with_capacity(n / 8),
            attracted_tos: Vec::with_capacity(n / 16),
        }
    }

    pub fn push(&mut self, o: &mut Organism, lookahead_ticks: f32) {
        let pred_x = o.x + o.vx_smooth * lookahead_ticks;
        let pred_y = o.y + o.vy_smooth * lookahead_ticks;
        // Velocity quantization: * 10 → i16, client decodes /10. Comment
        // and code were drifting at 10× off; standardising on /10 means
        // ±3276.7 tiles/tick representable, plenty of headroom.
        let enc_vx = (o.vx_smooth * 10.0)
            .round()
            .clamp(i16::MIN as f32, i16::MAX as f32) as i16;
        let enc_vy = (o.vy_smooth * 10.0)
            .round()
            .clamp(i16::MIN as f32, i16::MAX as f32) as i16;
        // i16::MIN sentinel = no target
        let (enc_tx, enc_ty) = match o.wander_target {
            Some((tx, ty)) => (tx as i16, ty as i16),
            None => (i16::MIN, i16::MIN),
        };
        let idx = self.ids.len() as u32;
        self.ids.push(o.id.clone());
        self.xs.push(q_pos(pred_x));
        self.ys.push(q_pos(pred_y));
        self.vxs.push(enc_vx);
        self.vys.push(enc_vy);
        self.target_xs.push(enc_tx);
        self.target_ys.push(enc_ty);
        self.energies.push(q_pct(o.energy));
        self.hydrations.push(q_pct(o.hydration));
        self.healths.push(q_pct(o.health));
        // Sparse: only emit thought if dirty since last send. Clear
        // the flag after read so the next delta only ships subsequent
        // changes. Full frames take the AoS JSON path and don't
        // touch this flag (they emit the thought unconditionally).
        if o.thought_dirty {
            self.thoughts.push((idx, o.thought.clone()));
            o.thought_dirty = false;
        }
        self.infections.push(q_pct(o.infection));
        self.fear_levels.push(q_pct(o.fear_level));
        self.carryings.push(o.carrying.min(255) as u8);
        self.carrying_types.push(o.carrying_type);
        self.pregnants.push(o.pregnant);
        // Sparse: only emit when set.
        if let Some(pid) = &o.partner_id {
            self.partner_ids.push((idx, pid.clone()));
        }
        if let Some(aid) = &o.attracted_to {
            self.attracted_tos.push((idx, aid.clone()));
        }
    }
}
#[derive(Serialize)]
pub struct TraitsJson {
    pub curiosity: f32,
    pub aggression: f32,
    pub fear: f32,
    pub memory_strength: f32,
    pub social_tendency: f32,
    pub resilience: f32,
}
#[derive(Serialize)]
pub struct OrgJson {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub energy: f32,
    pub hydration: f32,
    pub health: f32,
    pub age: u32,
    pub alive: bool,
    pub thought: String,
    pub infection: f32,
    pub fear_level: f32,
    pub carrying: u32,
    pub carrying_type: u8,
    pub pregnant: bool,
    pub partner_id: Option<String>,
    pub attracted_to: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory_count: Option<MemoryCount>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub learning: Option<LearningSummary>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attitudes: Option<HashMap<String, f32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub org_trust: Option<HashMap<String, f32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loneliness: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub boredom: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comfort: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grief_ticks: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub joy_ticks: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hope: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub awe: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gratitude: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub jealousy: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anger: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub regret: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub curiosity_drive: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spiritual: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aspiration: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sleep_debt: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children_count: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub conversation_count: Option<usize>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub father_id: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lineage_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_age: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sex: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub traits: Option<TraitsJson>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vocabulary: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discoveries: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_x: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_y: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_elder: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub friends: Option<HashMap<String, String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attributes: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor_events: Option<Vec<(u64, String, f32)>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<HashMap<String, u8>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_furniture: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub home_style_seed: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zodiac: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub birth_tick: Option<u64>,
}

#[derive(Serialize)]
pub struct LearningSummary {
    pub states: usize,
    pub tried_actions: usize,
    pub promising_states: usize,
    pub confidence: f32,
}

#[derive(Serialize)]
pub struct OrgDetailJson {
    #[serde(flatten)]
    pub base: OrgJson,
    pub thought_history: Vec<ThoughtJson>,
    pub vocabulary: HashMap<String, String>,
    pub life_log: Vec<LifeEventJson>,
    pub conversations: Vec<ConversationEntry>,
    pub memories: Vec<MemoryJson>,
}

#[derive(Serialize)]
pub struct MemoryJson {
    pub kind: String,
    pub text: String,
    pub salience: f32,
    pub emotion: i8,
    pub tick: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub related_id: Option<String>,
    pub recalls: u32,
}
