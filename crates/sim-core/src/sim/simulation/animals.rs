use super::*;

/// Safety ceiling on a zombie outbreak; past it, victims stay dead.
pub(super) const MAX_ZOMBIES: usize = 250;

/// Chance each tick that a wild cat within reach of a person takes to them (see the cat bonds below).
const CAT_BOND_CHANCE: f32 = 0.002;

/// How close (Manhattan tiles) a second predator of its kind must be to make a hunter a pack.
const PACK_RANGE: f32 = 4.0;
/// How far (Manhattan tiles) a predator in a pack reaches prey; alone it reaches 1.5.
const PACK_REACH: f32 = 3.0;

impl Simulation {
    pub(super) fn spawn_animals(&mut self, count: usize) {
        for _ in 0..count {
            let r = self.rng.random::<f32>();
            let kind = if r < 0.22 {
                AnimalKind::Rabbit
            } else if r < 0.24 {
                AnimalKind::Fox
            } else if r < 0.40 {
                AnimalKind::Deer
            } else if r < 0.50 {
                AnimalKind::Boar
            } else if r < 0.62 {
                AnimalKind::Bird
            } else if r < 0.70 {
                AnimalKind::Fish
            } else if r < 0.76 {
                AnimalKind::Wolf
            } else if r < 0.79 {
                AnimalKind::Bear
            } else if r < 0.87 {
                AnimalKind::Sheep
            } else if r < 0.93 {
                AnimalKind::Cow
            } else if r < 0.97 {
                AnimalKind::Horse
            } else if r < 0.99 {
                AnimalKind::Chicken
            } else {
                AnimalKind::Cat
            };
            self.spawn_animal_of_kind(kind);
        }
    }

    pub(super) fn spawn_animal_of_kind(&mut self, kind: AnimalKind) {
        let habitat = kind.habitat();
        // Prefer the kind's habitat for a few tries, then take any free tile.
        for attempt in 0..60 {
            let x = self.rng.random_range(3..(WIDTH as i32 - 3)) as f32;
            let y = self.rng.random_range(3..(HEIGHT as i32 - 3)) as f32;
            let tile = self.grid.get(x as i32, y as i32);
            let at_home = habitat.is_empty()
                || attempt >= 40
                || habitat.contains(&self.grid.biome_at(x as i32, y as i32));
            if kind.fits_ground(tile) && at_home {
                let id = self.next_animal_id;
                self.next_animal_id += 1;
                self.animals.push(Animal::new(id, x, y, kind));
                return;
            }
        }
    }

