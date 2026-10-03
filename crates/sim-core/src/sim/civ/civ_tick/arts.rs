use super::*;

pub(super) fn tick_artwork(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    let mut new_artworks: Vec<Artwork> = Vec::new();
    for o in &sim.organisms {
        if !o.alive {
            continue;
        }
        if o.age_stage() == AgeStage::Infant || o.age_stage() == AgeStage::Child {
            continue;
        }
        if o.traits.curiosity < 0.6 {
            continue;
        }
        if sim.rng.random::<f32>() > 0.04 {
            continue;
        }
        let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::Stone);
        let kind = pick_art_kind(era);
        let id = sim.next_artwork_id;
        sim.next_artwork_id += 1;
        let title = format!("Untitled {} no.{}", kind.name(), id);
        new_artworks.push(Artwork {
            id,
            kind,
            creator_id: o.id.clone(),
            creator_name: o.name.clone(),
            location: [o.x as i32, o.y as i32],
            tick: sim.tick_count,
            title,
        });
    }
    for a in &new_artworks {
        push_event(
            &mut sim.events,
            sim.tick_count,
            "artwork_created",
            &a.creator_name,
            &format!("created {} '{}'", a.kind.name(), a.title),
        );
    }
    sim.artworks.extend(new_artworks);
    while sim.artworks.len() > 200 {
        sim.artworks.remove(0);
    }
}

pub(super) fn pick_art_kind(era: Era) -> ArtKind {
    if era >= Era::Information {
        ArtKind::Digital
    } else if era >= Era::Modern {
        ArtKind::Film
    } else if era >= Era::Industrial {
        ArtKind::Photograph
    } else if era >= Era::Renaissance {
        ArtKind::Painting
    } else if era >= Era::Classical {
        ArtKind::Fresco
    } else if era >= Era::Bronze {
        ArtKind::Sculpture
    } else {
        ArtKind::CavePainting
    }
}

pub(super) fn tick_books(sim: &mut Simulation) {
    let era_map = sim.lineage_eras.clone();
    let mut new_books: Vec<Book> = Vec::new();
    for o in &sim.organisms {
        if !o.alive || o.literacy < 0.4 {
            continue;
        }
        if o.age_stage() != AgeStage::Adult && o.age_stage() != AgeStage::Elder {
            continue;
        }
        if sim.rng.random::<f32>() > 0.05 {
            continue;
        }
        let era = era_map.get(&o.lineage_id).copied().unwrap_or(Era::Iron);
        if era < Era::Bronze {
            continue;
        }
        let id = sim.next_book_id;
        sim.next_book_id += 1;
        let title = pick_book_title(sim.tick_count + id as u64);
        let topic = pick_topic(era, sim.tick_count + id as u64);
        new_books.push(Book {
            id,
            title: title.clone(),
            author_org_id: o.id.clone(),
            author_name: o.name.clone(),
            written_tick: sim.tick_count,
            lineage_id: o.lineage_id.clone(),
            topic,
            copies: if era >= Era::Renaissance { 50 } else { 1 },
        });
    }
    for b in &new_books {
        push_event(
            &mut sim.events,
            sim.tick_count,
            "book_written",
            &b.author_name,
            &format!("wrote '{}'", b.title),
        );
    }
    sim.books.extend(new_books);
    while sim.books.len() > 500 {
        sim.books.remove(0);
    }
}

pub(super) fn pick_topic(era: Era, seed: u64) -> BookTopic {
    let mut opts = vec![BookTopic::History, BookTopic::Religion, BookTopic::Poetry];
    if era >= Era::Classical {
        opts.extend([
            BookTopic::Philosophy,
            BookTopic::Medicine,
            BookTopic::Mathematics,
            BookTopic::Geography,
        ]);
    }
    if era >= Era::Renaissance {
        opts.extend([
            BookTopic::Science,
            BookTopic::Astronomy,
            BookTopic::Engineering,
            BookTopic::Law,
        ]);
    }
    if era >= Era::Industrial {
        opts.extend([
            BookTopic::Fiction,
            BookTopic::Biography,
            BookTopic::Economics,
            BookTopic::Drama,
        ]);
    }
    opts[(seed as usize) % opts.len()]
}
