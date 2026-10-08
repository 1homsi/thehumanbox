use super::*;

impl Simulation {
    pub(super) fn cmd_smite(&mut self, x: f32, y: f32, radius: f32) -> bool {
        // Clamp the upper bound too: `radius: 1e30` parses to
        // `f32::INFINITY`, which made `d <= r` true for every
        // organism in the world.
        let r = if radius <= 0.0 { 3.0 } else { radius.min(32.0) };
        let nearest_person = self
            .organisms
            .iter()
            .enumerate()
            .filter(|(_, o)| o.alive)
            .map(|(i, o)| (i, (o.x - x).hypot(o.y - y)))
            .filter(|&(_, d)| d <= r)
            .min_by(|a, b| a.1.total_cmp(&b.1));
        let nearest_animal = self
            .animals
            .iter()
            .enumerate()
            .filter(|(_, a)| a.alive)
            .map(|(i, a)| (i, (a.x - x).hypot(a.y - y)))
            .filter(|&(_, d)| d <= r)
            .min_by(|a, b| a.1.total_cmp(&b.1));
        // Lightning also cracks roofs where it lands, and sometimes
        // sets them alight.
        let (bx, by) = (x as i32, y as i32);
        let roofs = crate::sim::civ::building_damage::strike_buildings(
            self,
            bx,
            by,
            1.5,
            0.45,
            0.2,
            crate::sim::civ::building_damage::DamageCause::Lightning,
        );
        if roofs > 0 && self.rng.random::<f32>() < 0.4 {
            self.ignite(bx, by);
        }
        // Lightning strikes whatever living thing is closest.
        let struck = match (nearest_person, nearest_animal) {
            (Some((i, dp)), animal) if animal.is_none_or(|(_, da)| dp <= da) => {
                // Health below zero hands the death to the normal
                // tick, which records it and lets kin grieve.
                self.organisms[i].health = -1.0;
                self.organisms[i].mark_harm(crate::organism::organism::Harm::Disaster, self.tick_count);
                let name = self.organisms[i].name.clone();
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "smite",
                    &name,
                    "was struck down by lightning",
                );
                true
            }
            (_, Some((i, _))) => {
                self.animals[i].alive = false;
                let kind = self.animals[i].kind.a_name();
                push_event(
                    &mut self.events,
                    self.tick_count,
                    "smite",
                    "lightning",
                    &format!("struck down {kind}"),
                );
                true
            }
            _ => false,
        };
        struck || roofs > 0
    }

    pub(super) fn cmd_ignite(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = radius.clamp(0, 21);
        for dx in -r..=r {
            for dy in -r..=r {
                if dx * dx + dy * dy > r * r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                if WorldGrid::in_bounds(nx, ny) {
                    let cur = self.grid.get(nx, ny);
                    if !protected(cur) && cur != Tile::Water && cur != Tile::Void {
                        self.grid.set(nx, ny, Tile::Fire);
                        *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                        self.physics.register_fire(nx, ny);
                    }
                }
            }
        }
        true
    }

    pub(super) fn cmd_weather(&mut self, kind: String) -> bool {
        let now = self.tick_count;
        match kind.as_str() {
            "rain" => {
                self.weather.kind = 1;
                self.weather.start_tick = now;
                self.weather.duration = 1800;
                self.weather.intensity = 0.7;
            }
            "snow" => {
                self.weather.kind = 3;
                self.weather.start_tick = now;
                self.weather.duration = 1500;
                self.weather.intensity = 0.6;
            }
            "fog" => {
                self.weather.kind = 4;
                self.weather.start_tick = now;
                self.weather.duration = 1200;
                self.weather.intensity = 0.5;
            }
            "storm" => {
                self.weather.kind = 2;
                self.weather.start_tick = now;
                self.weather.duration = 1800;
                self.weather.intensity = 0.9;
            }
            _ => {
                self.weather.kind = 0;
                self.weather.duration = 0;
                self.weather.intensity = 0.0;
                self.weather.wet_until = 0;
            }
        }
        true
    }

    /// A tornado: a funnel touches down and tears along a random heading.
    /// Where it passes it wrecks buildings, strikes down the nearest person or
    /// animal in its funnel, uproots plantings and flattens fields. Returns
    /// whether it hit anything.
    pub(super) fn cmd_tornado(&mut self, x: i32, y: i32, radius: i32) -> bool {
        use crate::sim::civ::building_damage::{strike_buildings, DamageCause};
        use std::f32::consts::TAU;
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let length = radius.clamp(4, 24);
        let heading = self.rng.random::<f32>() * TAU;
        let (dx, dy) = (heading.cos(), heading.sin());
        let mut hit = false;
        for step in 0..=length {
            let fx = x as f32 + dx * step as f32;
            let fy = y as f32 + dy * step as f32;
            let (cx, cy) = (fx.round() as i32, fy.round() as i32);
            if !WorldGrid::in_bounds(cx, cy) {
                break;
            }
            hit |= strike_buildings(self, cx, cy, 2.5, 0.8, 0.3, DamageCause::Storm) > 0;
            hit |= self.cmd_smite(fx, fy, 2.0);
            for ny in cy - 1..=cy + 1 {
                for nx in cx - 1..=cx + 1 {
                    if !WorldGrid::in_bounds(nx, ny) {
                        continue;
                    }
                    if self.plantings.remove(&(WorldGrid::idx(nx, ny) as u32)).is_some() {
                        hit = true;
                    }
                    if self.grid.get(nx, ny) == Tile::Food {
                        self.grid.set(nx, ny, Tile::Grass);
                        hit = true;
                    }
                }
            }
        }
        if hit {
            self.planting_revision = self.planting_revision.wrapping_add(1);
        }
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "disaster",
            "world",
            &format!("a tornado tore across the land from ({x}, {y})"),
        );
        hit
    }

    /// A gale: the wind turns to a random quarter and blows hard. It drifts
    /// back to its usual strength over the following days.
    pub(super) fn cmd_gale(&mut self) -> bool {
        use std::f32::consts::TAU;
        let theta = self.rng.random::<f32>() * TAU;
        self.weather.wind_x = theta.cos() * 0.9;
        self.weather.wind_y = theta.sin() * 0.9;
        self.weather.wind_last_tick = self.tick_count;
        const QUARTERS: [&str; 8] = [
            "east",
            "south-east",
            "south",
            "south-west",
            "west",
            "north-west",
            "north",
            "north-east",
        ];
        let quarter = QUARTERS[((theta / TAU * 8.0).round() as usize) % 8];
        let now = self.tick_count;
        push_event(
            &mut self.events,
            now,
            "weather",
            "world",
            &format!("a gale blows toward the {quarter}"),
        );
        true
    }

    pub(super) fn cmd_drought(&mut self, active: bool) -> bool {
        if active {
            self.drought.active = true;
            self.drought.start_tick = self.tick_count;
            self.drought.rain_relief = 0;
        } else {
            self.drought.active = false;
            self.drought.dried_tiles.clear();
            self.drought.rain_relief = self.tick_count;
        }
        true
    }

    pub(super) fn cmd_outbreak(&mut self, count: u32) -> bool {
        let n = count.clamp(1, 50) as usize;
        let mut hit = 0;
        for o in self.organisms.iter_mut() {
            if hit >= n {
                break;
            }
            if o.alive && o.infection < 0.2 {
                // A god's curse is the real thing: plague, whatever the age.
                o.infection = 0.85;
                if !o.diseases.iter().any(|(d, _)| d == "plague") {
                    o.diseases.push(("plague".to_string(), self.tick_count));
                }
                hit += 1;
            }
        }
        true
    }

    pub(super) fn cmd_poison(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 3.0 } else { radius.min(32.0) };
        let mut poisoned = 0;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x).hypot(o.y - y) <= r {
                o.infection = o.infection.max(0.85);
                poisoned += 1;
            }
        }
        poisoned > 0
    }

    pub(super) fn cmd_earthquake(&mut self, x: i32, y: i32, radius: i32) -> bool {
        if !WorldGrid::in_bounds(x, y) {
            return false;
        }
        let r = if radius <= 0 { 5 } else { radius.clamp(1, 16) };
        // Jagged fault lines: random rock and sand cracks, more near
        // the centre. Protected tiles (huts, campfires) are spared.
        for dx in -r..=r {
            for dy in -r..=r {
                let d2 = dx * dx + dy * dy;
                if d2 > r * r {
                    continue;
                }
                let (nx, ny) = (x + dx, y + dy);
                let cur = self.grid.get(nx, ny);
                if protected(cur) || matches!(cur, Tile::Water | Tile::Void) {
                    continue;
                }
                let near = 1.0 - (d2 as f32).sqrt() / r as f32;
                if self.rng.random::<f32>() < 0.12 + 0.30 * near {
                    let crack = if self.rng.random::<f32>() < 0.6 {
                        Tile::Rock
                    } else {
                        Tile::Sand
                    };
                    self.grid.set(nx, ny, crack);
                    *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                }
            }
        }
        let (fx, fy, fr) = (x as f32, y as f32, r as f32);
        let mut hurt = 0;
        for o in self.organisms.iter_mut() {
            let d = (o.x - fx).hypot(o.y - fy);
            if o.alive && d <= fr {
                o.health -= 0.25 + 0.35 * (1.0 - d / fr);
                o.mark_harm(crate::organism::organism::Harm::Disaster, self.tick_count);
                o.fear_level = (o.fear_level + 0.5).min(1.0);
                hurt += 1;
            }
        }
        let buildings = crate::sim::civ::building_damage::quake_damage(self, x, y, r);
        push_event(
            &mut self.events,
            self.tick_count,
            "earthquake",
            "the earth",
            &format!("shook, hurting {hurt} people and damaging {buildings} buildings"),
        );
        true
    }

    pub(super) fn cmd_meteor(&mut self, x: i32, y: i32, radius: i32) -> bool {
        if !WorldGrid::in_bounds(x, y) {
            return false;
        }
        let r = if radius <= 0 { 4 } else { radius.clamp(1, 12) };
        let (fx, fy, fr) = (x as f32, y as f32, r as f32);
        let mut killed = 0;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - fx).hypot(o.y - fy) <= fr {
                o.health = -1.0;
                o.mark_harm(crate::organism::organism::Harm::Disaster, self.tick_count);
                killed += 1;
            }
        }
        let what = match killed {
            0 => "a meteor fell from the sky".to_string(),
            1 => "a meteor fell and killed one person".to_string(),
            n => format!("a meteor fell and killed {n} people"),
        };
        push_event(&mut self.events, self.tick_count, "meteor", "the sky", &what);
        crate::sim::civ::building_damage::strike_buildings(
            self,
            x,
            y,
            r as f32 + 1.0,
            1.0,
            0.45,
            crate::sim::civ::building_damage::DamageCause::Meteor,
        );
        self.wither_plantings(x, y, r + 2);
        for a in self.animals.iter_mut() {
            if a.alive && (a.x - fx).hypot(a.y - fy) <= fr {
                a.alive = false;
            }
        }
        let outer = r + 2;
        let mut ore_left = 0usize;
        for dx in -outer..=outer {
            for dy in -outer..=outer {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) {
                    continue;
                }
                let cur = self.grid.get(nx, ny);
                if protected(cur) || cur == Tile::Void {
                    continue;
                }
                let d2 = dx * dx + dy * dy;
                if d2 * 4 <= r * r {
                    // The meteorite itself: part of the crater floor is
                    // ore, which tribes can mine.
                    let ore = (self.rng.random::<f32>() < 0.45) && (dx, dy) != (0, 0);
                    self.grid
                        .set(nx, ny, if ore { Tile::Mineral } else { Tile::Rock });
                    ore_left += usize::from(ore);
                    *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                } else if d2 <= r * r {
                    self.grid.set(nx, ny, Tile::Ash);
                    *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                } else if d2 <= outer * outer && cur != Tile::Water {
                    self.grid.set(nx, ny, Tile::Fire);
                    *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                    self.physics.register_fire(nx, ny);
                }
            }
        }
        if ore_left > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "meteor",
                "the sky",
                &format!("the meteorite left {ore_left} tiles of ore in its crater"),
            );
        }
        true
    }

    pub(super) fn cmd_banish(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 6.0 } else { radius.min(32.0) };
        let mut banished = 0;
        for a in self.animals.iter_mut() {
            if a.alive && a.kind.hostile() && (a.x - x).hypot(a.y - y) <= r {
                a.alive = false;
                banished += 1;
            }
        }
        if banished > 0 {
            let what = if banished == 1 { "creature" } else { "creatures" };
            push_event(
                &mut self.events,
                self.tick_count,
                "smite",
                "the gods",
                &format!("banished {banished} {what}"),
            );
        }
        banished > 0
    }

    pub(super) fn cmd_blight(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = if radius <= 0 { 5 } else { radius.min(24) };
        let mut withered = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                self.grid.fertility[i] *= 0.15;
                if self.grid.get(nx, ny) == Tile::Food {
                    self.grid.set(nx, ny, Tile::Scorched);
                    withered += 1;
                }
            }
        }
        withered += self.wither_plantings(x, y, r);
        let rf = r as f32;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x as f32).hypot(o.y - y as f32) <= rf {
                o.inv_food = 0;
                o.think("our food rotted", self.tick_count);
                withered += 1;
            }
        }
        if withered > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "danger",
                "a blight",
                "rotted the crops",
            );
        }
        withered > 0
    }

    pub(super) fn cmd_frenzy(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 4.0 } else { radius.min(24.0) };
        let mut maddened = 0;
        for o in self.organisms.iter_mut() {
            if !o.alive || (o.x - x).hypot(o.y - y) > r {
                continue;
            }
            let hurt = 0.15 + self.rng.random::<f32>() * 0.25;
            o.health = (o.health - hurt).max(0.01);
            o.mark_harm(crate::organism::organism::Harm::Fight, self.tick_count);
            o.fear_level = (o.fear_level + 0.4).min(1.0);
            o.hope = (o.hope - 0.3).max(0.0);
            o.think("fought a neighbour in a frenzy", self.tick_count);
            maddened += 1;
        }
        if maddened > 1 {
            push_event(
                &mut self.events,
                self.tick_count,
                "war",
                "a frenzy",
                &format!("set {maddened} people on each other"),
            );
        }
        maddened > 0
    }

    /// A tsunami: a wave out of the nearest sea runs up the coast and inland.
    /// Every land tile within `radius` of the coast point floods (and drains
    /// again later); buildings near the shore are wrecked, people in the wave
    /// are hurt and land animals in it drown. Fails when no sea lies near the
    /// click.
    pub(super) fn cmd_tsunami(&mut self, x: i32, y: i32, radius: i32) -> bool {
        use crate::sim::civ::building_damage::{strike_buildings, DamageCause};
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let mut coast: Option<(i32, i32, i32)> = None;
        for dx in -12..=12 {
            for dy in -12..=12 {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || self.grid.get(nx, ny) != Tile::Water {
                    continue;
                }
                let d = dx * dx + dy * dy;
                if coast.is_none_or(|(_, _, best)| d < best) {
                    coast = Some((nx, ny, d));
                }
            }
        }
        let Some((sx, sy, _)) = coast else {
            return false;
        };
        let r = radius.clamp(6, 20);
        let mut flooded = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                let (nx, ny) = (sx + dx, sy + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                if matches!(
                    self.grid.get(nx, ny),
                    Tile::Void | Tile::Rock | Tile::Water | Tile::Mineral | Tile::Hut
                ) {
                    continue;
                }
                self.grid.set(nx, ny, Tile::Flooded);
                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                if self.flood_tiles.len() < crate::sim::world_events::MAX_FLOOD_TILES {
                    let stay = crate::sim::world_events::FLOOD_RIM_TICKS;
                    self.flood_tiles.push((nx, ny, self.tick_count + stay));
                }
                flooded += 1;
            }
        }
        if flooded == 0 {
            return false;
        }
        let rf = r as f32;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - sx as f32).hypot(o.y - sy as f32) <= rf {
                o.health = (o.health - 0.35).max(0.01);
                o.mark_harm(crate::organism::organism::Harm::Disaster, self.tick_count);
                o.fear_level = (o.fear_level + 0.5).min(1.0);
                o.think("a wave swept us off our feet", self.tick_count);
            }
        }
        for a in self.animals.iter_mut() {
            if a.alive
                && !a.kind.aquatic()
                && !a.kind.flies()
                && (a.x - sx as f32).hypot(a.y - sy as f32) <= rf
                && self.grid.get(a.x as i32, a.y as i32) == Tile::Flooded
            {
                a.alive = false;
            }
        }
        strike_buildings(self, sx, sy, rf, 0.9, 0.3, DamageCause::Flood);
        let now = self.tick_count;
        push_event(&mut self.events, now, "danger", "a tsunami", "ran up the coast");
        true
    }

    pub(super) fn cmd_flood(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = if radius <= 0 { 4 } else { radius.min(20) };
        let mut flooded = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                let tile = self.grid.get(nx, ny);
                if matches!(
                    tile,
                    Tile::Void | Tile::Rock | Tile::Water | Tile::Mineral | Tile::Hut
                ) {
                    continue;
                }
                // The deep middle becomes a lake; the rim floods.
                // Both drain away again (see `tick_world_evolution`).
                let deep = (dx * dx + dy * dy) * 4 <= r * r;
                self.grid
                    .set(nx, ny, if deep { Tile::Water } else { Tile::Flooded });
                *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                if self.flood_tiles.len() < crate::sim::world_events::MAX_FLOOD_TILES {
                    let stay = if deep {
                        crate::sim::world_events::FLOOD_DEEP_TICKS
                    } else {
                        crate::sim::world_events::FLOOD_RIM_TICKS
                    };
                    self.flood_tiles.push((nx, ny, self.tick_count + stay));
                }
                flooded += 1;
            }
        }
        let rf = r as f32;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x as f32).hypot(o.y - y as f32) <= rf {
                o.health = (o.health - 0.2).max(0.01);
                o.mark_harm(crate::organism::organism::Harm::Disaster, self.tick_count);
                o.fear_level = (o.fear_level + 0.3).min(1.0);
                o.think("the water rose around us", self.tick_count);
            }
        }
        if flooded > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "danger",
                "a flood",
                "swept over the land",
            );
            crate::sim::civ::building_damage::strike_buildings(
                self,
                x,
                y,
                r as f32,
                0.35,
                0.1,
                crate::sim::civ::building_damage::DamageCause::Flood,
            );
        }
        flooded > 0
    }

    pub(super) fn cmd_blizzard(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = if radius <= 0 { 6 } else { radius.min(24) };
        let mut frozen = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                match self.grid.get(nx, ny) {
                    Tile::Grass | Tile::Food | Tile::Ash | Tile::Scorched | Tile::Sand => {
                        self.grid.set(nx, ny, Tile::Snow);
                        frozen += 1;
                    }
                    Tile::Fire => {
                        self.grid.set(nx, ny, Tile::Snow);
                        *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                        frozen += 1;
                    }
                    _ => {}
                }
            }
        }
        let rf = r as f32;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x as f32).hypot(o.y - y as f32) <= rf {
                o.energy = (o.energy - 0.35).max(0.05);
                o.health = (o.health - 0.1).max(0.01);
                o.mark_harm(crate::organism::organism::Harm::Disaster, self.tick_count);
                o.think("freezing in the blizzard", self.tick_count);
            }
        }
        if frozen > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "danger",
                "a blizzard",
                "buried the land in snow",
            );
            crate::sim::civ::building_damage::strike_buildings(
                self,
                x,
                y,
                r as f32,
                0.15,
                0.05,
                crate::sim::civ::building_damage::DamageCause::Frost,
            );
            self.frost_plantings(x, y, r);
        }
        frozen > 0
    }

    pub(super) fn cmd_thunder(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 8.0 } else { radius.min(32.0) };
        let mut struck = false;
        for _ in 0..6 {
            let angle = self.rng.random::<f32>() * std::f32::consts::TAU;
            let dist = self.rng.random::<f32>().sqrt() * r;
            let (sx, sy) = (x + angle.cos() * dist, y + angle.sin() * dist);
            struck |= self.apply_command(Command::Smite {
                x: sx,
                y: sy,
                radius: 2.0,
            });
            if self.rng.random::<f32>() < 0.35 {
                let (tx, ty) = (sx as i32, sy as i32);
                if WorldGrid::in_bounds(tx, ty) && self.grid.get(tx, ty).flammable() {
                    self.grid.set(tx, ty, Tile::Fire);
                    *self.grid.fire_intensity_mut(tx, ty) = 1.0;
                    self.physics.register_fire(tx, ty);
                    struck = true;
                }
            }
        }
        struck
    }

    pub(super) fn cmd_volcano(&mut self, x: i32, y: i32, radius: i32) -> bool {
        use crate::world::tiles::Biome;
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = if radius <= 0 { 6 } else { radius.clamp(3, 12) };
        let rf = r as f32;
        let mut changed = false;
        for dx in -r * 2..=r * 2 {
            for dy in -r * 2..=r * 2 {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || self.grid.get(nx, ny) == Tile::Void {
                    continue;
                }
                let i = WorldGrid::idx(nx, ny);
                let d = ((dx * dx + dy * dy) as f32).sqrt();
                if d <= 1.5 {
                    self.grid.set(nx, ny, Tile::Fire);
                    *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                    self.physics.register_fire(nx, ny);
                } else if d < rf * 0.6 {
                    self.grid.set(nx, ny, Tile::Rock);
                } else if d < rf * 1.2 {
                    self.grid.set(nx, ny, Tile::Ash);
                } else if d < rf * 1.5 && self.grid.get(nx, ny).flammable() && self.rng.random::<f32>() < 0.3
                {
                    self.grid.set(nx, ny, Tile::Fire);
                    *self.grid.fire_intensity_mut(nx, ny) = 1.0;
                    self.physics.register_fire(nx, ny);
                } else {
                    continue;
                }
                self.grid.biome[i] = Biome::Volcanic as u8;
                self.grid.elevation[i] = self.grid.elevation[i].max(0.3 + (1.0 - d / (rf * 2.0)) * 0.6);
                changed = true;
            }
        }
        let mut killed = 0;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x as f32).hypot(o.y - y as f32) < rf * 0.6 {
                o.health = -1.0;
                o.mark_harm(crate::organism::organism::Harm::Disaster, self.tick_count);
                killed += 1;
            }
        }
        for a in self.animals.iter_mut() {
            if a.alive && (a.x - x as f32).hypot(a.y - y as f32) < rf * 0.6 {
                a.alive = false;
            }
        }
        let detail = if killed > 0 {
            format!("burst from the ground and buried {killed} people")
        } else {
            "burst from the ground".to_string()
        };
        push_event(&mut self.events, self.tick_count, "danger", "a volcano", &detail);
        // The cone buries what it rises under; the ash fall cracks
        // roofs further out.
        let hit = crate::sim::civ::building_damage::strike_buildings(
            self,
            x,
            y,
            rf * 1.2,
            1.0,
            0.3,
            crate::sim::civ::building_damage::DamageCause::Lava,
        );
        self.wither_plantings(x, y, (rf * 1.5) as i32);
        changed || hit > 0
    }

    pub(super) fn cmd_meteor_shower(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 10.0 } else { radius.min(40.0) };
        let mut hit = false;
        for _ in 0..5 {
            let angle = self.rng.random::<f32>() * std::f32::consts::TAU;
            let dist = self.rng.random::<f32>().sqrt() * r;
            let (mx, my) = ((x + angle.cos() * dist) as i32, (y + angle.sin() * dist) as i32);
            hit |= self.apply_command(Command::Meteor {
                x: mx,
                y: my,
                radius: 2,
            });
        }
        hit
    }
}
