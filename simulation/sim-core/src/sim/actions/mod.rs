pub mod agriculture;
pub mod agriculture_advanced;
pub mod animal_handling;
pub mod animal_husbandry;
pub mod architecture_design;
pub mod art_culture;
pub mod arts_performance;
pub mod barista_advanced;
pub mod beekeeping;
pub mod bio_action;
pub mod butchery;
pub mod cafe_work;
pub mod caretaking_advanced;
pub mod celestial_work;
pub mod ceramics_pottery;
pub mod ceremony;
pub mod childcare;
pub mod childhood;
pub mod communication;
pub mod community;
pub mod construction;
pub mod cooking;
pub mod cooking_world;
pub mod cosmic_arts;
pub mod cosmic_engineer;
pub mod courier;
pub mod court_politics;
pub mod crafting;
pub mod crafts_advanced;
pub mod creative_make;
pub mod crime_law;
pub mod ctx;
pub mod cyber_action;
pub mod deep_craft;
pub mod diplomacy;
pub mod distillation;
pub mod domestic;
pub mod dreamwork;
pub mod ecological;
pub mod economy;
pub mod education;
pub mod elder_life;
pub mod emergency_response;
pub mod emotion;
pub mod emotion_deep;
pub mod entertainment;
pub mod environment;
pub mod exploration;
pub mod family;
pub mod fashion;
pub mod festival_prep;
pub mod field_research;
pub mod fitness;
pub mod food_drink;
pub mod gardening;
pub mod glasswork;
pub mod governance;
pub mod historical_record;
pub mod hobbies;
pub mod home_decor;
pub mod industry;
pub mod infrastructure_work;
pub mod journalism;
pub mod knowledge;
pub mod leadership;
pub mod learning;
pub mod leatherwork;
pub mod legacy_death;
pub mod logistics;
pub mod martial;
pub mod martian_act;
pub mod masonry_work;
pub mod medicine;
pub mod medicine_care;
pub mod metalwork;
pub mod military_strategy;
pub mod modern_tech;
pub mod mountaineering;
pub mod mythmaking;
pub mod nature_walk;
pub mod negotiation;
pub mod oral_history;
pub mod orbital_act;
pub mod political_action;
pub mod profession;
pub mod relationships;
pub mod relationships_deep;
pub mod religion_expanded;
pub mod resources;
pub mod retail;
pub mod ritual_advanced;
pub mod scholarly;
pub mod science;
pub mod science_lab;
pub mod seafaring;
pub mod seasonal;
pub mod self_care;
pub mod self_improvement;
pub mod shadow_arts;
pub mod singularity_act;
pub mod social;
pub mod social_play;
pub mod spiritual;
pub mod spiritual_practice;
pub mod stargazing;
pub mod survival;
pub mod teaching_advanced;
pub mod tech_devops;
pub mod tech_use;
pub mod textiles;
pub mod theology;
pub mod trade_advanced;
pub mod transport;
pub mod travel_explore;
pub mod urban;
pub mod warfare;
pub mod water_sports;
pub mod woodwork;
pub mod work_trade;
pub mod xenobiology;

use super::simulation::Simulation;
use crate::sim::age_stage::AgeStage;
use crate::sim::era::Era;
use crate::sim::tech::buildings::{BuildingFunction, BuildingKind};
use crate::world::tiles::Tile;
use ctx::ActionCtx;

const ACTIONS_PER_BAND: usize = 8;

/// Return one stable nearby representative for each foreign lineage.
///
/// Spatial buckets are an implementation detail and must not decide who an
/// organism negotiates with. Prefer the closest living representative, then
/// use lineage, organism id, and index as deterministic tie breakers.
fn deterministic_foreign_partners(ctx: &ActionCtx) -> Vec<usize> {
    let mut partners: Vec<usize> = ctx
        .near
        .iter()
        .copied()
        .filter(|&index| {
            ctx.sim
                .organisms
                .get(index)
                .is_some_and(|organism| organism.alive && organism.lineage_id != ctx.lid)
        })
        .collect();

    partners.sort_unstable_by(|&left_index, &right_index| {
        let left = &ctx.sim.organisms[left_index];
        let right = &ctx.sim.organisms[right_index];
        let left_distance = (left.x - ctx.sx).abs() + (left.y - ctx.sy).abs();
        let right_distance = (right.x - ctx.sx).abs() + (right.y - ctx.sy).abs();

        left_distance
            .total_cmp(&right_distance)
            .then_with(|| left.lineage_id.cmp(&right.lineage_id))
            .then_with(|| left.id.cmp(&right.id))
            .then_with(|| left_index.cmp(&right_index))
    });

    let mut seen_lineages = std::collections::BTreeSet::new();
    partners.retain(|&index| seen_lineages.insert(ctx.sim.organisms[index].lineage_id.clone()));
    partners
}

#[derive(Clone, Copy)]
enum AgeGate {
    Child,
    TeenOrOlder,
    AdultOrElder,
    Elder,
}

#[derive(Clone, Copy)]
enum SocialGate {
    None,
    Anyone,
    Kin,
    KinCount(u8),
    Stranger,
    KinAndStranger,
}

