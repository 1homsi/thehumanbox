use super::super::ctx::ActionCtx;
use crate::organism::animal::{pick_dog_name, AnimalKind};

pub fn apply(ctx: &mut ActionCtx) -> f32 {
    let target = ctx
        .sim
        .animals
        .iter()
        .enumerate()
        .filter(|(_, animal)| animal.alive && animal.kind == AnimalKind::Wolf && animal.bonded_org.is_none())
        .filter(|(_, animal)| (animal.x - ctx.sx).abs() + (animal.y - ctx.sy).abs() <= 4.0)
        .min_by(|left, right| {
            let left_distance = (left.1.x - ctx.sx).abs() + (left.1.y - ctx.sy).abs();
            let right_distance = (right.1.x - ctx.sx).abs() + (right.1.y - ctx.sy).abs();
            left_distance
                .total_cmp(&right_distance)
                .then_with(|| left.1.id.cmp(&right.1.id))
        })
        .map(|(index, _)| index);
    let Some(target) = target else {
        ctx.think("searching for animals");
        return 0.0;
    };
    if ctx.org().inv_food == 0 {
        return 0.0;
    }
    ctx.org_mut().inv_food -= 1;
    let wolf_energy = ctx.sim.animals[target].energy;
    let tame_chance = (0.30 + ctx.org().traits.social_tendency * 0.20 - ctx.org().traits.aggression * 0.15)
        .clamp(0.15, 0.55);
    if wolf_energy < 0.30 || ctx.chance(tame_chance) {
        let owner_id = ctx.org().id.clone();
        let owner_name = ctx.org().name.clone();
        let dog_name = pick_dog_name(&mut ctx.sim.rng);
        let animal = &mut ctx.sim.animals[target];
        animal.kind = AnimalKind::Dog;
        animal.bonded_org = Some(owner_id);
        animal.energy = (animal.energy + 0.35).min(1.0);
        animal.name = Some(dog_name.clone());
        ctx.org_mut().joy_ticks = ctx.org().joy_ticks.saturating_add(300).min(1_200);
        ctx.think(&format!("befriending and naming {dog_name}"));
        ctx.discover("animal-taming", "tamed a wild animal");
        ctx.event("life", &format!("{owner_name} bonded with the wolf {dog_name}"));
        0.028
    } else {
        ctx.sim.animals[target].energy = (ctx.sim.animals[target].energy + 0.12).min(1.0);
        ctx.think("approaching an animal");
        -0.003
    }
}
