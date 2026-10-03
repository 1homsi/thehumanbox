use super::*;

#[derive(Clone, Copy)]
pub(super) enum AgeGate {
    Child,
    TeenOrOlder,
    AdultOrElder,
    Elder,
}

#[derive(Clone, Copy)]
pub(super) enum SocialGate {
    None,
    Anyone,
    Kin,
    KinCount(u8),
    Stranger,
    KinAndStranger,
}

#[derive(Clone, Copy)]
pub(super) enum PlaceGate {
    Anywhere,
    BuildableLand,
    Home,
    WildLand,
    Water,
    BridgeSite,
    Rock,
    Fire,
    Hut,
    NearHut,
    HutOrRock,
    Workspace(Workspace),
    FireAndWorkspace(Workspace),
    ExperimentWorkspace(Workspace),
    HomeAndWater,
}

#[derive(Clone, Copy)]
pub(super) enum ResourceGate {
    None,
    Food,
    CarriedFood,
    Materials,
    BridgeMaterials,
    TradeGoods,
    Wealth,
    Wood,
    WoodAndStone,
    Stone,
    Metalworking,
}

#[derive(Clone, Copy)]
pub(super) enum Workspace {
    Any,
    Education,
    Trade,
    Industry,
    Worship,
    Civic,
    Military,
    Transport,
    Healthcare,
    Recreation,
    Research,
    Cafe,
    Fashion,
    Butchery,
    Brewery,
    Workshop,
    Forge,
    Textile,
    Arts,
    Writing,
    Craft,
    Jewelry,
    Technical,
    Postal,
}

pub(super) const WORKSPACE_KIND_COUNT: usize = Workspace::Postal as usize + 1;

pub(super) const ALL_WORKSPACES: [Workspace; WORKSPACE_KIND_COUNT] = [
    Workspace::Any,
    Workspace::Education,
    Workspace::Trade,
    Workspace::Industry,
    Workspace::Worship,
    Workspace::Civic,
    Workspace::Military,
    Workspace::Transport,
    Workspace::Healthcare,
    Workspace::Recreation,
    Workspace::Research,
    Workspace::Cafe,
    Workspace::Fashion,
    Workspace::Butchery,
    Workspace::Brewery,
    Workspace::Workshop,
    Workspace::Forge,
    Workspace::Textile,
    Workspace::Arts,
    Workspace::Writing,
    Workspace::Craft,
    Workspace::Jewelry,
    Workspace::Technical,
    Workspace::Postal,
];

#[derive(Clone, Copy)]
pub(super) enum QualificationMode {
    All,
    Any,
}

#[derive(Clone, Copy)]
pub(super) struct Qualification {
    pub(super) discoveries: &'static [&'static str],
    pub(super) all_discoveries: bool,
    pub(super) specialties: &'static [&'static str],
    pub(super) min_literacy: f32,
    pub(super) leader: bool,
    pub(super) any_specialty: bool,
    pub(super) mode: QualificationMode,
}

pub(super) const Q_NONE: Qualification = Qualification {
    discoveries: &[],
    all_discoveries: false,
    specialties: &[],
    min_literacy: 0.0,
    leader: false,
    any_specialty: false,
    mode: QualificationMode::All,
};

pub(super) const fn qualification(
    discoveries: &'static [&'static str],
    specialties: &'static [&'static str],
    min_literacy: f32,
) -> Qualification {
    Qualification {
        discoveries,
        all_discoveries: false,
        specialties,
        min_literacy,
        leader: false,
        any_specialty: false,
        mode: QualificationMode::All,
    }
}

pub(super) const fn qualification_all_discoveries(
    discoveries: &'static [&'static str],
    specialties: &'static [&'static str],
    min_literacy: f32,
) -> Qualification {
    Qualification {
        discoveries,
        all_discoveries: true,
        specialties,
        min_literacy,
        leader: false,
        any_specialty: false,
        mode: QualificationMode::All,
    }
}

pub(super) const fn qualification_any(
    discoveries: &'static [&'static str],
    specialties: &'static [&'static str],
    min_literacy: f32,
) -> Qualification {
    Qualification {
        discoveries,
        all_discoveries: false,
        specialties,
        min_literacy,
        leader: false,
        any_specialty: false,
        mode: QualificationMode::Any,
    }
}

pub(super) const fn leadership_qualification(specialties: &'static [&'static str]) -> Qualification {
    Qualification {
        discoveries: &[],
        all_discoveries: false,
        specialties,
        min_literacy: 0.0,
        leader: true,
        any_specialty: false,
        mode: QualificationMode::Any,
    }
}

pub(super) const fn leadership_with_all_requirements(
    discoveries: &'static [&'static str],
    specialties: &'static [&'static str],
    min_literacy: f32,
) -> Qualification {
    Qualification {
        discoveries,
        all_discoveries: true,
        specialties,
        min_literacy,
        leader: true,
        any_specialty: false,
        mode: QualificationMode::All,
    }
}

pub(super) const Q_ANY_SPECIALTY: Qualification = Qualification {
    any_specialty: true,
    ..Q_NONE
};

#[derive(Clone, Copy)]
pub(super) struct ActionBand {
    pub(super) start: usize,
    pub(super) end: usize,
    pub(super) min_era: Era,
    pub(super) age: AgeGate,
    pub(super) social: SocialGate,
    pub(super) place: PlaceGate,
    pub(super) resource: ResourceGate,
    pub(super) qualification: Qualification,
}

macro_rules! band {
    ($start:literal, $end:literal, $era:ident, $age:ident, $social:ident($count:literal), $place:expr, $resource:ident, $qualification:expr) => {
        ActionBand {
            start: $start,
            end: $end,
            min_era: Era::$era,
            age: AgeGate::$age,
            social: SocialGate::$social($count),
            place: $place,
            resource: ResourceGate::$resource,
            qualification: $qualification,
        }
    };
    ($start:literal, $end:literal, $era:ident, $age:ident, $social:ident, $place:expr, $resource:ident, $qualification:expr) => {
        ActionBand {
            start: $start,
            end: $end,
            min_era: Era::$era,
            age: AgeGate::$age,
            social: SocialGate::$social,
            place: $place,
            resource: ResourceGate::$resource,
            qualification: $qualification,
        }
    };
}