#[derive(Clone, Copy)]
enum PlaceGate {
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
enum ResourceGate {
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
enum Workspace {
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

#[derive(Clone, Copy)]
enum QualificationMode {
    All,
    Any,
}

#[derive(Clone, Copy)]
struct Qualification {
    discoveries: &'static [&'static str],
    all_discoveries: bool,
    specialties: &'static [&'static str],
    min_literacy: f32,
    leader: bool,
    any_specialty: bool,
    mode: QualificationMode,
}

const Q_NONE: Qualification = Qualification {
    discoveries: &[],
    all_discoveries: false,
    specialties: &[],
    min_literacy: 0.0,
    leader: false,
    any_specialty: false,
    mode: QualificationMode::All,
};

const fn qualification(
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

const fn qualification_all_discoveries(
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

const fn qualification_any(
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

const fn leadership_qualification(specialties: &'static [&'static str]) -> Qualification {
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

const fn leadership_with_all_requirements(
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

const Q_ANY_SPECIALTY: Qualification = Qualification {
    any_specialty: true,
    ..Q_NONE
};

#[derive(Clone, Copy)]
struct ActionBand {
    start: usize,
    end: usize,
    min_era: Era,
    age: AgeGate,
    social: SocialGate,
    place: PlaceGate,
    resource: ResourceGate,
    qualification: Qualification,
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

// Base actions that represent institutions or formal knowledge use the same
// semantic gate at selection and execution time. Emotional actions remain
// broadly human; communication, science, religion, seasonal practice, and
// education unlock only when their named prerequisites exist in the world.
const BASE_ACTION_BANDS: &[ActionBand] = &[
    band!(
        38,
        38,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    // Construction is intentionally split by structure. A single broad
    // "has materials" check used to expose aqueducts, libraries, and
    // observatories alongside the first hut.
    band!(
        39,
        39,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Materials,
        qualification(&["masonry"], &["builder", "mason"], 0.0)
    ),
    band!(
        40,
        40,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::BuildableLand,
        None,
        qualification(&["shelter"], &["builder", "farmer"], 0.0)
    ),
    band!(
        41,
        41,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::BridgeSite,
        BridgeMaterials,
        qualification_all_discoveries(&["engineering", "masonry"], &["builder", "engineer"], 0.0)
    ),
    band!(
        42,
        42,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        Stone,
        qualification_all_discoveries(&["road_building", "wheel"], &["builder", "engineer"], 0.0)
    ),
    band!(
        43,
        43,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Wood,
        qualification(&["agriculture"], &["farmer", "builder"], 0.0)
    ),
    band!(
        44,
        44,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Materials,
        qualification(&["masonry"], &["builder", "officer"], 0.0)
    ),
    band!(
        45,
        45,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Water,
        Wood,
        qualification(&["navigation"], &["sailor", "carpenter"], 0.0)
    ),
    band!(
        46,
        46,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Wood,
        qualification(&["ritual"], &["priest", "artist"], 0.0)
    ),
    band!(
        47,
        47,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Stone,
        qualification(&["ritual"], &["priest", "builder"], 0.0)
    ),
    band!(
        48,
        48,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Wood,
        qualification(&["shelter", "agriculture"], &["builder", "farmer"], 0.0)
    ),
    band!(
        49,
        49,
        PreStone,
        AdultOrElder,
        None,
        PlaceGate::BuildableLand,
        Wood,
        qualification(&["foraging"], &[], 0.0)
    ),
    band!(
        50,
        50,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Materials,
        qualification(&["masonry", "warfare"], &["builder", "soldier", "officer"], 0.0)
    ),
    band!(
        166,
        166,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::BuildableLand,
        Materials,
        qualification(&["engineering", "tool_making"], &["builder", "engineer"], 0.0)
    ),
    band!(
        167,
        167,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Water,
        Materials,
        qualification_all_discoveries(&["engineering", "irrigation"], &["engineer", "mason"], 0.0)
    ),
    band!(
        168,
        168,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        Stone,
        qualification_all_discoveries(&["road_building", "masonry"], &["builder", "mason"], 0.0)
    ),
    band!(
        169,
        169,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["masonry"], &["builder", "carpenter"], 0.0)
    ),
    band!(
        170,
        170,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Fire,
        Stone,
        qualification(&["pottery", "smelting"], &["artist", "mason", "smith"], 0.0)
    ),
    band!(
        171,
        171,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Fire,
        Stone,
        qualification(&["smelting"], &["smith", "engineer"], 0.0)
    ),
    band!(
        172,
        172,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Materials,
        qualification(&["barter", "currency"], &["merchant", "builder"], 0.0)
    ),
    band!(
        173,
        173,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Home,
        Stone,
        qualification_all_discoveries(&["theater", "masonry"], &["builder", "mason", "artist"], 0.0)
    ),
    band!(
        174,
        174,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Wood,
        qualification_all_discoveries(&["writing", "chronicle"], &["scholar", "scribe", "builder"], 0.35)
    ),
    band!(
        175,
        175,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification_all_discoveries(&["astronomy", "mathematics"], &["scholar", "engineer"], 0.4)
    ),
    band!(
        176,
        176,
        Bronze,
        AdultOrElder,
        Anyone,
        PlaceGate::Home,
        Stone,
        qualification(&["faith", "ritual"], &["priest", "builder"], 0.0)
    ),
    band!(
        177,
        177,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::HomeAndWater,
        None,
        qualification_all_discoveries(&["agriculture", "irrigation"], &["farmer", "engineer"], 0.0)
    ),
    band!(
        178,
        178,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Water,
        Stone,
        qualification_all_discoveries(&["navigation", "masonry"], &["sailor", "mason"], 0.0)
    ),
    band!(
        179,
        179,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Rock,
        Wood,
        qualification_all_discoveries(&["fire", "language"], &["officer", "soldier"], 0.0)
    ),
    band!(
        180,
        180,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Wood,
        qualification(&["hunting", "food_preservation"], &["hunter", "carpenter"], 0.0)
    ),
    // Trade and government actions represent institutions, not generic social
    // impulses. Formal actions require the matching completed workplace.
    band!(
        276,
        276,
        Stone,
        AdultOrElder,
        Stranger,
        PlaceGate::Anywhere,
        TradeGoods,
        qualification(&["language"], &[], 0.0)
    ),
    band!(
        277,
        277,
        Bronze,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Trade),
        TradeGoods,
        qualification(&["barter"], &["merchant"], 0.0)
    ),
    band!(
        278,
        278,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Materials,
        qualification(&["barter"], &["merchant", "builder"], 0.0)
    ),
    band!(
        279,
        279,
        Bronze,
        AdultOrElder,
        Stranger,
        PlaceGate::Anywhere,
        TradeGoods,
        qualification(&["barter"], &["merchant"], 0.0)
    ),
    band!(
        280,
        280,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        TradeGoods,
        qualification(&["barter"], &["merchant"], 0.0)
    ),
    band!(
        281,
        281,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        None,
        qualification(&["barter"], &["merchant"], 0.0)
    ),
    band!(
        282,
        282,
        Medieval,
        AdultOrElder,
        KinCount(3),
        PlaceGate::Workspace(Workspace::Trade),
        None,
        qualification(&["currency"], &["merchant", "banker"], 0.0)
    ),
    band!(
        283,
        283,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Trade),
        TradeGoods,
        qualification(&["barter"], &["merchant"], 0.0)
    ),
    band!(
        284,
        284,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Wealth,
        qualification(&["currency"], &["merchant", "banker"], 0.0)
    ),
    band!(
        285,
        285,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        TradeGoods,
        qualification(&["barter"], &["merchant"], 0.0)
    ),
    band!(
        286,
        286,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Food,
        qualification(&["barter"], &["merchant"], 0.0)
    ),
    band!(
        287,
        287,
        Iron,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Trade),
        TradeGoods,
        qualification(&["navigation", "wheel", "currency"], &["merchant"], 0.0)
    ),
    band!(
        288,
        288,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Trade),
        // The route handler selects and consumes concrete cargo atomically;
        // a generic gate would reject tools/water or double-charge goods.
        None,
        qualification(&["currency"], &["merchant"], 0.0)
    ),
    band!(
        289,
        289,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Trade),
        None,
        qualification(&["currency"], &["merchant"], 0.0)
    ),
    band!(
        290,
        290,
        Iron,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Civic),
        Wealth,
        leadership_qualification(&["merchant", "politician"])
    ),
    band!(
        291,
        291,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Forge),
        Metalworking,
        qualification_all_discoveries(&["currency", "smelting"], &["smith", "banker"], 0.0)
    ),
    band!(
        292,
        292,
        Iron,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Trade),
        TradeGoods,
        qualification(&["currency"], &["merchant"], 0.0)
    ),
    band!(
        293,
        293,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Trade),
        None,
        qualification(&["currency"], &["merchant"], 0.0)
    ),
    band!(
        294,
        294,
        Classical,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["law_code", "currency"], &["merchant", "politician"], 0.35)
    ),
    band!(
        295,
        295,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["law_code", "currency"], &["banker", "politician"], 0.35)
    ),
    band!(
        296,
        301,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["writing", "law_code"], &["lawyer", "politician"], 0.4)
    ),
    band!(
        302,
        302,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Military),
        None,
        leadership_qualification(&["officer", "soldier"])
    ),
    band!(
        303,
        303,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["writing", "law_code"], &["lawyer", "politician"], 0.4)
    ),
    band!(
        304,
        304,
        Iron,
        AdultOrElder,
        KinCount(2),
        PlaceGate::Home,
        None,
        leadership_with_all_requirements(&["language", "writing"], &["politician", "priest"], 0.25)
    ),
    band!(
        305,
        306,
        Classical,
        AdultOrElder,
        KinCount(2),
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["writing", "law_code"], &["lawyer", "politician"], 0.4)
    ),
    band!(
        307,
        310,
        Classical,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(
            &["writing", "law_code"],
            &["lawyer", "politician", "officer"],
            0.4
        )
    ),
    band!(
        311,
        311,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["writing", "law_code"], &["lawyer", "politician"], 0.4)
    ),
    band!(
        312,
        312,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        leadership_with_all_requirements(&["ritual"], &["priest"], 0.0)
    ),
    band!(
        313,
        315,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["writing", "law_code"], &["lawyer", "politician"], 0.4)
    ),
    // Agriculture progresses from fields to processing and finally controlled
    // growing; the greenhouse cannot be reached from the generic food check.
    band!(
        336,
        340,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        341,
        342,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Food,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        343,
        343,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::NearHut,
        Food,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        344,
        344,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification_all_discoveries(&["agriculture", "plowing"], &["farmer"], 0.0)
    ),
    band!(
        345,
        345,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Wood,
        qualification(&["agriculture"], &["farmer", "builder"], 0.0)
    ),
    band!(
        346,
        347,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        348,
        348,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Food,
        qualification(&["food_preservation", "agriculture"], &["farmer"], 0.0)
    ),
    band!(
        349,
        349,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Industry),
        Food,
        qualification(&["agriculture"], &["farmer", "brewer"], 0.0)
    ),
    band!(
        350,
        350,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Food,
        qualification(&["agriculture"], &["farmer", "brewer"], 0.0)
    ),
    band!(
        351,
        351,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Fire,
        Food,
        qualification(&["brewing"], &["brewer"], 0.0)
    ),
    band!(
        352,
        352,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["agriculture", "herbalism"], &["farmer", "healer"], 0.0)
    ),
    band!(
        353,
        353,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Wood,
        qualification_all_discoveries(&["agriculture", "irrigation"], &["farmer", "builder"], 0.0)
    ),
    band!(
        354,
        354,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        Food,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        355,
        355,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Food,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    // Military doctrine uses a staged gate. Only basic organization can occur
    // before a military institution; siege engineering needs both materials.
    band!(
        436,
        436,
        Bronze,
        AdultOrElder,
        KinCount(3),
        PlaceGate::Anywhere,
        None,
        leadership_qualification(&["officer", "soldier"])
    ),
    band!(
        437,
        437,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        None,
        qualification(&["warfare", "tool_making"], &["officer", "soldier"], 0.0)
    ),
    band!(
        438,
        438,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Military),
        WoodAndStone,
        qualification_all_discoveries(&["engineering", "ironworking"], &["engineer", "officer"], 0.0)
    ),
    band!(
        439,
        439,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Rock,
        Materials,
        qualification(&["hunting", "warfare"], &["hunter", "soldier", "officer"], 0.0)
    ),
    band!(
        440,
        440,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::HutOrRock,
        Materials,
        qualification(&["warfare"], &["soldier", "officer", "builder"], 0.0)
    ),
    band!(
        441,
        441,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Military),
        Food,
        qualification(&["warfare"], &["soldier", "officer", "merchant"], 0.0)
    ),
    band!(
        442,
        442,
        Classical,
        AdultOrElder,
        KinAndStranger,
        PlaceGate::WildLand,
        None,
        qualification(&["warfare"], &["officer"], 0.0)
    ),
    band!(
        443,
        443,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::WildLand,
        Materials,
        qualification(&["warfare"], &["soldier", "officer", "builder"], 0.0)
    ),
    band!(
        444,
        444,
        Iron,
        AdultOrElder,
        KinCount(2),
        PlaceGate::Workspace(Workspace::Military),
        None,
        leadership_qualification(&["officer", "soldier"])
    ),
    band!(
        445,
        445,
        Medieval,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Military),
        None,
        qualification_all_discoveries(&["warfare", "animal_domestication"], &["officer", "soldier"], 0.0)
    ),
    band!(
        446,
        446,
        Medieval,
        AdultOrElder,
        Stranger,
        PlaceGate::Water,
        None,
        qualification_all_discoveries(&["warfare", "navigation"], &["officer", "sailor"], 0.0)
    ),
    band!(
        447,
        447,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Military),
        Materials,
        qualification_all_discoveries(&["warfare", "masonry"], &["officer", "soldier", "builder"], 0.0)
    ),
    band!(
        448,
        448,
        Classical,
        AdultOrElder,
        KinAndStranger,
        PlaceGate::Anywhere,
        None,
        qualification_all_discoveries(&["warfare", "writing"], &["officer"], 0.3)
    ),
    band!(
        449,
        449,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Rock,
        Materials,
        qualification(
            &["warfare", "tool_making"],
            &["officer", "soldier", "builder"],
            0.0
        )
    ),
    band!(
        450,
        450,
        Iron,
        AdultOrElder,
        Stranger,
        PlaceGate::WildLand,
        None,
        qualification(&["cartography", "warfare"], &["officer", "soldier"], 0.25)
    ),
    band!(
        451,
        451,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Military),
        WoodAndStone,
        qualification_all_discoveries(&["engineering", "ironworking"], &["engineer", "officer"], 0.0)
    ),
    band!(
        452,
        452,
        Medieval,
        AdultOrElder,
        KinAndStranger,
        PlaceGate::Water,
        None,
        qualification_all_discoveries(&["warfare", "navigation"], &["officer", "sailor"], 0.0)
    ),
    band!(
        453,
        453,
        Medieval,
        AdultOrElder,
        KinAndStranger,
        PlaceGate::Workspace(Workspace::Military),
        None,
        qualification_all_discoveries(&["warfare", "siege_weapon"], &["officer", "soldier"], 0.0)
    ),
    band!(
        454,
        454,
        Classical,
        AdultOrElder,
        Stranger,
        PlaceGate::Anywhere,
        None,
        qualification_all_discoveries(&["warfare", "writing"], &["officer"], 0.35)
    ),
    band!(
        455,
        455,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        qualification(&["warfare"], &["officer", "artist"], 0.0)
    ),
    band!(
        536,
        536,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        Wood,
        qualification_all_discoveries(
            &["animal_domestication", "agriculture"],
            &["farmer", "builder"],
            0.0
        )
    ),
    band!(
        537,
        537,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification(&["tool_making"], &["hunter", "officer", "builder"], 0.0)
    ),
    band!(
        67,
        67,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::ExperimentWorkspace(Workspace::Research),
        None,
        qualification(
            &["mathematics", "philosophy"],
            &["scholar", "engineer", "doctor"],
            0.4
        )
    ),
    band!(
        68,
        68,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["mathematics"], &["scholar", "priest"], 0.35)
    ),
    band!(
        70,
        70,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification_all_discoveries(&["writing", "geometry"], &["scholar", "scribe", "sailor"], 0.35)
    ),
    band!(
        386,
        405,
        PreStone,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        406,
        406,
        Iron,
        TeenOrOlder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification(&["language"], &[], 0.2)
    ),
    band!(
        407,
        407,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Anywhere,
        None,
        qualification(&["language", "writing"], &[], 0.0)
    ),
    band!(
        408,
        408,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Wood,
        qualification(&["writing"], &["scribe", "scholar"], 0.3)
    ),
    band!(
        409,
        409,
        Stone,
        TeenOrOlder,
        Stranger,
        PlaceGate::Anywhere,
        None,
        qualification(&["language"], &[], 0.0)
    ),
    band!(
        410,
        410,
        Stone,
        TeenOrOlder,
        Anyone,
        PlaceGate::Anywhere,
        None,
        qualification(&["language"], &[], 0.0)
    ),
    band!(
        411,
        411,
        PreStone,
        TeenOrOlder,
        Kin,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        412,
        412,
        PreStone,
        TeenOrOlder,
        Stranger,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        413,
        413,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Fire,
        Wood,
        qualification(&["smoke_signals", "signal_drums"], &[], 0.0)
    ),
    band!(
        414,
        414,
        Industrial,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Postal),
        None,
        qualification_all_discoveries(&["writing", "wheel"], &["merchant", "scribe"], 0.4)
    ),
    band!(
        415,
        415,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification(&["writing"], &["scribe", "mason"], 0.3)
    ),
    band!(
        416,
        416,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_with_all_requirements(&["writing", "law_code"], &["lawyer", "politician"], 0.4)
    ),
    band!(
        417,
        417,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        qualification(&["language", "cave_painting"], &[], 0.1)
    ),
    band!(
        418,
        418,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        None,
        qualification_all_discoveries(&["writing", "mathematics"], &["scribe", "scholar"], 0.5)
    ),
    band!(
        419,
        419,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        None,
        qualification(&["secret_code"], &["scribe", "scholar"], 0.5)
    ),
    band!(
        420,
        420,
        Stone,
        TeenOrOlder,
        Stranger,
        PlaceGate::Anywhere,
        None,
        qualification(&["language", "smoke_signals"], &[], 0.0)
    ),
    band!(
        421,
        421,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(
            &["mathematics", "philosophy"],
            &["scholar", "engineer", "doctor"],
            0.45
        )
    ),
    band!(
        422,
        422,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        None,
        qualification(&["writing"], &["scholar", "scribe"], 0.35)
    ),
    band!(
        423,
        423,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Wood,
        qualification(&["mathematics", "tool_making"], &["engineer", "scholar"], 0.35)
    ),
    band!(
        424,
        424,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["astronomy", "star_charts"], &["scholar"], 0.45)
    ),
    band!(
        425,
        425,
        Renaissance,
        Elder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification_all_discoveries(&["astronomy", "mathematics"], &["scholar"], 0.55)
    ),
    band!(
        426,
        426,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["writing"], &["scholar"], 0.4)
    ),
    band!(
        427,
        427,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification(&["engineering", "tool_making"], &["engineer", "smith"], 0.0)
    ),
    band!(
        428,
        428,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Workshop),
        Materials,
        qualification(&["tool_making"], &["carpenter", "smith", "engineer"], 0.0)
    ),
    band!(
        429,
        429,
        Renaissance,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["scientific_method"], &["scholar", "engineer", "doctor"], 0.5)
    ),
    band!(
        430,
        430,
        Renaissance,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["philosophy", "scientific_method"], &["scholar"], 0.5)
    ),
    band!(
        431,
        431,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::ExperimentWorkspace(Workspace::Research),
        None,
        qualification(
            &["mathematics", "philosophy"],
            &["scholar", "engineer", "doctor"],
            0.5
        )
    ),
    band!(
        432,
        432,
        Renaissance,
        Elder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(
            &["mathematics", "philosophy", "astronomy"],
            &["scholar", "engineer"],
            0.5
        )
    ),
    band!(
        433,
        433,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["scientific_method"], &["scholar", "doctor"], 0.5)
    ),
    band!(
        434,
        434,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["astronomy"], &["scholar"], 0.4)
    ),
    band!(
        435,
        435,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["calendar", "mathematics"], &["scholar"], 0.4)
    ),
    band!(
        456,
        456,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        None,
        qualification(&["ritual"], &["priest"], 0.0)
    ),
    band!(
        457,
        458,
        Stone,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual"], &["priest"], 0.0)
    ),
    band!(
        459,
        459,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification_all_discoveries(&["ritual", "writing"], &["priest"], 0.3)
    ),
    band!(
        460,
        460,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["ritual"], &["priest", "builder"], 0.0)
    ),
    band!(
        461,
        462,
        Stone,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual"], &["priest"], 0.0)
    ),
    band!(
        463,
        463,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["ritual"], &["priest"], 0.0)
    ),
    band!(
        464,
        464,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual"], &["priest"], 0.0)
    ),
    band!(
        465,
        465,
        Stone,
        TeenOrOlder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual_dance"], &["priest", "artist"], 0.0)
    ),
    band!(
        466,
        466,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["ritual"], &["priest"], 0.0)
    ),
    band!(
        467,
        467,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        leadership_with_all_requirements(&["ritual", "writing"], &["priest"], 0.35)
    ),
    band!(
        468,
        468,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification_all_discoveries(&["ritual", "philosophy"], &["priest", "scholar"], 0.35)
    ),
    band!(
        469,
        469,
        Medieval,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification_all_discoveries(&["ritual", "writing"], &["priest"], 0.4)
    ),
    band!(
        470,
        470,
        Classical,
        AdultOrElder,
        KinAndStranger,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual"], &["priest"], 0.25)
    ),
    band!(471, 471, Stone, TeenOrOlder, None, PlaceGate::Home, Food, Q_NONE),
    band!(
        472,
        472,
        PreStone,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        None,
        Q_NONE
    ),
    band!(
        473,
        474,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        475,
        476,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["calendar", "astronomy"], &["scholar", "priest"], 0.3)
    ),
    band!(
        477,
        477,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Food,
        qualification(&["food_preservation"], &["farmer", "hunter"], 0.0)
    ),
    band!(
        478,
        478,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Home,
        Wood,
        qualification(&["fire"], &[], 0.0)
    ),
    band!(
        479,
        479,
        PreStone,
        TeenOrOlder,
        None,
        PlaceGate::HomeAndWater,
        None,
        Q_NONE
    ),
    band!(
        480,
        480,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["hunting"], &["hunter"], 0.0)
    ),
    band!(
        481,
        481,
        PreStone,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["foraging"], &["farmer", "hunter"], 0.0)
    ),
    band!(
        482,
        482,
        Stone,
        TeenOrOlder,
        KinCount(2),
        PlaceGate::Hut,
        None,
        qualification(&["language"], &[], 0.0)
    ),
    band!(
        483,
        483,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification_all_discoveries(&["calendar", "ritual"], &["priest", "scholar"], 0.3)
    ),
    band!(
        484,
        484,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["calendar", "mathematics"], &["scholar"], 0.35)
    ),
    band!(
        485,
        485,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        None,
        qualification_all_discoveries(&["writing", "calendar"], &["scholar", "scribe"], 0.4)
    ),
    band!(
        501,
        501,
        Iron,
        AdultOrElder,
        KinCount(2),
        PlaceGate::Hut,
        None,
        qualification(&["writing"], &["teacher", "scholar"], 0.4)
    ),
    band!(
        502,
        503,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["writing"], &["teacher", "scholar"], 0.4)
    ),
    band!(
        504,
        504,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Wood,
        qualification(&["language"], &[], 0.25)
    ),
    band!(
        505,
        505,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Wood,
        qualification_all_discoveries(&["scroll_writing", "writing"], &["scribe", "scholar"], 0.4)
    ),
    band!(
        506,
        506,
        Iron,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        None,
        qualification(&["scroll_writing"], &[], 0.3)
    ),
    band!(
        507,
        507,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification(&["writing"], &["scribe", "scholar"], 0.4)
    ),
    band!(
        508,
        508,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Fire,
        None,
        qualification(&["scroll_writing"], &[], 0.2)
    ),
    band!(
        509,
        509,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["philosophy"], &["scholar", "teacher"], 0.4)
    ),
    band!(
        510,
        510,
        Renaissance,
        Elder,
        KinCount(3),
        PlaceGate::Hut,
        None,
        qualification_all_discoveries(&["writing", "philosophy"], &["scholar", "teacher"], 0.5)
    ),
    band!(
        511,
        511,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["writing"], &["teacher", "scholar"], 0.4)
    ),
    band!(
        512,
        512,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        None,
        Q_ANY_SPECIALTY
    ),
    band!(
        513,
        514,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["writing"], &["teacher", "scholar"], 0.4)
    ),
    band!(
        515,
        515,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["philosophy"], &["scholar", "priest"], 0.35)
    ),
    band!(
        516,
        516,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["philosophy", "ritual"], &["priest", "scholar"], 0.35)
    ),
    band!(
        517,
        517,
        Iron,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["writing"], &["teacher", "scholar"], 0.4)
    ),
    band!(
        518,
        518,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification_all_discoveries(&["writing", "paper"], &["scholar", "scribe"], 0.5)
    ),
    band!(
        519,
        519,
        Renaissance,
        Elder,
        Kin,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification_all_discoveries(&["writing", "printing"], &["teacher", "scholar"], 0.55)
    ),
    band!(
        520,
        520,
        Iron,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["language"], &["teacher", "scholar", "scribe"], 0.25)
    ),
];

