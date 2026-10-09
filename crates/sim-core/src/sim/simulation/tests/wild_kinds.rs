//! Wild kinds with a habitat: where foxes and cats are placed in the world.

use super::*;
use crate::world::grid::{HEIGHT, WIDTH};
use crate::world::tiles::Biome;

#[test]
fn foxes_are_shy_prey_and_cats_keep_their_distance() {
    assert!(AnimalKind::Fox.is_prey(), "wolves hunt foxes");
    assert!(!AnimalKind::Cat.is_prey(), "cats are not game");
    for kind in [AnimalKind::Fox, AnimalKind::Cat] {
        assert!(!kind.hostile(), "{} is not a danger to people", kind.name());
        assert!(kind.flee_radius() > 0.0, "{} keeps away from people", kind.name());
        assert!(kind.drain() > 0.0 && kind.step_size() > 0);
    }
    assert_eq!(AnimalKind::Fox.name(), "fox");
    assert_eq!(AnimalKind::Cat.name(), "cat");
}

#[test]
fn wild_foxes_are_placed_in_their_habitat_and_cats_anywhere() {
    let mut sim = Simulation::new(11);
    sim.animals.clear();
    // Desert everywhere, forest on the western half: a fox should always find
    // the woods, while a cat has no such preference.
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let forest = x < WIDTH as i32 / 2;
            sim.grid.biome[WorldGrid::idx(x, y)] = if forest { Biome::Forest } else { Biome::Desert } as u8;
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    for _ in 0..40 {
        sim.spawn_animal_of_kind(AnimalKind::Fox);
    }
    assert_eq!(sim.animals.len(), 40);
    for fox in &sim.animals {
        assert_eq!(
            sim.grid.biome_at(fox.x as i32, fox.y as i32),
            Biome::Forest,
            "fox at ({}, {})",
            fox.x,
            fox.y
        );
    }

    sim.animals.clear();
    for _ in 0..200 {
        sim.spawn_animal_of_kind(AnimalKind::Cat);
    }
    let biomes: Vec<Biome> = sim
        .animals
        .iter()
        .map(|cat| sim.grid.biome_at(cat.x as i32, cat.y as i32))
        .collect();
    assert!(biomes.contains(&Biome::Desert), "cats reach the desert");
    assert!(biomes.contains(&Biome::Forest), "cats reach the forest");
}

#[test]
fn penguins_camels_frogs_and_whales_keep_to_their_own_ground() {
    assert!(AnimalKind::Whale.aquatic(), "whales swim");
    assert!(AnimalKind::Whale.fits_ground(Tile::Water));
    assert!(
        !AnimalKind::Whale.fits_ground(Tile::Grass),
        "whales stay in the water"
    );
    assert!(
        !AnimalKind::Penguin.fits_ground(Tile::Water),
        "penguins walk on snow, not water"
    );
    assert!(AnimalKind::Penguin.fits_ground(Tile::Snow));
    assert!(AnimalKind::Penguin.herds(), "penguins huddle together");
    assert!(AnimalKind::Frog.is_prey(), "wolves and bears eat frogs");
    for kind in [
        AnimalKind::Penguin,
        AnimalKind::Camel,
        AnimalKind::Frog,
        AnimalKind::Whale,
    ] {
        assert!(!kind.hostile(), "{} is not a danger to people", kind.name());
        assert!(kind.drain() > 0.0 && kind.step_size() > 0);
    }
    assert_eq!(AnimalKind::Camel.name(), "camel");
    assert_eq!(AnimalKind::Whale.a_name(), "a whale");
}

#[test]
fn released_camels_land_in_the_desert_and_whales_only_in_water() {
    let mut sim = Simulation::new(5);
    sim.animals.clear();
    // Sand desert on the western half, grass on the eastern half, with a lake in the middle of the desert.
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let desert = x < WIDTH as i32 / 2;
            sim.grid.biome[WorldGrid::idx(x, y)] =
                if desert { Biome::Desert } else { Biome::Grassland } as u8;
            sim.grid.set(x, y, if desert { Tile::Sand } else { Tile::Grass });
        }
    }
    for x in 40..46 {
        for y in 40..46 {
            sim.grid.set(x, y, Tile::Water);
        }
    }
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":60.0,"y":60.0,"kind":"camel","count":12,"radius":12}"#
    ));
    assert!(sim.animals.len() >= 12);
    for camel in &sim.animals {
        assert_eq!(
            sim.grid.biome_at(camel.x as i32, camel.y as i32),
            Biome::Desert,
            "camel at ({}, {})",
            camel.x,
            camel.y
        );
    }

    sim.animals.clear();
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":43.0,"y":43.0,"kind":"whale","count":3,"radius":4}"#
    ));
    assert!(!sim.animals.is_empty(), "a whale finds the lake");
    for whale in &sim.animals {
        assert_eq!(
            sim.grid.get(whale.x as i32, whale.y as i32),
            Tile::Water,
            "whale stays in water"
        );
    }
}

