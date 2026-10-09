use super::*;

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
            | Pond | MushroomFarm | Aquaculture | Pen | PlayGround | Cemetery => {
                &[("wood", 12), ("stone", 4)]
            }
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
}
