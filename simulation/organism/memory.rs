use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize)]
pub enum MemoryKind {
    Core,
    Episode,
    Fact,
    Bond,
    Place,
    Dream,
}

impl MemoryKind {
    pub fn label(self) -> &'static str {
        match self {
            MemoryKind::Core => "core",
            MemoryKind::Episode => "episode",
            MemoryKind::Fact => "fact",
            MemoryKind::Bond => "bond",
            MemoryKind::Place => "place",
            MemoryKind::Dream => "dream",
        }
    }

    pub fn from_label(s: &str) -> Self {
        match s {
            "core" => MemoryKind::Core,
            "episode" => MemoryKind::Episode,
            "fact" => MemoryKind::Fact,
            "bond" => MemoryKind::Bond,
            "place" => MemoryKind::Place,
            "dream" => MemoryKind::Dream,
            _ => MemoryKind::Episode,
        }
    }

    pub fn decay_per_day(self) -> f32 {
        match self {
            MemoryKind::Core => 0.0,
            MemoryKind::Fact => 0.001,
            MemoryKind::Bond => 0.003,
            MemoryKind::Place => 0.004,
            MemoryKind::Episode => 0.008,
            MemoryKind::Dream => 0.030,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MemoryEntry {
    pub kind: MemoryKind,
    pub text: String,
    pub salience: f32,
    pub emotion: i8,
    pub tick_formed: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub related_id: Option<String>,
    #[serde(default)]
    pub recall_count: u32,
}

impl MemoryEntry {
    pub fn new(kind: MemoryKind, text: impl Into<String>, tick: u64) -> Self {
        Self {
            kind,
            text: text.into(),
            salience: match kind {
                MemoryKind::Core => 1.0,
                MemoryKind::Fact => 0.7,
                MemoryKind::Bond => 0.75,
                MemoryKind::Place => 0.55,
                MemoryKind::Episode => 0.65,
                MemoryKind::Dream => 0.25,
            },
            emotion: 0,
            tick_formed: tick,
            related_id: None,
            recall_count: 0,
        }
    }

    pub fn with_emotion(mut self, emotion: i8) -> Self {
        self.emotion = emotion.clamp(-3, 3);
        self
    }

    pub fn with_salience(mut self, s: f32) -> Self {
        self.salience = s.clamp(0.0, 1.0);
        self
    }

    pub fn with_related(mut self, id: impl Into<String>) -> Self {
        self.related_id = Some(id.into());
        self
    }
}

#[derive(Default, Clone, Debug, Serialize, Deserialize)]
pub struct MemoryStore {
    pub entries: Vec<MemoryEntry>,
    #[serde(default)]
    pub last_decay_tick: u64,
}

impl MemoryStore {
    pub const MAX: usize = 64;
    const FLOOR: f32 = 0.02;
    const DEDUP_WINDOW: usize = 16;

    pub fn insert(&mut self, e: MemoryEntry) {
        if e.salience <= 0.0 {
            return;
        }
        if let MemoryKind::Episode | MemoryKind::Place | MemoryKind::Bond | MemoryKind::Dream = e.kind {
            let n = self.entries.len();
            let start = n.saturating_sub(Self::DEDUP_WINDOW);
            for existing in self.entries[start..].iter_mut() {
                if existing.kind == e.kind && existing.text == e.text {
                    existing.salience = (existing.salience + e.salience * 0.5).min(1.0);
                    existing.recall_count = existing.recall_count.saturating_add(1);
                    return;
                }
            }
        }
        self.entries.push(e);
        if self.entries.len() > Self::MAX {
            let cap = Self::MAX;
            self.entries.sort_by(|a, b| {
                b.salience
                    .partial_cmp(&a.salience)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            self.entries.truncate(cap);
        }
    }

    pub fn tick(&mut self, tick: u64, day_length: u32, memory_strength: f32) {
        if self.last_decay_tick == 0 {
            self.last_decay_tick = tick;
            return;
        }
        if tick.saturating_sub(self.last_decay_tick) < day_length as u64 {
            return;
        }
        let days = tick.saturating_sub(self.last_decay_tick) as f32 / day_length.max(1) as f32;
        self.last_decay_tick = tick;
        let mind_keep = 0.6 + memory_strength.clamp(0.0, 1.0) * 0.4;
        for e in self.entries.iter_mut() {
            let emotion_brake = 1.0 - (e.emotion.unsigned_abs() as f32 * 0.18).min(0.72);
            let recall_brake = 1.0 / (1.0 + (e.recall_count as f32) * 0.12);
            let decay = e.kind.decay_per_day() * days * (2.0 - mind_keep) * emotion_brake * recall_brake;
            e.salience = (e.salience - decay).max(0.0);
        }
        self.entries
            .retain(|e| e.salience > Self::FLOOR || e.kind == MemoryKind::Core);
    }

    pub fn touch(&mut self, predicate: impl Fn(&MemoryEntry) -> bool, bump: f32) -> usize {
        let mut touched = 0;
        for e in self.entries.iter_mut() {
            if predicate(e) {
                e.salience = (e.salience + bump).min(1.0);
                e.recall_count = e.recall_count.saturating_add(1);
                touched += 1;
            }
        }
        touched
    }

    pub fn top(&self, n: usize) -> Vec<&MemoryEntry> {
        let mut v: Vec<&MemoryEntry> = self.entries.iter().collect();
        v.sort_by(|a, b| {
            b.salience
                .partial_cmp(&a.salience)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        v.truncate(n);
        v
    }

    pub fn most_salient(&self) -> Option<&MemoryEntry> {
        self.entries.iter().max_by(|a, b| {
            a.salience
                .partial_cmp(&b.salience)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    }

    pub fn most_salient_of(&self, kind: MemoryKind) -> Option<&MemoryEntry> {
        self.entries.iter().filter(|e| e.kind == kind).max_by(|a, b| {
            a.salience
                .partial_cmp(&b.salience)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    }

    pub fn recall_about(&self, related_id: &str) -> Option<&MemoryEntry> {
        self.entries
            .iter()
            .filter(|e| e.related_id.as_deref() == Some(related_id))
            .max_by(|a, b| {
                a.salience
                    .partial_cmp(&b.salience)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    }

    pub fn pick_for_reflection(&self, prefer_emotion: Option<bool>) -> Option<&MemoryEntry> {
        let candidates: Vec<&MemoryEntry> = self
            .entries
            .iter()
            .filter(|e| e.salience > 0.20)
            .filter(|e| match prefer_emotion {
                Some(true) => e.emotion.abs() >= 1,
                Some(false) => e.emotion == 0,
                None => true,
            })
            .collect();
        candidates.into_iter().max_by(|a, b| {
            a.salience
                .partial_cmp(&b.salience)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

pub fn seed_core_memories(tick: u64) -> Vec<MemoryEntry> {
    vec![
        MemoryEntry::new(MemoryKind::Core, "I am alive in this world.", tick).with_emotion(1),
        MemoryEntry::new(MemoryKind::Core, "The sun rises and the sun sets.", tick).with_emotion(0),
        MemoryEntry::new(MemoryKind::Core, "Other beings move around me.", tick).with_emotion(0),
        MemoryEntry::new(
            MemoryKind::Core,
            "Food keeps me strong; water keeps me well.",
            tick,
        )
        .with_emotion(0),
        MemoryEntry::new(MemoryKind::Core, "Danger hurts. Fire warms.", tick).with_emotion(0),
        MemoryEntry::new(MemoryKind::Core, "I can choose what to do.", tick).with_emotion(1),
        MemoryEntry::new(MemoryKind::Core, "The world is real and I am part of it.", tick).with_emotion(1),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_memories_dont_decay() {
        let mut store = MemoryStore::default();
        for m in seed_core_memories(0) {
            store.insert(m);
        }
        store.tick(10_000, 600, 0.5);
        assert!(store
            .entries
            .iter()
            .all(|e| e.kind != MemoryKind::Core || e.salience >= 0.95));
    }

    #[test]
    fn dreams_decay_fast() {
        let mut store = MemoryStore::default();
        store.last_decay_tick = 1;
        store.insert(MemoryEntry::new(MemoryKind::Dream, "a strange flash", 1));
        store.tick(1 + 5 * 600, 600, 0.5);
        let dream = store.entries.iter().find(|e| e.kind == MemoryKind::Dream);
        if let Some(d) = dream {
            assert!(d.salience < 0.2, "dream should decay quickly, got {}", d.salience);
        }
    }

    #[test]
    fn insert_deduplicates_episodes() {
        let mut store = MemoryStore::default();
        store.insert(MemoryEntry::new(MemoryKind::Episode, "saw a wolf", 100));
        store.insert(MemoryEntry::new(MemoryKind::Episode, "saw a wolf", 200));
        assert_eq!(store.entries.len(), 1);
        assert!(store.entries[0].recall_count >= 1);
    }

    #[test]
    fn capacity_keeps_high_salience() {
        let mut store = MemoryStore::default();
        let total = MemoryStore::MAX + 20;
        let high_count = (0..total).filter(|i| i % 3 == 0).count();
        for i in 0..total {
            store.insert(
                MemoryEntry::new(MemoryKind::Episode, format!("event {}", i), i as u64)
                    .with_salience(if i % 3 == 0 { 0.9 } else { 0.1 }),
            );
        }
        assert!(store.entries.len() <= MemoryStore::MAX);
        let kept_high = store.entries.iter().filter(|e| e.salience >= 0.85).count();
        assert_eq!(
            kept_high, high_count,
            "all high-salience memories must survive truncation"
        );
    }
}
