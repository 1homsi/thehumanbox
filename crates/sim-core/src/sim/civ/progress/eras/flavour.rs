//! One line for each era, said when a tribe comes into it (the era events in
//! the chronicle). Words only: no era's rules change with them.

use super::Era;

impl Era {
    /// What daily life is like in this era, as one sentence.
    pub fn flavour(self) -> &'static str {
        match self {
            Era::PreStone => "People gather what grows and shelter where they can.",
            Era::Stone => "People shape stone tools and learn to make fire at will.",
            Era::Bronze => "Metal is smelted from ore, and tools and weapons begin to last.",
            Era::Iron => "Iron replaces bronze in the fields and at war.",
            Era::Classical => "Writing, law and coinage bind the tribes into cities.",
            Era::Medieval => "Guilds, castles and churches shape the work and the calendar.",
            Era::Renaissance => "Scholars copy and argue, and new ideas spread quickly.",
            Era::Industrial => "Machines and factories draw people from the fields to the towns.",
            Era::Modern => "Electricity and the telegraph carry light and news everywhere.",
            Era::Information => "Information flows through networks and every home has a screen.",
            Era::Atomic => "Splitting the atom gives power enough for whole cities.",
            Era::Space => "Rockets leave the air behind and people look down on the whole world.",
            Era::Digital => "Computers do the counting, and the work moves onto screens.",
            Era::Quantum => "Quantum machines solve problems no ordinary engine could.",
            Era::Solar => "Sunlight is gathered in vast fields and runs the world.",
            Era::Fusion => "Stars are copied on Earth, and power is cheap beyond measure.",
            Era::Genetic => "People read and edit the code of life itself.",
            Era::Orbital => "Whole cities turn in orbit above the clouds.",
            Era::Lunar => "Bases on the Moon mine its dust and keep its light.",
            Era::Martian => "Red-dust towns on Mars hold the first off-world tribe.",
            Era::Cyber => "Minds and machines are linked, and the net is part of every life.",
            Era::Neural => "Thought itself is read, shared and shaped by machines.",
            Era::Posthuman => "People outgrow their first bodies and choose what they become.",
            Era::Interstellar => "Ships cross the gaps between stars and carry whole tribes with them.",
            Era::Singularity => "Machine minds outpace their makers and the old rules fall away.",
            Era::Galactic => "Empires spread across the arms of the galaxy.",
            Era::Dyson => "A shell of solar collectors wraps the star that feeds the tribes.",
            Era::Kardashev2 => "A civilisation runs on the full light of its star.",
            Era::Kardashev3 => "A civilisation runs on the light of a whole galaxy.",
            Era::Stellar => "Stars are steered, lit and sometimes let go.",
            Era::Nebular => "Clouds of gas are shaped into worlds and homes.",
            Era::Universal => "The tribes reach across the whole universe.",
            Era::Multiverse => "Other universes are visited and traded with.",
            Era::Transcendent => "Minds rise past the limits of matter and of time.",
            Era::Eldritch => "Something older than the world stirs at the edges of the map.",
            Era::Voidborn => "People are born in the dark between worlds and call it home.",
            Era::Chronal => "Time itself is measured, bent and kept by the tribes.",
            Era::Akashic => "Every event that ever happened can be read back.",
            Era::Entropic => "The slow running-down of the world is tended like a garden.",
            Era::Oneiric => "Dreams become real places that the tribes walk into.",
            Era::Mythic => "The stories of the tribes are sung as if they are the world.",
            Era::Demiurge => "A maker shapes new worlds from the stuff of the old.",
            Era::Pantheon => "Gods walk among the tribes and answer for what they do.",
            Era::Omega => "The last era of the old world, and the first of something new.",
            Era::Rebirth => "The world begins again, and the tribes remember all of it.",
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_era_has_a_sentence_about_its_daily_life() {
        for era in super::super::LADDER {
            let line = era.flavour();
            assert!(line.ends_with('.'), "{:?} needs a full sentence", era);
            assert!(line.len() > 20, "{:?} needs more than a fragment", era);
        }
    }
}