// The generated action library is intentionally broad, but an action family
// only enters an organism's decision pool when its world and personal context
// support it. A rotating sample from each eligible family keeps every action
// reachable over time without constructing a 4,000-entry Vec for every agent
// on every tick.
const ACTION_BANDS: &[ActionBand] = &[
    band!(
        540,
        540,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["shelter"], &[], 0.0)
    ),
    band!(
        541,
        541,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::HomeAndWater,
        None,
        qualification(&["shelter"], &[], 0.0)
    ),
    band!(
        542,
        542,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification_all_discoveries(&["shelter", "weaving"], &[], 0.0)
    ),
    band!(
        543,
        543,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::HomeAndWater,
        None,
        qualification(&["pottery"], &[], 0.0)
    ),
    band!(
        544,
        544,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::HomeAndWater,
        None,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        545,
        547,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        548,
        548,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["shelter"], &[], 0.0)
    ),
    band!(
        549,
        549,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["smelting"], &["smith", "merchant"], 0.0)
    ),
    band!(
        550,
        551,
        Renaissance,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["glass"], &[], 0.0)
    ),
    band!(
        552,
        552,
        Modern,
        AdultOrElder,
        Kin,
        PlaceGate::HomeAndWater,
        None,
        qualification(&["automobile"], &["engineer"], 0.0)
    ),
    band!(
        553,
        554,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        555,
        556,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        Food,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        557,
        557,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        Wood,
        qualification(&["fire"], &[], 0.0)
    ),
    band!(
        558,
        558,
        Bronze,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Materials,
        qualification(&["smelting"], &["smith", "carpenter"], 0.0)
    ),
    band!(
        559,
        560,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Materials,
        qualification(&["shelter"], &["builder", "carpenter"], 0.0)
    ),
    band!(
        561,
        561,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Stone,
        qualification(&["tool_making"], &["hunter", "smith"], 0.0)
    ),
    band!(
        562,
        562,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["candle", "fire"], &[], 0.0)
    ),
    band!(
        563,
        563,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["pottery"], &[], 0.0)
    ),
    band!(
        564,
        564,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["shelter"], &[], 0.0)
    ),
    band!(
        565,
        565,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        566,
        566,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Fire,
        Wood,
        qualification(&["fire"], &[], 0.0)
    ),
    band!(
        567,
        567,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::HomeAndWater,
        None,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        568,
        569,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::HomeAndWater,
        None,
        qualification(&["pottery"], &[], 0.0)
    ),
    band!(
        570,
        571,
        Medieval,
        TeenOrOlder,
        Kin,
        PlaceGate::Fire,
        Food,
        qualification(&["cooking", "agriculture"], &["baker", "brewer", "farmer"], 0.0)
    ),
    band!(
        572,
        573,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Fire,
        Food,
        qualification(&["cooking"], &["baker"], 0.0)
    ),
    band!(
        574,
        575,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["shelter"], &[], 0.0)
    ),
    band!(
        576,
        578,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Fire,
        Wood,
        qualification(&["fire"], &[], 0.0)
    ),
    band!(
        579,
        580,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["shelter"], &["builder", "carpenter"], 0.0)
    ),
    band!(
        581,
        581,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        582,
        582,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["foraging"], &[], 0.0)
    ),
    band!(
        583,
        584,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["agriculture"], &["farmer"], 0.0)
    ),
    band!(
        585,
        588,
        Bronze,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        Food,
        qualification(&["animal_domestication"], &["farmer"], 0.0)
    ),
    band!(
        589,
        589,
        Stone,
        TeenOrOlder,
        Kin,
        PlaceGate::Home,
        None,
        qualification(&["shelter"], &[], 0.0)
    ),
    band!(
        600,
        649,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        660,
        710,
        Classical,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Any),
        None,
        Q_NONE
    ),
    band!(
        720,
        770,
        Classical,
        TeenOrOlder,
        Anyone,
        PlaceGate::Workspace(Workspace::Recreation),
        None,
        Q_NONE
    ),
    band!(
        780,
        830,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        None,
        Q_ANY_SPECIALTY
    ),
    band!(
        840,
        889,
        Modern,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        qualification(
            &["electricity", "radio", "automobile"],
            &["engineer", "programmer"],
            0.0
        )
    ),
    band!(
        900,
        949,
        PreStone,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        None,
        Q_NONE
    ),
    band!(
        960,
        1011,
        Iron,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        qualification(
            &["wheel", "railroad", "automobile", "airplane"],
            &["sailor", "engineer", "pilot"],
            0.0
        )
    ),
    band!(
        1020,
        1070,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        1080,
        1080,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Stone,
        qualification(&["pottery", "ceramics"], &["artist", "mason"], 0.0)
    ),
    band!(
        1081,
        1081,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Stone,
        qualification_all_discoveries(&["pottery", "pottery_glaze"], &["artist", "mason"], 0.0)
    ),
    band!(
        1082,
        1082,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Stone,
        qualification(&["pottery", "ceramics"], &["artist", "mason"], 0.0)
    ),
    band!(
        1083,
        1086,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Workshop),
        Wood,
        qualification(&["tool_making"], &["carpenter", "artist"], 0.0)
    ),
    band!(
        1087,
        1089,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Workshop),
        Materials,
        qualification(&["tool_making"], &["carpenter", "weaver"], 0.0)
    ),
    band!(
        1090,
        1090,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Workshop),
        Materials,
        qualification_all_discoveries(&["fire", "candle"], &["builder", "carpenter"], 0.0)
    ),
    band!(
        1091,
        1091,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        Wood,
        qualification(&["basket_weaving"], &["weaver"], 0.0)
    ),
    band!(
        1092,
        1092,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["weaving", "dye"], &["weaver"], 0.0)
    ),
    band!(
        1093,
        1093,
        Classical,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["weaving", "dye", "currency"], &["weaver"], 0.0)
    ),
    band!(
        1094,
        1094,
        Stone,
        TeenOrOlder,
        Anyone,
        PlaceGate::Home,
        None,
        Q_NONE
    ),
    band!(
        1095,
        1096,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        1097,
        1101,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Jewelry),
        Metalworking,
        qualification(&["smelting"], &["smith", "artist"], 0.0)
    ),
    band!(
        1102,
        1103,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Forge),
        Metalworking,
        qualification(&["ironworking"], &["smith"], 0.0)
    ),
    band!(
        1104,
        1104,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Workshop),
        Wood,
        qualification(&["tool_making"], &["carpenter"], 0.0)
    ),
    band!(
        1105,
        1105,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Forge),
        Metalworking,
        qualification(&["smelting"], &["smith"], 0.0)
    ),
    band!(
        1106,
        1107,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Stone,
        qualification(&["glass", "glassblowing"], &["smith", "artist"], 0.0)
    ),
    band!(
        1108,
        1109,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Materials,
        qualification_all_discoveries(&["fire", "candle"], &["artist", "builder"], 0.0)
    ),
    band!(
        1110,
        1110,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Craft),
        Materials,
        qualification(&["chemistry"], &["brewer", "artist"], 0.0)
    ),
    band!(
        1111,
        1112,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Craft),
        Materials,
        qualification(&["distillation"], &["brewer", "artist"], 0.0)
    ),
    band!(
        1113,
        1114,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Wood,
        qualification_all_discoveries(&["paper", "writing"], &["scribe"], 0.5)
    ),
    band!(
        1115,
        1117,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification_all_discoveries(&["paper", "writing", "printing"], &["scribe", "artist"], 0.5)
    ),
    band!(
        1118,
        1118,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification(&["cartography"], &["scholar", "scribe"], 0.4)
    ),
    band!(
        1119,
        1121,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification_all_discoveries(&["writing", "geometry"], &["builder", "engineer", "weaver"], 0.4)
    ),
    band!(
        1122,
        1122,
        Renaissance,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification(&["perspective_drawing"], &["artist"], 0.0)
    ),
    band!(
        1123,
        1123,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Stone,
        qualification(&["pottery"], &["artist", "mason"], 0.0)
    ),
    band!(
        1124,
        1124,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification(&["candle"], &["artist"], 0.0)
    ),
    band!(
        1125,
        1125,
        Renaissance,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification(&["perspective_drawing", "pigment_making"], &["artist"], 0.0)
    ),
    band!(
        1126,
        1127,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Forge),
        Metalworking,
        qualification(&["smelting"], &["smith"], 0.0)
    ),
    band!(
        1128,
        1129,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Forge),
        Metalworking,
        qualification(&["ironworking"], &["smith"], 0.0)
    ),
    band!(
        1130,
        1131,
        Iron,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification_all_discoveries(&["writing", "dye"], &["artist", "scribe"], 0.0)
    ),
    band!(
        1140,
        1189,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Fire,
        Food,
        qualification(&["fire", "cooking"], &["baker", "brewer"], 0.0)
    ),
    band!(
        1200,
        1201,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification(&["stone_tools"], &["hunter", "smith"], 0.0)
    ),
    band!(
        1202,
        1209,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Forge),
        Metalworking,
        qualification(&["ironworking"], &["smith"], 0.0)
    ),
    band!(
        1210,
        1210,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Wood,
        qualification(&["tool_making"], &["hunter", "carpenter"], 0.0)
    ),
    band!(
        1211,
        1211,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Wood,
        qualification_all_discoveries(&["tool_making", "weaving"], &["hunter", "carpenter"], 0.0)
    ),
    band!(
        1212,
        1212,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Wood,
        qualification(&["tool_making"], &["hunter", "carpenter"], 0.0)
    ),
    band!(
        1213,
        1213,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Forge),
        Metalworking,
        qualification(&["smelting"], &["smith", "hunter"], 0.0)
    ),
    band!(
        1214,
        1214,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Wood,
        qualification(&["tool_making"], &["hunter", "carpenter"], 0.0)
    ),
    band!(
        1215,
        1215,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Workshop),
        Wood,
        qualification_all_discoveries(&["tool_making", "weaving"], &["carpenter", "weaver"], 0.0)
    ),
    band!(
        1216,
        1218,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        1219,
        1219,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["weaving", "currency"], &["weaver"], 0.0)
    ),
    band!(
        1220,
        1224,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["weaving", "dye"], &["weaver", "artist"], 0.0)
    ),
    band!(
        1225,
        1225,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["weaving", "dye", "currency"], &["weaver", "artist"], 0.0)
    ),
    band!(
        1226,
        1227,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["weaving", "dye"], &["weaver", "artist"], 0.0)
    ),
    band!(
        1228,
        1229,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification_all_discoveries(&["writing", "paper"], &["scribe", "artist"], 0.5)
    ),
    band!(
        1230,
        1232,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        1233,
        1234,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Water,
        Materials,
        qualification_all_discoveries(&["weaving", "agriculture"], &["weaver"], 0.0)
    ),
    band!(
        1235,
        1237,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Water,
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        1238,
        1238,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        1239,
        1240,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification(&["perspective_drawing"], &["artist"], 0.0)
    ),
    band!(
        1241,
        1241,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification(&["pigment_making"], &["artist"], 0.0)
    ),
    band!(
        1242,
        1242,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification(&["oil_painting"], &["artist"], 0.0)
    ),
    band!(
        1243,
        1243,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification(&["dye"], &["artist"], 0.0)
    ),
    band!(
        1244,
        1244,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Stone,
        qualification(&["masonry"], &["artist", "mason"], 0.0)
    ),
    band!(
        1245,
        1248,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Stone,
        qualification(&["masonry"], &["mason", "builder"], 0.0)
    ),
    band!(
        1249,
        1249,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification_all_discoveries(&["paper", "printing"], &["artist", "scribe"], 0.5)
    ),
    band!(
        1260,
        1310,
        Stone,
        Child,
        Anyone,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        1260,
        1310,
        Stone,
        TeenOrOlder,
        Anyone,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        1320,
        1369,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        Food,
        qualification(&["medicine_lore", "herbalism"], &["healer", "doctor"], 0.0)
    ),
    band!(
        1380,
        1428,
        Stone,
        Child,
        Kin,
        PlaceGate::Anywhere,
        None,
        qualification_any(&["language", "writing"], &["teacher", "scholar", "scribe"], 0.15)
    ),
    band!(
        1380,
        1428,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Education),
        None,
        Q_NONE
    ),
    band!(
        1440,
        1489,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(
            &["cartography", "navigation", "wheel"],
            &["sailor", "pilot", "merchant"],
            0.0
        )
    ),
    band!(
        1500,
        1548,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual", "ritual_dance"], &["priest"], 0.0)
    ),
    band!(
        1560,
        1608,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_qualification(&["lawyer", "politician", "officer"])
    ),
    band!(
        1620,
        1668,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Home,
        Food,
        Q_NONE
    ),
    band!(
        1680,
        1729,
        Bronze,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Trade),
        None,
        qualification(&["barter", "currency"], &["merchant", "banker"], 0.0)
    ),
    band!(
        1740,
        1790,
        Iron,
        AdultOrElder,
        Stranger,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_qualification(&["lawyer", "officer", "soldier"])
    ),
    band!(
        1800,
        1849,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::Water,
        None,
        qualification(&["fishing", "navigation", "sail"], &["sailor"], 0.0)
    ),
    band!(
        1860,
        1909,
        Classical,
        TeenOrOlder,
        Anyone,
        PlaceGate::Workspace(Workspace::Recreation),
        None,
        qualification(&["drumming", "theater", "opera"], &["artist", "actor"], 0.0)
    ),
    band!(
        1920,
        1969,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        Food,
        qualification(&["agriculture", "farm", "irrigation"], &["farmer"], 0.0)
    ),
    band!(
        1980,
        2029,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        Food,
        qualification(
            &["hunting", "hunt", "animal_domestication"],
            &["hunter", "farmer"],
            0.0
        )
    ),
    band!(
        2040,
        2089,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Industry),
        Materials,
        qualification(
            &["factory", "steam_engine", "smelting"],
            &["engineer", "smith", "miner"],
            0.0
        )
    ),
    band!(
        2100,
        2149,
        Modern,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        qualification(
            &["electricity", "radio", "automobile"],
            &["engineer", "programmer"],
            0.0
        )
    ),
    band!(
        2160,
        2212,
        PreStone,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        None,
        Q_NONE
    ),
    band!(
        2220,
        2269,
        Stone,
        TeenOrOlder,
        Anyone,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        2280,
        2329,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        2340,
        2389,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        2400,
        2449,
        Renaissance,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        qualification(&["astronomy", "mathematics"], &["artist", "scholar"], 0.35)
    ),
    band!(
        2460,
        2509,
        Medieval,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual", "philosophy"], &["priest"], 0.0)
    ),
    band!(
        2520,
        2568,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual", "ritual_dance"], &["priest"], 0.0)
    ),
    band!(
        2580,
        2629,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Materials,
        qualification(
            &["masonry", "engineering", "gothic_architecture"],
            &["builder", "engineer", "mason"],
            0.0
        )
    ),
    band!(
        2640,
        2689,
        Iron,
        AdultOrElder,
        Anyone,
        PlaceGate::Anywhere,
        None,
        leadership_qualification(&["politician", "officer", "soldier"])
    ),
    band!(
        2700,
        2749,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Trade),
        None,
        qualification(&["currency", "trade"], &["merchant", "banker"], 0.0)
    ),
    band!(
        2760,
        2809,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Worship),
        None,
        qualification(&["ritual", "writing", "philosophy"], &["priest", "scholar"], 0.35)
    ),
    band!(
        2820,
        2869,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::Fire,
        Food,
        qualification(&["cooking"], &["baker", "brewer"], 0.0)
    ),
    band!(2880, 2929, Stone, TeenOrOlder, Kin, PlaceGate::Home, None, Q_NONE),
    band!(
        2940,
        2941,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Wood,
        qualification(&["shelter"], &["builder", "carpenter"], 0.0)
    ),
    band!(
        2942,
        2944,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        2945,
        2948,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        None,
        qualification(&["fire", "candle"], &[], 0.0)
    ),
    band!(
        2949,
        2949,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification_all_discoveries(&["glass", "smelting"], &["smith", "builder"], 0.0)
    ),
    band!(
        2950,
        2950,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["body_paint", "perspective_drawing"], &["artist"], 0.0)
    ),
    band!(
        2951,
        2951,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        2952,
        2952,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["perspective_drawing"], &["artist"], 0.0)
    ),
    band!(
        2953,
        2953,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        None,
        qualification(&["ritual"], &["priest", "artist"], 0.0)
    ),
    band!(
        2954,
        2954,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["glass"], &["smith", "artist"], 0.0)
    ),
    band!(
        2955,
        2955,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        Q_NONE
    ),
    band!(
        2956,
        2956,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        2957,
        2959,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["smelting", "pottery"], &["smith", "artist"], 0.0)
    ),
    band!(
        2960,
        2964,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        None,
        qualification(&["foraging", "herbalism"], &[], 0.0)
    ),
    band!(
        2965,
        2969,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        None,
        Q_NONE
    ),
    band!(
        2970,
        2974,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        None,
        qualification_all_discoveries(&["beekeeping", "candle"], &[], 0.0)
    ),
    band!(
        2975,
        2978,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["smelting"], &["builder", "carpenter"], 0.0)
    ),
    band!(
        2979,
        2979,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Home,
        Materials,
        qualification(&["engineering"], &["smith", "engineer"], 0.0)
    ),
    band!(
        2980,
        2987,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Home,
        None,
        Q_NONE
    ),
    band!(
        2988,
        2989,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::HomeAndWater,
        None,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        3000,
        3049,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(
            &["writing", "mathematics", "philosophy"],
            &["scholar", "scribe", "teacher"],
            0.45
        )
    ),
    band!(
        3060,
        3109,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["astronomy"], &["scholar", "engineer"], 0.45)
    ),
    band!(
        3120,
        3169,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        None,
        qualification(&["language", "ritual"], &["priest", "artist"], 0.0)
    ),
    band!(
        3180,
        3229,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Transport),
        None,
        qualification(
            &["wheel", "trade", "railroad"],
            &["merchant", "engineer", "officer"],
            0.0
        )
    ),
    band!(
        3240,
        3289,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        None,
        qualification(&["language", "writing"], &["scholar", "scribe", "teacher"], 0.25)
    ),
    band!(
        3300,
        3349,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Materials,
        qualification(
            &["masonry", "engineering", "gothic_architecture"],
            &["builder", "engineer", "mason"],
            0.0
        )
    ),
    band!(
        3360,
        3409,
        Classical,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["writing"], &["teacher", "scholar", "scribe"], 0.45)
    ),
    band!(
        3420,
        3469,
        Stone,
        AdultOrElder,
        Kin,
        PlaceGate::Anywhere,
        Food,
        qualification(&["medicine_lore", "herbalism"], &["healer", "doctor"], 0.0)
    ),
    band!(
        3480,
        3482,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification(&["printing"], &["artist", "scribe"], 0.0)
    ),
    band!(
        3483,
        3485,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Craft),
        Materials,
        qualification_all_discoveries(&["printing", "chemistry"], &["artist", "smith"], 0.0)
    ),
    band!(
        3486,
        3486,
        Atomic,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Technical),
        Materials,
        qualification_all_discoveries(&["electricity", "chemistry"], &["engineer"], 0.0)
    ),
    band!(
        3487,
        3487,
        Information,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Technical),
        Materials,
        qualification_all_discoveries(&["electricity", "microchip"], &["engineer"], 0.0)
    ),
    band!(
        3488,
        3489,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Industry),
        Materials,
        qualification_all_discoveries(&["factory", "chemistry"], &["engineer", "smith"], 0.0)
    ),
    band!(
        3490,
        3499,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification_all_discoveries(&["printing", "paper"], &["scribe", "artist"], 0.5)
    ),
    band!(
        3500,
        3510,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["printing", "chemistry"], &["artist", "weaver"], 0.0)
    ),
    band!(
        3511,
        3515,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Technical),
        Materials,
        qualification(&["chemistry"], &["artist", "engineer"], 0.0)
    ),
    band!(
        3516,
        3516,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Arts),
        Materials,
        qualification(&["oil_painting", "pigment_making"], &["artist"], 0.0)
    ),
    band!(
        3517,
        3517,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification_all_discoveries(&["weaving", "dye"], &["weaver"], 0.0)
    ),
    band!(
        3518,
        3518,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Stone,
        qualification_all_discoveries(&["pottery_glaze", "ceramics"], &["artist", "mason"], 0.0)
    ),
    band!(
        3519,
        3520,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Textile),
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        3521,
        3521,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Writing),
        Materials,
        qualification(&["printing"], &["scribe", "artist"], 0.0)
    ),
    band!(
        3522,
        3522,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::FireAndWorkspace(Workspace::Craft),
        Stone,
        qualification(&["ceramics"], &["artist", "mason"], 0.0)
    ),
    band!(
        3523,
        3523,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Craft),
        Materials,
        qualification(&["chemistry"], &["carpenter", "artist"], 0.0)
    ),
    band!(
        3524,
        3524,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Craft),
        Materials,
        qualification(&["glass", "ceramics"], &["artist"], 0.0)
    ),
    band!(
        3525,
        3525,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Technical),
        Materials,
        qualification(&["chemistry"], &["engineer"], 0.0)
    ),
    band!(
        3540,
        3589,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        Food,
        qualification(&["agriculture", "farm"], &["farmer"], 0.0)
    ),
    band!(
        3600,
        3649,
        Classical,
        TeenOrOlder,
        Anyone,
        PlaceGate::Home,
        Materials,
        qualification(&["ritual", "drumming", "opera"], &["artist", "priest"], 0.0)
    ),
    band!(
        3660,
        3709,
        Bronze,
        TeenOrOlder,
        Stranger,
        PlaceGate::Anywhere,
        None,
        qualification(
            &["tool_making", "ironworking"],
            &["soldier", "hunter", "officer"],
            0.0
        )
    ),
    band!(
        3720,
        3769,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Rock,
        Stone,
        qualification(&["masonry", "stone_tools"], &["mason", "builder"], 0.0)
    ),
    band!(
        3780,
        3829,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Wood,
        qualification(&["wood", "tool_making"], &["carpenter", "builder"], 0.0)
    ),
    band!(
        3840,
        3889,
        Iron,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Industry),
        Stone,
        qualification(&["smelting", "ironworking"], &["smith", "miner"], 0.0)
    ),
    band!(
        3900,
        3949,
        Classical,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Industry),
        Materials,
        qualification(&["glass", "glassblowing"], &["smith", "artist"], 0.0)
    ),
    band!(
        3960,
        4009,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        Materials,
        qualification(&["weaving"], &["weaver"], 0.0)
    ),
    band!(
        4020,
        4069,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Anywhere,
        None,
        qualification(&["leather", "leatherwork", "hunting"], &["hunter"], 0.0)
    ),
    band!(
        4080,
        4124,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Fire,
        Stone,
        qualification(&["pottery", "ceramics"], &["artist", "mason"], 0.0)
    ),
    band!(
        4140,
        4189,
        Industrial,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(
            &["scientific_method", "electricity"],
            &["scholar", "engineer", "doctor"],
            0.55
        )
    ),
    band!(
        4200,
        4249,
        Renaissance,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(
            &["scientific_method", "cartography"],
            &["scholar", "doctor", "engineer"],
            0.4
        )
    ),
    band!(
        4260,
        4309,
        Cyber,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(
            &["cybernetics", "neural_interface"],
            &["programmer", "engineer"],
            0.6
        )
    ),
    band!(
        4320,
        4369,
        Genetic,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(
            &["genome_edit", "biotech"],
            &["doctor", "scholar", "engineer"],
            0.6
        )
    ),
    band!(
        4380,
        4429,
        Modern,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["scientific_method"], &["farmer", "scholar", "engineer"], 0.35)
    ),
    band!(
        4440,
        4489,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Rock,
        None,
        qualification(&["stone_tools", "tool_making"], &["hunter", "miner"], 0.0)
    ),
    band!(
        4500,
        4549,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Water,
        None,
        Q_NONE
    ),
    band!(
        4560,
        4609,
        Bronze,
        TeenOrOlder,
        None,
        PlaceGate::WildLand,
        None,
        qualification(&["astronomy", "star_charts"], &["scholar", "sailor"], 0.25)
    ),
    band!(
        4620,
        4669,
        Modern,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Healthcare),
        None,
        qualification(
            &["medicine_lore", "surgery", "germ_theory"],
            &["doctor", "healer", "officer"],
            0.0
        )
    ),
    band!(
        4680,
        4729,
        Classical,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Civic),
        None,
        leadership_qualification(&["politician", "lawyer", "officer"])
    ),
    band!(
        4740,
        4789,
        Orbital,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Transport),
        None,
        qualification(&["orbital_ring", "space_elevator"], &["pilot", "engineer"], 0.6)
    ),
    band!(
        4800,
        4849,
        Martian,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(
            &["mars_colony", "terraforming"],
            &["pilot", "engineer", "scholar"],
            0.6
        )
    ),
    band!(
        4860,
        4910,
        Interstellar,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["biotech", "exoplanet"], &["doctor", "scholar"], 0.7)
    ),
    band!(
        4920,
        4969,
        Singularity,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(
            &["agi", "self_improvement", "transcend", "synthetic_mind"],
            &["programmer", "engineer", "scholar"],
            0.75
        )
    ),
    band!(
        4980,
        5029,
        Galactic,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Industry),
        None,
        qualification(&["dyson_swarm", "galactic_net"], &["engineer", "pilot"], 0.75)
    ),
    band!(
        5040,
        5089,
        Stone,
        TeenOrOlder,
        None,
        PlaceGate::Home,
        None,
        qualification(&["ritual", "language"], &["priest", "artist"], 0.0)
    ),
    band!(
        5100,
        5149,
        Iron,
        AdultOrElder,
        Stranger,
        PlaceGate::Anywhere,
        None,
        qualification(&["trade", "writing"], &["merchant", "lawyer", "politician"], 0.25)
    ),
    band!(
        5160,
        5209,
        Iron,
        AdultOrElder,
        Kin,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(&["writing"], &["scribe", "scholar", "journalist"], 0.45)
    ),
    band!(
        5220,
        5269,
        Iron,
        TeenOrOlder,
        None,
        PlaceGate::Anywhere,
        None,
        qualification(&["wheel", "writing"], &["merchant", "sailor", "pilot"], 0.0)
    ),
    band!(
        5280,
        5329,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::WildLand,
        Food,
        qualification(&["beekeeping", "agriculture"], &["farmer"], 0.0)
    ),
    band!(
        5340,
        5389,
        Modern,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Cafe),
        Food,
        qualification(&["cooking"], &["baker", "merchant"], 0.0)
    ),
    band!(
        5400,
        5449,
        Modern,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Cafe),
        Food,
        qualification(&["brewing", "cooking"], &["baker", "brewer", "merchant"], 0.0)
    ),
    band!(
        5460,
        5509,
        Modern,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Trade),
        None,
        qualification(&["currency"], &["merchant", "banker"], 0.0)
    ),
    band!(
        5520,
        5569,
        Information,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Research),
        None,
        qualification(&["computer", "internet"], &["programmer", "engineer"], 0.5)
    ),
    band!(
        5580,
        5629,
        PreStone,
        Child,
        None,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        5640,
        5689,
        PreStone,
        Elder,
        None,
        PlaceGate::Anywhere,
        None,
        Q_NONE
    ),
    band!(
        5700,
        5749,
        Renaissance,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Education),
        None,
        qualification(
            &["writing", "printing"],
            &["journalist", "scribe", "scholar"],
            0.5
        )
    ),
    band!(
        5760,
        5809,
        Bronze,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Fashion),
        Materials,
        qualification(&["weaving"], &["weaver", "artist"], 0.0)
    ),
    band!(
        5820,
        5869,
        Stone,
        AdultOrElder,
        None,
        PlaceGate::Workspace(Workspace::Butchery),
        CarriedFood,
        qualification(&["hunting", "hunt"], &["hunter"], 0.0)
    ),
    band!(
        5880,
        5929,
        Bronze,
        AdultOrElder,
        Anyone,
        PlaceGate::Workspace(Workspace::Brewery),
        Food,
        qualification(&["brewing"], &["brewer"], 0.0)
    ),
];

