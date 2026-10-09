use super::*;

/// Faith at which a tribe raises a place of worship to its gods.
pub(super) const DEVOUT_FAITH: i32 = 8;

/// A shrine (or, from the Bronze Age, a temple) for a tribe whose prayers
/// the gods have answered often, if it has no place of worship yet.
pub(super) fn devout_target(
    sim: &Simulation,
    lid: &str,
    era: Era,
    pop: usize,
    considered: &HashSet<BuildingKind>,
) -> Option<BuildingKind> {
    use BuildingKind::*;
    if era < Era::Stone || sim.prayers.faith.get(lid).is_none_or(|&f| f < DEVOUT_FAITH) {
        return None;
    }
    let worship = [Shrine, Temple, Cathedral, Mosque, Synagogue, Pagoda];
    if worship.iter().any(|k| considered.contains(k)) {
        return None;
    }
    let temple_ready =
        era >= Era::Bronze && pop >= construction_population_requirement(12, sim.population_limit());
    Some(if temple_ready { Temple } else { Shrine })
}

/// Modern science needs somewhere to be done, and without a laboratory no
/// tribe learns anything past the Industrial age. A tribe raises its
/// schools, observatory and university ahead of the rest of the town so the
/// ages beyond are never held up behind a long list of market stalls.
pub(super) fn research_target(
    era: Era,
    pop: usize,
    population_limit: usize,
    existing: &HashSet<BuildingKind>,
) -> Option<BuildingKind> {
    use BuildingKind::*;
    const RESEARCH_FIRST: [(Era, usize, BuildingKind); 6] = [
        (Era::Classical, 18, School),
        (Era::Classical, 18, Library),
        (Era::Classical, 22, Observatory),
        (Era::Renaissance, 40, University),
        (Era::Information, 140, Datacenter),
        (Era::Digital, 180, ResearchLab),
    ];
    RESEARCH_FIRST.into_iter().find_map(|(from, base, kind)| {
        (era >= from
            && pop >= construction_population_requirement(base, population_limit)
            && !existing.contains(&kind))
        .then_some(kind)
    })
}