#[test]
fn ducks_and_bees_are_harmless_and_keep_to_their_own_ground() {
    assert!(AnimalKind::Duck.is_prey(), "wolves and foxes eat ducks");
    assert!(AnimalKind::Duck.herds(), "ducks flock together");
    assert!(AnimalKind::Duck.fits_ground(Tile::Grass));
    assert!(AnimalKind::Bee.flies(), "bees fly over the land");
    assert!(!AnimalKind::Bee.is_prey(), "bees are left alone by predators");
    for kind in [AnimalKind::Duck, AnimalKind::Bee] {
        assert!(!kind.hostile(), "{} is not a danger to people", kind.name());
        assert!(kind.drain() > 0.0 && kind.step_size() > 0);
    }
    assert_eq!(AnimalKind::Bee.a_name(), "a bee");
    assert_eq!(AnimalKind::Duck.name(), "duck");
}

#[test]
fn released_ducks_and_bees_are_placed_when_the_ground_suits_them() {
    let mut sim = Simulation::new(6);
    sim.animals.clear();
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let wet = x < WIDTH as i32 / 2;
            sim.grid.biome[WorldGrid::idx(x, y)] = if wet { Biome::Wetland } else { Biome::Desert } as u8;
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":40.0,"y":60.0,"kind":"duck","count":6,"radius":8}"#
    ));
    assert!(sim.animals.len() >= 6, "ducks are released");
    assert!(sim.animals.iter().all(|a| matches!(a.kind, AnimalKind::Duck)));
    sim.animals.clear();
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":200.0,"y":60.0,"kind":"bee","count":4,"radius":6}"#
    ));
    assert!(!sim.animals.is_empty(), "bees are released");
    assert!(sim.animals.iter().all(|a| matches!(a.kind, AnimalKind::Bee)));
}

#[test]
fn a_wild_cat_that_stays_by_a_person_takes_to_them() {
    let mut sim = Simulation::new(7);
    for o in sim.organisms.iter_mut() {
        o.alive = false;
    }
    sim.organisms[0].alive = true;
    sim.organisms[0].x = 100.0;
    sim.organisms[0].y = 100.0;
    sim.organisms[0].health = 1.0;
    sim.animals.clear();
    sim.animals.push(crate::organism::animal::Animal::new(
        9_001,
        101.0,
        100.0,
        AnimalKind::Cat,
    ));
    let owner = sim.organisms[0].id.clone();
    for _ in 0..4000 {
        // Keep the person and the cat beside each other, so only the chance decides the bond.
        sim.organisms[0].x = 100.0;
        sim.organisms[0].y = 100.0;
        sim.organisms[0].alive = true;
        sim.animals[0].alive = true;
        sim.animals[0].x = 101.0;
        sim.animals[0].y = 100.0;
        sim.tick();
        if sim.animals[0].bonded_org.is_some() {
            break;
        }
    }
    assert_eq!(
        sim.animals[0].bonded_org.as_deref(),
        Some(owner.as_str()),
        "the cat took to the person beside it"
    );
    assert!(matches!(sim.animals[0].kind, AnimalKind::Cat), "it stays a cat");
    assert!(sim.animals[0].name.is_some(), "the cat has a name");
}

#[test]
fn owls_and_eagles_are_harmless_fliers_that_are_never_caught() {
    for kind in [AnimalKind::Owl, AnimalKind::Eagle] {
        assert!(kind.flies(), "{} flies over the land", kind.name());
        assert!(!kind.is_prey(), "{} is not hunted as prey", kind.name());
        assert!(!kind.hostile(), "{} is no danger to people", kind.name());
        assert!(kind.drain() > 0.0 && kind.step_size() > 0);
        assert!(!kind.habitat().is_empty(), "{} keeps to a habitat", kind.name());
    }
    assert!(AnimalKind::Owl.fits_ground(Tile::Grass));
    assert_eq!(AnimalKind::Owl.a_name(), "an owl");
    assert_eq!(AnimalKind::Eagle.a_name(), "an eagle");
}

#[test]
fn released_owls_and_eagles_are_placed_in_their_habitat() {
    let mut sim = Simulation::new(8);
    sim.animals.clear();
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let biome = if x < WIDTH as i32 / 2 {
                Biome::Forest
            } else {
                Biome::Badlands
            };
            sim.grid.biome[WorldGrid::idx(x, y)] = biome as u8;
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    assert!(sim
        .apply_command_json(r#"{"cmd":"spawn_animal","x":40.0,"y":60.0,"kind":"owl","count":5,"radius":8}"#));
    assert!(sim.animals.len() >= 5, "owls are released");
    assert!(sim.animals.iter().all(|a| matches!(a.kind, AnimalKind::Owl)));
    sim.animals.clear();
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":200.0,"y":60.0,"kind":"eagle","count":4,"radius":6}"#
    ));
    assert!(!sim.animals.is_empty(), "eagles are released");
    assert!(sim.animals.iter().all(|a| matches!(a.kind, AnimalKind::Eagle)));
}