#[derive(Clone, Copy)]
struct EligibilityContext {
    kin_near: bool,
    kin_count: usize,
    stranger_near: bool,
    near_water: bool,
    near_rock: bool,
    near_fire: bool,
    near_home: bool,
    wild_land: bool,
    has_food: bool,
    has_carried_food: bool,
    has_materials: bool,
    has_wood: bool,
    has_stone: bool,
}

fn stable_action_phase(id: &str, tick: u64) -> usize {
    let hash = id.bytes().fold(2_166_136_261u32, |hash, byte| {
        (hash ^ u32::from(byte)).wrapping_mul(16_777_619)
    });
    (u64::from(hash) + tick / 30) as usize
}

fn extend_rotating_candidates(actions: &mut Vec<usize>, candidates: &[usize], phase: usize) {
    let len = candidates.len();
    if len == 0 {
        return;
    }
    let take = ACTIONS_PER_BAND.min(len);
    let offset = phase % len;
    for step in 0..take {
        actions.push(candidates[(offset + step) % len]);
    }
}

fn qualifies(org: &crate::organism::organism::Organism, requirement: Qualification) -> bool {
    let mut active_gates = 0;
    let mut passed_gates = 0;

    if !requirement.discoveries.is_empty() {
        active_gates += 1;
        let has_discoveries = if requirement.all_discoveries {
            requirement
                .discoveries
                .iter()
                .all(|discovery| org.discoveries.contains(*discovery))
        } else {
            requirement
                .discoveries
                .iter()
                .any(|discovery| org.discoveries.contains(*discovery))
        };
        passed_gates += usize::from(has_discoveries);
    }

    if requirement.any_specialty || !requirement.specialties.is_empty() || requirement.leader {
        active_gates += 1;
        let has_specialty = org.specialty.as_deref().is_some_and(|specialty| {
            requirement.any_specialty || requirement.specialties.contains(&specialty)
        }) || (requirement.leader && org.is_leader);
        passed_gates += usize::from(has_specialty);
    }

    if requirement.min_literacy > 0.0 {
        active_gates += 1;
        passed_gates += usize::from(org.literacy >= requirement.min_literacy);
    }

    match requirement.mode {
        QualificationMode::All => passed_gates == active_gates,
        QualificationMode::Any => passed_gates > 0 || active_gates == 0,
    }
}

fn workspace_matches(kind: BuildingKind, workspace: Workspace) -> bool {
    use BuildingKind as BK;
    match workspace {
        Workspace::Any => true,
        Workspace::Education => kind.function() == BuildingFunction::Education,
        Workspace::Trade => kind.function() == BuildingFunction::Trade,
        Workspace::Industry => kind.function() == BuildingFunction::Industry,
        Workspace::Worship => kind.function() == BuildingFunction::Worship,
        Workspace::Civic => kind.function() == BuildingFunction::Civic,
        Workspace::Military => kind.function() == BuildingFunction::Military,
        Workspace::Transport => matches!(
            kind,
            BK::TrainStation
                | BK::Airport
                | BK::Port
                | BK::Dock
                | BK::Marina
                | BK::BusStop
                | BK::Spaceport
                | BK::OrbitalLift
                | BK::Hyperloop
                | BK::Maglev
        ),
        Workspace::Healthcare => kind.function() == BuildingFunction::Healthcare,
        Workspace::Recreation => kind.function() == BuildingFunction::Recreation,
        Workspace::Research => matches!(
            kind,
            BK::University
                | BK::Library
                | BK::Observatory
                | BK::ResearchLab
                | BK::Datacenter
                | BK::Cryolab
                | BK::NeuralHub
                | BK::AiCore
        ),
        Workspace::Cafe => matches!(kind, BK::Cafe | BK::Restaurant | BK::Bakery | BK::FoodCart),
        Workspace::Fashion => matches!(
            kind,
            BK::Tailor | BK::ClothingShop | BK::Cobbler | BK::Jeweler | BK::Studio
        ),
        Workspace::Butchery => matches!(kind, BK::Butcher | BK::Fishmonger | BK::Cheesemonger),
        Workspace::Brewery => matches!(kind, BK::Brewery | BK::Tavern | BK::Inn | BK::Vineyard),
        Workspace::Workshop => matches!(kind, BK::Workshop | BK::GuildHall),
        Workspace::Forge => matches!(kind, BK::Forge | BK::Smithy | BK::Goldsmith),
        Workspace::Textile => matches!(kind, BK::Workshop | BK::Tailor | BK::ClothingShop),
        Workspace::Arts => matches!(kind, BK::Workshop | BK::Studio | BK::ArtGallery),
        Workspace::Writing => matches!(kind, BK::Workshop | BK::Scribe | BK::Library | BK::BookStore),
        Workspace::Craft => matches!(kind, BK::Workshop | BK::Forge | BK::Smithy | BK::GuildHall),
        Workspace::Jewelry => matches!(kind, BK::Forge | BK::Smithy | BK::Goldsmith | BK::Jeweler),
        Workspace::Technical => {
            kind.function() == BuildingFunction::Industry
                || matches!(
                    kind,
                    BK::University
                        | BK::Library
                        | BK::Observatory
                        | BK::ResearchLab
                        | BK::Datacenter
                        | BK::Cryolab
                        | BK::NeuralHub
                        | BK::AiCore
                )
        }
        Workspace::Postal => matches!(kind, BK::PostOffice | BK::Scribe | BK::CityHall),
    }
}

fn near_complete_workspace(sim: &Simulation, lineage: &str, ix: i32, iy: i32, workspace: Workspace) -> bool {
    sim.buildings.iter().any(|building| {
        if !building.is_operational()
            || !workspace_matches(building.kind, workspace)
            || building
                .owner_lineage
                .as_deref()
                .is_some_and(|owner| owner != lineage)
        {
            return false;
        }
        let (width, height) = building.footprint();
        let nearest_x = ix.clamp(building.x, building.x + i32::from(width) - 1);
        let nearest_y = iy.clamp(building.y, building.y + i32::from(height) - 1);
        (nearest_x - ix).abs() + (nearest_y - iy).abs() <= 8
    })
}

