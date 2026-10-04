use super::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CombatStyle {
    Brawl,
    Spear,
    Sword,
    Pike,
    Musket,
    Rifle,
    Modern,
}

impl CombatStyle {
    pub fn era_unlock(self) -> Era {
        match self {
            CombatStyle::Brawl => Era::PreStone,
            CombatStyle::Spear => Era::Stone,
            CombatStyle::Sword => Era::Bronze,
            CombatStyle::Pike => Era::Medieval,
            CombatStyle::Musket => Era::Renaissance,
            CombatStyle::Rifle => Era::Industrial,
            CombatStyle::Modern => Era::Modern,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            CombatStyle::Brawl => "brawl",
            CombatStyle::Spear => "spear",
            CombatStyle::Sword => "sword",
            CombatStyle::Pike => "pike",
            CombatStyle::Musket => "musket",
            CombatStyle::Rifle => "rifle",
            CombatStyle::Modern => "modern",
        }
    }
}

/// A temporary, lineage-owned fighting position created in the field. This is
/// separate from permanent buildings so digging in can matter without
/// pretending a complete wall was constructed instantly.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldFortification {
    pub x: i32,
    pub y: i32,
    pub lineage_id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BattleScale {
    Skirmish,
    Raid,
    Siege,
    Battle,
    War,
}

impl BattleScale {
    pub fn min_participants(self) -> usize {
        match self {
            BattleScale::Skirmish => 2,
            BattleScale::Raid => 6,
            BattleScale::Siege => 10,
            BattleScale::Battle => 20,
            BattleScale::War => 40,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            BattleScale::Skirmish => "skirmish",
            BattleScale::Raid => "raid",
            BattleScale::Siege => "siege",
            BattleScale::Battle => "battle",
            BattleScale::War => "war",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BattleOutcome {
    AttackerVictory,
    DefenderVictory,
    Stalemate,
}

impl BattleOutcome {
    pub fn name(self) -> &'static str {
        match self {
            BattleOutcome::AttackerVictory => "attacker_victory",
            BattleOutcome::DefenderVictory => "defender_victory",
            BattleOutcome::Stalemate => "stalemate",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Battle {
    pub id: String,
    pub attackers: Vec<String>,
    pub defenders: Vec<String>,
    pub attacker_orgs: Vec<String>,
    pub defender_orgs: Vec<String>,
    pub scale: BattleScale,
    pub location: (i32, i32),
    pub started_tick: u64,
    pub ended_tick: Option<u64>,
    pub casualties_a: u32,
    pub casualties_d: u32,
    pub outcome: Option<BattleOutcome>,
    pub initial_a: u32,
    pub initial_d: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum TreatyKind {
    NonAggression,
    Alliance,
    Trade,
    Defensive,
    Vassalage,
}

impl TreatyKind {
    pub fn name(self) -> &'static str {
        match self {
            TreatyKind::NonAggression => "non_aggression",
            TreatyKind::Alliance => "alliance",
            TreatyKind::Trade => "trade",
            TreatyKind::Defensive => "defensive",
            TreatyKind::Vassalage => "vassalage",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Treaty {
    pub lineage_a: String,
    pub lineage_b: String,
    pub kind: TreatyKind,
    pub signed_tick: u64,
    pub expires_tick: u64,
}

pub fn damage_multiplier(style: CombatStyle) -> f32 {
    match style {
        CombatStyle::Brawl => 1.0,
        CombatStyle::Spear => 1.4,
        CombatStyle::Sword => 1.8,
        CombatStyle::Pike => 2.0,
        CombatStyle::Musket => 3.0,
        CombatStyle::Rifle => 4.5,
        CombatStyle::Modern => 6.0,
    }
}
