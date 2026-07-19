use crate::sim::era::Era;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BuildingKind {
    Hut,
    House,
    Manor,
    TownHouse,
    Apartment,
    School,
    University,
    Library,
    Market,
    Temple,
    Factory,
    Hospital,
    Forge,
    Mill,
    Bakery,
    Inn,
    Bank,
    Workshop,
    Granary,
    Barracks,
    Lighthouse,
    Windmill,
    Watermill,
    Aqueduct,
    Bridge,
    Wall,
    Tower,
    Plaza,
    Statue,
    Fountain,
    TrainStation,
    Airport,
    Port,
    Stadium,
    Museum,
    Cathedral,
    Castle,
    Theatre,
    Observatory,
    Tavern,
    Brewery,
    Butcher,
    Fishmonger,
    Cheesemonger,
    Tailor,
    Cobbler,
    ClothingShop,
    Jeweler,
    Apothecary,
    Herbalist,
    Barbershop,
    Scribe,
    BookStore,
    ArtGallery,
    MusicHall,
    Cafe,
    Restaurant,
    Hotel,
    GuildHall,
    Courthouse,
    CityHall,
    PostOffice,
    PoliceStation,
    FireStation,
    Pharmacy,
    Clinic,
    Spa,
    Bathhouse,
    Greenhouse,
    Vineyard,
    Ranch,
    Stable,
    Kennel,
    Dovecote,
    Quarry,
    Mine,
    SawMill,
    Tannery,
    Smithy,
    Goldsmith,
    Refinery,
    PowerPlant,
    Substation,
    WaterTower,
    Reservoir,
    GasStation,
    AutoShop,
    Garage,
    MallShop,
    Supermarket,
    OfficeTower,
    Skyscraper,
    Datacenter,
    Studio,
    Spaceport,
    OrbitalLift,
    SolarArray,
    WindFarm,
    FusionPlant,
    NeuralHub,
    AiCore,
    Biodome,
    Cryolab,
    NanoFab,
    Hyperloop,
    Maglev,
    Hospital2,
    ResearchLab,
    Megastructure,
    Well,
    Lamppost,
    Signpost,
    MarketStall,
    FoodCart,
    Cart,
    Tent,
    Pavilion,
    Gazebo,
    Bench,
    Fence,
    Gate,
    Watchtower,
    Gallows,
    Monument,
    Obelisk,
    Shrine,
    Cemetery,
    GraveStone,
    Garden,
    Orchard,
    Pond,
    PlayGround,
    FlagPole,
    Bandstand,
    Kiosk,
    BillBoard,
    TelephonePole,
    StreetLight,
    BusStop,
    ParkingLot,
    Crosswalk,
    Pyramid,
    Ziggurat,
    Coliseum,
    TriumphalArch,
    ClockTower,
    Mosque,
    Synagogue,
    Pagoda,
    Stupa,
    Mausoleum,
    Hangar,
    Silo,
    Warehouse,
    Dock,
    Marina,
    Lighthouse2,
    Drydock,
    Crane,
    RadioTower,
    SatelliteDish,
    WindTurbine,
    SolarPanel,
    ChargingStation,
    RoboticArm,
    Drone,
    HoloBoard,
    NeonSign,
    ArcadeBox,
    Fountain2,
    FoodTruck,
    Greenhouse2,
    MushroomFarm,
    Aquaculture,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildingFunction {
    Housing,
    Education,
    Worship,
    Trade,
    Industry,
    Healthcare,
    Military,
    Civic,
    Infrastructure,
    Recreation,
}

/// Resources committed when a settlement opens a construction site.
///
/// Organisms currently carry raw wood and stone rather than dozens of refined
/// commodities. Refined inputs from `material_cost` are therefore represented
/// by wealth (the lineage buys or manufactures them), while every advanced
/// structure still needs a small stone foundation. Labor is paid over time by
/// nearby, active workers rather than at site creation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConstructionCost {
    pub wood: u16,
    pub stone: u16,
    pub wealth: u32,
    pub labor: u16,
}

