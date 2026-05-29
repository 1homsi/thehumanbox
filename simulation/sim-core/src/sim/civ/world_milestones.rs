use crate::sim::era::Era;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Milestone {
    FirstFire,
    FirstTool,
    FirstShelter,
    FirstBirth,
    FirstDeath,
    FirstSpeech,
    FirstReligion,
    FirstWriting,
    FirstBook,
    FirstSchool,
    FirstUniversity,
    FirstPlague,
    FirstWar,
    FirstTreaty,
    FirstVehicle,
    FirstShip,
    FirstTrain,
    FirstPlane,
    FirstFactory,
    FirstHospital,
    FirstElectricity,
    FirstComputer,
    FirstSatellite,
    FirstAI,
    Pop100,
    Pop500,
    Pop1000,
    Pop5000,
    GoldenAge,
    Renaissance,
    Enlightenment,
    GuildFormed,
    EmpireBorn,
    RepublicBorn,
    DemocracyBorn,
    GreatFamine,
    GreatPlague,
    GreatFlood,
    GreatFire,
    Revolution,
    MoonLanding,
    InternetAge,
}

impl Milestone {
    pub fn name(self) -> &'static str {
        match self {
            Milestone::FirstFire => "first_fire",
            Milestone::FirstTool => "first_tool",
            Milestone::FirstShelter => "first_shelter",
            Milestone::FirstBirth => "first_birth",
            Milestone::FirstDeath => "first_death",
            Milestone::FirstSpeech => "first_speech",
            Milestone::FirstReligion => "first_religion",
            Milestone::FirstWriting => "first_writing",
            Milestone::FirstBook => "first_book",
            Milestone::FirstSchool => "first_school",
            Milestone::FirstUniversity => "first_university",
            Milestone::FirstPlague => "first_plague",
            Milestone::FirstWar => "first_war",
            Milestone::FirstTreaty => "first_treaty",
            Milestone::FirstVehicle => "first_vehicle",
            Milestone::FirstShip => "first_ship",
            Milestone::FirstTrain => "first_train",
            Milestone::FirstPlane => "first_plane",
            Milestone::FirstFactory => "first_factory",
            Milestone::FirstHospital => "first_hospital",
            Milestone::FirstElectricity => "first_electricity",
            Milestone::FirstComputer => "first_computer",
            Milestone::FirstSatellite => "first_satellite",
            Milestone::FirstAI => "first_ai",
            Milestone::Pop100 => "pop_100",
            Milestone::Pop500 => "pop_500",
            Milestone::Pop1000 => "pop_1000",
            Milestone::Pop5000 => "pop_5000",
            Milestone::GoldenAge => "golden_age",
            Milestone::Renaissance => "renaissance",
            Milestone::Enlightenment => "enlightenment",
            Milestone::GuildFormed => "guild_formed",
            Milestone::EmpireBorn => "empire_born",
            Milestone::RepublicBorn => "republic_born",
            Milestone::DemocracyBorn => "democracy_born",
            Milestone::GreatFamine => "great_famine",
            Milestone::GreatPlague => "great_plague",
            Milestone::GreatFlood => "great_flood",
            Milestone::GreatFire => "great_fire",
            Milestone::Revolution => "revolution",
            Milestone::MoonLanding => "moon_landing",
            Milestone::InternetAge => "internet_age",
        }
    }

    pub fn description(self) -> &'static str {
        match self {
            Milestone::FirstFire => "the first flame is tamed",
            Milestone::FirstTool => "the first tool is shaped from stone",
            Milestone::FirstShelter => "the first roof rises against the rain",
            Milestone::FirstBirth => "the first child is born into the world",
            Milestone::FirstDeath => "the first eyes close for the last time",
            Milestone::FirstSpeech => "words gather meaning across many tongues",
            Milestone::FirstReligion => "a people lifts its eyes to the unseen",
            Milestone::FirstWriting => "marks on stone outlive the hand that made them",
            Milestone::FirstBook => "many pages bound together preserve a mind",
            Milestone::FirstSchool => "elders gather the young to teach them",
            Milestone::FirstUniversity => "a place is set aside for learning above all",
            Milestone::FirstPlague => "an unseen sickness cuts through the people",
            Milestone::FirstWar => "two peoples settle their dispute with blood",
            Milestone::FirstTreaty => "lines on the earth replace lines of swords",
            Milestone::FirstVehicle => "the wheel carries a body further than feet",
            Milestone::FirstShip => "wood crosses what no foot can",
            Milestone::FirstTrain => "iron carries iron through the hills",
            Milestone::FirstPlane => "a body slips the bonds of the ground",
            Milestone::FirstFactory => "machines repeat the work of many hands",
            Milestone::FirstHospital => "the sick gather in one place to be healed",
            Milestone::FirstElectricity => "lightning is bottled and put to work",
            Milestone::FirstComputer => "a machine learns to follow instructions",
            Milestone::FirstSatellite => "a made thing orbits the sky",
            Milestone::FirstAI => "thought is poured into silicon",
            Milestone::Pop100 => "the people number one hundred",
            Milestone::Pop500 => "the people number five hundred",
            Milestone::Pop1000 => "the people number one thousand",
            Milestone::Pop5000 => "the people number five thousand",
            Milestone::GoldenAge => "an age of plenty and song begins",
            Milestone::Renaissance => "old knowledge is rediscovered, and new questions follow",
            Milestone::Enlightenment => "reason becomes the lamp of the people",
            Milestone::GuildFormed => "those of one craft band together",
            Milestone::EmpireBorn => "many peoples bow to one banner",
            Milestone::RepublicBorn => "the rule of one gives way to the rule of many",
            Milestone::DemocracyBorn => "each voice counts the same as any other",
            Milestone::GreatFamine => "the harvest fails and many do not eat",
            Milestone::GreatPlague => "a sickness sweeps across the lands",
            Milestone::GreatFlood => "the waters rise and the land is unmade",
            Milestone::GreatFire => "the world burns, and rebuilds",
            Milestone::Revolution => "the rulers are cast down by their own people",
            Milestone::MoonLanding => "feet stand upon the moon",
            Milestone::InternetAge => "minds are linked across every land",
        }
    }

    pub fn era_at_least(self) -> Era {
        match self {
            Milestone::FirstFire
            | Milestone::FirstTool
            | Milestone::FirstShelter
            | Milestone::FirstBirth
            | Milestone::FirstDeath
            | Milestone::FirstSpeech => Era::Stone,
            Milestone::FirstReligion | Milestone::Pop100 | Milestone::FirstWar | Milestone::GreatFamine => {
                Era::Bronze
            }
            Milestone::FirstWriting | Milestone::FirstTreaty | Milestone::EmpireBorn => Era::Iron,
            Milestone::FirstBook
            | Milestone::FirstSchool
            | Milestone::FirstUniversity
            | Milestone::FirstPlague
            | Milestone::FirstShip
            | Milestone::Pop500
            | Milestone::GoldenAge
            | Milestone::GreatPlague
            | Milestone::RepublicBorn
            | Milestone::GuildFormed => Era::Classical,
            Milestone::Renaissance => Era::Renaissance,
            Milestone::FirstFactory
            | Milestone::FirstHospital
            | Milestone::FirstElectricity
            | Milestone::FirstTrain
            | Milestone::FirstVehicle
            | Milestone::Pop1000
            | Milestone::Revolution
            | Milestone::Enlightenment
            | Milestone::GreatFire
            | Milestone::GreatFlood => Era::Industrial,
            Milestone::FirstPlane | Milestone::DemocracyBorn | Milestone::MoonLanding => Era::Modern,
            Milestone::FirstComputer
            | Milestone::FirstSatellite
            | Milestone::FirstAI
            | Milestone::Pop5000
            | Milestone::InternetAge => Era::Information,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_fire_in_stone_era() {
        assert_eq!(Milestone::FirstFire.era_at_least(), Era::Stone);
    }

    #[test]
    fn moon_landing_in_modern_era() {
        assert_eq!(Milestone::MoonLanding.era_at_least(), Era::Modern);
    }
}
