use super::*;

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

impl BuildingFunction {
    /// The lowercase name frames carry: what `format!("{:?}", f).to_lowercase()`
    /// gave, without allocating.
    pub fn label(self) -> &'static str {
        match self {
            BuildingFunction::Housing => "housing",
            BuildingFunction::Education => "education",
            BuildingFunction::Worship => "worship",
            BuildingFunction::Trade => "trade",
            BuildingFunction::Industry => "industry",
            BuildingFunction::Healthcare => "healthcare",
            BuildingFunction::Military => "military",
            BuildingFunction::Civic => "civic",
            BuildingFunction::Infrastructure => "infrastructure",
            BuildingFunction::Recreation => "recreation",
        }
    }
}

impl BuildingKind {
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

    /// Unmaintained lifespan in the same years displayed by the world calendar.
    pub fn service_life_years(self) -> u16 {
        use BuildingKind::*;
        match self {
            Tent | Fence | Cart | MarketStall => 20,
            Hut | Dovecote | Kennel => 50,
            House | Inn | Workshop | Granary | Stable | Windmill | Watermill => 200,
            Castle | Cathedral | Temple | Pyramid | Ziggurat | Monument | Coliseum => 600,
            _ => 300,
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
}