#[test]
fn snakes_keep_to_the_ground_and_a_hungry_crocodile_is_dangerous() {
    for kind in [AnimalKind::Snake, AnimalKind::Crocodile] {
        assert!(!kind.flies(), "{} walks the ground", kind.name());
        assert!(!kind.habitat().is_empty(), "{} keeps to a habitat", kind.name());
        assert!(kind.drain() > 0.0 && kind.step_size() > 0);
    }
    assert!(!AnimalKind::Snake.hostile(), "a snake keeps out of people's way");
    assert!(
        AnimalKind::Crocodile.predator(),
        "a crocodile hunts, as a bear does"
    );
    assert!(
        AnimalKind::Crocodile.hostile(),
        "a hungry crocodile is a danger to people"
    );
    assert_eq!(AnimalKind::Snake.a_name(), "a snake");
    assert_eq!(AnimalKind::Crocodile.a_name(), "a crocodile");
}

#[test]
fn released_crocodiles_are_placed_in_the_swamp() {
    let mut sim = Simulation::new(9);
    sim.animals.clear();
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let biome = if x < WIDTH as i32 / 2 {
                Biome::Wetland
            } else {
                Biome::Tundra
            };
            sim.grid.biome[WorldGrid::idx(x, y)] = biome as u8;
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":40.0,"y":60.0,"kind":"crocodile","count":4,"radius":8}"#
    ));
    assert!(!sim.animals.is_empty(), "crocodiles are released");
    assert!(sim
        .animals
        .iter()
        .all(|a| matches!(a.kind, AnimalKind::Crocodile)));
}

#[test]
fn released_monkeys_swing_through_the_jungle_and_no_other_ground() {
    assert!(
        !AnimalKind::Monkey.hostile(),
        "monkeys are not a danger to people"
    );
    assert!(!AnimalKind::Monkey.is_prey(), "monkeys are not game");
    assert!(
        AnimalKind::Monkey.flee_radius() > 0.0,
        "monkeys keep away from people"
    );
    assert!(AnimalKind::Monkey.drain() > 0.0 && AnimalKind::Monkey.step_size() > 0);
    assert_eq!(AnimalKind::Monkey.name(), "monkey");
    assert_eq!(AnimalKind::Monkey.a_name(), "a monkey");
    assert_eq!(AnimalKind::Monkey.habitat(), &[Biome::Jungle]);

    let mut sim = Simulation::new(19);
    sim.animals.clear();
    // Jungle on the western half, desert on the eastern half, all of it grass.
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let jungle = x < WIDTH as i32 / 2;
            sim.grid.biome[WorldGrid::idx(x, y)] = if jungle { Biome::Jungle } else { Biome::Desert } as u8;
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":60.0,"y":60.0,"kind":"monkey","count":12,"radius":12}"#
    ));
    assert!(sim.animals.len() >= 12);
    for monkey in &sim.animals {
        assert_eq!(
            sim.grid.biome_at(monkey.x as i32, monkey.y as i32),
            Biome::Jungle,
            "monkey at ({}, {})",
            monkey.x,
            monkey.y
        );
    }
}

#[test]
fn released_goats_keep_to_their_habitat() {
    assert!(AnimalKind::Goat.drain() > 0.0 && AnimalKind::Goat.step_size() > 0);
    assert_eq!(AnimalKind::Goat.name(), "goat");
    let mut sim = Simulation::new(23);
    sim.animals.clear();
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let home = x < WIDTH as i32 / 2;
            sim.grid.biome[WorldGrid::idx(x, y)] = if home { Biome::Badlands } else { Biome::Jungle } as u8;
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":60.0,"y":60.0,"kind":"goat","count":12,"radius":12}"#
    ));
    assert!(sim.animals.len() >= 12);
    for a in &sim.animals {
        assert_eq!(
            sim.grid.biome_at(a.x as i32, a.y as i32),
            Biome::Badlands,
            "goat at ({}, {})",
            a.x,
            a.y
        );
    }
}

#[test]
fn released_elephants_keep_to_their_habitat() {
    assert!(AnimalKind::Elephant.drain() > 0.0 && AnimalKind::Elephant.step_size() > 0);
    assert_eq!(AnimalKind::Elephant.name(), "elephant");
    let mut sim = Simulation::new(29);
    sim.animals.clear();
    for x in 0..WIDTH as i32 {
        for y in 0..HEIGHT as i32 {
            let home = x < WIDTH as i32 / 2;
            sim.grid.biome[WorldGrid::idx(x, y)] = if home { Biome::Savanna } else { Biome::Tundra } as u8;
            sim.grid.set(x, y, Tile::Grass);
        }
    }
    assert!(sim.apply_command_json(
        r#"{"cmd":"spawn_animal","x":60.0,"y":60.0,"kind":"elephant","count":12,"radius":12}"#
    ));
    assert!(sim.animals.len() >= 12);
    for a in &sim.animals {
        assert_eq!(
            sim.grid.biome_at(a.x as i32, a.y as i32),
            Biome::Savanna,
            "elephant at ({}, {})",
            a.x,
            a.y
        );
    }
}