impl BuildingKind {
    pub fn name(self) -> &'static str {
        match self {
            BuildingKind::Hut => "hut",
            BuildingKind::House => "house",
            BuildingKind::Manor => "manor",
            BuildingKind::TownHouse => "townhouse",
            BuildingKind::Apartment => "apartment",
            BuildingKind::School => "school",
            BuildingKind::University => "university",
            BuildingKind::Library => "library",
            BuildingKind::Market => "market",
            BuildingKind::Temple => "temple",
            BuildingKind::Factory => "factory",
            BuildingKind::Hospital => "hospital",
            BuildingKind::Forge => "forge",
            BuildingKind::Mill => "mill",
            BuildingKind::Bakery => "bakery",
            BuildingKind::Inn => "inn",
            BuildingKind::Bank => "bank",
            BuildingKind::Workshop => "workshop",
            BuildingKind::Granary => "granary",
            BuildingKind::Barracks => "barracks",
            BuildingKind::Lighthouse => "lighthouse",
            BuildingKind::Windmill => "windmill",
            BuildingKind::Watermill => "watermill",
            BuildingKind::Aqueduct => "aqueduct",
            BuildingKind::Bridge => "bridge",
            BuildingKind::Wall => "wall",
            BuildingKind::Tower => "tower",
            BuildingKind::Plaza => "plaza",
            BuildingKind::Statue => "statue",
            BuildingKind::Fountain => "fountain",
            BuildingKind::TrainStation => "train_station",
            BuildingKind::Airport => "airport",
            BuildingKind::Port => "port",
            BuildingKind::Stadium => "stadium",
            BuildingKind::Museum => "museum",
            BuildingKind::Cathedral => "cathedral",
            BuildingKind::Castle => "castle",
            BuildingKind::Theatre => "theatre",
            BuildingKind::Observatory => "observatory",
            BuildingKind::Tavern => "tavern",
            BuildingKind::Brewery => "brewery",
            BuildingKind::Butcher => "butcher",
            BuildingKind::Fishmonger => "fishmonger",
            BuildingKind::Cheesemonger => "cheesemonger",
            BuildingKind::Tailor => "tailor",
            BuildingKind::Cobbler => "cobbler",
            BuildingKind::ClothingShop => "clothing_shop",
            BuildingKind::Jeweler => "jeweler",
            BuildingKind::Apothecary => "apothecary",
            BuildingKind::Herbalist => "herbalist",
            BuildingKind::Barbershop => "barbershop",
            BuildingKind::Scribe => "scribe",
            BuildingKind::BookStore => "bookstore",
            BuildingKind::ArtGallery => "art_gallery",
            BuildingKind::MusicHall => "music_hall",
            BuildingKind::Cafe => "cafe",
            BuildingKind::Restaurant => "restaurant",
            BuildingKind::Hotel => "hotel",
            BuildingKind::GuildHall => "guild_hall",
            BuildingKind::Courthouse => "courthouse",
            BuildingKind::CityHall => "city_hall",
            BuildingKind::PostOffice => "post_office",
            BuildingKind::PoliceStation => "police_station",
            BuildingKind::FireStation => "fire_station",
            BuildingKind::Pharmacy => "pharmacy",
            BuildingKind::Clinic => "clinic",
            BuildingKind::Spa => "spa",
            BuildingKind::Bathhouse => "bathhouse",
            BuildingKind::Greenhouse => "greenhouse",
            BuildingKind::Vineyard => "vineyard",
            BuildingKind::Ranch => "ranch",
            BuildingKind::Stable => "stable",
            BuildingKind::Kennel => "kennel",
            BuildingKind::Dovecote => "dovecote",
            BuildingKind::Quarry => "quarry",
            BuildingKind::Mine => "mine",
            BuildingKind::SawMill => "saw_mill",
            BuildingKind::Tannery => "tannery",
            BuildingKind::Smithy => "smithy",
            BuildingKind::Goldsmith => "goldsmith",
            BuildingKind::Refinery => "refinery",
            BuildingKind::PowerPlant => "power_plant",
            BuildingKind::Substation => "substation",
            BuildingKind::WaterTower => "water_tower",
            BuildingKind::Reservoir => "reservoir",
            BuildingKind::GasStation => "gas_station",
            BuildingKind::AutoShop => "auto_shop",
            BuildingKind::Garage => "garage",
            BuildingKind::MallShop => "mall_shop",
            BuildingKind::Supermarket => "supermarket",
            BuildingKind::OfficeTower => "office_tower",
            BuildingKind::Skyscraper => "skyscraper",
            BuildingKind::Datacenter => "datacenter",
            BuildingKind::Studio => "studio",
            BuildingKind::Spaceport => "spaceport",
            BuildingKind::OrbitalLift => "orbital_lift",
            BuildingKind::SolarArray => "solar_array",
            BuildingKind::WindFarm => "wind_farm",
            BuildingKind::FusionPlant => "fusion_plant",
            BuildingKind::NeuralHub => "neural_hub",
            BuildingKind::AiCore => "ai_core",
            BuildingKind::Biodome => "biodome",
            BuildingKind::Cryolab => "cryolab",
            BuildingKind::NanoFab => "nano_fab",
            BuildingKind::Hyperloop => "hyperloop",
            BuildingKind::Maglev => "maglev",
            BuildingKind::Hospital2 => "mega_hospital",
            BuildingKind::ResearchLab => "research_lab",
            BuildingKind::Megastructure => "megastructure",
            BuildingKind::Well => "well",
            BuildingKind::Lamppost => "lamppost",
            BuildingKind::Signpost => "signpost",
            BuildingKind::MarketStall => "market_stall",
            BuildingKind::FoodCart => "food_cart",
            BuildingKind::Cart => "cart",
            BuildingKind::Tent => "tent",
            BuildingKind::Pavilion => "pavilion",
            BuildingKind::Gazebo => "gazebo",
            BuildingKind::Bench => "bench",
            BuildingKind::Fence => "fence",
            BuildingKind::Gate => "gate",
            BuildingKind::Watchtower => "watchtower",
            BuildingKind::Gallows => "gallows",
            BuildingKind::Monument => "monument",
            BuildingKind::Obelisk => "obelisk",
            BuildingKind::Shrine => "shrine",
            BuildingKind::Cemetery => "cemetery",
            BuildingKind::GraveStone => "gravestone",
            BuildingKind::Garden => "garden",
            BuildingKind::Orchard => "orchard",
            BuildingKind::Pond => "pond",
            BuildingKind::PlayGround => "playground",
            BuildingKind::FlagPole => "flagpole",
            BuildingKind::Bandstand => "bandstand",
            BuildingKind::Kiosk => "kiosk",
            BuildingKind::BillBoard => "billboard",
            BuildingKind::TelephonePole => "telephone_pole",
            BuildingKind::StreetLight => "street_light",
            BuildingKind::BusStop => "bus_stop",
            BuildingKind::ParkingLot => "parking_lot",
            BuildingKind::Crosswalk => "crosswalk",
            BuildingKind::Pyramid => "pyramid",
            BuildingKind::Ziggurat => "ziggurat",
            BuildingKind::Coliseum => "coliseum",
            BuildingKind::TriumphalArch => "triumphal_arch",
            BuildingKind::ClockTower => "clock_tower",
            BuildingKind::Mosque => "mosque",
            BuildingKind::Synagogue => "synagogue",
            BuildingKind::Pagoda => "pagoda",
            BuildingKind::Stupa => "stupa",
            BuildingKind::Mausoleum => "mausoleum",
            BuildingKind::Hangar => "hangar",
            BuildingKind::Silo => "silo",
            BuildingKind::Warehouse => "warehouse",
            BuildingKind::Dock => "dock",
            BuildingKind::Marina => "marina",
            BuildingKind::Lighthouse2 => "harbor_light",
            BuildingKind::Drydock => "drydock",
            BuildingKind::Crane => "crane",
            BuildingKind::RadioTower => "radio_tower",
            BuildingKind::SatelliteDish => "satellite_dish",
            BuildingKind::WindTurbine => "wind_turbine",
            BuildingKind::SolarPanel => "solar_panel",
            BuildingKind::ChargingStation => "charging_station",
            BuildingKind::RoboticArm => "robotic_arm",
            BuildingKind::Drone => "drone",
            BuildingKind::HoloBoard => "holo_board",
            BuildingKind::NeonSign => "neon_sign",
            BuildingKind::ArcadeBox => "arcade",
            BuildingKind::Fountain2 => "grand_fountain",
            BuildingKind::FoodTruck => "food_truck",
            BuildingKind::Greenhouse2 => "biolab",
            BuildingKind::MushroomFarm => "mushroom_farm",
            BuildingKind::Aquaculture => "aquaculture",
        }
    }

    pub fn era_unlock(self) -> Era {
        use BuildingKind::*;
        match self {
            Hut => Era::Stone,
            House => Era::Bronze,
            Manor | Castle => Era::Medieval,
            TownHouse => Era::Renaissance,
            Apartment => Era::Modern,
            School | Library => Era::Classical,
            University | Theatre => Era::Renaissance,
            Market | Plaza => Era::Iron,
            Temple => Era::Bronze,
            Cathedral => Era::Medieval,
            Factory | Bank => Era::Industrial,
            Hospital | Stadium | Airport | Museum => Era::Modern,
            Forge | Workshop | Granary | Statue | Fountain | Wall | Tower | Barracks => Era::Bronze,
            Mill | Windmill | Watermill | Inn | Bakery => Era::Medieval,
            Aqueduct | Bridge | Lighthouse | Observatory => Era::Classical,
            TrainStation => Era::Industrial,
            Port => Era::Iron,
            Tavern | Brewery | Butcher | Fishmonger | Cheesemonger | Tailor | Cobbler | Jeweler
            | Apothecary | Herbalist | Barbershop | Scribe | Smithy | Goldsmith | GuildHall => Era::Medieval,
            ClothingShop | BookStore | ArtGallery | MusicHall | Cafe | Restaurant | Hotel | Courthouse
            | CityHall | PostOffice => Era::Renaissance,
            PoliceStation | FireStation | Pharmacy | Clinic | Spa | Bathhouse => Era::Industrial,
            Greenhouse | Vineyard | Ranch | Stable | Kennel | Dovecote => Era::Medieval,
            Quarry | Mine | SawMill | Tannery => Era::Bronze,
            Refinery | PowerPlant | Substation | WaterTower | Reservoir => Era::Industrial,
            GasStation | AutoShop | Garage | MallShop | Supermarket => Era::Modern,
            OfficeTower | Skyscraper | Datacenter | Studio => Era::Information,
            Spaceport | SolarArray | WindFarm => Era::Atomic,
            OrbitalLift | FusionPlant | Biodome | Cryolab | NanoFab => Era::Fusion,
            NeuralHub | AiCore | ResearchLab => Era::Digital,
            Hyperloop | Maglev | Hospital2 => Era::Solar,
            Megastructure => Era::Galactic,
            Well | Lamppost | Signpost | MarketStall | FoodCart | Cart | Tent | Pavilion | Gazebo | Bench
            | Fence | Gate | Watchtower | Gallows | Monument | Obelisk | Shrine => Era::Stone,
            Cemetery | GraveStone | Garden | Orchard | Pond | PlayGround | FlagPole | Bandstand | Kiosk => {
                Era::Bronze
            }
            BillBoard | TelephonePole | StreetLight | BusStop | ParkingLot | Crosswalk => Era::Industrial,
            Pyramid | Ziggurat | Coliseum | TriumphalArch | ClockTower | Mosque | Synagogue | Pagoda
            | Stupa | Mausoleum => Era::Classical,
            Hangar | Silo | Warehouse | Dock | Marina | Lighthouse2 | Drydock | Crane => Era::Industrial,
            RadioTower | SatelliteDish => Era::Atomic,
            WindTurbine | SolarPanel | ChargingStation | RoboticArm | Drone => Era::Information,
            HoloBoard | NeonSign | ArcadeBox | Fountain2 | FoodTruck => Era::Modern,
            Greenhouse2 | MushroomFarm | Aquaculture => Era::Modern,
        }
    }

    pub fn footprint(self) -> (u8, u8) {
        use BuildingKind::*;
        match self {
            Hut | Statue | Fountain | Well | Lamppost | Signpost | MarketStall | FoodCart | Cart | Tent
            | Bench | Gate | GraveStone | FlagPole | Kiosk | BillBoard | TelephonePole | StreetLight
            | BusStop | Obelisk | Shrine | Crosswalk | SolarPanel | ChargingStation | RoboticArm | Drone
            | HoloBoard | NeonSign | ArcadeBox | Pond | Fence | SatelliteDish | FoodTruck => (1, 1),
            House | Inn | Bakery | Forge | Workshop | Granary | Mill | Windmill | Watermill | Bank | Wall
            | Tower | Lighthouse | Observatory | Tavern | Brewery | Butcher | Fishmonger | Cheesemonger
            | Tailor | Cobbler | Jeweler | Apothecary | Herbalist | Barbershop | Scribe | BookStore
            | ArtGallery | Cafe | PostOffice | Pharmacy | Clinic | Spa | Bathhouse | Smithy | Goldsmith
            | Quarry | Mine | SawMill | Tannery | Stable | Kennel | Dovecote | Watchtower | Gallows
            | Monument | Bandstand | Gazebo | Pavilion | ClothingShop | Restaurant | Hotel | GuildHall
            | Courthouse | PoliceStation | FireStation | MallShop | Supermarket | Studio | GasStation
            | AutoShop | Garage | Cemetery | Garden | Orchard | PlayGround | ParkingLot | ClockTower
            | Mosque | Synagogue | Stupa | Mausoleum | Hangar | Silo | Warehouse | Dock | Marina
            | Lighthouse2 | Drydock | Crane | RadioTower | WindTurbine | Pyramid | Ziggurat
            | TriumphalArch | Pagoda | Fountain2 | MushroomFarm | Aquaculture | Greenhouse | Greenhouse2
            | Vineyard | Ranch | WaterTower | Reservoir | Substation | Refinery | PowerPlant | MusicHall
            | CityHall => (2, 2),
            TownHouse => (2, 3),
            Market | School | Hospital | Plaza | Temple | Theatre | Barracks | Museum | TrainStation
            | Port | Spaceport | OrbitalLift | SolarArray | WindFarm | FusionPlant | NeuralHub | AiCore
            | Biodome | Cryolab | NanoFab | Hyperloop | Maglev | Hospital2 | ResearchLab | OfficeTower
            | Datacenter | Coliseum => (3, 3),
            Manor | University | Library | Stadium | Apartment | Cathedral | Castle | Factory | Airport
            | Skyscraper | Megastructure => (4, 4),
            Aqueduct | Bridge => (4, 1),
        }
    }

    pub fn capacity(self) -> u8 {
        use BuildingKind::*;
        match self {
            Hut => 2,
            House | Inn | Bakery | Workshop | Forge | Tavern | Cafe | ClothingShop | Tailor | Cobbler
            | Jeweler | Apothecary | Herbalist | Barbershop | Butcher | Fishmonger | Cheesemonger
            | Scribe | BookStore | Brewery | Smithy | Goldsmith | Pharmacy | Clinic | Restaurant => 4,
            TownHouse | Hotel | Spa | Bathhouse | ArtGallery | MusicHall => 6,
            Manor | Apartment | Hospital2 | Skyscraper => 12,
            School | University | Library | Temple | Market | Hospital | Cathedral | Theatre | Museum
            | GuildHall | Courthouse | CityHall | Coliseum | Pyramid | Ziggurat | Mosque | Synagogue
            | Pagoda | Stupa | Mausoleum | Studio | OfficeTower | Datacenter | NeuralHub | AiCore
            | Biodome | ResearchLab | Cryolab | NanoFab => 20,
            Castle | Barracks | Factory | Stadium | Airport | TrainStation | Port | Spaceport
            | OrbitalLift | FusionPlant | SolarArray | WindFarm | Megastructure | Hyperloop | Maglev
            | Warehouse | Marina | Hangar => 40,
            _ => 0,
        }
    }

    pub fn material_cost(self) -> &'static [(&'static str, u32)] {
        use BuildingKind::*;
        match self {
            Hut => &[("wood", 8), ("grass", 4)],
            House => &[("wood", 20), ("stone", 8)],
            Manor => &[("wood", 60), ("stone", 40), ("iron", 6)],
            TownHouse => &[("wood", 40), ("stone", 28)],
            Apartment => &[("concrete", 200), ("steel", 60), ("glass", 40)],
            School => &[("wood", 40), ("stone", 30), ("paper", 10)],
            University => &[("stone", 80), ("wood", 60), ("paper", 30), ("iron", 10)],
            Library => &[("stone", 50), ("wood", 30), ("paper", 60)],
            Market => &[("wood", 25), ("stone", 10)],
            Temple => &[("stone", 60), ("gold", 4)],
            Cathedral => &[("stone", 200), ("gold", 20), ("glass", 10)],
            Castle => &[("stone", 250), ("iron", 30), ("wood", 60)],
            Factory => &[("brick", 150), ("steel", 80), ("coal", 30)],
            Hospital => &[("brick", 80), ("steel", 30), ("glass", 20)],
            Forge | Smithy | Goldsmith => &[("stone", 30), ("iron", 8)],
            Mill | Windmill | Watermill => &[("wood", 30), ("stone", 12)],
            Bakery | Inn | Workshop | Tavern | Brewery | Butcher | Fishmonger | Cheesemonger | Tailor
            | Cobbler | ClothingShop | Jeweler | Apothecary | Herbalist | Barbershop | Scribe | BookStore
            | Cafe | Restaurant | Hotel | Pharmacy | Clinic => &[("wood", 25), ("stone", 10)],
            Bank => &[("stone", 60), ("iron", 20), ("gold", 10)],
            Granary | Silo | Warehouse => &[("wood", 30), ("stone", 10)],
            Barracks => &[("wood", 40), ("stone", 30), ("iron", 12)],
            Lighthouse | Lighthouse2 => &[("stone", 50), ("wood", 15)],
            Aqueduct => &[("stone", 80)],
            Bridge => &[("stone", 60), ("wood", 20)],
            Wall | Tower | Watchtower => &[("stone", 40)],
            Plaza | Statue | Fountain | Fountain2 | Monument | Obelisk | Shrine | Bandstand | Pavilion
            | Gazebo | Bench | TriumphalArch | ClockTower => &[("stone", 20)],
            TrainStation => &[("brick", 100), ("steel", 60), ("iron", 30)],
            Airport | Hangar => &[("concrete", 300), ("steel", 200), ("glass", 80)],
            Port | Dock | Marina | Drydock => &[("wood", 80), ("stone", 60)],
            Stadium | Coliseum => &[("concrete", 250), ("steel", 100)],
            Museum => &[("stone", 120), ("glass", 30), ("paper", 20)],
            Theatre | MusicHall | ArtGallery => &[("wood", 80), ("stone", 50)],
            Observatory => &[("stone", 60), ("glass", 30), ("iron", 10)],
            GuildHall | Courthouse | CityHall | PostOffice | PoliceStation | FireStation | Spa
            | Bathhouse | MallShop | Supermarket | Studio | GasStation | AutoShop | Garage | OfficeTower
            | Skyscraper => &[("brick", 80), ("steel", 30), ("glass", 20)],
            Refinery | PowerPlant | Substation | WaterTower | Reservoir | Datacenter => {
                &[("steel", 80), ("concrete", 60)]
            }
            Greenhouse | Greenhouse2 | Vineyard | Ranch | Stable | Kennel | Dovecote | Garden | Orchard
            | Pond | MushroomFarm | Aquaculture | PlayGround | Cemetery => &[("wood", 12), ("stone", 4)],
            Quarry | Mine | SawMill | Tannery => &[("wood", 18), ("stone", 12)],
            Spaceport | OrbitalLift | FusionPlant | NeuralHub | AiCore | Biodome | Cryolab | NanoFab
            | Hyperloop | Maglev | Hospital2 | ResearchLab | Megastructure => {
                &[("steel", 200), ("glass", 100)]
            }
            SolarArray | WindFarm | WindTurbine | SolarPanel | ChargingStation | RoboticArm | Drone
            | HoloBoard | NeonSign | ArcadeBox | FoodTruck | RadioTower | SatelliteDish | Crane => {
                &[("steel", 40), ("glass", 20)]
            }
            Pyramid | Ziggurat | Mausoleum | Mosque | Synagogue | Pagoda | Stupa => &[("stone", 120)],
            Well | Lamppost | Signpost | MarketStall | FoodCart | Cart | Tent | Fence | Gate | Gallows
            | GraveStone | FlagPole | Kiosk | BillBoard | TelephonePole | StreetLight | BusStop
            | ParkingLot | Crosswalk => &[("wood", 4), ("stone", 2)],
        }
    }

    /// Converts the detailed material bill into resources the live simulation
    /// can actually account for today. The divisor keeps pooled lineage costs
    /// achievable even in the smallest supported local worlds.
    pub fn construction_cost(self) -> ConstructionCost {
        let mut raw_wood = 0u32;
        let mut raw_stone = 0u32;
        let mut refined = 0u32;
        for &(material, amount) in self.material_cost() {
            match material {
                "wood" | "grass" | "paper" => raw_wood = raw_wood.saturating_add(amount),
                "stone" => raw_stone = raw_stone.saturating_add(amount),
                _ => refined = refined.saturating_add(amount),
            }
        }

        let wood = raw_wood.div_ceil(20) as u16;
        let mut stone = raw_stone.div_ceil(20) as u16;
        let wealth = refined.div_ceil(20);
        let (width, height) = self.footprint();
        let area = u16::from(width) * u16::from(height);
        if wood == 0 && stone == 0 {
            stone = area.div_ceil(4).max(1);
        }
        let era_complexity = crate::sim::era::LADDER
            .iter()
            .position(|era| *era == self.era_unlock())
            .unwrap_or(0) as u16;

        ConstructionCost {
            wood,
            stone,
            wealth,
            labor: area
                .saturating_mul(4)
                .saturating_add(era_complexity.saturating_mul(2))
                .max(1),
        }
    }

    /// Maximum useful simultaneous crew size. Larger projects can absorb more
    /// workers, while a hut cannot unrealistically employ an entire lineage.
    pub fn construction_crew_capacity(self) -> usize {
        usize::from(self.construction_cost().labor.div_ceil(24).clamp(1, 6))
    }

    /// Compatibility knowledge earned alongside the canonical building name
    /// when construction completes. These keys were historically granted by
    /// individual actions; keeping them completion-bound preserves existing
    /// technology prerequisites without letting unfinished sites unlock them.
    pub fn completion_discovery_aliases(self) -> &'static [&'static str] {
        use BuildingKind::*;
        match self {
            Hut => &["shelter"],
            Theatre => &["amphitheater"],
            Market => &["markets"],
            MarketStall => &["market"],
            Forge => &["metallurgy"],
            Granary => &["barn"],
            Aqueduct => &["aqueducts"],
            Wall => &["walls"],
            Fence => &["fencing"],
            Gate => &["gates"],
            Watchtower => &["scouting"],
            Shrine => &["religion"],
            Dock => &["quay"],
            _ => &[],
        }
    }

    pub fn function(self) -> BuildingFunction {
        use BuildingFunction::*;
        use BuildingKind::*;
        match self {
            Hut | House | Manor | TownHouse | Apartment | Castle | Inn | Hotel | Tent | Skyscraper => Housing,
            School | University | Library | Museum | Observatory | ResearchLab | Scribe | BookStore
            | Studio => Education,
            Temple | Cathedral | Shrine | Mosque | Synagogue | Pagoda | Stupa | Mausoleum | Pyramid
            | Ziggurat | Cemetery | GraveStone => Worship,
            Market | Bank | Workshop | Bakery | Port | Tavern | Brewery | Butcher | Fishmonger
            | Cheesemonger | Tailor | Cobbler | ClothingShop | Jeweler | Apothecary | Herbalist
            | Barbershop | Cafe | Restaurant | GuildHall | MallShop | Supermarket | GasStation | AutoShop
            | Garage | MarketStall | FoodCart | FoodTruck | Kiosk | ArtGallery => Trade,
            Forge | Mill | Windmill | Watermill | Factory | Granary | Smithy | Goldsmith | Quarry | Mine
            | SawMill | Tannery | Refinery | PowerPlant | Substation | OfficeTower | Datacenter
            | Spaceport | OrbitalLift | SolarArray | WindFarm | FusionPlant | NeuralHub | AiCore
            | Biodome | Cryolab | NanoFab | Hyperloop | Maglev | Megastructure | SolarPanel | WindTurbine
            | RoboticArm | Drone | Greenhouse | Greenhouse2 | Vineyard | Ranch | Stable | Kennel
            | Dovecote | MushroomFarm | Aquaculture | Hangar | Silo | Warehouse | Crane => Industry,
            Hospital | Pharmacy | Clinic | Spa | Bathhouse | Hospital2 => Healthcare,
            Barracks | Wall | Tower | Watchtower | Gallows | PoliceStation | FireStation => Military,
            Plaza | Statue | Fountain | Fountain2 | Lighthouse | Lighthouse2 | Courthouse | CityHall
            | PostOffice | Monument | Obelisk | TriumphalArch | ClockTower | FlagPole | Signpost | Bench
            | Lamppost | StreetLight | TelephonePole | RadioTower | SatelliteDish | HoloBoard | NeonSign
            | BillBoard | Well | Garden | Orchard | Pond => Civic,
            Aqueduct | Bridge | TrainStation | Airport | Dock | Marina | Drydock | BusStop | ParkingLot
            | Crosswalk | Gate | Fence | ChargingStation | Cart => Infrastructure,
            Stadium | Theatre | MusicHall | Coliseum | PlayGround | Bandstand | Gazebo | Pavilion
            | ArcadeBox => Recreation,
            WaterTower | Reservoir => Infrastructure,
        }
    }

    pub fn all() -> &'static [BuildingKind] {
        use BuildingKind::*;
        &[
            Hut,
            House,
            Manor,
            TownHouse,
            Apartment,
            School,
            University,
            Library,
            Market,
            Temple,
            Factory,
            Hospital,
            Forge,
            Mill,
            Bakery,
            Inn,
            Bank,
            Workshop,
            Granary,
            Barracks,
            Lighthouse,
            Windmill,
            Watermill,
            Aqueduct,
            Bridge,
            Wall,
            Tower,
            Plaza,
            Statue,
            Fountain,
            TrainStation,
            Airport,
            Port,
            Stadium,
            Museum,
            Cathedral,
            Castle,
            Theatre,
            Observatory,
            Tavern,
            Brewery,
            Butcher,
            Fishmonger,
            Cheesemonger,
            Tailor,
            Cobbler,
            ClothingShop,
            Jeweler,
            Apothecary,
            Herbalist,
            Barbershop,
            Scribe,
            BookStore,
            ArtGallery,
            MusicHall,
            Cafe,
            Restaurant,
            Hotel,
            GuildHall,
            Courthouse,
            CityHall,
            PostOffice,
            PoliceStation,
            FireStation,
            Pharmacy,
            Clinic,
            Spa,
            Bathhouse,
            Greenhouse,
            Vineyard,
            Ranch,
            Stable,
            Kennel,
            Dovecote,
            Quarry,
            Mine,
            SawMill,
            Tannery,
            Smithy,
            Goldsmith,
            Refinery,
            PowerPlant,
            Substation,
            WaterTower,
            Reservoir,
            GasStation,
            AutoShop,
            Garage,
            MallShop,
            Supermarket,
            OfficeTower,
            Skyscraper,
            Datacenter,
            Studio,
            Spaceport,
            OrbitalLift,
            SolarArray,
            WindFarm,
            FusionPlant,
            NeuralHub,
            AiCore,
            Biodome,
            Cryolab,
            NanoFab,
            Hyperloop,
            Maglev,
            Hospital2,
            ResearchLab,
            Megastructure,
            Well,
            Lamppost,
            Signpost,
            MarketStall,
            FoodCart,
            Cart,
            Tent,
            Pavilion,
            Gazebo,
            Bench,
            Fence,
            Gate,
            Watchtower,
            Gallows,
            Monument,
            Obelisk,
            Shrine,
            Cemetery,
            GraveStone,
            Garden,
            Orchard,
            Pond,
            PlayGround,
            FlagPole,
            Bandstand,
            Kiosk,
            BillBoard,
            TelephonePole,
            StreetLight,
            BusStop,
            ParkingLot,
            Crosswalk,
            Pyramid,
            Ziggurat,
            Coliseum,
            TriumphalArch,
            ClockTower,
            Mosque,
            Synagogue,
            Pagoda,
            Stupa,
            Mausoleum,
            Hangar,
            Silo,
            Warehouse,
            Dock,
            Marina,
            Lighthouse2,
            Drydock,
            Crane,
            RadioTower,
            SatelliteDish,
            WindTurbine,
            SolarPanel,
            ChargingStation,
            RoboticArm,
            Drone,
            HoloBoard,
            NeonSign,
            ArcadeBox,
            Fountain2,
            FoodTruck,
            Greenhouse2,
            MushroomFarm,
            Aquaculture,
        ]
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Building {
    pub id: u32,
    pub kind: BuildingKind,
    pub x: i32,
    pub y: i32,
    pub owner_lineage: Option<String>,
    pub occupants: Vec<String>,
    pub built_at_tick: u64,
    pub condition: f32,
    /// True only for ambient settlement scenery. Decorative buildings
    /// may be rotated out to keep long-running worlds fast; functional
    /// buildings and wonders are permanent world history.
    #[serde(default)]
    pub decorative: bool,
}