fn near_hut(sim: &Simulation, lineage: &str, ix: i32, iy: i32) -> bool {
    (-1..=1).any(|dx| (-1..=1).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Hut)))
        || sim.buildings.iter().any(|building| {
            if !building.is_operational()
                || building.kind != BuildingKind::Hut
                || building
                    .owner_lineage
                    .as_deref()
                    .is_some_and(|owner| owner != lineage)
            {
                return false;
            }
            let (width, height) = building.footprint();
            let nearest_x = ix.clamp(building.x, building.x + i32::from(width) - 1);
            let nearest_y = iy.clamp(building.y, building.y + i32::from(height) - 1);
            (nearest_x - ix).abs() + (nearest_y - iy).abs() <= 1
        })
}

fn band_is_eligible(
    sim: &Simulation,
    idx: usize,
    ix: i32,
    iy: i32,
    band: ActionBand,
    era: Era,
    context: EligibilityContext,
) -> bool {
    let org = &sim.organisms[idx];
    if era < band.min_era || !qualifies(org, band.qualification) {
        return false;
    }

    let stage = org.age_stage();
    let age_ok = match band.age {
        AgeGate::Child => matches!(stage, AgeStage::Infant | AgeStage::Child),
        AgeGate::TeenOrOlder => matches!(stage, AgeStage::Teen | AgeStage::Adult | AgeStage::Elder),
        AgeGate::AdultOrElder => matches!(stage, AgeStage::Adult | AgeStage::Elder),
        AgeGate::Elder => stage == AgeStage::Elder || org.is_elder,
    };
    if !age_ok {
        return false;
    }

    let social_ok = match band.social {
        SocialGate::None => true,
        SocialGate::Anyone => context.kin_near || context.stranger_near,
        SocialGate::Kin => context.kin_near,
        SocialGate::KinCount(count) => context.kin_count >= usize::from(count),
        SocialGate::Stranger => context.stranger_near,
        SocialGate::KinAndStranger => context.kin_near && context.stranger_near,
    };
    if !social_ok {
        return false;
    }

    let place_ok = match band.place {
        PlaceGate::Anywhere => true,
        PlaceGate::BuildableLand => matches!(sim.grid.get(ix, iy), Tile::Grass | Tile::Sand | Tile::Snow),
        PlaceGate::Home => context.near_home,
        PlaceGate::WildLand => context.wild_land,
        PlaceGate::Water => context.near_water,
        PlaceGate::BridgeSite => {
            super::civ_tick::construction_site_is_valid(sim, BuildingKind::Bridge, ix, iy)
        }
        PlaceGate::Rock => context.near_rock,
        PlaceGate::Fire => context.near_fire,
        PlaceGate::Hut => matches!(sim.grid.get(ix, iy), Tile::Hut),
        PlaceGate::NearHut => near_hut(sim, &org.lineage_id, ix, iy),
        PlaceGate::HutOrRock => matches!(sim.grid.get(ix, iy), Tile::Hut) || context.near_rock,
        PlaceGate::Workspace(workspace) => near_complete_workspace(sim, &org.lineage_id, ix, iy, workspace),
        PlaceGate::FireAndWorkspace(workspace) => {
            context.near_fire && near_complete_workspace(sim, &org.lineage_id, ix, iy, workspace)
        }
        PlaceGate::ExperimentWorkspace(workspace) => {
            (context.near_fire || context.near_water)
                && near_complete_workspace(sim, &org.lineage_id, ix, iy, workspace)
        }
        PlaceGate::HomeAndWater => context.near_home && context.near_water,
    };
    if !place_ok {
        return false;
    }

    match band.resource {
        ResourceGate::None => true,
        ResourceGate::Food => context.has_food,
        ResourceGate::CarriedFood => context.has_carried_food,
        ResourceGate::Materials => context.has_materials,
        ResourceGate::BridgeMaterials => {
            super::civ_tick::lineage_can_afford_construction(sim, &org.lineage_id, BuildingKind::Bridge)
        }
        ResourceGate::TradeGoods => context.has_carried_food || context.has_materials || org.wealth > 0,
        ResourceGate::Wealth => org.wealth > 0,
        ResourceGate::Wood => context.has_wood,
        ResourceGate::WoodAndStone => context.has_wood && context.has_stone,
        ResourceGate::Stone => context.has_stone,
        ResourceGate::Metalworking => context.has_stone && org.wealth > 0,
    }
}

fn eligible_band_for_action(
    sim: &Simulation,
    idx: usize,
    action: usize,
    ix: i32,
    iy: i32,
    spatial: &crate::sim::spatial::SpatialIndex,
) -> Option<ActionBand> {
    let org = &sim.organisms[idx];
    if action_output_at_capacity(org, action) {
        return None;
    }
    let mut nearby = Vec::with_capacity(16);
    spatial.query_into(org.x as i32, org.y as i32, 6, &mut nearby);
    let mut kin_near = false;
    let mut kin_count = 0;
    let mut stranger_near = false;
    for other_index in nearby {
        if other_index == idx {
            continue;
        }
        let other = &sim.organisms[other_index];
        if !other.alive || (other.x - org.x).abs() + (other.y - org.y).abs() > 6.0 {
            continue;
        }
        if other.lineage_id == org.lineage_id {
            kin_near = true;
            kin_count += 1;
        } else {
            stranger_near = true;
        }
    }

    let tile = sim.grid.get(ix, iy);
    let near_water =
        (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Water)));
    let near_rock = [
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (1, -1),
        (-1, 1),
        (1, 1),
    ]
    .iter()
    .any(|&(dx, dy)| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Rock | Tile::Mineral));
    let near_fire = (-2i32..=2).any(|dx| {
        (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Fire | Tile::Campfire))
    });
    let context = EligibilityContext {
        kin_near,
        kin_count,
        stranger_near,
        near_water,
        near_rock,
        near_fire,
        near_home: (org.home_x - org.x).abs() + (org.home_y - org.y).abs() <= 10.0,
        wild_land: matches!(
            tile,
            Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash
        ),
        has_food: org.inv_food > 0 || matches!(tile, Tile::Food),
        has_carried_food: org.inv_food > 0,
        has_materials: org.inv_wood > 0 || org.inv_stone > 0,
        has_wood: org.inv_wood > 0,
        has_stone: org.inv_stone > 0,
    };
    let era = sim.era(&org.lineage_id);

    BASE_ACTION_BANDS
        .iter()
        .chain(ACTION_BANDS)
        .copied()
        .find(|band| {
            (band.start..=band.end).contains(&action)
                && band_is_eligible(sim, idx, ix, iy, *band, era, context)
        })
}

#[derive(Clone, Copy)]
struct ResourceSnapshot {
    food: u8,
    wood: u8,
    stone: u8,
    wealth: u32,
}

fn reserve_action_resource(
    sim: &mut Simulation,
    idx: usize,
    resource: ResourceGate,
) -> Option<ResourceSnapshot> {
    let org = &mut sim.organisms[idx];
    let snapshot = ResourceSnapshot {
        food: org.inv_food,
        wood: org.inv_wood,
        stone: org.inv_stone,
        wealth: org.wealth,
    };
    let reserved = match resource {
        ResourceGate::None => true,
        ResourceGate::Food if org.inv_food > 0 => {
            org.inv_food -= 1;
            true
        }
        ResourceGate::CarriedFood if org.inv_food > 0 => {
            org.inv_food -= 1;
            true
        }
        ResourceGate::Materials if org.inv_wood > 0 => {
            org.inv_wood -= 1;
            true
        }
        ResourceGate::Materials if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        ResourceGate::TradeGoods if org.inv_food > 0 => {
            org.inv_food -= 1;
            true
        }
        ResourceGate::TradeGoods if org.inv_wood > 0 => {
            org.inv_wood -= 1;
            true
        }
        ResourceGate::TradeGoods if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        ResourceGate::TradeGoods if org.wealth > 0 => {
            org.wealth -= 1;
            true
        }
        ResourceGate::Wealth if org.wealth > 0 => {
            org.wealth -= 1;
            true
        }
        ResourceGate::Wood if org.inv_wood > 0 => {
            org.inv_wood -= 1;
            true
        }
        ResourceGate::WoodAndStone if org.inv_wood > 0 && org.inv_stone > 0 => {
            org.inv_wood -= 1;
            org.inv_stone -= 1;
            true
        }
        ResourceGate::Stone if org.inv_stone > 0 => {
            org.inv_stone -= 1;
            true
        }
        ResourceGate::Metalworking if org.inv_stone > 0 && org.wealth > 0 => {
            org.inv_stone -= 1;
            org.wealth -= 1;
            true
        }
        _ => false,
    };
    reserved.then_some(snapshot)
}

fn restore_action_resource(sim: &mut Simulation, idx: usize, snapshot: ResourceSnapshot) {
    let org = &mut sim.organisms[idx];
    org.inv_food = snapshot.food;
    org.inv_wood = snapshot.wood;
    org.inv_stone = snapshot.stone;
    org.wealth = snapshot.wealth;
}

fn action_uses_atomic_reservation(action: usize) -> bool {
    matches!(
        action,
        1080..=1131 | 1200..=1249 | 2940..=2989 | 3480..=3525 | 5820..=5869
    )
}

/// Base actions with an immediate world effect use a deferred charge: their
/// contextual handler must succeed first, then the semantically declared
/// resource is consumed in the same simulation turn. Complex transfers,
/// construction projects, and crafting pipelines own their transaction in
/// their domain handler and are deliberately absent from this list.
fn action_uses_deferred_resource_charge(action: usize) -> bool {
    matches!(
        action,
        42 | 46
            | 50
            | 276
            | 287
            | 291
            | 292
            | 348
            | 354
            | 406
            | 408
            | 413
            | 415
            | 427
            | 428
            | 439
            | 440
            | 449
            | 471
            | 477
            | 478
            | 507
            | 518
    )
}

fn action_requires_semantic_validation(action: usize) -> bool {
    action >= 540
        || BASE_ACTION_BANDS
            .iter()
            .any(|band| (band.start..=band.end).contains(&action))
}

fn action_output_at_capacity(org: &crate::organism::organism::Organism, action: usize) -> bool {
    butchery::output_key(action)
        .is_some_and(|output| org.tools.get(output).copied().unwrap_or(0) >= butchery::OUTPUT_CAP)
}

pub fn available_actions(
    sim: &Simulation,
    idx: usize,
    ix: i32,
    iy: i32,
    spatial: &crate::sim::spatial::SpatialIndex,
) -> Vec<usize> {
    let org = &sim.organisms[idx];
    let tile = sim.grid.get(ix, iy);
    let (sx, sy) = (org.x, org.y);
    let lid = &org.lineage_id;

    let mut near_buf: Vec<usize> = Vec::with_capacity(16);
    spatial.query_into(sx as i32, sy as i32, 6, &mut near_buf);
    let mut kin_near = false;
    let mut kin_count = 0;
    let mut stranger_near = false;
    for &i in &near_buf {
        if i == idx {
            continue;
        }
        let o = &sim.organisms[i];
        if !o.alive || (o.x - sx).abs() + (o.y - sy).abs() > 6.0 {
            continue;
        }
        if o.lineage_id == *lid {
            kin_near = true;
            kin_count += 1;
        } else {
            stranger_near = true;
        }
    }
    let any_near = kin_near || stranger_near;
    let has_mats = org.inv_wood > 0 || org.inv_stone > 0;
    let has_food = org.inv_food > 0 || matches!(tile, Tile::Food);
    let near_water =
        (-2i32..=2).any(|dx| (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Water)));
    let near_rock = [
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (1, -1),
        (-1, 1),
        (1, 1),
    ]
    .iter()
    .any(|&(dx, dy)| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Rock | Tile::Mineral));
    let near_fire = (-2i32..=2).any(|dx| {
        (-2i32..=2).any(|dy| matches!(sim.grid.get(ix + dx, iy + dy), Tile::Fire | Tile::Campfire))
    });
    let near_home = (org.home_x - org.x).abs() + (org.home_y - org.y).abs() <= 10.0;
    let needs_low = org.energy < 0.5 || org.hydration < 0.5;

    let mut a: Vec<usize> = Vec::with_capacity(256);

    a.extend(0..=25);

    a.extend(26..=38);

    if has_mats || near_rock || near_water {
        a.extend(39..=50);
        a.extend(166..=180);
    }

    if org.energy > 0.30 {
        a.extend(51..=65);
        a.extend(151..=165);
    }

    a.push(66);
    a.push(69);
    a.extend(71..=79);
    a.extend(126..=140);

    if any_near {
        a.extend(80..=89);
    }

    if stranger_near || kin_near {
        a.extend(90..=95);
        a.extend(181..=190);
    }

    a.extend(100..=101);
    if stranger_near {
        a.extend([96, 97, 98, 99, 102, 103, 104, 105, 106].iter().copied());
    }
    a.extend(191..=200);

    a.extend(107..=116);
    a.extend(221..=225);

    a.extend(117..=125);
    a.extend(211..=220);

    if has_food {
        a.extend(141..=150);
    }

    a.extend(201..=210);

    if any_near {
        a.extend(226..=245);
    }

    a.extend(246..=260);

    if kin_near {
        a.extend(261..=275);
    }

    if any_near || org.inv_food > 0 || org.inv_wood > 0 {
        a.extend(276..=295);
    }

    // Governance/diplomacy 296-315. Half of them (declare_war,
    // sign_treaty, grant_citizenship, establish_borders) actually need
    // a stranger nearby; gating only on kin_near made them
    // unreachable unless kin and stranger happened to be in the same
    // 6-tile bubble. Open the mask to either condition.
    if kin_near || stranger_near {
        a.extend(296..=315);
    }

    a.extend(316..=335);

    if matches!(tile, Tile::Food | Tile::Grass) || has_food || needs_low {
        a.extend(336..=355);
    }

    a.extend(356..=370);

    a.extend(371..=385);

    if kin_near {
        a.extend(436..=455);
    }

    if org.is_elder || org.health < 0.40 || kin_near {
        a.extend(486..=500);
    }

    if kin_near {
        a.extend(521..=535);
    }

    a.extend(536..=537);
    let era = sim.era(lid);
    let context = EligibilityContext {
        kin_near,
        kin_count,
        stranger_near,
        near_water,
        near_rock,
        near_fire,
        near_home,
        wild_land: matches!(
            tile,
            Tile::Grass | Tile::Food | Tile::Sand | Tile::Snow | Tile::Ash
        ),
        has_food,
        has_carried_food: org.inv_food > 0,
        has_materials: has_mats,
        has_wood: org.inv_wood > 0,
        has_stone: org.inv_stone > 0,
    };
    let phase = stable_action_phase(&org.id, sim.tick_count);
    let mut semantically_eligible = std::collections::HashSet::new();
    for &band in BASE_ACTION_BANDS {
        if band_is_eligible(sim, idx, ix, iy, band, era, context) {
            a.extend(band.start..=band.end);
            semantically_eligible.extend(band.start..=band.end);
        }
    }
    let mut eligible_by_family = std::collections::BTreeMap::<usize, Vec<usize>>::new();
    for &band in ACTION_BANDS {
        if band_is_eligible(sim, idx, ix, iy, band, era, context) {
            let family = band.start / 60;
            debug_assert_eq!(family, band.end / 60);
            semantically_eligible.extend(band.start..=band.end);
            eligible_by_family
                .entry(family)
                .or_default()
                .extend(band.start..=band.end);
        }
    }

    for candidates in eligible_by_family.values_mut() {
        candidates.sort_unstable();
        candidates.dedup();
        extend_rotating_candidates(&mut a, candidates, phase);
    }

    let mut seen = std::collections::HashSet::with_capacity(a.len());
    a.retain(|action| {
        !action_output_at_capacity(org, *action)
            && (!action_requires_semantic_validation(*action) || semantically_eligible.contains(action))
            && agriculture::action_is_possible(sim, idx, *action, ix, iy, near_water)
            && religion_expanded::action_is_possible(sim, idx, *action, &near_buf, sim.tick_count)
            && crate::sim::civ::trade_routes::action_is_possible(sim, idx, *action, &near_buf)
            && (*action != 2704 || crate::sim::civ::trade_routes::can_dispatch_caravan(sim, idx))
            && seen.insert(*action)
    });

    a
}