    pub(super) fn tick_animals(&mut self, org_idx_by_id: &FxHashMap<String, usize>) {
        self.tick_animal_census();
        // Passive respawn floor. Without this, a transient extinction
        // (drought + hunting + wolves eating prey then starving) leaves
        // the world animal-less forever, since reproduction requires
        // living parents. Every 600 ticks, if the population dipped
        // below the floor, drip-spawn some back.
        if self.tick_count > 0 && self.tick_count.is_multiple_of(600) {
            let alive = self.animals.iter().filter(|a| a.alive).count();
            const ANIMAL_FLOOR: usize = 40;
            if alive < ANIMAL_FLOOR {
                let to_add = (ANIMAL_FLOOR - alive).min(10);
                self.spawn_animals(to_add);
            }

            const PER_KIND_FLOOR: &[(AnimalKind, usize)] = &[
                (AnimalKind::Rabbit, 14),
                (AnimalKind::Deer, 10),
                (AnimalKind::Boar, 6),
                (AnimalKind::Bird, 8),
                (AnimalKind::Fish, 6),
                (AnimalKind::Wolf, 4),
                (AnimalKind::Bear, 2),
                (AnimalKind::Sheep, 6),
                (AnimalKind::Cow, 4),
                (AnimalKind::Horse, 4),
                (AnimalKind::Chicken, 4),
                (AnimalKind::Fox, 4),
                (AnimalKind::Cat, 3),
            ];
            for &(kind, floor) in PER_KIND_FLOOR {
                let count = self.animals.iter().filter(|a| a.alive && a.kind == kind).count();
                if count < floor {
                    let need = (floor - count).min(3);
                    for _ in 0..need {
                        self.spawn_animal_of_kind(kind);
                    }
                }
            }
        }

        use crate::world::tiles::Biome;

        // Wild bears sleep the winter through: they keep still, need little
        // and neither hunt nor frighten anyone until spring.
        let winter = self.season() == "scarcity";
        // Family dogs sleep by their owner's hearth at night, once they have
        // walked home (see the owner loop below).
        let night = self.is_night();
        for animal in &mut self.animals {
            let wild = animal.alive && animal.bonded_org.is_none();
            animal.sleeping = winter && wild && animal.kind == AnimalKind::Bear;
            // Birds fly south for the winter and come back with the spring.
            animal.away = winter && wild && animal.kind == AnimalKind::Bird;
            if night && animal.alive && matches!(animal.kind, AnimalKind::Dog | AnimalKind::Cat) {
                let home = animal
                    .bonded_org
                    .as_ref()
                    .and_then(|bid| org_idx_by_id.get(bid))
                    .map(|&oi| &self.organisms[oi])
                    .filter(|o| o.alive);
                animal.sleeping = home
                    .map(|o| (o.home_x - animal.x).abs() + (o.home_y - animal.y).abs() <= 1.0)
                    .unwrap_or(false);
            }
        }

        // Animals only react to people within their chase/flee radius. Build
        // this after human movement, then reuse the query buffers for every
        // animal instead of scanning the entire population for each one.
        let human_spatial = SpatialIndex::build(&self.organisms, 10);
        let mut human_candidates = Vec::with_capacity(32);
        let mut nearby_humans = Vec::with_capacity(32);
        let mut wolf_candidates = Vec::with_capacity(32);

        let mut prey_pos_for_chase: Vec<(f32, f32)> = Vec::new();
        let mut wolf_pos_for_flee: Vec<(f32, f32)> = Vec::new();
        for animal in self
            .animals
            .iter()
            .filter(|animal| animal.alive && !animal.sleeping && !animal.away)
        {
            match animal.kind {
                kind if kind.is_prey() => prey_pos_for_chase.push((animal.x, animal.y)),
                kind if kind.hostile() => wolf_pos_for_flee.push((animal.x, animal.y)),
                _ => {}
            }
        }
        for animal in &mut self.animals {
            if animal.sleeping || animal.away {
                animal.energy = animal.energy.max(0.5);
                continue;
            }
            let human_radius = if animal.kind.hostile() {
                20
            } else {
                animal.kind.flee_radius().ceil() as i32
            };
            nearby_human_positions(
                &self.organisms,
                &human_spatial,
                animal.x,
                animal.y,
                human_radius,
                &mut human_candidates,
                &mut nearby_humans,
            );
            animal.tick(
                &self.grid,
                &nearby_humans,
                &prey_pos_for_chase,
                &wolf_pos_for_flee,
                &mut self.rng,
            );
        }

        self.tick_fish_schools();
        self.tick_bird_flocks();
        self.tick_scavengers();
        self.tick_herds();

        let prey_positions: Vec<(usize, f32, f32, AnimalKind)> = self
            .animals
            .iter()
            .enumerate()
            .filter(|(_, a)| a.alive && !a.away && a.kind.is_prey())
            .map(|(i, a)| (i, a.x, a.y, a.kind))
            .collect();
        let mut kills: Vec<(usize, usize)> = Vec::new();
        // A hungry wolf or bear with another of its kind close by hunts as a pack: the pair runs prey
        // down from a little further off than one predator alone can reach.
        let hunters: Vec<(usize, f32, f32, AnimalKind)> = self
            .animals
            .iter()
            .enumerate()
            .filter(|(_, a)| a.alive && a.kind.predator() && !a.sleeping)
            .map(|(i, a)| (i, a.x, a.y, a.kind))
            .collect();
        for (pi, pred) in self.animals.iter().enumerate() {
            if !pred.alive || !pred.kind.predator() || pred.sleeping {
                continue;
            }
            if pred.energy > 0.85 {
                continue;
            }
            let packed = hunters.iter().any(|&(oi, ox, oy, okind)| {
                oi != pi && okind == pred.kind && (ox - pred.x).abs() + (oy - pred.y).abs() <= PACK_RANGE
            });
            let reach = if packed { PACK_REACH } else { 1.5 };
            for (vi, vx, vy, _) in prey_positions.iter().copied() {
                if vi == pi {
                    continue;
                }
                let d = (vx - pred.x).abs() + (vy - pred.y).abs();
                if d <= reach {
                    kills.push((pi, vi));
                    break;
                }
            }
        }
        for (pi, vi) in kills {
            if !self.animals[pi].alive || !self.animals[vi].alive {
                continue;
            }
            let gain = match self.animals[vi].kind {
                AnimalKind::Rabbit | AnimalKind::Chicken => 0.40,
                AnimalKind::Deer | AnimalKind::Sheep => 0.65,
                AnimalKind::Cow | AnimalKind::Horse => 0.80,
                _ => 0.20,
            };
            let (px, py, pkind) = (self.animals[vi].x, self.animals[vi].y, self.animals[vi].kind);
            self.animals[vi].alive = false;
            self.carcasses.push(Carcass {
                x: px,
                y: py,
                kind: pkind,
                age: 0,
                picked: 0,
            });
            self.animals[pi].energy = (self.animals[pi].energy + gain).min(1.0);
        }

        let mut tames: Vec<(usize, usize)> = Vec::new();
        for (ai, a) in self.animals.iter().enumerate() {
            if !a.alive || !matches!(a.kind, AnimalKind::Wolf) {
                continue;
            }
            if a.energy >= 0.4 {
                continue;
            }
            ordered_human_candidates(&human_spatial, a.x, a.y, 3, &mut wolf_candidates);
            for &oi in &wolf_candidates {
                let o = &self.organisms[oi];
                if !o.alive || o.energy < 0.7 {
                    continue;
                }
                if o.traits.aggression > 0.5 {
                    continue;
                }
                if (o.x - a.x).abs() + (o.y - a.y).abs() > 2.5 {
                    continue;
                }
                let tame_p = 0.004 + (1.0 - o.traits.aggression) * 0.006;
                if self.rng.random::<f32>() < tame_p {
                    tames.push((ai, oi));
                    break;
                }
            }
        }
        // A wild cat that wanders up to a person now and then takes to them: it stays a cat, bonds to that
        // person and keeps near them, as a dog does.
        let mut cat_bonds: Vec<(usize, usize)> = Vec::new();
        for (ai, a) in self.animals.iter().enumerate() {
            if !a.alive || a.kind != AnimalKind::Cat || a.bonded_org.is_some() {
                continue;
            }
            ordered_human_candidates(&human_spatial, a.x, a.y, 3, &mut wolf_candidates);
            for &oi in &wolf_candidates {
                let o = &self.organisms[oi];
                if !o.alive || (o.x - a.x).abs() + (o.y - a.y).abs() > 2.5 {
                    continue;
                }
                if self.rng.random::<f32>() < CAT_BOND_CHANCE {
                    cat_bonds.push((ai, oi));
                    break;
                }
            }
        }
        for (ai, oi) in cat_bonds {
            if self.animals[ai].bonded_org.is_some() {
                continue;
            }
            let owner_id = self.organisms[oi].id.clone();
            let cat_name = crate::organism::animal::pick_dog_name(&mut self.rng);
            self.animals[ai].bonded_org = Some(owner_id);
            self.animals[ai].name = Some(cat_name.clone());
            self.animals[ai].energy = (self.animals[ai].energy + 0.20).min(1.0);
            let oname = self.organisms[oi].name.clone();
            self.organisms[oi].joy_ticks = (self.organisms[oi].joy_ticks + 200).min(1200);
            self.organisms[oi].log_event(format!("took in a cat named {}", cat_name));
            push_event(
                &mut self.events,
                self.tick_count,
                "life",
                &oname,
                &format!("took in a cat named {}", cat_name),
            );
        }
        for (ai, oi) in tames {
            self.animals[ai].kind = AnimalKind::Dog;
            self.animals[ai].bonded_org = Some(self.organisms[oi].id.clone());
            self.animals[ai].energy = (self.animals[ai].energy + 0.30).min(1.0);
            let dog_name = crate::organism::animal::pick_dog_name(&mut self.rng);
            self.animals[ai].name = Some(dog_name.clone());
            let oname = self.organisms[oi].name.clone();
            self.organisms[oi].discoveries.insert("dog".to_string());
            self.organisms[oi].joy_ticks = (self.organisms[oi].joy_ticks + 300).min(1200);
            self.organisms[oi].think(&format!("named the wolf {}", dog_name), self.tick_count);
            self.organisms[oi].log_event(format!("named their dog {}", dog_name));
            push_event(
                &mut self.events,
                self.tick_count,
                "build",
                &oname,
                &format!("befriended a wolf and named it {}", dog_name),
            );
        }

        for ai in 0..self.animals.len() {
            if !self.animals[ai].alive {
                continue;
            }
            if !matches!(self.animals[ai].kind, AnimalKind::Dog | AnimalKind::Cat) {
                continue;
            }
            let bonded = self.animals[ai].bonded_org.clone();
            if let Some(bid) = bonded {
                let (ax, ay) = (self.animals[ai].x, self.animals[ai].y);
                let mut owner_idx: Option<usize> = None;
                if let Some(oi) = org_idx_by_id.get(&bid).copied() {
                    let o = &self.organisms[oi];
                    if !o.alive || o.id != bid {
                        continue;
                    }
                    // At night the dog heads for the family hearth instead of
                    // the owner, who may be out and about.
                    let owner_dist = (o.x - ax).abs() + (o.y - ay).abs();
                    let (gx, gy) = if night { (o.home_x, o.home_y) } else { (o.x, o.y) };
                    let reach = if night { 1.0 } else { 3.0 };
                    if (gx - ax).abs() + (gy - ay).abs() > reach {
                        let dx = (gx - ax).signum();
                        let dy = (gy - ay).signum();
                        let nx = (ax + dx).max(1.0).min(WIDTH as f32 - 2.0);
                        let ny = (ay + dy).max(1.0).min(HEIGHT as f32 - 2.0);
                        let t = self.grid.get(nx as i32, ny as i32);
                        if !matches!(t, Tile::Void | Tile::Rock | Tile::Water | Tile::Fire) {
                            self.animals[ai].x = nx;
                            self.animals[ai].y = ny;
                        }
                    }
                    if owner_dist < 5.0 {
                        owner_idx = Some(oi);
                    }
                }
                if let Some(oi) = owner_idx {
                    let o = &mut self.organisms[oi];
                    o.loneliness = (o.loneliness - 0.004).max(0.0);
                    o.boredom = (o.boredom - 0.002).max(0.0);
                    o.comfort = (o.comfort + 0.001).min(1.0);
                }
            }
        }

        let mut bites: Vec<(usize, usize)> = Vec::new();
        for (ai, a) in self.animals.iter().enumerate() {
            // Only hungry predators attack, like their prey hunting above.
            // Monsters always do; a UFO abducts instead (see tick_monsters).
            let monster = a.kind.monster();
            if !a.alive
                || a.sleeping
                || a.kind == AnimalKind::Ufo
                || !(monster || (a.kind.predator() && a.energy <= 0.85))
            {
                continue;
            }
            // Aliens shoot and dragons breathe from a little further away.
            let reach = match a.kind {
                AnimalKind::Alien => 3.0,
                AnimalKind::Dragon => 2.0,
                _ => 1.5,
            };
            let (ax, ay) = (a.x, a.y);
            ordered_human_candidates(&human_spatial, ax, ay, 3, &mut wolf_candidates);
            for &oi in &wolf_candidates {
                let o = &self.organisms[oi];
                if !o.alive {
                    continue;
                }
                let manh = (o.x - ax).abs() + (o.y - ay).abs();
                if manh <= reach {
                    let kin_nearby = wolf_candidates
                        .iter()
                        .map(|&index| &self.organisms[index])
                        .filter(|k| k.alive && k.id != o.id && k.lineage_id == o.lineage_id)
                        .filter(|k| (k.x - ax).abs() + (k.y - ay).abs() <= 3.0)
                        .count();
                    let pack_defence = if kin_nearby >= 2 { 0.5 } else { 1.0 };
                    let weak_bonus = if o.health < 0.5 || o.energy < 0.3 {
                        0.20
                    } else {
                        0.0
                    };
                    let base = match a.kind {
                        AnimalKind::Zombie => 0.30,
                        AnimalKind::Demon => 0.28,
                        AnimalKind::Dragon => 0.22,
                        AnimalKind::Alien => 0.20,
                        _ => 0.18 + a.energy * 0.10,
                    };
                    let bite_p = (base + weak_bonus) * pack_defence;
                    if self.rng.random::<f32>() < bite_p {
                        bites.push((ai, oi));
                    }
                }
            }
        }
        let mut risen: Vec<(f32, f32)> = Vec::new();
        let mut zombies = self
            .animals
            .iter()
            .filter(|a| a.alive && a.kind == AnimalKind::Zombie)
            .count();
        for (ai, oi) in bites {
            // Someone already at zero health dies this tick; biting them
            // again must not count, or every zombie around them raised one.
            if !self.animals[ai].alive || !self.organisms[oi].alive || self.organisms[oi].health <= 0.0 {
                continue;
            }
            // Beasts will not strike under the gods' ward.
            if self.warded(self.organisms[oi].x, self.organisms[oi].y) {
                continue;
            }
            let beast = self.animals[ai].kind;
            let bear = beast == AnimalKind::Bear;
            let base_dmg = match beast {
                AnimalKind::Bear => 0.22,
                AnimalKind::Zombie => 0.14,
                AnimalKind::Demon => 0.20,
                AnimalKind::Dragon => 0.30,
                AnimalKind::Alien => 0.18,
                _ => 0.12,
            };
            let dmg = base_dmg + self.rng.random::<f32>() * 0.08;
            let oname = self.organisms[oi].name.clone();
            self.organisms[oi].health = (self.organisms[oi].health - dmg).max(0.0);
            self.organisms[oi].mark_harm(crate::organism::organism::Harm::Beast, self.tick_count);
            self.organisms[oi].think(&format!("{} attacks", beast.a_name()), self.tick_count);
            let fright = if beast.monster() { 0.4 } else { 0.25 };
            self.organisms[oi].fear_level = (self.organisms[oi].fear_level + fright).min(1.0);
            self.animals[ai].energy = (self.animals[ai].energy + 0.20).min(1.0);
            let killed = self.organisms[oi].health <= 0.0;
            if killed && beast.monster() {
                // Exactly zero can heal back above zero before the death
                // check runs; below zero hands the death to the normal tick,
                // as smite does, so a monster's kill is final.
                self.organisms[oi].health = -1.0;
                self.organisms[oi].mark_harm(crate::organism::organism::Harm::Beast, self.tick_count);
            }
            // Monsters attack constantly, so only their kills make the log.
            if !beast.monster() {
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "danger",
                    &oname,
                    &format!("mauled by {}", beast.a_name()),
                );
            } else if killed && beast != AnimalKind::Zombie {
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "danger",
                    &oname,
                    &format!("killed by {}", beast.a_name()),
                );
            }
            // A zombie's victim gets back up as one of them, while the
            // horde has room to grow.
            if beast == AnimalKind::Zombie && killed && zombies < MAX_ZOMBIES {
                zombies += 1;
                risen.push((self.organisms[oi].x, self.organisms[oi].y));
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "danger",
                    &oname,
                    "rose as a zombie",
                );
            }

            // People fight back: the victim and nearby kin strike at the
            // wolf. Weapons, numbers and boldness decide whether it dies.
            let (ax, ay) = (self.animals[ai].x, self.animals[ai].y);
            let victim_lineage = self.organisms[oi].lineage_id.clone();
            ordered_human_candidates(&human_spatial, ax, ay, 3, &mut wolf_candidates);
            let defenders: Vec<usize> = wolf_candidates
                .iter()
                .copied()
                .filter(|&k| {
                    let o = &self.organisms[k];
                    o.alive
                        && o.age >= 700
                        && (k == oi || o.lineage_id == victim_lineage)
                        && (o.x - ax).abs() + (o.y - ay).abs() <= 3.0
                })
                .take(4)
                .collect();
            let strike = |o: &crate::organism::organism::Organism| -> f32 {
                let armed = o.discoveries.contains("spear")
                    || o.discoveries.contains("hunting")
                    || o.discoveries.contains("bow");
                0.10 + if armed { 0.16 } else { 0.0 } + o.traits.aggression * 0.10
            };
            // A bear takes far more to bring down than a wolf, and a dragon
            // more than anything.
            let toughness = match beast {
                AnimalKind::Bear => 0.45,
                AnimalKind::Zombie => 0.8,
                AnimalKind::Demon => 0.35,
                AnimalKind::Dragon => 0.12,
                AnimalKind::Alien => 0.5,
                _ => 1.0,
            };
            let kill_p =
                (defenders.iter().map(|&k| strike(&self.organisms[k])).sum::<f32>() * toughness).min(0.85);
            let health_ok = self.organisms[oi].health > 0.0;
            if !defenders.is_empty() && health_ok && self.rng.random::<f32>() < kill_p {
                self.animals[ai].alive = false;
                for &k in &defenders {
                    let o = &mut self.organisms[k];
                    o.fear_level = (o.fear_level - 0.2).max(0.0);
                    o.think(&format!("fought off {}", beast.a_name()), self.tick_count);
                }
                if !beast.monster() {
                    let o = &mut self.organisms[oi];
                    o.inv_food = o.inv_food.saturating_add(if bear { 4 } else { 2 }).min(9);
                }
                let detail = if defenders.len() > 1 {
                    format!("killed {} with {} others", beast.a_name(), defenders.len() - 1)
                } else {
                    format!("killed the {} that attacked them", beast.name())
                };
                push_event(&mut self.events, self.tick_count, "hunt", &oname, &detail);
            } else if !defenders.is_empty() {
                // Driven back: a sated wolf stops hunting for a while.
                self.animals[ai].energy = self.animals[ai].energy.max(0.9);
            }
        }
        for (x, y) in risen {
            let id = self.next_animal_id;
            self.next_animal_id += 1;
            self.animals.push(Animal::new(id, x, y, AnimalKind::Zombie));
        }
        self.tick_monsters(&human_spatial);

        let breeding_season = matches!(self.season(), "recovery" | "abundance");
        let candidates: Vec<(usize, f32, f32, AnimalKind)> = self
            .animals
            .iter()
            // Young are born in spring and summer, not in the lean months.
            .filter(|a| {
                a.alive
                    && breeding_season
                    && !a.away
                    && a.energy > 0.70
                    && self.tick_count.saturating_sub(a.last_reproduced) > 800
            })
            .map(|a| (a.id, a.x, a.y, a.kind))
            .collect();

        let kind_cap = |k: AnimalKind| -> usize {
            match k {
                AnimalKind::Rabbit => 130,
                AnimalKind::Deer => 110,
                AnimalKind::Boar => 90,
                AnimalKind::Bird => 120,
                AnimalKind::Fish => 110,
                AnimalKind::Wolf => 45,
                AnimalKind::Dog => 40,
                AnimalKind::Bear => 18,
                AnimalKind::Sheep => 90,
                AnimalKind::Cow => 70,
                AnimalKind::Horse => 60,
                AnimalKind::Chicken => 80,
                AnimalKind::Fox => 70,
                AnimalKind::Cat => 60,
                AnimalKind::Penguin => 60,
                AnimalKind::Camel => 40,
                AnimalKind::Frog => 90,
                AnimalKind::Whale => 40,
                AnimalKind::Duck => 70,
                AnimalKind::Bee => 60,
                AnimalKind::Owl => 30,
                AnimalKind::Eagle => 24,
                AnimalKind::Snake => 30,
                AnimalKind::Crocodile => 20,
                AnimalKind::Monkey => 40,
                AnimalKind::Goat => 50,
                AnimalKind::Elephant => 25,
                AnimalKind::Lion => 25,
                AnimalKind::Zebra => 40,
                // Summoned, never born.
                AnimalKind::Zombie
                | AnimalKind::Demon
                | AnimalKind::Dragon
                | AnimalKind::Alien
                | AnimalKind::Ufo => 0,
            }
        };
        let mut kind_alive: HashMap<AnimalKind, usize> = HashMap::default();
        for a in self.animals.iter().filter(|a| a.alive) {
            *kind_alive.entry(a.kind).or_insert(0) += 1;
        }

        for (pid, px, py, kind) in candidates {
            if kind_alive.get(&kind).copied().unwrap_or(0) >= kind_cap(kind) {
                continue;
            }
            let biome = self.grid.biome_at(px as i32, py as i32);
            let biome_mult: f32 = match (kind, biome) {
                (AnimalKind::Bird | AnimalKind::Boar, Biome::Jungle) => 1.5,
                (AnimalKind::Deer | AnimalKind::Horse | AnimalKind::Cow, Biome::Savanna) => 1.4,
                (AnimalKind::Rabbit, Biome::Grassland) => 1.5,
                (AnimalKind::Rabbit, Biome::Wetland) => 1.3,
                (AnimalKind::Rabbit, Biome::Forest) => 1.0,
                (AnimalKind::Rabbit, Biome::Desert) => 0.4,
                (AnimalKind::Rabbit, Biome::Tundra) => 0.5,
                (AnimalKind::Rabbit, Biome::Volcanic) => 0.1,
                (AnimalKind::Deer, Biome::Forest) => 1.6,
                (AnimalKind::Deer, Biome::Grassland) => 1.2,
                (AnimalKind::Deer, Biome::Wetland) => 1.0,
                (AnimalKind::Deer, Biome::Tundra) => 0.6,
                (AnimalKind::Deer, Biome::Desert) => 0.3,
                (AnimalKind::Deer, Biome::Volcanic) => 0.1,
                (AnimalKind::Boar, Biome::Forest) => 1.8,
                (AnimalKind::Boar, Biome::Wetland) => 1.5,
                (AnimalKind::Boar, Biome::Grassland) => 1.0,
                (AnimalKind::Boar, _) => 0.3,
                (AnimalKind::Bird, Biome::Forest) => 1.4,
                (AnimalKind::Bird, Biome::Wetland) => 1.3,
                (AnimalKind::Bird, Biome::Grassland) => 1.1,
                (AnimalKind::Bird, Biome::Tundra) => 0.7,
                (AnimalKind::Bird, Biome::Desert) => 0.4,
                (AnimalKind::Bird, Biome::Volcanic) => 0.1,
                (AnimalKind::Fish, Biome::Wetland) => 1.0,
                (AnimalKind::Fish, _) => 0.7,
                (AnimalKind::Wolf, Biome::Forest) => 1.2,
                (AnimalKind::Wolf, Biome::Tundra) => 1.4,
                (AnimalKind::Wolf, Biome::Grassland) => 0.8,
                (AnimalKind::Wolf, _) => 0.3,
                (AnimalKind::Dog, _) => 0.0,
                (AnimalKind::Bear, Biome::Forest) => 1.3,
                (AnimalKind::Bear, Biome::Tundra) => 1.1,
                (AnimalKind::Bear, _) => 0.2,
                (AnimalKind::Sheep, Biome::Grassland) => 1.5,
                (AnimalKind::Sheep, Biome::Tundra) => 0.8,
                (AnimalKind::Sheep, _) => 0.5,
                (AnimalKind::Cow, Biome::Grassland) => 1.4,
                (AnimalKind::Cow, Biome::Wetland) => 1.0,
                (AnimalKind::Cow, _) => 0.3,
                (AnimalKind::Horse, Biome::Grassland) => 1.5,
                (AnimalKind::Horse, _) => 0.4,
                (AnimalKind::Chicken, Biome::Grassland) => 1.2,
                (AnimalKind::Chicken, Biome::Forest) => 0.8,
                (AnimalKind::Chicken, _) => 0.4,
                // Monsters never breed.
                _ => 0.0,
            };

            let local_density = self
                .animals
                .iter()
                .filter(|a| a.alive && (a.x - px).abs() + (a.y - py).abs() <= 14.0)
                .count() as f32;
            let density_factor = (1.0 - (local_density / 3.0).min(1.0)).max(0.0);

            let total_alive = self.animals.iter().filter(|a| a.alive).count() as f32;
            let global_factor = (1.0 - (total_alive - 600.0).max(0.0) / 400.0).max(0.0);

            let p = 0.0005 * biome_mult * density_factor * global_factor;
            if p > 0.0 && self.rng.random::<f32>() < p {
                let nid = self.next_animal_id;
                self.next_animal_id += 1;
                let ox = self.rng.random_range(-3.0..3.0f32);
                let oy = self.rng.random_range(-3.0..3.0f32);
                let nx = (px + ox).max(1.0).min(WIDTH as f32 - 2.0);
                let ny = (py + oy).max(1.0).min(HEIGHT as f32 - 2.0);
                let mut young = Animal::new(nid, nx, ny, kind);
                young.born_tick = self.tick_count.max(1);
                self.animals.push(young);
                *kind_alive.entry(kind).or_insert(0) += 1;
                if let Some(p) = self.animals.iter_mut().find(|a| a.id == pid) {
                    p.last_reproduced = self.tick_count;
                }
            }
        }

        self.animals.retain(|a| a.alive);
    }

    /// What monsters do besides biting: dragons set fires near people,
    /// demons scorch the ground they walk on, and UFOs abduct people.
    pub(super) fn tick_monsters(&mut self, human_spatial: &SpatialIndex) {
        let mut nearby = Vec::with_capacity(16);
        for ai in 0..self.animals.len() {
            let a = &self.animals[ai];
            if !a.alive || !a.kind.monster() {
                continue;
            }
            let (kind, ax, ay) = (a.kind, a.x, a.y);
            match kind {
                AnimalKind::Dragon => {
                    if self.rng.random::<f32>() >= 0.05 {
                        continue;
                    }
                    ordered_human_candidates(human_spatial, ax, ay, 6, &mut nearby);
                    let Some(&oi) = nearby.iter().find(|&&oi| {
                        let o = &self.organisms[oi];
                        o.alive && (o.x - ax).abs() + (o.y - ay).abs() <= 6.0
                    }) else {
                        continue;
                    };
                    let (tx, ty) = (self.organisms[oi].x as i32, self.organisms[oi].y as i32);
                    for (dx, dy) in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)] {
                        self.ignite(tx + dx, ty + dy);
                    }
                    crate::sim::civ::building_damage::strike_buildings(
                        self,
                        tx,
                        ty,
                        2.5,
                        0.3,
                        0.12,
                        crate::sim::civ::building_damage::DamageCause::Dragonfire,
                    );
                }
                AnimalKind::Demon => {
                    let (x, y) = (ax as i32, ay as i32);
                    let roll = self.rng.random::<f32>();
                    if roll < 0.01 {
                        self.ignite(x, y);
                    } else if roll < 0.10
                        && matches!(self.grid.get(x, y), Tile::Grass | Tile::Food | Tile::Snow)
                    {
                        self.grid.set(x, y, Tile::Scorched);
                    }
                }
                AnimalKind::Ufo => {
                    if self.rng.random::<f32>() >= 0.04 {
                        continue;
                    }
                    ordered_human_candidates(human_spatial, ax, ay, 2, &mut nearby);
                    let Some(&oi) = nearby.iter().find(|&&oi| {
                        let o = &self.organisms[oi];
                        o.alive && o.health > 0.0 && (o.x - ax).abs() + (o.y - ay).abs() <= 1.5
                    }) else {
                        continue;
                    };
                    // Health below zero hands the death to the normal tick.
                    self.organisms[oi].health = -1.0;
                    self.organisms[oi].mark_harm(crate::organism::organism::Harm::Beast, self.tick_count);
                    let name = self.organisms[oi].name.clone();
                    push_event(
                        &mut self.events,
                        self.tick_count,
                        "danger",
                        &name,
                        "was abducted by a UFO",
                    );
                }
                _ => {}
            }
        }
    }

    /// Sets a burnable tile alight.
    pub(crate) fn ignite(&mut self, x: i32, y: i32) {
        if !WorldGrid::in_bounds(x, y) || !self.grid.get(x, y).flammable() {
            return;
        }
        self.grid.set(x, y, Tile::Fire);
        *self.grid.fire_intensity_mut(x, y) = 1.0;
        self.physics.register_fire(x, y);
    }

    pub(super) fn check_animal_catches(&mut self) {
        let mut to_catch: Vec<(usize, usize)> = Vec::new();
        let organism_spatial = SpatialIndex::build(&self.organisms, 10);
        let animal_spatial = SpatialIndex::build_animals(&self.animals, 10);
        let mut nearby_animals: Vec<usize> = Vec::with_capacity(16);
        for (oi, org) in self.organisms.iter().enumerate() {
            if !org.alive {
                continue;
            }
            let (ox, oy) = (org.x as i32, org.y as i32);
            animal_spatial.query_into(ox, oy, 3, &mut nearby_animals);
            for &ai in &nearby_animals {
                let animal = &self.animals[ai];
                if !animal.alive || animal.away {
                    continue;
                }
                let (ax, ay) = (animal.x as i32, animal.y as i32);
                let manh = (ox - ax).abs() + (oy - ay).abs();
                if manh <= 2 {
                    if matches!(animal.kind, AnimalKind::Dog) {
                        continue;
                    }
                    let base_p = match animal.kind {
                        AnimalKind::Rabbit => 0.32,
                        AnimalKind::Deer => 0.18,
                        AnimalKind::Boar => 0.14,
                        AnimalKind::Bird => 0.16,
                        AnimalKind::Fish => 0.26,
                        AnimalKind::Wolf => 0.10,
                        AnimalKind::Bear => 0.05,
                        AnimalKind::Sheep => 0.28,
                        AnimalKind::Cow => 0.30,
                        AnimalKind::Horse => 0.12,
                        AnimalKind::Chicken => 0.34,
                        _ => 0.0,
                    };
                    let weapon_bonus = if org.discoveries.contains("spear") {
                        0.22
                    } else if org.discoveries.contains("stone_tools") {
                        0.12
                    } else if org.discoveries.contains("hunt") {
                        0.06
                    } else {
                        0.0
                    };
                    let dist_penalty = if manh == 2 { 0.6 } else { 1.0 };
                    let p = (base_p + org.traits.aggression * 0.18 + weapon_bonus) * dist_penalty;
                    if self.rng.random::<f32>() < p {
                        to_catch.push((oi, ai));
                    }
                }
            }
        }

        let mut caught: rustc_hash::FxHashSet<usize> = rustc_hash::FxHashSet::default();
        for (oi, ai) in to_catch {
            if caught.contains(&ai) {
                continue;
            }
            caught.insert(ai);
            let (kind, boost, meat, leather_chance, food_yield) = match self.animals[ai].kind {
                AnimalKind::Rabbit => ("rabbit", 0.30, 1u8, 0.40f32, 1u8),
                AnimalKind::Deer => ("deer", 0.55, 3u8, 0.85f32, 3u8),
                AnimalKind::Boar => ("boar", 0.65, 3u8, 0.75f32, 3u8),
                AnimalKind::Bird => ("bird", 0.18, 1u8, 0.05f32, 1u8),
                AnimalKind::Fish => ("fish", 0.32, 1u8, 0.00f32, 2u8),
                AnimalKind::Wolf => ("wolf", 0.45, 2u8, 0.90f32, 1u8),
                AnimalKind::Dog => ("dog", 0.0, 0u8, 0.00f32, 0u8),
                AnimalKind::Bear => ("bear", 0.70, 4u8, 0.95f32, 3u8),
                AnimalKind::Sheep => ("sheep", 0.45, 2u8, 0.90f32, 2u8),
                AnimalKind::Cow => ("cow", 0.70, 4u8, 0.85f32, 4u8),
                AnimalKind::Horse => ("horse", 0.55, 3u8, 0.80f32, 3u8),
                AnimalKind::Chicken => ("chicken", 0.22, 1u8, 0.00f32, 1u8),
                AnimalKind::Fox => ("fox", 0.25, 1u8, 0.55f32, 1u8),
                AnimalKind::Penguin => ("penguin", 0.25, 1u8, 0.10f32, 1u8),
                AnimalKind::Camel => ("camel", 0.50, 3u8, 0.85f32, 3u8),
                AnimalKind::Frog => ("frog", 0.25, 1u8, 0.00f32, 1u8),
                AnimalKind::Duck => ("duck", 0.25, 1u8, 0.00f32, 1u8),
                // Never caught: their catch chance above is zero.
                AnimalKind::Cat
                | AnimalKind::Whale
                | AnimalKind::Bee
                | AnimalKind::Owl
                | AnimalKind::Eagle
                | AnimalKind::Snake
                | AnimalKind::Crocodile
                | AnimalKind::Monkey
                | AnimalKind::Goat
                | AnimalKind::Elephant
                | AnimalKind::Lion
                | AnimalKind::Zebra
                | AnimalKind::Zombie
                | AnimalKind::Demon
                | AnimalKind::Dragon
                | AnimalKind::Alien
                | AnimalKind::Ufo => continue,
            };
            let (ax, ay) = (self.animals[ai].x as i32, self.animals[ai].y as i32);
            self.animals[ai].alive = false;
            let ms = self.organisms[oi].traits.memory_strength;
            let has_tools = self.organisms[oi].discoveries.contains("stone_tools")
                || self.organisms[oi].discoveries.contains("spear");
            let tool_bonus = if has_tools { 0.10 } else { 0.0 };
            let hunter_lid = self.organisms[oi].lineage_id.clone();
            let hunter_x = self.organisms[oi].x;
            let hunter_y = self.organisms[oi].y;
            let pack_kin = organism_spatial
                .query(hunter_x as i32, hunter_y as i32, 5)
                .into_iter()
                .filter(|&i| i != oi)
                .filter(|&i| {
                    let o = &self.organisms[i];
                    o.alive
                        && o.lineage_id == hunter_lid
                        && (o.x - hunter_x).abs() + (o.y - hunter_y).abs() <= 5.0
                })
                .count();
            let pack_bonus = if pack_kin >= 3 {
                0.14
            } else if pack_kin >= 1 {
                0.06
            } else {
                0.0
            };
            if pack_kin >= 2 {
                let name = self.organisms[oi].name.clone();
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "hunt",
                    &name,
                    &format!(
                        "pack hunt: {} kin ({} {})",
                        pack_kin,
                        kind,
                        if pack_kin >= 3 { "coordinated!" } else { "helped" }
                    ),
                );
            }
            self.organisms[oi].energy =
                (self.organisms[oi].energy + boost + tool_bonus + pack_bonus).min(1.0);
            self.organisms[oi].inv_food = self.organisms[oi].inv_food.saturating_add(food_yield);
            if meat > 0 {
                let cur = self.organisms[oi].tools.get("meat").copied().unwrap_or(0);
                let next = (cur as u16 + meat as u16).min(8) as u8;
                self.organisms[oi].tools.insert("meat".to_string(), next);
            }
            if leather_chance > 0.0 && self.rng.random::<f32>() < leather_chance {
                let cur = self.organisms[oi].tools.get("leather").copied().unwrap_or(0);
                let next = (cur as u16 + 1).min(8) as u8;
                self.organisms[oi].tools.insert("leather".to_string(), next);
            }
            self.organisms[oi].think("hunting", self.tick_count);
            self.organisms[oi].log_event(format!("hunted a {} at ({},{})", kind, ax, ay));
            self.organisms[oi].discover("hunt");
            self.organisms[oi].discover("hunting");
            Organism::remember(&mut self.organisms[oi].food_memory, ax, ay, 0.65, ms);

            {
                use crate::organism::memory::{MemoryEntry, MemoryKind};
                let is_first = !self.organisms[oi].attributes.contains("milestone:first_hunt");
                if is_first {
                    self.organisms[oi]
                        .attributes
                        .insert("milestone:first_hunt".to_string());
                    self.organisms[oi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Episode,
                            format!("my first kill — a {} fell to my hand", kind),
                            self.tick_count,
                        )
                        .with_salience(0.85)
                        .with_emotion(2),
                    );
                    self.organisms[oi].joy_ticks = (self.organisms[oi].joy_ticks + 50).min(1200);
                } else if matches!(kind, "deer" | "boar" | "wolf") {
                    self.organisms[oi].memories.insert(
                        MemoryEntry::new(
                            MemoryKind::Episode,
                            format!("brought down a {} that day", kind),
                            self.tick_count,
                        )
                        .with_salience(0.55)
                        .with_emotion(1),
                    );
                }
            }

            if pack_kin >= 1 {
                let share = if pack_kin >= 3 { 0.12 } else { 0.08 };
                let helpers: Vec<usize> = organism_spatial
                    .query(hunter_x as i32, hunter_y as i32, 5)
                    .into_iter()
                    .filter(|&i| i != oi)
                    .filter(|&i| {
                        let o = &self.organisms[i];
                        o.alive
                            && o.lineage_id == hunter_lid
                            && (o.x - hunter_x).abs() + (o.y - hunter_y).abs() <= 5.0
                    })
                    .collect();
                for hi in helpers {
                    self.organisms[hi].energy = (self.organisms[hi].energy + share).min(1.0);
                    self.organisms[hi].think("shared in the hunt", self.tick_count);
                }
            }
        }

        self.animals.retain(|a| a.alive);
    }

    pub(super) fn apply_water_fatigue(&mut self, idx: usize, x: i32, y: i32) {
        if self.grid.get(x, y) != Tile::Water
            || self.vehicles.iter().any(|v| {
                v.kind == crate::sim::transportation::TransportKind::Boat
                    && v.x == x
                    && v.y == y
                    && v.occupants.first() == Some(&self.organisms[idx].id)
            })
        {
            self.organisms[idx].water_ticks = 0;
            return;
        }

        let depth = self.grid.depth_at(x, y);
        let ticks = self.organisms[idx].water_ticks.saturating_add(1);
        self.organisms[idx].water_ticks = ticks;

        let fatigue = (ticks.saturating_sub(4) as f32 * 0.00045) + 0.0015 + depth * 0.004;
        self.organisms[idx].energy = (self.organisms[idx].energy - fatigue).max(0.0);

        if ticks > 12 || depth > 0.45 {
            let panic = (ticks.saturating_sub(12) as f32 * 0.0007) + depth * 0.0025;
            self.organisms[idx].health = (self.organisms[idx].health - panic).max(0.0);
            self.organisms[idx].mark_harm(crate::organism::organism::Harm::Drowning, self.tick_count);
            self.organisms[idx].fear_level = (self.organisms[idx].fear_level + 0.025 + depth * 0.04).min(1.0);
            self.organisms[idx].think("struggling in water", self.tick_count);
            let ms = self.organisms[idx].traits.memory_strength;
            Organism::remember(&mut self.organisms[idx].danger_memory, x, y, 0.85, ms);
        }

        if ticks > 6 {
            if let Some(land) = self.nearest_land_from(x, y, 18) {
                self.organisms[idx].wander_target = Some(land);
            }
        }
    }
}
