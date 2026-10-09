#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Biome {
    Grassland = 0,
    Forest = 1,
    Desert = 2,
    Wetland = 3,
    Tundra = 4,
    Volcanic = 5,
    /// Hot and very wet: dense, fertile, full of food.
    Jungle = 6,
    /// Hot and semi-dry: golden grass and scattered trees.
    Savanna = 7,
    /// Cold forest: dense snowy pines.
    Taiga = 8,
    /// Hot, dry uplands: red rock and dust.
    Badlands = 9,
}

impl Biome {
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => Biome::Forest,
            2 => Biome::Desert,
            3 => Biome::Wetland,
            4 => Biome::Tundra,
            5 => Biome::Volcanic,
            6 => Biome::Jungle,
            7 => Biome::Savanna,
            8 => Biome::Taiga,
            9 => Biome::Badlands,
            _ => Biome::Grassland,
        }
    }
    /// Covered in trees people can fell for wood.
    pub fn wooded(self) -> bool {
        matches!(self, Biome::Forest | Biome::Jungle | Biome::Taiga)
    }
    pub fn food_growth_mult(self) -> f32 {
        match self {
            Biome::Grassland => 1.0,
            Biome::Forest => 2.2,
            Biome::Desert => 0.08,
            Biome::Wetland => 1.9,
            Biome::Tundra => 0.25,
            Biome::Volcanic => 0.15,
            Biome::Jungle => 2.6,
            Biome::Savanna => 0.7,
            Biome::Taiga => 0.9,
            Biome::Badlands => 0.15,
        }
    }
    pub fn initial_food_chance(self) -> f32 {
        match self {
            Biome::Grassland => 0.10,
            Biome::Forest => 0.22,
            Biome::Desert => 0.02,
            Biome::Wetland => 0.15,
            Biome::Tundra => 0.04,
            Biome::Volcanic => 0.03,
            Biome::Jungle => 0.26,
            Biome::Savanna => 0.07,
            Biome::Taiga => 0.08,
            Biome::Badlands => 0.02,
        }
    }
    pub fn base_fertility(self) -> f32 {
        match self {
            Biome::Grassland => 0.72,
            Biome::Forest => 0.88,
            Biome::Desert => 0.12,
            Biome::Wetland => 0.82,
            Biome::Tundra => 0.32,
            Biome::Volcanic => 0.18,
            Biome::Jungle => 0.92,
            Biome::Savanna => 0.5,
            Biome::Taiga => 0.5,
            Biome::Badlands => 0.15,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(i8)]
pub enum Tile {
    Void = 0,
    Grass = 1,
    Water = 2,
    Food = 3,
    Fire = 4,
    Rock = 5,
    Ash = 6,
    Campfire = 7,
    Hut = 8,
    Flooded = 9,
    Mineral = 10,
    Scorched = 11,
    Snow = 12,
    Sand = 13,
    /// Molten rock: flows downhill slowly, sets fire to what burns, kills what it touches, cools to rock.
    Lava = 14,
    /// Frozen water: people walk across it; it melts back to water when the cold lets go.
    Ice = 15,
}

impl Tile {
    pub fn from_i8(v: i8) -> Self {
        match v {
            1 => Tile::Grass,
            2 => Tile::Water,
            3 => Tile::Food,
            4 => Tile::Fire,
            5 => Tile::Rock,
            6 => Tile::Ash,
            7 => Tile::Campfire,
            8 => Tile::Hut,
            9 => Tile::Flooded,
            10 => Tile::Mineral,
            11 => Tile::Scorched,
            12 => Tile::Snow,
            13 => Tile::Sand,
            14 => Tile::Lava,
            15 => Tile::Ice,
            _ => Tile::Void,
        }
    }

    pub fn walkable(self) -> bool {
        !matches!(
            self,
            Tile::Rock | Tile::Void | Tile::Hut | Tile::Mineral | Tile::Lava
        )
    }

    /// Ground a road can be laid on: open land, not water, rock, fire or built things.
    pub fn road_ground(self) -> bool {
        matches!(
            self,
            Tile::Grass | Tile::Sand | Tile::Snow | Tile::Ash | Tile::Food
        )
    }

    pub fn flammable(self) -> bool {
        matches!(self, Tile::Grass | Tile::Food)
    }
}
