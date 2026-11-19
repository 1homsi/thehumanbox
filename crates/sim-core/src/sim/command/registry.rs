use super::Command;
use crate::sim::simulation::Simulation;

pub struct CommandSpec {
    pub id: &'static str,
    pub(super) run: fn(&mut Simulation, Command) -> bool,
}

pub const ALIASES: &[(&str, &str)] = &[("time_of_day", "set_time_of_day"), ("set_strategy", "guide")];

macro_rules! registry {
    ($($id:literal => $variant:ident { $($field:ident),* } => $method:ident($($arg:expr),*);)*) => {
        impl Command {
            pub fn id(&self) -> &'static str {
                match self {
                    $(Command::$variant { .. } => $id,)*
                }
            }
        }

        pub static COMMANDS: &[CommandSpec] = &[
            $(CommandSpec {
                id: $id,
                run: |sim, cmd| match cmd {
                    Command::$variant { $($field),* } => sim.$method($($arg),*),
                    _ => false,
                },
            },)*
        ];
    };
}

registry! {
    "spawn" => Spawn { x, y, count, lineage, speak_like } => cmd_spawn(x, y, count, lineage, speak_like);
    "family" => Family { x, y } => cmd_family(x, y);
    "teleport" => Teleport { x, y, radius } => cmd_teleport(x, y, radius);
    "make_leader" => MakeLeader { x, y, radius } => cmd_make_leader(x, y, radius);
    "place_building" => PlaceBuilding { x, y, kind } => cmd_place_building(x, y, kind);
    "place_boat" => PlaceBoat { x, y } => cmd_place_boat(x, y);
    "heal_one" => HealOne { x, y, radius } => cmd_heal_one(x, y, radius);
    "gift" => Gift { x, y, radius, what } => cmd_gift(x, y, radius, what);
    "set_time_of_day" => SetTimeOfDay { phase } => cmd_set_time_of_day(phase);
    "hail" => Hail { x, y, radius } => cmd_hail(x, y, radius);
    "nuke" => Nuke { x, y, radius } => cmd_nuke(x, y, radius);
    "eclipse" => Eclipse {} => cmd_eclipse();
    "rain_patch" => RainPatch { x, y, radius } => cmd_rain_patch(x, y, radius);
    "cure_tribe" => CureTribe { x, y } => cmd_cure_tribe(x, y);
    "guardian" => Guardian { x, y } => cmd_guardian(x, y);
    "aurora" => Aurora {} => cmd_aurora();
    "heat_wave" => HeatWave {} => cmd_heat_wave();
    "freeze" => Freeze { x, y, radius } => cmd_freeze(x, y, radius);
    "bless_river" => BlessRiver { x, y, radius } => cmd_bless_river(x, y, radius);
    "bless_forest" => BlessForest { x, y, radius } => cmd_bless_forest(x, y, radius);
    "talent" => Talent { x, y, radius } => cmd_talent(x, y, radius);
    "shape_land" => ShapeLand { x, y, radius, by } => cmd_shape_land(x, y, radius, by);
    "bless_soil" => BlessSoil { x, y, radius } => cmd_bless_soil(x, y, radius);
    "spring" => Spring { x, y } => cmd_spring(x, y);
    "bountiful_hunt" => BountifulHunt { x, y, radius } => cmd_bountiful_hunt(x, y, radius);
    "era_tribe" => EraTribe { x, y, era } => cmd_era_tribe(x, y, era);
    "set_world_mods" => SetWorldMods { mods } => cmd_set_world_mods(mods);
    "tribe_gift" => TribeGift { x, y, radius, what } => cmd_tribe_gift(x, y, radius, what);
    "migrate_tribe" => MigrateTribe { x, y, radius } => cmd_migrate_tribe(x, y, radius);
    "trade_gift" => TradeGift { ax, ay, bx, by } => cmd_trade_gift(ax, ay, bx, by);
    "clear_region" => ClearRegion { x, y, radius } => cmd_clear_region(x, y, radius);
    "mutate" => Mutate { x, y, radius } => cmd_mutate(x, y, radius);
    "merge_tribes" => MergeTribes { ax, ay, bx, by } => cmd_merge_tribes(ax, ay, bx, by);
    "split_tribe" => SplitTribe { x, y, radius } => cmd_split_tribe(x, y, radius);
    "teach_nearby" => TeachNearby { x, y, radius } => cmd_teach_nearby(x, y, radius);
    "curse" => Curse { x, y, radius } => cmd_curse(x, y, radius);
    "comet" => Comet { x, y, radius } => cmd_comet(x, y, radius);
    "smite" => Smite { x, y, radius } => cmd_smite(x, y, radius);
    "heal" => Heal { x, y, radius } => cmd_heal(x, y, radius);
    "paint" => Paint { x, y, tile, radius } => cmd_paint(x, y, tile, radius);
    "ignite" => Ignite { x, y, radius } => cmd_ignite(x, y, radius);
    "weather" => Weather { kind } => cmd_weather(kind);
    "drought" => Drought { active } => cmd_drought(active);
    "sinkhole" => Sinkhole { x, y, radius } => cmd_sinkhole(x, y, radius);
    "black_hole" => BlackHole { x, y, radius } => cmd_black_hole(x, y, radius);
    "acid_rain" => AcidRain { x, y, radius } => cmd_acid_rain(x, y, radius);
    "spawn_animal" => SpawnAnimal { x, y, kind, count, radius } => cmd_spawn_animal(x, y, kind, count, radius);
    "poison" => Poison { x, y, radius } => cmd_poison(x, y, radius);
    "bless" => Bless { x, y, radius } => cmd_bless(x, y, radius);
    "long_life" => LongLife { x, y, radius } => cmd_long_life(x, y, radius);
    "courage" => Courage { x, y, radius } => cmd_courage(x, y, radius);
    "sunshine" => Sunshine { x, y, radius } => cmd_sunshine(x, y, radius);
    "inspire" => Inspire { x, y, radius } => cmd_inspire(x, y, radius);
    "earthquake" => Earthquake { x, y, radius } => cmd_earthquake(x, y, radius);
    "war" => War { x, y } => cmd_war(x, y);
    "peace" => Peace { x, y } => cmd_peace(x, y);
    "meteor" => Meteor { x, y, radius } => cmd_meteor(x, y, radius);
    "harvest" => Harvest { x, y, radius } => cmd_harvest(x, y, radius);
    "cure" => Cure { x, y, radius } => cmd_cure(x, y, radius);
    "arm" => Arm { x, y, radius } => cmd_arm(x, y, radius);
    "bounty" => Bounty { x, y, radius } => cmd_bounty(x, y, radius);
    "douse" => Douse { x, y, radius } => cmd_douse(x, y, radius);
    "ward" => Ward { x, y, radius } => cmd_ward(x, y, radius);
    "teach" => Teach { lineage } => cmd_teach(lineage);
    "revive" => Revive { x, y } => cmd_revive(x, y);
    "banish" => Banish { x, y, radius } => cmd_banish(x, y, radius);
    "blight" => Blight { x, y, radius } => cmd_blight(x, y, radius);
    "frenzy" => Frenzy { x, y, radius } => cmd_frenzy(x, y, radius);
    "flood" => Flood { x, y, radius } => cmd_flood(x, y, radius);
    "blizzard" => Blizzard { x, y, radius } => cmd_blizzard(x, y, radius);
    "thunder" => Thunder { x, y, radius } => cmd_thunder(x, y, radius);
    "plant" => Plant { x, y, kind, radius } => cmd_plant(x, y, kind, radius);
    "rename_tribe" => RenameTribe { lineage, name } => cmd_rename_tribe(lineage, name);
    "paint_biome" => PaintBiome { x, y, biome, radius } => cmd_paint_biome(x, y, biome, radius);
    "volcano" => Volcano { x, y, radius } => cmd_volcano(x, y, radius);
    "meteor_shower" => MeteorShower { x, y, radius } => cmd_meteor_shower(x, y, radius);
    "love" => Love { x, y, radius } => cmd_love(x, y, radius);
    "marry" => Marry { ax, ay, bx, by } => cmd_marry(ax, ay, bx, by);
    "rename_person" => RenamePerson { id, name } => cmd_rename_person(id, name);
    "follow" => Follow { id } => cmd_follow(id);
    "tame" => Tame { x, y, radius } => cmd_tame(x, y, radius);
    "road" => Road { x, y, radius, kind } => cmd_road(x, y, radius, kind);
    "demolish" => Demolish { x, y, radius } => cmd_demolish(x, y, radius);
    "repair" => Repair { x, y, radius } => cmd_repair(x, y, radius);
    "restore" => Restore { x, y, radius } => cmd_restore(x, y, radius);
    "gale" => Gale {} => cmd_gale();
    "tornado" => Tornado { x, y, radius } => cmd_tornado(x, y, radius);
    "tsunami" => Tsunami { x, y, radius } => cmd_tsunami(x, y, radius);
    "locusts" => Locusts { x, y, radius } => cmd_locusts(x, y, radius);
    "wildfire" => Wildfire { x, y, radius } => cmd_wildfire(x, y, radius);
    "guide" => Guide { lineage, strategy, duration_ticks } => cmd_guide(lineage, strategy, duration_ticks);
    "composite" => Composite { steps } => cmd_composite(steps);
    "set_difficulty" => SetDifficulty { level } => cmd_set_difficulty(level);
    "outbreak" => Outbreak { count, x, y, radius } => cmd_outbreak_any(count, x, y, radius);
}

pub fn lookup(name: &str) -> Option<&'static CommandSpec> {
    let id = ALIASES
        .iter()
        .find(|(alias, _)| *alias == name)
        .map_or(name, |(_, id)| id);
    COMMANDS.iter().find(|spec| spec.id == id)
}

impl Simulation {
    fn cmd_set_difficulty(&mut self, level: String) -> bool {
        match crate::sim::goals::Difficulty::parse(&level) {
            Some(d) => {
                self.set_difficulty(d);
                true
            }
            None => false,
        }
    }

    fn cmd_outbreak_any(&mut self, count: u32, x: Option<f32>, y: Option<f32>, radius: f32) -> bool {
        match (x, y) {
            (Some(x), Some(y)) => self.cmd_outbreak_at(x, y, radius, count),
            _ => self.cmd_outbreak(count),
        }
    }
}