fn workshop_bonus(sim: &Simulation, ix: i32, iy: i32, action: usize) -> f32 {
    use crate::sim::tech::buildings::BuildingKind as BK;
    let kinds: &[BK] = match action {
        5340..=5449 => &[BK::Cafe, BK::Restaurant, BK::Bakery],
        5460..=5509 => &[
            BK::Market,
            BK::MallShop,
            BK::Supermarket,
            BK::MarketStall,
            BK::Kiosk,
        ],
        5520..=5569 => &[BK::Datacenter, BK::OfficeTower, BK::ResearchLab, BK::Studio],
        5700..=5749 => &[BK::Library, BK::Scribe, BK::BookStore, BK::University],
        5760..=5809 => &[BK::Tailor, BK::ClothingShop, BK::Cobbler, BK::Jeweler],
        5820..=5869 => &[BK::Butcher, BK::Cheesemonger, BK::Fishmonger, BK::Smithy],
        5880..=5929 => &[BK::Brewery, BK::Tavern, BK::Inn, BK::Vineyard],
        _ => return 1.0,
    };
    let near = sim.buildings.iter().any(|b| {
        if !b.is_operational() || !kinds.contains(&b.kind) {
            return false;
        }
        let (fw, fh) = b.kind.footprint();
        let bx = b.x + fw as i32 / 2;
        let by = b.y + fh as i32 / 2;
        (bx - ix).abs() + (by - iy).abs() <= 7
    });
    if near {
        1.55
    } else {
        1.0
    }
}

fn category_for(action: usize) -> Option<&'static str> {
    Some(match action {
        5340..=5389 => "cafe_work",
        5400..=5449 => "barista_advanced",
        5460..=5509 => "retail",
        5520..=5569 => "tech_devops",
        5580..=5629 => "childhood",
        5640..=5689 => "elder_life",
        5700..=5749 => "journalism",
        5760..=5809 => "fashion",
        5820..=5869 => "butchery",
        5880..=5929 => "distillation",
        _ => return None,
    })
}

fn aspiration_bonus(aspiration: &str, action: usize) -> f32 {
    if aspiration.is_empty() {
        return 1.0;
    }
    let matches = match aspiration {
        "seeker" => {
            // Knowledge / science / exploration
            matches!(
                action,
                66..=79 | 117..=125 | 126..=140 | 211..=220 | 421..=435 | 1380..=1428 | 4140..=4189 | 4200..=4249 | 4560..=4609
            )
        }
        "wanderer" => {
            // Pure exploration
            matches!(action, 117..=125 | 211..=220 | 1440..=1489 | 4440..=4489 | 4500..=4549)
        }
        "warrior" => {
            // Combat / military
            matches!(action, 96..=106 | 191..=200 | 436..=455 | 3660..=3709 | 4620..=4669)
        }
        "connector" => {
            // Social / relationships / family
            matches!(action, 80..=89 | 226..=245 | 261..=275 | 1260..=1310 | 2220..=2269)
        }
        "builder" => {
            // Construction + craft + masonry
            matches!(
                action,
                39..=50 | 166..=180 | 51..=65 | 151..=165 | 1200..=1249 | 3480..=3525 | 3720..=3769 | 3780..=3829 | 3840..=3889
            )
        }
        "devout" => {
            // Spiritual + religion + ritual
            matches!(action, 201..=210 | 456..=470 | 1500..=1548 | 2520..=2568 | 2760..=2809)
        }
        "sage" => {
            // Teaching, education, scholarship
            matches!(action, 501..=520 | 3000..=3049 | 3240..=3289 | 3360..=3409)
        }
        "provider" => {
            matches!(action, 26..=38 | 141..=150 | 336..=355 | 356..=370 | 1140..=1189 | 1620..=1668 | 3420..=3469)
        }
        "artist" => {
            matches!(action, 316..=335 | 3120..=3169 | 3300..=3349 | 5160..=5209)
        }
        "healer" => {
            matches!(action, 246..=260 | 1320..=1369 | 3060..=3109 | 4920..=4969)
        }
        _ => false,
    };
    if matches {
        1.4
    } else {
        1.0
    }
}

fn specialty_bonus(org_specialty: Option<&str>, action: usize) -> f32 {
    let Some(spec) = org_specialty else { return 1.0 };
    let matches = match action {
        5340..=5449 => spec == "baker",
        5460..=5509 => spec == "merchant" || spec == "banker",
        5520..=5569 => spec == "programmer" || spec == "engineer",
        5700..=5749 => spec == "journalist" || spec == "scholar" || spec == "scribe",
        5760..=5809 => spec == "weaver",
        5820..=5869 => spec == "hunter" || spec == "farmer",
        5880..=5929 => spec == "brewer",
        336..=355 => spec == "farmer",
        356..=370 => spec == "hunter" || spec == "farmer",
        66..=79 | 126..=140 | 421..=435 => spec == "scholar" || spec == "scribe" || spec == "teacher",
        446..=455 | 96..=106 | 191..=200 => spec == "soldier" || spec == "officer",
        246..=260 => spec == "healer" || spec == "doctor",
        201..=210 | 456..=470 => spec == "priest",
        276..=295 => spec == "merchant" || spec == "banker",
        316..=335 => spec == "artist",
        _ => false,
    };
    if matches {
        1.4
    } else {
        1.0
    }
}

fn records_experiment(action: usize) -> bool {
    matches!(
        action,
        67 | 421 | 427 | 431
            | 4145..=4147
            | 4150..=4169
            | 4180..=4185
            | 4320..=4323
            | 4326..=4328
            | 4330..=4332
            | 4335..=4339
            | 4343..=4348
            | 4360..=4366
            | 4870..=4875
            | 4883..=4884
    )
}

