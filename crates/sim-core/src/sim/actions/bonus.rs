use super::*;

pub(super) fn workshop_bonus(sim: &Simulation, ix: i32, iy: i32, action: usize) -> f32 {
    use crate::sim::tech::buildings::BuildingKind as BK;
    let kinds: &[BK] = match action {
        5340..=5449 => &[BK::Cafe, BK::Restaurant, BK::Bakery],
        5460..=5509 => &[
            BK::Market,
            BK::MallShop,
            BK::Supermarket,
            BK::MarketStall,
            BK::Kiosk,
        ],
        5520..=5569 => &[BK::Datacenter, BK::OfficeTower, BK::ResearchLab, BK::Studio],
        5700..=5749 => &[BK::Library, BK::Scribe, BK::BookStore, BK::University],
        5760..=5809 => &[BK::Tailor, BK::ClothingShop, BK::Cobbler, BK::Jeweler],
        5820..=5869 => &[BK::Butcher, BK::Cheesemonger, BK::Fishmonger, BK::Smithy],
        5880..=5929 => &[BK::Brewery, BK::Tavern, BK::Inn, BK::Vineyard],
        _ => return 1.0,
    };
    let near = sim.buildings.iter().any(|b| {
        if !b.is_operational() || !kinds.contains(&b.kind) {
            return false;
        }
        let (fw, fh) = b.kind.footprint();
        let bx = b.x + fw as i32 / 2;
        let by = b.y + fh as i32 / 2;
        (bx - ix).abs() + (by - iy).abs() <= 7
    });
    if near {
        1.55
    } else {
        1.0
    }
}

pub(super) fn category_for(action: usize) -> Option<&'static str> {
    Some(match action {
        5340..=5389 => "cafe_work",
        5400..=5449 => "barista_advanced",
        5460..=5509 => "retail",
        5520..=5569 => "tech_devops",
        5580..=5629 => "childhood",
        5640..=5689 => "elder_life",
        5700..=5749 => "journalism",
        5760..=5809 => "fashion",
        5820..=5869 => "butchery",
        5880..=5929 => "distillation",
        _ => return registry::category(action),
    })
}

pub(super) fn aspiration_bonus(aspiration: &str, action: usize) -> f32 {
    if aspiration.is_empty() {
        return 1.0;
    }
    let matches = match aspiration {
        "seeker" => {
            // Knowledge / science / exploration
            matches!(
                action,
                66..=79 | 117..=125 | 126..=140 | 211..=220 | 421..=435 | 1380..=1428 | 4140..=4189 | 4200..=4249 | 4560..=4609
            )
        }
        "wanderer" => {
            // Pure exploration
            matches!(action, 117..=125 | 211..=220 | 1440..=1489 | 4440..=4489 | 4500..=4549)
        }
        "warrior" => {
            // Combat / military
            matches!(action, 96..=106 | 191..=200 | 436..=455 | 3660..=3709 | 4620..=4669)
        }
        "connector" => {
            // Social / relationships / family
            matches!(action, 80..=89 | 226..=245 | 261..=275 | 1260..=1310 | 2220..=2269)
        }
        "builder" => {
            // Construction + craft + masonry
            matches!(
                action,
                39..=50 | 166..=180 | 51..=65 | 151..=165 | 1200..=1249 | 3480..=3525 | 3720..=3769 | 3780..=3829 | 3840..=3889
            )
        }
        "devout" => {
            // Spiritual + religion + ritual
            matches!(action, 201..=210 | 456..=470 | 1500..=1548 | 2520..=2568 | 2760..=2809)
        }
        "sage" => {
            // Teaching, education, scholarship
            matches!(action, 501..=520 | 3000..=3049 | 3240..=3289 | 3360..=3409)
        }
        "provider" => {
            matches!(action, 26..=38 | 141..=150 | 336..=355 | 356..=370 | 1140..=1189 | 1620..=1668 | 3420..=3469)
        }
        "artist" => {
            matches!(action, 316..=335 | 3120..=3169 | 3300..=3349 | 5160..=5209)
        }
        "healer" => {
            // `3060..=3109` is `celestial_work` (astronomy) - every other
            // range here is a medical/care family, so it looks like a
            // copy/paste slip rather than an intentional cross-interest.
            matches!(action, 246..=260 | 1320..=1369 | 3420..=3469 | 4920..=4969)
        }
        _ => false,
    };
    if matches {
        1.4
    } else {
        1.0
    }
}

/// How much a practised trade adds to a matching action: a novice gets the
/// old flat 1.4, rising to 1.8 at full practice.
pub(super) fn specialty_bonus(org_specialty: Option<&str>, action: usize, practice: f32) -> f32 {
    let Some(spec) = org_specialty else { return 1.0 };
    let matches = match action {
        5340..=5449 => spec == "baker",
        5460..=5509 => spec == "merchant" || spec == "banker",
        5520..=5569 => spec == "programmer" || spec == "engineer",
        5700..=5749 => spec == "journalist" || spec == "scholar" || spec == "scribe",
        5760..=5809 => spec == "weaver",
        5820..=5869 => spec == "hunter" || spec == "farmer",
        5880..=5929 => spec == "brewer",
        336..=355 => spec == "farmer",
        356..=370 => spec == "hunter" || spec == "farmer",
        66..=79 | 126..=140 | 421..=435 => spec == "scholar" || spec == "scribe" || spec == "teacher",
        446..=455 | 96..=106 | 191..=200 => spec == "soldier" || spec == "officer",
        246..=260 => spec == "healer" || spec == "doctor",
        201..=210 | 456..=470 => spec == "priest",
        276..=295 => spec == "merchant" || spec == "banker",
        316..=335 => spec == "artist",
        _ => false,
    };
    if matches {
        1.0 + 0.8 * (0.5 + 0.5 * practice.clamp(0.0, 1.0))
    } else {
        1.0
    }
}

/// Each attempt at a trade's work closes a little of the gap to mastery.
pub(crate) fn grow_practice(practice: f32) -> f32 {
    (practice + PRACTICE_STEP * (1.0 - practice)).min(1.0)
}

const PRACTICE_STEP: f32 = 0.01;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_novice_gets_the_old_flat_bonus_and_experts_more() {
        let farmer_action = 336;
        assert!((specialty_bonus(Some("farmer"), farmer_action, 0.0) - 1.4).abs() < 1e-6);
        assert!((specialty_bonus(Some("farmer"), farmer_action, 1.0) - 1.8).abs() < 1e-6);
        assert!(specialty_bonus(Some("farmer"), farmer_action, 0.5) > 1.4);
        assert_eq!(specialty_bonus(Some("baker"), farmer_action, 1.0), 1.0);
        assert_eq!(specialty_bonus(None, farmer_action, 1.0), 1.0);
    }

    #[test]
    fn practice_grows_with_attempts_and_never_passes_mastery() {
        let mut p = 0.0;
        let mut last = p;
        for _ in 0..400 {
            p = grow_practice(p);
            assert!(p >= last && p <= 1.0);
            last = p;
        }
        assert!(p > 0.9, "after 400 attempts practice is {p}");
        assert!(p <= 1.0);
    }
}
