use crate::sim::era::Era;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum GovernmentKind {
    Tribal,
    Chiefdom,
    Monarchy,
    Theocracy,
    Republic,
    Democracy,
    Empire,
    Federation,
    Corporate,
}

impl GovernmentKind {
    pub fn name(self) -> &'static str {
        match self {
            GovernmentKind::Tribal => "tribal",
            GovernmentKind::Chiefdom => "chiefdom",
            GovernmentKind::Monarchy => "monarchy",
            GovernmentKind::Theocracy => "theocracy",
            GovernmentKind::Republic => "republic",
            GovernmentKind::Democracy => "democracy",
            GovernmentKind::Empire => "empire",
            GovernmentKind::Federation => "federation",
            GovernmentKind::Corporate => "corporate",
        }
    }
    pub fn era_unlock(self) -> Era {
        match self {
            GovernmentKind::Tribal => Era::PreStone,
            GovernmentKind::Chiefdom => Era::Stone,
            GovernmentKind::Monarchy | GovernmentKind::Theocracy => Era::Iron,
            GovernmentKind::Republic => Era::Classical,
            GovernmentKind::Empire => Era::Classical,
            GovernmentKind::Democracy => Era::Renaissance,
            GovernmentKind::Federation => Era::Modern,
            GovernmentKind::Corporate => Era::Information,
        }
    }
    pub fn is_hereditary(self) -> bool {
        matches!(
            self,
            GovernmentKind::Monarchy | GovernmentKind::Empire | GovernmentKind::Chiefdom
        )
    }

    pub fn leader_count(self) -> u8 {
        match self {
            GovernmentKind::Tribal => 0,
            GovernmentKind::Chiefdom
            | GovernmentKind::Monarchy
            | GovernmentKind::Empire
            | GovernmentKind::Theocracy => 1,
            GovernmentKind::Republic => 3,
            GovernmentKind::Democracy | GovernmentKind::Federation => 5,
            GovernmentKind::Corporate => 7,
        }
    }
    pub fn default_tax_rate(self) -> f32 {
        match self {
            GovernmentKind::Tribal | GovernmentKind::Chiefdom => 0.02,
            GovernmentKind::Monarchy | GovernmentKind::Empire | GovernmentKind::Theocracy => 0.15,
            GovernmentKind::Republic => 0.10,
            GovernmentKind::Democracy | GovernmentKind::Federation => 0.20,
            GovernmentKind::Corporate => 0.08,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum LawKind {
    NoMurder,
    NoTheft,
    PropertyRights,
    Inheritance,
    Marriage,
    MilitaryService,
    Taxation,
    Education,
    Religion,
    Worship,
    FreedomOfSpeech,
    NoSlavery,
    EqualRights,
    SafetyNet,
    Healthcare,
    ChildLabour,
    EnvironmentalProtection,
    DigitalRights,
    Suffrage,
}

impl LawKind {
    pub fn name(self) -> &'static str {
        match self {
            LawKind::NoMurder => "no_murder",
            LawKind::NoTheft => "no_theft",
            LawKind::PropertyRights => "property_rights",
            LawKind::Inheritance => "inheritance",
            LawKind::Marriage => "marriage",
            LawKind::MilitaryService => "military_service",
            LawKind::Taxation => "taxation",
            LawKind::Education => "compulsory_education",
            LawKind::Religion => "state_religion",
            LawKind::Worship => "freedom_of_worship",
            LawKind::FreedomOfSpeech => "freedom_of_speech",
            LawKind::NoSlavery => "no_slavery",
            LawKind::EqualRights => "equal_rights",
            LawKind::SafetyNet => "safety_net",
            LawKind::Healthcare => "universal_healthcare",
            LawKind::ChildLabour => "child_labour_ban",
            LawKind::EnvironmentalProtection => "environmental_protection",
            LawKind::DigitalRights => "digital_rights",
            LawKind::Suffrage => "universal_suffrage",
        }
    }
    pub fn era_appearance(self) -> Era {
        match self {
            LawKind::NoMurder
            | LawKind::NoTheft
            | LawKind::Marriage
            | LawKind::Inheritance
            | LawKind::Worship => Era::PreStone,
            LawKind::PropertyRights | LawKind::Religion | LawKind::MilitaryService | LawKind::Taxation => {
                Era::Bronze
            }
            LawKind::Education | LawKind::FreedomOfSpeech => Era::Classical,
            LawKind::NoSlavery => Era::Renaissance,
            LawKind::SafetyNet
            | LawKind::Healthcare
            | LawKind::EqualRights
            | LawKind::ChildLabour
            | LawKind::Suffrage => Era::Modern,
            LawKind::EnvironmentalProtection | LawKind::DigitalRights => Era::Information,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Law {
    pub kind: LawKind,
    pub enacted_tick: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Government {
    pub lineage_id: String,
    pub kind: GovernmentKind,
    pub leader_id: Option<String>,
    pub council_ids: Vec<String>,
    pub established_tick: u64,
    pub laws: Vec<Law>,
    pub tax_rate: f32,
    pub treasury: u64,
    /// Income tax already withheld from current payroll but not yet remitted
    /// to the public treasury by an administrator or the next fiscal cycle.
    #[serde(default)]
    pub tax_receipts_pending: u64,
    pub conscription: bool,
}

impl Government {
    pub fn new(lineage_id: String, kind: GovernmentKind, tick: u64) -> Self {
        Government {
            lineage_id,
            kind,
            leader_id: None,
            council_ids: Vec::new(),
            established_tick: tick,
            laws: Vec::new(),
            tax_rate: kind.default_tax_rate(),
            treasury: 0,
            tax_receipts_pending: 0,
            conscription: false,
        }
    }

    pub fn pick_kind_for(era: Era, pop: usize, literacy_avg: f32) -> GovernmentKind {
        if era >= Era::Information && literacy_avg > 0.75 {
            return GovernmentKind::Federation;
        }
        if era >= Era::Modern && literacy_avg > 0.6 {
            return GovernmentKind::Democracy;
        }
        if era >= Era::Renaissance && literacy_avg > 0.4 {
            return GovernmentKind::Republic;
        }
        if era >= Era::Iron && pop > 40 {
            return GovernmentKind::Empire;
        }
        if era >= Era::Iron {
            return GovernmentKind::Monarchy;
        }
        if pop > 12 {
            return GovernmentKind::Chiefdom;
        }
        GovernmentKind::Tribal
    }

    /// Change the form of government without erasing the institutions the
    /// lineage already built. Laws, public funds, tax policy, and military
    /// policy survive constitutional changes; only offices that no longer
    /// exist are removed.
    pub fn transition_to(&mut self, kind: GovernmentKind, tick: u64) {
        self.kind = kind;
        self.established_tick = tick;
        let leader_count = usize::from(kind.leader_count());
        if leader_count == 0 {
            self.leader_id = None;
            self.council_ids.clear();
        } else {
            self.council_ids.truncate(leader_count.saturating_sub(1));
        }
    }

    /// Laws are simulation rules, not just historical labels. Keeping the
    /// lookup here gives the economy, education, and warfare systems one
    /// consistent source of truth.
    pub fn has_law(&self, kind: LawKind) -> bool {
        self.laws.iter().any(|law| law.kind == kind)
    }

    /// Governments cannot collect tax before their people have enacted a tax
    /// law. The clamp protects old or imported saves with out-of-range values.
    pub fn effective_tax_rate(&self) -> f32 {
        if self.has_law(LawKind::Taxation) {
            self.tax_rate.clamp(0.0, 0.5)
        } else {
            0.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn democracy_needs_renaissance() {
        let g = Government::pick_kind_for(Era::Renaissance, 50, 0.7);
        assert!(matches!(g, GovernmentKind::Republic | GovernmentKind::Empire));
    }

    #[test]
    fn tribal_for_small_groups() {
        let g = Government::pick_kind_for(Era::Stone, 6, 0.0);
        assert!(matches!(g, GovernmentKind::Tribal));
    }

    #[test]
    fn taxation_requires_an_enacted_law() {
        let mut g = Government::new("lineage".into(), GovernmentKind::Republic, 10);
        assert_eq!(g.effective_tax_rate(), 0.0);
        g.laws.push(Law {
            kind: LawKind::Taxation,
            enacted_tick: 20,
        });
        assert_eq!(g.effective_tax_rate(), g.tax_rate);
    }

    #[test]
    fn constitutional_transition_preserves_institutional_state() {
        let mut g = Government::new("lineage".into(), GovernmentKind::Republic, 10);
        g.leader_id = Some("leader".into());
        g.council_ids = vec!["council-a".into(), "council-b".into()];
        g.laws.push(Law {
            kind: LawKind::Taxation,
            enacted_tick: 20,
        });
        g.tax_rate = 0.17;
        g.treasury = 840;
        g.conscription = true;

        g.transition_to(GovernmentKind::Democracy, 100);

        assert_eq!(g.kind, GovernmentKind::Democracy);
        assert_eq!(g.established_tick, 100);
        assert_eq!(g.leader_id.as_deref(), Some("leader"));
        assert_eq!(g.council_ids.len(), 2);
        assert!(g.has_law(LawKind::Taxation));
        assert_eq!(g.tax_rate, 0.17);
        assert_eq!(g.treasury, 840);
        assert!(g.conscription);
    }
}