impl Building {
    pub fn new(id: u32, kind: BuildingKind, x: i32, y: i32, owner: Option<String>, tick: u64) -> Self {
        Building {
            id,
            kind,
            x,
            y,
            owner_lineage: owner,
            occupants: Vec::new(),
            built_at_tick: tick,
            condition: 0.0,
            decorative: false,
        }
    }

    pub fn is_complete(&self) -> bool {
        self.condition >= 1.0
    }

    /// Only constructed, functional buildings may influence organisms or
    /// civilization systems. Decorative props remain visual world detail.
    pub fn is_operational(&self) -> bool {
        !self.decorative && self.is_complete()
    }

    pub fn footprint(&self) -> (u8, u8) {
        self.kind.footprint()
    }
    pub fn function(&self) -> BuildingFunction {
        self.kind.function()
    }

    /// A completed housing building can shelter its owning lineage. Buildings
    /// without an owner are shared world structures; unfinished and decorative
    /// buildings never grant shelter effects.
    pub fn provides_shelter_for(&self, lineage: &str) -> bool {
        self.is_operational()
            && self.function() == BuildingFunction::Housing
            && self
                .owner_lineage
                .as_deref()
                .map(|owner| owner == lineage)
                .unwrap_or(true)
    }

    /// Whether this is an unfinished housing project already owned by a
    /// lineage. This is deliberately separate from `provides_shelter_for`:
    /// callers may avoid opening duplicate projects without treating a work
    /// site as weather protection or a home.
    pub fn is_shelter_project_for(&self, lineage: &str) -> bool {
        !self.decorative
            && !self.is_complete()
            && self.function() == BuildingFunction::Housing
            && self.owner_lineage.as_deref() == Some(lineage)
    }