pub(super) fn next_target_building(
    era: Era,
    pop: usize,
    population_limit: usize,
    existing: &HashSet<BuildingKind>,
) -> Option<BuildingKind> {
    use BuildingKind::*;
    let mut wishlist: Vec<BuildingKind> = Vec::new();
    let meets = |base| pop >= construction_population_requirement(base, population_limit);
    if let Some(kind) = research_target(era, pop, population_limit, existing) {
        return Some(kind);
    }
    if era >= Era::Stone && meets(3) {
        wishlist.push(Hut);
        wishlist.push(Tent);
        wishlist.push(Well);
        wishlist.push(Signpost);
        wishlist.push(Shrine);
    }
    if era >= Era::Stone && meets(6) {
        wishlist.push(Watchtower);
        wishlist.push(Fence);
        wishlist.push(Gate);
        wishlist.push(Cart);
    }
    if era >= Era::Bronze && meets(8) {
        wishlist.push(House);
        wishlist.push(Forge);
        wishlist.push(Granary);
        wishlist.push(MarketStall);
        wishlist.push(Smithy);
    }
    if era >= Era::Bronze && meets(10) {
        wishlist.push(Quarry);
        wishlist.push(Mine);
        wishlist.push(SawMill);
        wishlist.push(Tannery);
        wishlist.push(Stable);
    }
    if era >= Era::Bronze && meets(12) {
        wishlist.push(Temple);
        wishlist.push(Garden);
        wishlist.push(Orchard);
        wishlist.push(Pond);
        wishlist.push(Cemetery);
        wishlist.push(Monument);
        wishlist.push(Obelisk);
    }
    if era >= Era::Iron && meets(15) {
        wishlist.push(Market);
        wishlist.push(Workshop);
        wishlist.push(Plaza);
        wishlist.push(Port);
        wishlist.push(FoodCart);
    }
    if era >= Era::Iron && meets(18) {
        wishlist.push(Butcher);
        wishlist.push(Fishmonger);
        wishlist.push(Cheesemonger);
        wishlist.push(Herbalist);
        wishlist.push(Tailor);
        wishlist.push(Cobbler);
        wishlist.push(Goldsmith);
    }
    if era >= Era::Classical && meets(18) {
        wishlist.push(School);
        wishlist.push(Library);
        wishlist.push(Bridge);
        wishlist.push(Bathhouse);
        wishlist.push(Pyramid);
        wishlist.push(Ziggurat);
        wishlist.push(Coliseum);
        wishlist.push(TriumphalArch);
    }
    if era >= Era::Classical && meets(22) {
        wishlist.push(Aqueduct);
        wishlist.push(Observatory);
        wishlist.push(ClockTower);
        wishlist.push(Mausoleum);
        wishlist.push(Pavilion);
        wishlist.push(Gazebo);
        wishlist.push(Bandstand);
    }
    if era >= Era::Medieval && meets(25) {
        wishlist.push(Manor);
        wishlist.push(Mill);
        wishlist.push(Castle);
        wishlist.push(Tavern);
        wishlist.push(Brewery);
        wishlist.push(Apothecary);
        wishlist.push(Jeweler);
        wishlist.push(Scribe);
    }
    if era >= Era::Medieval && meets(30) {
        wishlist.push(Cathedral);
        wishlist.push(Inn);
        wishlist.push(Bakery);
        wishlist.push(Windmill);
        wishlist.push(GuildHall);
        wishlist.push(Barbershop);
        wishlist.push(Vineyard);
        wishlist.push(Ranch);
        wishlist.push(Dovecote);
        wishlist.push(Kennel);
        wishlist.push(Pagoda);
        wishlist.push(Stupa);
        wishlist.push(Mosque);
        wishlist.push(Synagogue);
    }
    if era >= Era::Renaissance && meets(40) {
        wishlist.push(University);
        wishlist.push(TownHouse);
        wishlist.push(Theatre);
        wishlist.push(ClothingShop);
        wishlist.push(BookStore);
        wishlist.push(ArtGallery);
        wishlist.push(MusicHall);
        wishlist.push(Cafe);
        wishlist.push(Restaurant);
        wishlist.push(Hotel);
    }
    if era >= Era::Renaissance && meets(45) {
        wishlist.push(Bank);
        wishlist.push(Courthouse);
        wishlist.push(CityHall);
        wishlist.push(PostOffice);
        wishlist.push(Greenhouse);
        wishlist.push(Marina);
        wishlist.push(Drydock);
    }
    if era >= Era::Industrial && meets(60) {
        wishlist.push(Factory);
        wishlist.push(TrainStation);
        wishlist.push(Barracks);
        wishlist.push(PoliceStation);
        wishlist.push(FireStation);
        wishlist.push(Pharmacy);
        wishlist.push(Clinic);
        wishlist.push(Spa);
        wishlist.push(Refinery);
        wishlist.push(PowerPlant);
        wishlist.push(Substation);
        wishlist.push(WaterTower);
        wishlist.push(Reservoir);
        wishlist.push(Warehouse);
        wishlist.push(Silo);
    }
    if era >= Era::Industrial && meets(70) {
        wishlist.push(Museum);
        wishlist.push(Lighthouse);
        wishlist.push(Lighthouse2);
        wishlist.push(BillBoard);
        wishlist.push(StreetLight);
        wishlist.push(Lamppost);
        wishlist.push(TelephonePole);
        wishlist.push(BusStop);
        wishlist.push(Crane);
        wishlist.push(Hangar);
        wishlist.push(Dock);
    }
    if era >= Era::Modern && meets(100) {
        wishlist.push(Hospital);
        wishlist.push(Apartment);
        wishlist.push(Stadium);
        wishlist.push(GasStation);
        wishlist.push(AutoShop);
        wishlist.push(Garage);
        wishlist.push(MallShop);
        wishlist.push(Supermarket);
        wishlist.push(ParkingLot);
        wishlist.push(PlayGround);
        wishlist.push(FoodTruck);
        wishlist.push(NeonSign);
        wishlist.push(ArcadeBox);
        wishlist.push(Fountain2);
    }
    if era >= Era::Modern && meets(120) {
        wishlist.push(Airport);
        wishlist.push(Greenhouse2);
        wishlist.push(MushroomFarm);
        wishlist.push(Aquaculture);
    }
    if era >= Era::Information && meets(140) {
        wishlist.push(OfficeTower);
        wishlist.push(Skyscraper);
        wishlist.push(Datacenter);
        wishlist.push(Studio);
        wishlist.push(WindTurbine);
        wishlist.push(SolarPanel);
        wishlist.push(ChargingStation);
        wishlist.push(RoboticArm);
        wishlist.push(Drone);
    }
    if era >= Era::Atomic && meets(160) {
        wishlist.push(RadioTower);
        wishlist.push(SatelliteDish);
        wishlist.push(Spaceport);
        wishlist.push(SolarArray);
        wishlist.push(WindFarm);
    }
    if era >= Era::Digital && meets(180) {
        wishlist.push(NeuralHub);
        wishlist.push(AiCore);
        wishlist.push(ResearchLab);
        wishlist.push(HoloBoard);
    }
    if era >= Era::Fusion && meets(220) {
        wishlist.push(FusionPlant);
        wishlist.push(OrbitalLift);
        wishlist.push(Biodome);
        wishlist.push(Cryolab);
        wishlist.push(NanoFab);
    }
    if era >= Era::Solar && meets(240) {
        wishlist.push(Hyperloop);
        wishlist.push(Maglev);
        wishlist.push(Hospital2);
    }
    if era >= Era::Galactic && meets(450) {
        wishlist.push(Megastructure);
    }
    wishlist.into_iter().find(|&k| !existing.contains(&k))
}

/// A stone-age workshop is where a tribe makes things by hand (carved bowls,
/// spoons, pipes, dolls, kites), and the workshop workplace gate needs one
/// nearby. A tribe of six raises its first one before its next home.
pub(super) fn first_workshop_target(
    era: Era,
    pop: usize,
    existing: &HashSet<BuildingKind>,
) -> Option<BuildingKind> {
    let ready = era >= Era::Stone && pop >= 6;
    (ready && !existing.contains(&BuildingKind::Workshop)).then_some(BuildingKind::Workshop)
}

#[cfg(test)]
mod tests {
    use super::*;
    use BuildingKind::*;

    #[test]
    fn a_tribe_of_six_raises_its_first_workshop_before_its_next_home() {
        let built: HashSet<BuildingKind> = [Hut, Tent, Well].into_iter().collect();
        assert_eq!(first_workshop_target(Era::Stone, 6, &built), Some(Workshop));
        // Below six people a tribe has no room for a workshop yet.
        assert_eq!(first_workshop_target(Era::Stone, 5, &built), None);
    }

    #[test]
    fn a_tribe_with_a_workshop_does_not_raise_another_one_in_the_stone_age() {
        let built: HashSet<BuildingKind> = [Hut, Workshop].into_iter().collect();
        assert_eq!(first_workshop_target(Era::Stone, 40, &built), None);
    }
}
