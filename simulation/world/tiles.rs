#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u8)]
pub enum Biome {
    Grassland = 0,
    Forest    = 1,
    Desert    = 2,
    Wetland   = 3,
    Tundra    = 4,
    Volcanic  = 5,
}

impl Biome {
    pub fn from_u8(v: u8) -> Self {
        match v { 1 => Biome::Forest, 2 => Biome::Desert, 3 => Biome::Wetland,
                  4 => Biome::Tundra, 5 => Biome::Volcanic, _ => Biome::Grassland }
    }
    pub fn base_temp(self) -> f32 {
        match self { Biome::Grassland=>22.0, Biome::Forest=>18.0, Biome::Desert=>45.0,
                     Biome::Wetland=>20.0, Biome::Tundra=>-5.0, Biome::Volcanic=>80.0 }
    }
    pub fn food_growth_mult(self) -> f32 {
        match self { Biome::Grassland=>1.0, Biome::Forest=>2.2, Biome::Desert=>0.08,
                     Biome::Wetland=>1.9, Biome::Tundra=>0.25, Biome::Volcanic=>0.15 }
    }
    pub fn initial_food_chance(self) -> f32 {
        match self { Biome::Grassland=>0.10, Biome::Forest=>0.22, Biome::Desert=>0.02,
                     Biome::Wetland=>0.15, Biome::Tundra=>0.04, Biome::Volcanic=>0.03 }
    }
    pub fn rock_chance(self) -> f32 {
        match self { Biome::Volcanic=>0.14, Biome::Tundra=>0.08, Biome::Desert=>0.06,
                     _ => 0.03 }
    }
    pub fn base_fertility(self) -> f32 {
        match self { Biome::Grassland=>0.72, Biome::Forest=>0.88, Biome::Desert=>0.12,
                     Biome::Wetland=>0.82, Biome::Tundra=>0.32, Biome::Volcanic=>0.18 }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(i8)]
pub enum Tile {
    Void     = 0,
    Grass    = 1,
    Water    = 2,
    Food     = 3,
    Fire     = 4,
    Rock     = 5,
    Ash      = 6,
    Campfire = 7,
    Hut      = 8,
    Flooded  = 9,  // temporary shallow water from storm flooding, reverts after time
    Mineral  = 10, // rare volcanic mineral deposit
    Scorched = 11, // long-term burn scar after major fires, slowly recovers to grass
    Snow     = 12, // polar/tundra ground
    Sand     = 13, // desert ground
}

impl Tile {
    pub fn from_i8(v: i8) -> Self {
        match v {
            1  => Tile::Grass,
            2  => Tile::Water,
            3  => Tile::Food,
            4  => Tile::Fire,
            5  => Tile::Rock,
            6  => Tile::Ash,
            7  => Tile::Campfire,
            8  => Tile::Hut,
            9  => Tile::Flooded,
            10 => Tile::Mineral,
            11 => Tile::Scorched,
            12 => Tile::Snow,
            13 => Tile::Sand,
            _  => Tile::Void,
        }
    }

    pub fn walkable(self) -> bool {
        !matches!(self, Tile::Rock | Tile::Void | Tile::Hut | Tile::Mineral)
    }

    pub fn flammable(self) -> bool {
        matches!(self, Tile::Grass | Tile::Food)  // Farm is irrigated — not flammable
    }


    pub fn is_warm(self) -> bool {
        matches!(self, Tile::Fire | Tile::Campfire)
    }
}