    /// The closest tile in this building's footprint to a world position.
    pub fn closest_footprint_tile(&self, x: i32, y: i32) -> (i32, i32) {
        let (width, height) = self.footprint();
        (
            x.clamp(self.x, self.x + i32::from(width) - 1),
            y.clamp(self.y, self.y + i32::from(height) - 1),
        )
    }

    pub fn contains(&self, x: i32, y: i32) -> bool {
        let (w, h) = self.kind.footprint();
        x >= self.x && x < self.x + w as i32 && y >= self.y && y < self.y + h as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn footprint_smoke() {
        assert_eq!(BuildingKind::Hut.footprint(), (1, 1));
        assert_eq!(BuildingKind::Apartment.footprint(), (4, 4));
        assert_eq!(BuildingKind::Bridge.footprint(), (4, 1));
    }

    #[test]
    fn era_unlock_progression() {
        assert!(BuildingKind::Hut.era_unlock() < BuildingKind::House.era_unlock());
        assert!(BuildingKind::House.era_unlock() < BuildingKind::Manor.era_unlock());
        assert!(BuildingKind::Manor.era_unlock() < BuildingKind::Apartment.era_unlock());
    }

    #[test]
    fn construction_costs_use_real_resources_and_scale_labor() {
        let hut = BuildingKind::Hut.construction_cost();
        let factory = BuildingKind::Factory.construction_cost();
        let megastructure = BuildingKind::Megastructure.construction_cost();

        assert!(hut.wood > 0);
        assert_eq!(hut.wealth, 0);
        assert!(
            factory.stone > 0,
            "advanced sites still need a physical foundation"
        );
        assert!(
            factory.wealth > 0,
            "refined industrial materials are financed through wealth"
        );
        assert!(factory.labor > hut.labor);
        assert!(megastructure.labor > factory.labor);
        assert!(BuildingKind::Megastructure.construction_crew_capacity() > 1);

        for kind in BuildingKind::all() {
            let cost = kind.construction_cost();
            assert!(
                cost.wood > 0 || cost.stone > 0,
                "{} has no material cost",
                kind.name()
            );
            assert!(cost.labor > 0, "{} has no labor cost", kind.name());
        }
    }

    #[test]
    fn new_functional_buildings_start_incomplete() {
        let mut building = Building::new(1, BuildingKind::School, 0, 0, Some("lineage".into()), 10);
        assert!(!building.is_complete());
        assert!(!building.is_operational());
        assert_eq!(building.condition, 0.0);

        building.condition = 1.0;
        assert!(building.is_operational());
        building.decorative = true;
        assert!(!building.is_operational());
    }

    #[test]
    fn shelter_requires_completed_operational_housing_and_respects_ownership() {
        let mut hut = Building::new(1, BuildingKind::Hut, 4, 5, Some("lineage-a".into()), 10);
        assert!(!hut.provides_shelter_for("lineage-a"));
        assert!(hut.is_shelter_project_for("lineage-a"));
        assert!(!hut.is_shelter_project_for("lineage-b"));

        hut.condition = 1.0;
        assert!(hut.provides_shelter_for("lineage-a"));
        assert!(!hut.provides_shelter_for("lineage-b"));
        assert!(!hut.is_shelter_project_for("lineage-a"));

        hut.decorative = true;
        assert!(!hut.provides_shelter_for("lineage-a"));

        let mut shared_house = Building::new(2, BuildingKind::House, 8, 9, None, 10);
        shared_house.condition = 1.0;
        assert!(shared_house.provides_shelter_for("lineage-a"));
        assert!(shared_house.provides_shelter_for("lineage-b"));
        assert_eq!(shared_house.closest_footprint_tile(20, 8), (9, 9));
    }
}
