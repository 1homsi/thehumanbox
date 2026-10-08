use super::*;

impl Simulation {
    pub(super) fn cmd_heal(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
        let mut healed = 0;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x).hypot(o.y - y) <= r {
                o.health = 1.0;
                o.energy = 1.0;
                o.hydration = 1.0;
                o.infection = 0.0;
                healed += 1;
            }
        }
        for a in self.animals.iter_mut() {
            if a.alive && (a.x - x).hypot(a.y - y) <= r {
                a.energy = 1.0;
                healed += 1;
            }
        }
        healed > 0
    }

    /// Long life: the gods lengthen the days of everyone in the radius. Each
    /// blessing adds to the span allotted, up to a ceiling, and the people
    /// feel it in their hope.
    pub(super) fn cmd_long_life(&mut self, x: f32, y: f32, radius: f32) -> bool {
        const GAIN: u32 = 900;
        // Natural spans run from about 9,000 to 26,000 ticks; the blessing stops
        // lengthening anyone past a span no natural birth reaches.
        const CEILING: u32 = 24_000;
        let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
        let mut blessed = 0;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x).hypot(o.y - y) <= r && o.max_age < CEILING {
                o.max_age = (o.max_age + GAIN).min(CEILING);
                o.hope = (o.hope + 0.2).min(1.0);
                o.think("the gods have given us more days", self.tick_count);
                blessed += 1;
            }
        }
        if blessed > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the gods",
                &format!("gave {blessed} people more years"),
            );
        }
        blessed > 0
    }

    /// Courage: fear drains out of everyone in the radius, so they stop fleeing
    /// the danger that frightened them and hold their ground.
    pub(super) fn cmd_courage(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
        let mut braced = 0;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x).hypot(o.y - y) <= r && o.fear_level > 0.05 {
                o.fear_level = (o.fear_level - 0.6).max(0.0);
                o.hope = (o.hope + 0.15).min(1.0);
                o.think("the gods gave us courage", self.tick_count);
                braced += 1;
            }
        }
        if braced > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the gods",
                &format!("steadied {braced} people"),
            );
        }
        braced > 0
    }

    /// Sunshine: a bright spell over the fields in the brush area. Growing crops,
    /// orchards and flowers gain a stretch of growth and ripen sooner. Fails when
    /// nothing is growing there.
    pub(super) fn cmd_sunshine(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let warmed = self.warm_plantings(x, y, radius.clamp(2, 24));
        if warmed > 0 {
            let now = self.tick_count;
            push_event(
                &mut self.events,
                now,
                "bless",
                "the sun",
                &format!("warmed {warmed} growing plantings"),
            );
        }
        warmed > 0
    }

    pub(super) fn cmd_bless(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
        let mut blessed = 0;
        for o in self.organisms.iter_mut() {
            if o.alive && (o.x - x).hypot(o.y - y) <= r {
                o.health = 1.0;
                o.energy = 1.0;
                o.hydration = 1.0;
                o.infection = 0.0;
                o.hope = (o.hope + 0.35).min(1.0);
                o.comfort = (o.comfort + 0.25).min(1.0);
                o.joy_ticks = o.joy_ticks.saturating_add(600).min(1_200);
                o.think("blessed by the gods", self.tick_count);
                blessed += 1;
            }
        }
        if blessed > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the gods",
                &format!("blessed {blessed} people"),
            );
        }
        blessed > 0
    }

    pub(super) fn cmd_inspire(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
        let tech = crate::sim::tech::tech_tree::all_tech();
        let tick = self.tick_count;
        let mut inspired = 0;
        for i in 0..self.organisms.len() {
            let o = &self.organisms[i];
            if !o.alive || (o.x - x).hypot(o.y - y) > r {
                continue;
            }
            let ready: Vec<&str> = tech
                .iter()
                .filter(|node| !o.discoveries.contains(node.name))
                .filter(|node| node.prerequisites.iter().all(|p| o.discoveries.contains(*p)))
                .map(|node| node.name)
                .collect();
            let learned = (!ready.is_empty()).then(|| ready[self.rng.random_range(0..ready.len())]);
            let o = &mut self.organisms[i];
            o.literacy = (o.literacy + 0.15).min(1.0);
            if let Some(name) = learned {
                o.discoveries.insert(name.to_string());
                o.think(&format!("inspired: {}", name.replace('_', " ")), tick);
            }
            inspired += 1;
        }
        if inspired > 0 {
            push_event(
                &mut self.events,
                tick,
                "inspire",
                "the gods",
                &format!("inspired {inspired} people"),
            );
        }
        inspired > 0
    }

    pub(super) fn cmd_harvest(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 5.0 } else { radius.min(24.0) };
        let (cx, cy, ri) = (x as i32, y as i32, r.ceil() as i32);
        let mut grown = 0;
        for dx in -ri..=ri {
            for dy in -ri..=ri {
                let (nx, ny) = (cx + dx, cy + dy);
                if !WorldGrid::in_bounds(nx, ny) || ((dx * dx + dy * dy) as f32) > r * r {
                    continue;
                }
                let tile = self.grid.get(nx, ny);
                if !matches!(
                    tile,
                    Tile::Grass | Tile::Food | Tile::Ash | Tile::Scorched | Tile::Sand
                ) {
                    continue;
                }
                self.grid.fertility[WorldGrid::idx(nx, ny)] = 1.0;
                if tile != Tile::Food && self.rng.random::<f32>() < 0.55 {
                    self.grid.set(nx, ny, Tile::Food);
                    grown += 1;
                }
            }
        }
        grown += self.ripen_plantings(cx, cy, ri);
        if grown > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the land",
                "bloomed with food",
            );
        }
        grown > 0
    }

    pub(super) fn cmd_cure(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 10.0 } else { radius.min(48.0) };
        let until = self.tick_count + 6_000;
        let mut cured = 0;
        for o in self.organisms.iter_mut() {
            if !o.alive || (o.x - x).hypot(o.y - y) > r {
                continue;
            }
            if o.infection <= 0.0 && o.diseases.is_empty() {
                continue;
            }
            for (disease, _) in o.diseases.drain(..) {
                o.disease_immunity.insert(disease, until);
            }
            o.infection = 0.0;
            o.health = o.health.max(0.6);
            o.think("the sickness lifted", self.tick_count);
            cured += 1;
        }
        if cured > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the gods",
                &format!("cured {cured} people"),
            );
        }
        cured > 0
    }

    pub(super) fn cmd_arm(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
        let mut armed = 0;
        for o in self.organisms.iter_mut() {
            if !o.alive || o.age < 700 || (o.x - x).hypot(o.y - y) > r {
                continue;
            }
            for skill in ["stone_tools", "hunting", "spear", "bow"] {
                o.discoveries.insert(skill.to_string());
            }
            o.fear_level = (o.fear_level - 0.3).max(0.0);
            o.think("the gods taught me to fight", self.tick_count);
            armed += 1;
        }
        if armed > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "inspire",
                "the gods",
                &format!("armed {armed} people"),
            );
        }
        armed > 0
    }

    pub(super) fn cmd_bounty(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 4.0 } else { radius.min(32.0) };
        let mut gifted = 0;
        for o in self.organisms.iter_mut() {
            if !o.alive || (o.x - x).hypot(o.y - y) > r {
                continue;
            }
            o.inv_food = o.inv_food.saturating_add(5).min(9);
            o.inv_wood = o.inv_wood.saturating_add(5).min(9);
            o.inv_stone = o.inv_stone.saturating_add(4).min(9);
            o.comfort = (o.comfort + 0.2).min(1.0);
            o.think("found a gift from the gods", self.tick_count);
            gifted += 1;
        }
        if gifted > 0 {
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the gods",
                &format!("gave {gifted} people food, wood and stone"),
            );
        }
        gifted > 0
    }

    pub(super) fn cmd_douse(&mut self, x: i32, y: i32, radius: i32) -> bool {
        let (x, y) = (clamp_cmd_coord(x), clamp_cmd_coord(y));
        let r = if radius <= 0 { 5 } else { radius.min(24) };
        let mut doused = 0;
        for dx in -r..=r {
            for dy in -r..=r {
                let (nx, ny) = (x + dx, y + dy);
                if !WorldGrid::in_bounds(nx, ny) || dx * dx + dy * dy > r * r {
                    continue;
                }
                if self.grid.get(nx, ny) == Tile::Fire {
                    self.grid.set(nx, ny, Tile::Ash);
                    *self.grid.fire_intensity_mut(nx, ny) = 0.0;
                    doused += 1;
                }
            }
        }
        doused > 0
    }

    pub(super) fn cmd_ward(&mut self, x: f32, y: f32, radius: f32) -> bool {
        self.cast_ward(x, y, radius)
    }

    pub(super) fn cmd_revive(&mut self, x: f32, y: f32) -> bool {
        self.revive_near(x, y)
    }

    pub(super) fn cmd_love(&mut self, x: f32, y: f32, radius: f32) -> bool {
        use crate::organism::organism::Sex;
        let r = if radius <= 0.0 { 5.0 } else { radius.min(32.0) };
        let in_range: Vec<usize> = (0..self.organisms.len())
            .filter(|&i| {
                let o = &self.organisms[i];
                o.alive && o.age >= 700 && (o.x - x).hypot(o.y - y) <= r
            })
            .collect();
        let mut paired = 0;
        for &i in &in_range {
            if self.organisms[i].sex != Sex::Female || self.organisms[i].partner_id.is_some() {
                continue;
            }
            let lineage = self.organisms[i].lineage_id.clone();
            let Some(&j) = in_range.iter().find(|&&j| {
                let o = &self.organisms[j];
                o.sex == Sex::Male && o.partner_id.is_none() && o.lineage_id == lineage
            }) else {
                continue;
            };
            let (a, b) = (self.organisms[i].id.clone(), self.organisms[j].id.clone());
            self.organisms[i].partner_id = Some(b);
            self.organisms[j].partner_id = Some(a);
            paired += 1;
        }
        for &i in &in_range {
            let o = &mut self.organisms[i];
            // Ready for children now rather than after the usual wait.
            o.last_reproduced = 0;
            o.joy_ticks = o.joy_ticks.saturating_add(400).min(1_200);
            o.hope = (o.hope + 0.2).min(1.0);
            o.think("in love", self.tick_count);
        }
        if !in_range.is_empty() {
            let detail = if paired > 0 {
                format!("brought {paired} couples together")
            } else {
                format!("filled {} hearts with love", in_range.len())
            };
            push_event(&mut self.events, self.tick_count, "bless", "the gods", &detail);
        }
        !in_range.is_empty()
    }

    pub(super) fn cmd_tame(&mut self, x: f32, y: f32, radius: f32) -> bool {
        let r = if radius <= 0.0 { 6.0 } else { radius.min(32.0) };
        let mut tamed = 0;
        for ai in 0..self.animals.len() {
            let a = &self.animals[ai];
            if !a.alive
                || !matches!(a.kind, AnimalKind::Wolf | AnimalKind::Bear)
                || (a.x - x).hypot(a.y - y) > r
            {
                continue;
            }
            let (ax, ay) = (a.x, a.y);
            let owner = self
                .organisms
                .iter()
                .filter(|o| o.alive)
                .min_by(|p, q| (p.x - ax).hypot(p.y - ay).total_cmp(&(q.x - ax).hypot(q.y - ay)))
                .map(|o| o.id.clone());
            let a = &mut self.animals[ai];
            a.kind = AnimalKind::Dog;
            a.energy = 1.0;
            a.bonded_org = owner;
            if a.name.is_none() {
                a.name = Some(crate::organism::animal::pick_dog_name(&mut self.rng));
            }
            tamed += 1;
        }
        if tamed > 0 {
            let what = if tamed == 1 { "beast" } else { "beasts" };
            push_event(
                &mut self.events,
                self.tick_count,
                "bless",
                "the gods",
                &format!("tamed {tamed} wild {what} into loyal dogs"),
            );
        }
        tamed > 0
    }
}
