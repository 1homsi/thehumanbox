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
