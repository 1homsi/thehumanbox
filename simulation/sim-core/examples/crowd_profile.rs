//! Isolated native simulation benchmark; never loads or modifies a saved world.
use sim_core::organism::{
    animal::{Animal, AnimalKind},
    organism::Organism,
    traits::Traits,
};
use sim_core::sim::{
    buildings::{Building, BuildingKind},
    era::Era,
    simulation::Simulation,
};
use std::time::Instant;
fn main() {
    let count: usize = std::env::args().nth(1).unwrap_or("5000".into()).parse().unwrap();
    let ticks: usize = std::env::args().nth(2).unwrap_or("30".into()).parse().unwrap();
    let animal_count: Option<usize> = std::env::args().nth(3).map(|value| value.parse().unwrap());
    let dog_count: usize = std::env::args().nth(4).unwrap_or("0".into()).parse().unwrap();
    let building_count: usize = std::env::args().nth(5).unwrap_or("0".into()).parse().unwrap();
    assert!(count > 0 && count <= 50_000 && ticks > 0);
    assert!(animal_count.is_none_or(|count| count <= 400));
    assert!(dog_count <= animal_count.unwrap_or(0));
    assert!(building_count <= 1_500);
    let mut sim = Simulation::new(42);
    sim.set_population_limit(count);
    sim.organisms.clear();
    for i in 0..count {
        let mut person = Organism::new(
            format!("crowd-{i}"),
            "Resident".into(),
            0.0,
            0.0,
            1,
            String::new(),
            format!("clan-{}", i % 20),
            100_000,
            Traits::default(),
        );
        person.age = 40_000;
        person.id = format!("crowd-{i}");
        person.x = 40.0 + (i * 17 % 400) as f32;
        person.y = 40.0 + (i * 7 % 200) as f32;
        if building_count > 0 {
            const SPECIALTIES: [&str; 10] = [
                "merchant",
                "builder",
                "scholar",
                "soldier",
                "healer",
                "artist",
                "programmer",
                "farmer",
                "priest",
                "engineer",
            ];
            person.specialty = Some(SPECIALTIES[i % SPECIALTIES.len()].to_string());
            person.is_leader = i % 20 == 0;
            person.literacy = 1.0;
            person.inv_food = 4;
            person.inv_wood = 4;
            person.inv_stone = 4;
            person.wealth = 100;
            person.discoveries.extend(
                [
                    "shelter",
                    "barter",
                    "currency",
                    "writing",
                    "metalworking",
                    "masonry",
                    "agriculture",
                    "medicine",
                    "electricity",
                    "computer",
                    "weaving",
                ]
                .into_iter()
                .map(str::to_string),
            );
        }
        sim.organisms.push(person);
    }
    if building_count > 0 {
        const KINDS: [BuildingKind; 20] = [
            BuildingKind::Hut,
            BuildingKind::Workshop,
            BuildingKind::Market,
            BuildingKind::Temple,
            BuildingKind::Hospital,
            BuildingKind::Forge,
            BuildingKind::University,
            BuildingKind::Cafe,
            BuildingKind::Tailor,
            BuildingKind::Butcher,
            BuildingKind::Brewery,
            BuildingKind::Port,
            BuildingKind::PostOffice,
            BuildingKind::Factory,
            BuildingKind::Library,
            BuildingKind::Inn,
            BuildingKind::Bank,
            BuildingKind::School,
            BuildingKind::Observatory,
            BuildingKind::ResearchLab,
        ];
        eprintln!("stress fixture: {building_count} completed buildings, information-era lineages");
        sim.buildings.clear();
        for i in 0..building_count {
            let mut building = Building::new(
                i as u32 + 1,
                KINDS[i % KINDS.len()],
                20 + (i * 37 % 1180) as i32,
                20 + (i * 53 % 700) as i32,
                Some(format!("clan-{}", i % 20)),
                0,
            );
            building.condition = 1.0;
            sim.buildings.push(building);
        }
        sim.next_building_id = building_count as u32 + 1;
        for i in 0..20 {
            sim.lineage_eras.insert(format!("clan-{i}"), Era::Information);
        }
    }
    if let Some(animal_count) = animal_count {
        eprintln!("stress fixture: {animal_count} animals, {dog_count} bonded dogs");
        sim.animals.clear();
        for i in 0..animal_count {
            let kind = if i < dog_count {
                AnimalKind::Dog
            } else if i % 8 == 0 {
                AnimalKind::Wolf
            } else {
                AnimalKind::Rabbit
            };
            let mut animal = Animal::new(
                i,
                35.0 + (i * 37 % 410) as f32,
                35.0 + (i * 23 % 210) as f32,
                kind,
            );
            if kind == AnimalKind::Dog {
                animal.bonded_org = Some(format!("crowd-{}", i * 37 % count));
            }
            sim.animals.push(animal);
        }
    }
    let start = Instant::now();
    for tick in 0..ticks {
        let tick_start = Instant::now();
        sim.tick();
        eprintln!(
            "tick {}: {:.2} ms, {} alive",
            tick + 1,
            tick_start.elapsed().as_secs_f64() * 1000.0,
            sim.organisms.iter().filter(|person| person.alive).count()
        );
    }
    println!(
        "{count} people: mean tick {:.2} ms",
        start.elapsed().as_secs_f64() * 1000.0 / ticks as f64
    );
    let start = Instant::now();
    let json = sim.state_json_incremental().to_string();
    println!(
        "incremental frame {:.2} ms, {} bytes",
        start.elapsed().as_secs_f64() * 1000.0,
        json.len()
    );
}