pub fn try_apply(
    sim: &mut Simulation,
    idx: usize,
    action: usize,
    ix: i32,
    iy: i32,
    spatial: &crate::sim::spatial::SpatialIndex,
) -> Option<f32> {
    let semantic_requirement = if action_requires_semantic_validation(action) {
        Some(eligible_band_for_action(sim, idx, action, ix, iy, spatial)?)
    } else {
        None
    };
    if (456..=470).contains(&action) {
        let actor = sim.organisms.get(idx)?;
        let mut nearby_indices = Vec::with_capacity(16);
        spatial.query_into(actor.x as i32, actor.y as i32, 6, &mut nearby_indices);
        if !religion_expanded::action_is_possible(sim, idx, action, &nearby_indices, sim.tick_count) {
            return None;
        }
    }
    let reservation = if action_uses_atomic_reservation(action) {
        let requirement = semantic_requirement?;
        Some(reserve_action_resource(sim, idx, requirement.resource)?)
    } else {
        None
    };
    let deferred_resource = if action_uses_deferred_resource_charge(action) {
        semantic_requirement.map(|requirement| requirement.resource)
    } else {
        None
    };
    let bonus = workshop_bonus(sim, ix, iy, action);
    let spec_bonus = specialty_bonus(sim.organisms[idx].specialty.as_deref(), action);
    let asp_bonus = aspiration_bonus(&sim.organisms[idx].aspiration, action);
    if let Some(cat) = category_for(action) {
        *sim.action_counts.entry(cat).or_insert(0) += 1;
        if matches!(
            action,
            5340..=5449 | 5460..=5509 | 5520..=5569 | 5700..=5749 |
            5760..=5809 | 5820..=5869 | 5880..=5929
        ) {
            let entry = sim.workshop_hits.entry(cat).or_insert((0, 0));
            if bonus > 1.0 {
                entry.0 += 1;
            } else {
                entry.1 += 1;
            }
        }
    }
    let mut ctx = ActionCtx::new(sim, idx, ix, iy, spatial);
    let r = match action {
        26..=38 => resources::apply(action, &mut ctx),
        39..=50 => construction::apply(action, &mut ctx),
        51..=65 => crafting::apply(action, &mut ctx),
        66..=79 => knowledge::apply(action, &mut ctx),
        80..=89 => social::apply(action, &mut ctx),
        90..=95 => diplomacy::apply(action, &mut ctx),
        96..=106 => warfare::apply(action, &mut ctx),
        107..=116 => self_care::apply(action, &mut ctx),
        117..=125 => exploration::apply(action, &mut ctx),
        126..=140 => knowledge::apply(action, &mut ctx),
        141..=150 => cooking::apply(action, &mut ctx),
        151..=165 => crafting::apply(action, &mut ctx),
        166..=180 => construction::apply(action, &mut ctx),
        181..=190 => diplomacy::apply(action, &mut ctx),
        191..=200 => warfare::apply(action, &mut ctx),
        201..=210 => spiritual::apply(action, &mut ctx),
        211..=220 => exploration::apply(action, &mut ctx),
        221..=225 => self_care::apply(action, &mut ctx),
        226..=245 => relationships::apply(action, &mut ctx),
        246..=260 => medicine::apply(action, &mut ctx),
        261..=275 => family::apply(action, &mut ctx),
        276..=295 => economy::apply(action, &mut ctx),
        296..=315 => governance::apply(action, &mut ctx),
        316..=335 => art_culture::apply(action, &mut ctx),
        336..=355 => agriculture::apply(action, &mut ctx),
        356..=370 => animal_husbandry::apply(action, &mut ctx),
        371..=385 => environment::apply(action, &mut ctx),
        386..=405 => emotion::apply(action, &mut ctx),
        406..=420 => communication::apply(action, &mut ctx),
        421..=435 => science::apply(action, &mut ctx),
        436..=455 => military_strategy::apply(action, &mut ctx),
        456..=470 => religion_expanded::apply(action, &mut ctx),
        471..=485 => seasonal::apply(action, &mut ctx),
        486..=500 => legacy_death::apply(action, &mut ctx),
        501..=520 => education::apply(action, &mut ctx),
        521..=535 => ceremony::apply(action, &mut ctx),
        536..=537 => construction::apply(action, &mut ctx),
        540..=589 => domestic::apply(action, &mut ctx),
        600..=649 => hobbies::apply(action, &mut ctx),
        660..=710 => urban::apply(action, &mut ctx),
        720..=770 => entertainment::apply(action, &mut ctx),
        780..=830 => profession::apply(action, &mut ctx),
        840..=889 => modern_tech::apply(action, &mut ctx),
        900..=949 => nature_walk::apply(action, &mut ctx),
        960..=1011 => transport::apply(action, &mut ctx),
        1020..=1070 => fitness::apply(action, &mut ctx),
        1080..=1131 => creative_make::apply(action, &mut ctx),
        1140..=1189 => food_drink::apply(action, &mut ctx),
        1200..=1249 => crafts_advanced::apply(action, &mut ctx),
        1260..=1310 => social_play::apply(action, &mut ctx),
        1320..=1369 => medicine_care::apply(action, &mut ctx),
        1380..=1428 => learning::apply(action, &mut ctx),
        1440..=1489 => travel_explore::apply(action, &mut ctx),
        1500..=1548 => spiritual_practice::apply(action, &mut ctx),
        1560..=1608 => court_politics::apply(action, &mut ctx),
        1620..=1668 => childcare::apply(action, &mut ctx),
        1680..=1729 => work_trade::apply(action, &mut ctx),
        1740..=1790 => crime_law::apply(action, &mut ctx),
        1800..=1849 => seafaring::apply(action, &mut ctx),
        1860..=1909 => arts_performance::apply(action, &mut ctx),
        1920..=1969 => agriculture_advanced::apply(action, &mut ctx),
        1980..=2029 => animal_handling::apply(action, &mut ctx),
        2040..=2089 => industry::apply(action, &mut ctx),
        2100..=2149 => tech_use::apply(action, &mut ctx),
        2160..=2212 => survival::apply(action, &mut ctx),
        2220..=2269 => relationships_deep::apply(action, &mut ctx),
        2280..=2329 => self_improvement::apply(action, &mut ctx),
        2340..=2389 => emotion_deep::apply(action, &mut ctx),
        2400..=2449 => cosmic_arts::apply(action, &mut ctx),
        2460..=2509 => shadow_arts::apply(action, &mut ctx),
        2520..=2568 => ritual_advanced::apply(action, &mut ctx),
        2580..=2629 => architecture_design::apply(action, &mut ctx),
        2640..=2689 => leadership::apply(action, &mut ctx),
        2700..=2749 => trade_advanced::apply(action, &mut ctx),
        2760..=2809 => theology::apply(action, &mut ctx),
        2820..=2869 => cooking_world::apply(action, &mut ctx),
        2880..=2929 => community::apply(action, &mut ctx),
        2940..=2989 => home_decor::apply(action, &mut ctx),
        3000..=3049 => scholarly::apply(action, &mut ctx),
        3060..=3109 => celestial_work::apply(action, &mut ctx),
        3120..=3169 => mythmaking::apply(action, &mut ctx),
        3180..=3229 => logistics::apply(action, &mut ctx),
        3240..=3289 => oral_history::apply(action, &mut ctx),
        3300..=3349 => infrastructure_work::apply(action, &mut ctx),
        3360..=3409 => teaching_advanced::apply(action, &mut ctx),
        3420..=3469 => caretaking_advanced::apply(action, &mut ctx),
        3480..=3525 => deep_craft::apply(action, &mut ctx),
        3540..=3589 => gardening::apply(action, &mut ctx),
        3600..=3649 => festival_prep::apply(action, &mut ctx),
        3660..=3709 => martial::apply(action, &mut ctx),
        3720..=3769 => masonry_work::apply(action, &mut ctx),
        3780..=3829 => woodwork::apply(action, &mut ctx),
        3840..=3889 => metalwork::apply(action, &mut ctx),
        3900..=3949 => glasswork::apply(action, &mut ctx),
        3960..=4009 => textiles::apply(action, &mut ctx),
        4020..=4069 => leatherwork::apply(action, &mut ctx),
        4080..=4124 => ceramics_pottery::apply(action, &mut ctx),
        4140..=4189 => science_lab::apply(action, &mut ctx),
        4200..=4249 => field_research::apply(action, &mut ctx),
        4260..=4309 => cyber_action::apply(action, &mut ctx),
        4320..=4369 => bio_action::apply(action, &mut ctx),
        4380..=4429 => ecological::apply(action, &mut ctx),
        4440..=4489 => mountaineering::apply(action, &mut ctx),
        4500..=4549 => water_sports::apply(action, &mut ctx),
        4560..=4609 => stargazing::apply(action, &mut ctx),
        4620..=4669 => emergency_response::apply(action, &mut ctx),
        4680..=4729 => political_action::apply(action, &mut ctx),
        4740..=4789 => orbital_act::apply(action, &mut ctx),
        4800..=4849 => martian_act::apply(action, &mut ctx),
        4860..=4910 => xenobiology::apply(action, &mut ctx),
        4920..=4969 => singularity_act::apply(action, &mut ctx),
        4980..=5029 => cosmic_engineer::apply(action, &mut ctx),
        5040..=5089 => dreamwork::apply(action, &mut ctx),
        5100..=5149 => negotiation::apply(action, &mut ctx),
        5160..=5209 => historical_record::apply(action, &mut ctx),
        5220..=5269 => courier::apply(action, &mut ctx),
        5280..=5329 => beekeeping::apply(action, &mut ctx),
        5340..=5389 => cafe_work::apply(action, &mut ctx) * 0.8 * bonus,
        5400..=5449 => barista_advanced::apply(action, &mut ctx) * 1.4 * bonus,
        5460..=5509 => retail::apply(action, &mut ctx) * 1.2 * bonus,
        5520..=5569 => tech_devops::apply(action, &mut ctx) * 1.8 * bonus,
        5580..=5629 => childhood::apply(action, &mut ctx) * 1.6,
        5640..=5689 => elder_life::apply(action, &mut ctx) * 1.5,
        5700..=5749 => journalism::apply(action, &mut ctx) * 1.3 * bonus,
        5760..=5809 => fashion::apply(action, &mut ctx) * 1.1 * bonus,
        5820..=5869 => butchery::apply(action, &mut ctx) * 1.7 * bonus,
        5880..=5929 => distillation::apply(action, &mut ctx) * 2.0 * bonus,
        _ => return None,
    };
    if r > 0.0 && records_experiment(action) {
        ctx.sim.organisms[idx].last_experiment_tick = ctx.tick;
    }
    if r <= 0.0 {
        if let Some(snapshot) = reservation {
            restore_action_resource(ctx.sim, idx, snapshot);
        }
    } else if let Some(resource) = deferred_resource {
        let _charged = reserve_action_resource(ctx.sim, idx, resource)
            .unwrap_or_else(|| panic!("validated action {action} lost its resource before commit"));
    }
    Some(r * spec_bonus * asp_bonus)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::spatial::SpatialIndex;
    use crate::sim::tech::buildings::Building;

    fn actions_for(sim: &Simulation, idx: usize) -> Vec<usize> {
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let organism = &sim.organisms[idx];
        available_actions(sim, idx, organism.x as i32, organism.y as i32, &spatial)
    }

    fn move_other_organisms_far_away(sim: &mut Simulation, idx: usize) {
        for (other_index, organism) in sim.organisms.iter_mut().enumerate() {
            if other_index == idx {
                continue;
            }
            organism.x = 300.0 + (other_index % 10) as f32 * 10.0;
            organism.y = 300.0 + (other_index / 10) as f32 * 10.0;
        }
    }

    #[test]
    fn pre_stone_adult_does_not_receive_late_era_or_specialist_catalogue() {
        let mut sim = Simulation::new(11);
        let idx = 0;
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("programmer".to_string());
        sim.organisms[idx].literacy = 1.0;
        sim.organisms[idx].discoveries.insert("computer".to_string());
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.grid.set(x, y, Tile::Grass);

        let actions = actions_for(&sim, idx);
        for formal_knowledge in [67, 68, 70] {
            assert!(!actions.contains(&formal_knowledge));
        }
        assert!(actions.iter().any(|action| (386..=405).contains(action)));
        for late_communication in [406, 408, 414, 415, 416, 418, 419] {
            assert!(!actions.contains(&late_communication));
        }
        assert!(!actions.iter().any(|action| (421..=435).contains(action)));
        assert!(!actions.iter().any(|action| (456..=470).contains(action)));
        assert!(!actions.iter().any(|action| (475..=476).contains(action)));
        assert!(!actions.iter().any(|action| (483..=485).contains(action)));
        assert!(!actions.iter().any(|action| (501..=520).contains(action)));
        assert!(!actions.iter().any(|action| (39..=48).contains(action)));
        assert!(!actions.contains(&50));
        assert!(!actions.iter().any(|action| (166..=180).contains(action)));
        assert!(!actions.iter().any(|action| (276..=315).contains(action)));
        assert!(!actions.iter().any(|action| (336..=355).contains(action)));
        assert!(!actions.iter().any(|action| (436..=455).contains(action)));
        assert!(!actions.iter().any(|action| (536..=537).contains(action)));
        assert!(!actions.iter().any(|action| (540..=589).contains(action)));
        assert!(!actions.iter().any(|action| (840..=889).contains(action)));
        assert!(!actions.iter().any(|action| (4140..=4189).contains(action)));
        assert!(!actions.iter().any(|action| (5520..=5569).contains(action)));
        assert!(
            actions.len() < 600,
            "contextual sampling should stay compact, got {} actions",
            actions.len()
        );

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        for formal_knowledge in [67, 68, 70] {
            assert!(
                try_apply(&mut sim, idx, formal_knowledge, x, y, &spatial).is_none(),
                "pre-stone action {formal_knowledge} bypassed semantic validation"
            );
        }
    }

    #[test]
    fn era_and_profession_unlock_modern_technology_actions() {
        let mut sim = Simulation::new(12);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("engineer".to_string());
        sim.organisms[idx].discoveries.insert("electricity".to_string());

        assert!(!actions_for(&sim, idx)
            .iter()
            .any(|action| (840..=889).contains(action)));
        sim.lineage_eras.insert(lineage, Era::Modern);
        assert!(actions_for(&sim, idx)
            .iter()
            .any(|action| (840..=889).contains(action)));
    }

    #[test]
    fn research_actions_require_an_operational_owned_workspace() {
        let mut sim = Simulation::new(13);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Information);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("programmer".to_string());
        sim.organisms[idx].literacy = 0.8;
        sim.organisms[idx].discoveries.insert("computer".to_string());
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);

        let mut lab = Building::new(
            99,
            BuildingKind::ResearchLab,
            x + 1,
            y,
            Some(lineage),
            sim.tick_count,
        );
        assert!(!actions_for(&sim, idx)
            .iter()
            .any(|action| (5520..=5569).contains(action)));

        lab.condition = 1.0;
        lab.decorative = true;
        sim.buildings.push(lab);
        assert!(!actions_for(&sim, idx)
            .iter()
            .any(|action| (5520..=5569).contains(action)));

        sim.buildings[0].decorative = false;
        sim.buildings[0].owner_lineage = Some("other-lineage".to_string());
        assert!(!actions_for(&sim, idx)
            .iter()
            .any(|action| (5520..=5569).contains(action)));

        sim.buildings[0].owner_lineage = Some(sim.organisms[idx].lineage_id.clone());
        assert!(actions_for(&sim, idx)
            .iter()
            .any(|action| (5520..=5569).contains(action)));
    }

    #[test]
    fn childhood_and_elder_actions_follow_life_stage() {
        let mut sim = Simulation::new(14);
        let idx = 0;
        sim.organisms[idx].age = 0;
        assert!(actions_for(&sim, idx)
            .iter()
            .any(|action| (5580..=5629).contains(action)));
        assert!(!actions_for(&sim, idx)
            .iter()
            .any(|action| (5640..=5689).contains(action)));

        sim.organisms[idx].age = sim.organisms[idx].max_age.saturating_mul(4) / 5;
        assert!(!actions_for(&sim, idx)
            .iter()
            .any(|action| (5580..=5629).contains(action)));
        assert!(actions_for(&sim, idx)
            .iter()
            .any(|action| (5640..=5689).contains(action)));
    }

    #[test]
    fn rotating_family_sample_stays_bounded_and_eventually_exposes_every_action() {
        let candidates: Vec<usize> = (1200..=1249).collect();
        let mut seen = std::collections::HashSet::new();
        for phase in 0..candidates.len() {
            let mut actions = Vec::new();
            extend_rotating_candidates(&mut actions, &candidates, phase);
            assert_eq!(actions.len(), ACTIONS_PER_BAND);
            seen.extend(actions);
        }
        assert_eq!(seen.len(), candidates.len());
    }

    #[test]
    fn qualification_requires_every_active_dimension() {
        let mut sim = Simulation::new(15);
        let org = &mut sim.organisms[0];
        let requirement = qualification(&["electricity"], &["engineer"], 0.5);

        org.discoveries.insert("electricity".to_string());
        assert!(!qualifies(org, requirement));
        org.specialty = Some("engineer".to_string());
        assert!(!qualifies(org, requirement));
        org.literacy = 0.5;
        assert!(qualifies(org, requirement));

        let alternative = qualification_any(&["electricity"], &["engineer"], 0.5);
        org.specialty = None;
        org.literacy = 0.0;
        assert!(qualifies(org, alternative));
    }

    #[test]
    fn advanced_crafts_do_not_cross_professions_or_skip_prerequisites() {
        let mut sim = Simulation::new(16);
        let org = &mut sim.organisms[0];
        let steel = ACTION_BANDS.iter().find(|band| band.start == 1202).unwrap();
        let bow = ACTION_BANDS.iter().find(|band| band.start == 1211).unwrap();

        org.discoveries.insert("ironworking".to_string());
        org.specialty = Some("weaver".to_string());
        assert!(!qualifies(org, steel.qualification));
        org.specialty = Some("smith".to_string());
        assert!(qualifies(org, steel.qualification));

        org.discoveries.insert("tool_making".to_string());
        org.specialty = Some("carpenter".to_string());
        assert!(!qualifies(org, bow.qualification));
        org.discoveries.insert("weaving".to_string());
        assert!(qualifies(org, bow.qualification));
    }

    #[test]
    fn advanced_craft_revalidates_context_and_reserves_materials_atomically() {
        let mut sim = Simulation::new(17);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Iron);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("smith".to_string());
        sim.organisms[idx].discoveries.insert("ironworking".to_string());
        sim.organisms[idx].inv_stone = 2;
        sim.organisms[idx].wealth = 2;
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        let mut forge = Building::new(100, BuildingKind::Forge, x + 1, y, Some(lineage), sim.tick_count);
        forge.condition = 1.0;
        sim.buildings.push(forge);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(try_apply(&mut sim, idx, 1202, x, y, &spatial).is_some());
        assert_eq!(sim.organisms[idx].inv_stone, 1);
        assert_eq!(sim.organisms[idx].wealth, 1);

        sim.organisms[idx].specialty = Some("weaver".to_string());
        assert!(try_apply(&mut sim, idx, 1202, x, y, &spatial).is_none());
        assert_eq!(sim.organisms[idx].inv_stone, 1);
        assert_eq!(sim.organisms[idx].wealth, 1);
    }

    #[test]
    fn successful_experiments_record_recent_research_but_generic_study_does_not() {
        let mut sim = Simulation::new(18);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.tick_count = 777;
        sim.lineage_eras.insert(lineage.clone(), Era::Classical);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("scholar".to_string());
        sim.organisms[idx].literacy = 0.4;
        sim.organisms[idx].discoveries.insert("mathematics".to_string());
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.grid.set(x + 2, y, Tile::Water);
        let mut lab = Building::new(
            101,
            BuildingKind::ResearchLab,
            x + 1,
            y,
            Some(lineage),
            sim.tick_count,
        );
        lab.condition = 1.0;
        sim.buildings.push(lab);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(actions_for(&sim, idx).contains(&67));
        assert!(try_apply(&mut sim, idx, 67, x, y, &spatial).is_some());
        assert_eq!(sim.organisms[idx].last_experiment_tick, 777);

        sim.tick_count = 888;
        assert!(try_apply(&mut sim, idx, 66, x, y, &spatial).is_some());
        assert_eq!(sim.organisms[idx].last_experiment_tick, 777);
    }

    #[test]
    fn formal_astronomy_and_cartography_require_era_training_and_context() {
        let mut sim = Simulation::new(0xA570);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Iron);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("scholar".to_string());
        sim.organisms[idx].literacy = 0.4;
        sim.organisms[idx].discoveries.extend([
            "mathematics".to_string(),
            "writing".to_string(),
            "geometry".to_string(),
        ]);
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.grid.set(x, y, Tile::Grass);
        let mut observatory = Building::new(
            104,
            BuildingKind::Observatory,
            x + 1,
            y,
            Some(lineage),
            sim.tick_count,
        );
        observatory.condition = 1.0;
        sim.buildings.push(observatory);

        let actions = actions_for(&sim, idx);
        assert!(actions.contains(&68));
        assert!(actions.contains(&70));

        sim.organisms[idx].specialty = None;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 68, x, y, &spatial).is_none());
        assert!(try_apply(&mut sim, idx, 70, x, y, &spatial).is_none());
    }

    #[test]
    fn experiment_evidence_excludes_documentation_teaching_and_observation() {
        for action in [67, 421, 427, 431, 4157, 4183, 4338, 4361, 4872, 4884] {
            assert!(records_experiment(action), "action {action} is experimental");
        }
        for action in [
            422, 429, 435, 4142, 4187, 4204, 4405, 4415, 4560, 4580, 4860, 4903,
        ] {
            assert!(
                !records_experiment(action),
                "action {action} is observation, documentation, or teaching"
            );
        }
    }

    #[test]
    fn semantic_base_ranges_have_exactly_one_requirement_for_every_action() {
        for action in [67, 68, 70]
            .into_iter()
            .chain(39..=50)
            .chain(166..=180)
            .chain(276..=315)
            .chain(336..=355)
            .chain(386..=435)
            .chain(436..=455)
            .chain(456..=485)
            .chain(501..=520)
            .chain(536..=537)
        {
            let matches = BASE_ACTION_BANDS
                .iter()
                .filter(|band| (band.start..=band.end).contains(&action))
                .count();
            assert_eq!(matches, 1, "action {action} must have one semantic gate");
        }

        for action in 540..=589 {
            let matches = ACTION_BANDS
                .iter()
                .filter(|band| (band.start..=band.end).contains(&action))
                .count();
            assert_eq!(matches, 1, "domestic action {action} must have one semantic gate");
        }
    }

    #[test]
    fn pre_stone_cannot_bypass_advanced_build_farming_or_siege_gates() {
        let mut sim = Simulation::new(0xA11CE);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].literacy = 1.0;
        sim.organisms[idx].is_leader = true;
        sim.organisms[idx].inv_food = 10;
        sim.organisms[idx].inv_wood = 10;
        sim.organisms[idx].inv_stone = 10;
        sim.organisms[idx].wealth = 10;
        sim.organisms[idx].discoveries.extend(
            [
                "foraging",
                "barter",
                "currency",
                "writing",
                "chronicle",
                "mathematics",
                "astronomy",
                "engineering",
                "irrigation",
                "agriculture",
                "ironworking",
                "law_code",
            ]
            .into_iter()
            .map(str::to_string),
        );
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.organisms[1].lineage_id = lineage.clone();
        sim.organisms[1].x = x as f32 + 1.0;
        sim.organisms[1].y = y as f32;
        sim.grid.set(x, y, Tile::Grass);
        sim.grid.set(x + 1, y, Tile::Rock);
        sim.grid.set(x, y + 1, Tile::Water);
        let mut barracks = Building::new(
            500,
            BuildingKind::Barracks,
            x - 1,
            y,
            Some(lineage),
            sim.tick_count,
        );
        barracks.condition = 1.0;
        sim.buildings.push(barracks);

        sim.organisms[idx].specialty = Some("builder".to_string());
        assert!(
            actions_for(&sim, idx).contains(&49),
            "the resource-gated first hut must remain an early-game action"
        );
        sim.organisms[idx].inv_wood = 0;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 49, x, y, &spatial).is_none());
        sim.organisms[idx].inv_wood = 10;

        for (action, specialty) in [
            (167, "engineer"),
            (172, "merchant"),
            (174, "scholar"),
            (175, "scholar"),
            (278, "merchant"),
            (297, "politician"),
            (353, "farmer"),
            (438, "engineer"),
        ] {
            sim.organisms[idx].specialty = Some(specialty.to_string());
            assert!(
                !actions_for(&sim, idx).contains(&action),
                "pre-stone action {action} leaked through broad selection"
            );
            let spatial = SpatialIndex::build(&sim.organisms, 10);
            assert!(
                try_apply(&mut sim, idx, action, x, y, &spatial).is_none(),
                "pre-stone action {action} bypassed apply-time validation"
            );
        }
    }

    #[test]
    fn advanced_buildings_revalidate_era_training_knowledge_and_materials() {
        let mut sim = Simulation::new(0xB011D);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage, Era::Classical);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].literacy = 0.8;
        sim.organisms[idx].inv_wood = 10;
        sim.organisms[idx].inv_stone = 10;
        sim.organisms[idx].discoveries.extend(
            [
                "engineering",
                "irrigation",
                "barter",
                "writing",
                "chronicle",
                "astronomy",
                "mathematics",
            ]
            .into_iter()
            .map(str::to_string),
        );
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.organisms[idx].home_x = x as f32;
        sim.organisms[idx].home_y = y as f32;
        sim.organisms[1].lineage_id = sim.organisms[idx].lineage_id.clone();
        sim.organisms[1].x = x as f32 + 1.0;
        sim.organisms[1].y = y as f32;
        sim.grid.set(x, y, Tile::Grass);
        sim.grid.set(x + 1, y, Tile::Rock);
        sim.grid.set(x, y + 1, Tile::Water);

        for (action, specialty) in [
            (167, "engineer"),
            (172, "merchant"),
            (174, "scholar"),
            (175, "scholar"),
        ] {
            sim.organisms[idx].specialty = Some(specialty.to_string());
            assert!(
                actions_for(&sim, idx).contains(&action),
                "qualified specialist should receive action {action}"
            );
            sim.organisms[idx].specialty = None;
            let spatial = SpatialIndex::build(&sim.organisms, 10);
            assert!(
                try_apply(&mut sim, idx, action, x, y, &spatial).is_none(),
                "action {action} must revalidate profession at apply time"
            );
        }
    }

    #[test]
    fn bridge_action_requires_the_exact_buildable_crossing_it_will_use() {
        let mut sim = Simulation::new(0xB21D_6E51);
        sim.buildings.clear();
        sim.organisms.truncate(1);
        let idx = 0;
        let (x, y) = (120, 120);
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage, Era::Classical);
        let bridge_cost = BuildingKind::Bridge.construction_cost();
        let builder = &mut sim.organisms[idx];
        builder.x = x as f32;
        builder.y = y as f32;
        builder.age = builder.max_age / 2;
        builder.energy = 1.0;
        builder.health = 1.0;
        builder.specialty = Some("engineer".into());
        builder.discoveries.insert("engineering".into());
        builder.discoveries.insert("masonry".into());
        builder.inv_wood = u8::try_from(bridge_cost.wood).expect("bridge wood cost fits inventory");
        builder.inv_stone = u8::try_from(bridge_cost.stone).expect("bridge stone cost fits inventory");
        builder.wealth = bridge_cost.wealth;
        for tile_y in y - 3..=y + 3 {
            for tile_x in x - 3..=x + 7 {
                sim.grid.set(tile_x, tile_y, Tile::Grass);
            }
        }

        // Nearby water alone is insufficient: the action creates its project
        // at the actor's exact tile and the bridge footprint extends east.
        sim.grid.set(x, y - 1, Tile::Water);
        assert!(!actions_for(&sim, idx).contains(&41));

        // A dry anchor, water channel, and dry far anchor match the canonical
        // construction validator, so availability and application now agree.
        sim.grid.set(x, y - 1, Tile::Grass);
        sim.grid.set(x + 1, y, Tile::Water);
        sim.grid.set(x + 2, y, Tile::Water);
        assert!(bridge_cost.stone > 0);
        sim.organisms[idx].inv_stone =
            u8::try_from(bridge_cost.stone - 1).expect("bridge stone cost fits inventory");
        assert!(!actions_for(&sim, idx).contains(&41));
        sim.organisms[idx].inv_stone =
            u8::try_from(bridge_cost.stone).expect("bridge stone cost fits inventory");
        assert!(actions_for(&sim, idx).contains(&41));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 41, x, y, &spatial).is_some_and(|reward| reward > 0.0));
        assert!(sim
            .buildings
            .iter()
            .any(|building| building.kind == BuildingKind::Bridge && !building.is_complete()));
    }

    #[test]
    fn immediate_infrastructure_commits_its_declared_resource_once() {
        let mut sim = Simulation::new(0xAC71_0042);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage, Era::Iron);
        let builder = &mut sim.organisms[idx];
        builder.age = builder.max_age / 2;
        builder.specialty = Some("builder".into());
        builder.discoveries.insert("road_building".into());
        builder.discoveries.insert("wheel".into());
        builder.inv_stone = 1;
        let (x, y) = (builder.x as i32, builder.y as i32);
        sim.grid.set(x, y, Tile::Grass);

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 42, x, y, &spatial).is_some_and(|reward| reward > 0.0));
        assert_eq!(sim.organisms[idx].inv_stone, 0);

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 42, x, y, &spatial).is_none());
        assert_eq!(sim.organisms[idx].inv_stone, 0);
    }

    #[test]
    fn greenhouse_and_siege_require_their_exact_semantic_context_at_apply_time() {
        let mut sim = Simulation::new(0x51E6E);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Medieval);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].inv_wood = 3;
        sim.organisms[idx].inv_stone = 3;
        sim.organisms[idx].specialty = Some("farmer".to_string());
        sim.organisms[idx]
            .discoveries
            .extend(["agriculture", "irrigation"].into_iter().map(str::to_string));
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        sim.grid.set(x, y, Tile::Grass);
        sim.grid.set(x + 1, y, Tile::Rock);

        assert!(actions_for(&sim, idx).contains(&353));
        sim.organisms[idx].discoveries.remove("irrigation");
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 353, x, y, &spatial).is_none());

        sim.organisms[idx].specialty = Some("engineer".to_string());
        sim.organisms[idx]
            .discoveries
            .extend(["engineering", "ironworking"].into_iter().map(str::to_string));
        let mut barracks = Building::new(
            501,
            BuildingKind::Barracks,
            x + 1,
            y + 1,
            Some(lineage),
            sim.tick_count,
        );
        barracks.condition = 1.0;
        sim.buildings.push(barracks);
        assert!(actions_for(&sim, idx).contains(&438));

        sim.buildings[0].decorative = true;
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 438, x, y, &spatial).is_none());
    }

    #[test]
    fn base_communication_revalidates_era_knowledge_profession_and_workspace() {
        let mut sim = Simulation::new(19);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("scholar".to_string());
        sim.organisms[idx].literacy = 0.8;
        sim.organisms[idx]
            .discoveries
            .extend(["writing".to_string(), "mathematics".to_string()]);
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(try_apply(&mut sim, idx, 418, x, y, &spatial).is_none());
        sim.lineage_eras.insert(lineage.clone(), Era::Classical);
        assert!(try_apply(&mut sim, idx, 418, x, y, &spatial).is_none());

        let mut library = Building::new(
            101,
            BuildingKind::Library,
            x + 1,
            y,
            Some(lineage),
            sim.tick_count,
        );
        library.condition = 1.0;
        sim.buildings.push(library);
        assert!(try_apply(&mut sim, idx, 418, x, y, &spatial).is_some());
        assert!(sim.organisms[idx].discoveries.contains("secret_code"));
    }

    #[test]
    fn formal_science_requires_an_operational_research_workspace_at_apply_time() {
        let mut sim = Simulation::new(20);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Renaissance);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("scholar".to_string());
        sim.organisms[idx].literacy = 0.8;
        sim.organisms[idx].discoveries.insert("mathematics".to_string());
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(!actions_for(&sim, idx).contains(&421));
        let mut lab = Building::new(
            102,
            BuildingKind::ResearchLab,
            x + 1,
            y,
            Some(lineage),
            sim.tick_count,
        );
        lab.condition = 1.0;
        sim.buildings.push(lab);
        assert!(actions_for(&sim, idx).contains(&421));

        sim.buildings[0].decorative = true;
        assert!(try_apply(&mut sim, idx, 421, x, y, &spatial).is_none());
    }

    #[test]
    fn butchery_consumes_one_carried_food_for_each_successful_output() {
        let mut sim = Simulation::new(21);
        let idx = 0;
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Medieval);
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("hunter".to_string());
        sim.organisms[idx].discoveries.insert("hunting".to_string());
        sim.organisms[idx].inv_food = 1;
        let (x, y) = (sim.organisms[idx].x as i32, sim.organisms[idx].y as i32);
        let mut butcher = Building::new(
            103,
            BuildingKind::Butcher,
            x + 1,
            y,
            Some(lineage),
            sim.tick_count,
        );
        butcher.condition = 1.0;
        sim.buildings.push(butcher);

        let selected_tick = (0..50)
            .find_map(|phase| {
                sim.tick_count = phase * 30;
                actions_for(&sim, idx).contains(&5866).then_some(sim.tick_count)
            })
            .expect("rotating butchery family should eventually include package_roasts");
        sim.tick_count = selected_tick;
        let spatial = SpatialIndex::build(&sim.organisms, 10);

        assert!(try_apply(&mut sim, idx, 5866, x, y, &spatial).is_some());
        assert_eq!(sim.organisms[idx].inv_food, 0);
        assert_eq!(sim.organisms[idx].tools.get("roasts"), Some(&1));

        sim.organisms[idx].inv_food = 1;
        sim.organisms[idx]
            .tools
            .insert("roasts".to_string(), butchery::OUTPUT_CAP);
        assert!(!actions_for(&sim, idx).contains(&5866));
        assert!(eligible_band_for_action(&sim, idx, 5866, x, y, &spatial).is_none());
        assert!(try_apply(&mut sim, idx, 5866, x, y, &spatial).is_none());
        assert_eq!(sim.organisms[idx].inv_food, 1);
        assert_eq!(
            sim.organisms[idx].tools.get("roasts"),
            Some(&butchery::OUTPUT_CAP)
        );
    }

    #[test]
    fn school_and_academy_require_a_hut_and_their_exact_kin_counts() {
        let mut sim = Simulation::new(22);
        let idx = 0;
        assert!(sim.organisms.len() >= 4);
        move_other_organisms_far_away(&mut sim, idx);
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Renaissance);
        sim.organisms[idx].x = 100.0;
        sim.organisms[idx].y = 100.0;
        sim.organisms[idx].age = sim.organisms[idx].max_age.saturating_mul(4) / 5;
        sim.organisms[idx].specialty = Some("scholar".to_string());
        sim.organisms[idx].literacy = 0.8;
        sim.organisms[idx]
            .discoveries
            .extend(["writing".to_string(), "philosophy".to_string()]);
        sim.grid.set(100, 100, Tile::Hut);

        for (neighbor, x) in [(1, 101.0), (2, 102.0)] {
            sim.organisms[neighbor].alive = true;
            sim.organisms[neighbor].lineage_id.clone_from(&lineage);
            sim.organisms[neighbor].x = x;
            sim.organisms[neighbor].y = 100.0;
        }
        let two_kin = actions_for(&sim, idx);
        assert!(two_kin.contains(&501));
        assert!(!two_kin.contains(&510));

        sim.organisms[3].alive = true;
        sim.organisms[3].lineage_id.clone_from(&lineage);
        sim.organisms[3].x = 103.0;
        sim.organisms[3].y = 100.0;
        let three_kin = actions_for(&sim, idx);
        assert!(three_kin.contains(&501));
        assert!(three_kin.contains(&510));

        sim.grid.set(100, 100, Tile::Grass);
        let no_hut = actions_for(&sim, idx);
        assert!(!no_hut.contains(&501));
        assert!(!no_hut.contains(&510));
    }

    #[test]
    fn interfaith_needs_both_groups_and_teach_language_needs_a_stranger() {
        let mut sim = Simulation::new(23);
        let idx = 0;
        assert!(sim.organisms.len() >= 3);
        move_other_organisms_far_away(&mut sim, idx);
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Classical);
        sim.organisms[idx].x = 100.0;
        sim.organisms[idx].y = 100.0;
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].specialty = Some("priest".to_string());
        sim.organisms[idx].literacy = 0.8;
        sim.organisms[idx].discoveries.insert("ritual".to_string());

        sim.organisms[1].alive = true;
        sim.organisms[1].lineage_id.clone_from(&lineage);
        sim.organisms[1].x = 101.0;
        sim.organisms[1].y = 100.0;
        sim.organisms[2].alive = true;
        sim.organisms[2].lineage_id = "visiting-lineage".to_string();
        sim.organisms[2].x = 102.0;
        sim.organisms[2].y = 100.0;

        let mut temple = Building::new(
            104,
            BuildingKind::Temple,
            99,
            100,
            Some(lineage.clone()),
            sim.tick_count,
        );
        temple.condition = 1.0;
        let mut school = Building::new(105, BuildingKind::School, 100, 101, Some(lineage), sim.tick_count);
        school.condition = 1.0;
        sim.buildings.extend([temple, school]);

        assert!(actions_for(&sim, idx).contains(&470));
        sim.organisms[1].x = 300.0;
        sim.organisms[1].y = 300.0;
        assert!(!actions_for(&sim, idx).contains(&470));

        sim.organisms[idx].specialty = Some("scholar".to_string());
        sim.organisms[idx].discoveries.insert("language".to_string());
        assert!(actions_for(&sim, idx).contains(&520));
        sim.organisms[2].x = 310.0;
        sim.organisms[2].y = 310.0;
        assert!(!actions_for(&sim, idx).contains(&520));
    }

    #[test]
    fn religion_actions_filter_and_revalidate_canonical_membership_requirements() {
        let mut sim = Simulation::new(24);
        let idx = 0;
        assert!(sim.organisms.len() >= 3);
        move_other_organisms_far_away(&mut sim, idx);
        let lineage = sim.organisms[idx].lineage_id.clone();
        sim.lineage_eras.insert(lineage.clone(), Era::Stone);
        sim.organisms[idx].alive = true;
        sim.organisms[idx].x = 100.0;
        sim.organisms[idx].y = 100.0;
        sim.organisms[idx].age = sim.organisms[idx].max_age / 2;
        sim.organisms[idx].is_elder = true;
        sim.organisms[idx].specialty = Some("priest".to_string());
        sim.organisms[idx].discoveries.insert("ritual".to_string());
        for (neighbor, x) in [(1, 101.0), (2, 102.0)] {
            sim.organisms[neighbor].alive = true;
            sim.organisms[neighbor].lineage_id.clone_from(&lineage);
            sim.organisms[neighbor].x = x;
            sim.organisms[neighbor].y = 100.0;
        }

        assert!(actions_for(&sim, idx).contains(&456));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 456, 100, 100, &spatial).is_some());
        assert_eq!(sim.religions.len(), 1);

        assert!(!actions_for(&sim, idx).contains(&456));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 456, 100, 100, &spatial).is_none());

        sim.organisms[3].alive = true;
        sim.organisms[3].lineage_id = "foreign-faith-lineage".to_string();
        sim.organisms[3].x = 103.0;
        sim.organisms[3].y = 100.0;
        let mut temple = Building::new(
            999,
            BuildingKind::Temple,
            100,
            100,
            Some(lineage.clone()),
            sim.tick_count,
        );
        temple.condition = 1.0;
        sim.buildings.push(temple);
        assert!(actions_for(&sim, idx).contains(&458));

        sim.organisms[idx].religion_id = Some("dangling-religion".to_string());
        assert!(!actions_for(&sim, idx).contains(&458));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 458, 100, 100, &spatial).is_none());

        sim.religions.clear();
        sim.organisms[idx].is_elder = false;
        assert!(!actions_for(&sim, idx).contains(&456));
        let spatial = SpatialIndex::build(&sim.organisms, 10);
        assert!(try_apply(&mut sim, idx, 456, 100, 100, &spatial).is_none());
    }

    #[test]
    fn established_route_dispatches_tool_cargo_without_a_foreign_visitor() {
        let mut sim = Simulation::new(25);
        sim.organisms.truncate(2);
        for (index, organism) in sim.organisms.iter_mut().enumerate() {
            organism.alive = true;
            organism.lineage_id = if index == 0 { "river" } else { "hill" }.into();
            organism.x = if index == 0 { 100.0 } else { 220.0 };
            organism.y = if index == 0 { 100.0 } else { 160.0 };
            organism.home_x = organism.x;
            organism.home_y = organism.y;
            organism.age = organism.max_age / 2;
            organism.inv_food = 0;
            organism.inv_water = 0;
            organism.inv_wood = 0;
            organism.inv_stone = 0;
            organism.tools.clear();
        }
        sim.organisms[0].specialty = Some("merchant".into());
        sim.organisms[0].discoveries.insert("currency".into());
        sim.organisms[0].tools.insert("cloth".into(), 2);
        sim.lineage_eras.insert("river".into(), Era::Iron);
        sim.lineage_eras.insert("hill".into(), Era::Iron);

        let mut market = Building::new(
            1,
            BuildingKind::MarketStall,
            100,
            100,
            Some("river".into()),
            sim.tick_count,
        );
        market.condition = 1.0;
        let mut river_hut = Building::new(
            2,
            BuildingKind::Hut,
            101,
            100,
            Some("river".into()),
            sim.tick_count,
        );
        river_hut.condition = 1.0;
        let mut hill_hut = Building::new(
            3,
            BuildingKind::Hut,
            220,
            160,
            Some("hill".into()),
            sim.tick_count,
        );
        hill_hut.condition = 1.0;
        sim.buildings.extend([market, river_hut, hill_hut]);

        assert!(crate::sim::civ::trade_routes::establish_route(&mut sim, 0, 1));
        assert!(actions_for(&sim, 0).contains(&288));

        let spatial = SpatialIndex::build(&sim.organisms, 10);
        let reward = try_apply(&mut sim, 0, 288, 100, 100, &spatial);
        assert!(reward.is_some_and(|reward| reward > 0.0));
        assert_eq!(sim.organisms[0].tools.get("cloth"), None);
        assert_eq!(sim.caravans.len(), 1);
        assert_eq!(sim.caravans[0].cargo, "cloth");
        assert_eq!(sim.caravans[0].amount, 2);
    }
}
