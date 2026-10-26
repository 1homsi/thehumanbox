//! Msgpack encoding of a frame.
//!
//! `rmp_serde::to_vec_named(&payload)` is the reference: this module writes
//! exactly the same bytes, but writes the grid section (up to four per-cell
//! byte layers as `bin`, thousands of `[row, col, value]` rows on every frame)
//! with direct byte writes instead of one serde call per number. Everything
//! else still goes through `rmp_serde`.

use serde::Serialize;

use crate::sim::serialize::{FrameEntry, FramePayload};
use crate::world::grid::GridJson;

/// Encode a frame as msgpack, byte for byte what `rmp_serde::to_vec_named`
/// produces for the same payload.
pub fn encode(payload: &FramePayload) -> Result<Vec<u8>, rmp_serde::encode::Error> {
    let entries = payload.entries();
    let mut out: Vec<u8> = Vec::with_capacity(128 * 1024);
    write_map_len(&mut out, entries.len());
    for (key, entry) in &entries {
        write_str(&mut out, key);
        match entry {
            FrameEntry::Grid(grid) => write_grid(&mut out, grid),
            other => {
                let mut serializer = rmp_serde::Serializer::new(&mut out).with_struct_map();
                other.serialize(&mut serializer)?;
            }
        }
    }
    Ok(out)
}

fn write_map_len(out: &mut Vec<u8>, len: usize) {
    if len < 16 {
        out.push(0x80 | len as u8);
    } else if len < 65_536 {
        out.push(0xde);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(0xdf);
        out.extend_from_slice(&(len as u32).to_be_bytes());
    }
}

fn write_array_len(out: &mut Vec<u8>, len: usize) {
    if len < 16 {
        out.push(0x90 | len as u8);
    } else if len < 65_536 {
        out.push(0xdc);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(0xdd);
        out.extend_from_slice(&(len as u32).to_be_bytes());
    }
}

/// Field names are short ASCII.
fn write_str(out: &mut Vec<u8>, text: &str) {
    let len = text.len();
    if len < 32 {
        out.push(0xa0 | len as u8);
    } else if len < 256 {
        out.push(0xd9);
        out.push(len as u8);
    } else if len < 65_536 {
        out.push(0xda);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(0xdb);
        out.extend_from_slice(&(len as u32).to_be_bytes());
    }
    out.extend_from_slice(text.as_bytes());
}

/// The smallest unsigned encoding (what `rmp::encode::write_uint` picks).
#[inline]
fn write_uint(out: &mut Vec<u8>, value: u64) {
    if value < 128 {
        out.push(value as u8);
    } else if value < 256 {
        out.extend_from_slice(&[0xcc, value as u8]);
    } else if value < 65_536 {
        out.push(0xcd);
        out.extend_from_slice(&(value as u16).to_be_bytes());
    } else if value < 4_294_967_296 {
        out.push(0xce);
        out.extend_from_slice(&(value as u32).to_be_bytes());
    } else {
        out.push(0xcf);
        out.extend_from_slice(&value.to_be_bytes());
    }
}

/// The smallest signed encoding (what `rmp::encode::write_sint` picks).
#[inline]
fn write_sint(out: &mut Vec<u8>, value: i64) {
    if value >= 0 {
        write_uint(out, value as u64);
    } else if value >= -32 {
        out.push(value as u8);
    } else if value >= -128 {
        out.extend_from_slice(&[0xd0, value as u8]);
    } else if value >= -32_768 {
        out.push(0xd1);
        out.extend_from_slice(&(value as i16).to_be_bytes());
    } else if value >= -2_147_483_648 {
        out.push(0xd2);
        out.extend_from_slice(&(value as i32).to_be_bytes());
    } else {
        out.push(0xd3);
        out.extend_from_slice(&value.to_be_bytes());
    }
}

/// A byte layer as msgpack `bin`, the form `serialize_bytes` takes in `rmp_serde`.
fn write_bin(out: &mut Vec<u8>, bytes: &[u8]) {
    let len = bytes.len();
    if len < 256 {
        out.extend_from_slice(&[0xc4, len as u8]);
    } else if len < 65_536 {
        out.push(0xc5);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(0xc6);
        out.extend_from_slice(&(len as u32).to_be_bytes());
    }
    out.extend_from_slice(bytes);
}

/// Fixed-size `[u16; N]` rows (`[row, col, value, ..]` entries).
fn write_u16_rows<const N: usize>(out: &mut Vec<u8>, rows: &[[u16; N]]) {
    write_array_len(out, rows.len());
    out.reserve(rows.len() * (N * 3 + 1));
    for row in rows {
        write_array_len(out, N);
        for &v in row {
            write_uint(out, u64::from(v));
        }
    }
}

/// `GridJson` as a msgpack map in declaration (alphabetical) order, skipping
/// the absent optional layers, like its derived `Serialize`.
fn write_grid(out: &mut Vec<u8>, grid: &GridJson) {
    // Naming every field (no `..`) makes adding one a compile error here.
    let GridJson {
        biomes,
        depth_map,
        fertility,
        fertility_dense,
        fire,
        hazard,
        height,
        origin_x,
        origin_y,
        roads,
        structure,
        structure_delta,
        tiles,
        trails,
        width,
    } = grid;
    let optional = [
        structure.is_some(),
        structure_delta.is_some(),
        biomes.is_some(),
        depth_map.is_some(),
        fertility.is_some(),
        fertility_dense.is_some(),
        hazard.is_some(),
        roads.is_some(),
        tiles.is_some(),
        trails.is_some(),
    ];
    // fire, height, origin_x, origin_y and width are always present.
    write_map_len(out, 5 + optional.iter().filter(|present| **present).count());

    if let Some(cells) = biomes {
        write_str(out, "biomes");
        write_bin(out, cells);
    }
    if let Some(cells) = depth_map {
        write_str(out, "depth_map");
        write_bin(out, cells);
    }
    if let Some(rows) = fertility {
        write_str(out, "fertility");
        write_u16_rows(out, rows);
    }
    if let Some(cells) = fertility_dense {
        write_str(out, "fertility_dense");
        write_bin(out, cells);
    }
    write_str(out, "fire");
    write_u16_rows(out, fire);
    if let Some(rows) = hazard {
        write_str(out, "hazard");
        write_u16_rows(out, rows);
    }
    write_str(out, "height");
    write_uint(out, *height as u64);
    write_str(out, "origin_x");
    write_sint(out, i64::from(*origin_x));
    write_str(out, "origin_y");
    write_sint(out, i64::from(*origin_y));
    if let Some(rows) = roads {
        write_str(out, "roads");
        write_u16_rows(out, rows);
    }
    if let Some(rows) = structure {
        write_str(out, "structure");
        write_u16_rows(out, rows);
    }
    if let Some(rows) = structure_delta {
        write_str(out, "structure_delta");
        write_u16_rows(out, rows);
    }
    if let Some(cells) = tiles {
        write_str(out, "tiles");
        write_bin(out, cells);
    }
    if let Some(rows) = trails {
        write_str(out, "trails");
        write_u16_rows(out, rows);
    }
    write_str(out, "width");
    write_uint(out, *width as u64);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sim::simulation::Simulation;

    fn reference(payload: &FramePayload) -> Vec<u8> {
        rmp_serde::to_vec_named(payload).expect("reference encode")
    }

    /// The primitive writers against `rmp_serde` over every width boundary.
    #[test]
    fn number_and_header_writers_match_rmp() {
        let uints = [
            0u64,
            1,
            127,
            128,
            255,
            256,
            65_535,
            65_536,
            4_294_967_295,
            4_294_967_296,
            u64::MAX,
        ];
        for v in uints {
            let mut mine = Vec::new();
            write_uint(&mut mine, v);
            assert_eq!(mine, rmp_serde::to_vec(&v).unwrap(), "uint {v}");
        }
        let sints = [
            i64::MIN,
            -4_294_967_296,
            -2_147_483_649,
            -2_147_483_648,
            -32_769,
            -32_768,
            -129,
            -128,
            -33,
            -32,
            -1,
            0,
            1,
            127,
            128,
            255,
            256,
            65_535,
            65_536,
            4_294_967_295,
            4_294_967_296,
            i64::MAX,
        ];
        for v in sints {
            let mut mine = Vec::new();
            write_sint(&mut mine, v);
            assert_eq!(mine, rmp_serde::to_vec(&v).unwrap(), "sint {v}");
        }
        for len in [0usize, 1, 15, 16, 255, 65_535, 65_536, 70_000] {
            let mut mine = Vec::new();
            write_array_len(&mut mine, len);
            // A serde sequence of `len` unit-like zeros: skip its elements.
            let theirs = rmp_serde::to_vec(&vec![0u8; len]).unwrap();
            let elements = len; // each element is one byte
            assert_eq!(mine, theirs[..theirs.len() - elements], "array len {len}");
        }
        for len in [0usize, 5, 31, 32, 255, 256, 65_535, 65_536] {
            let text = "x".repeat(len);
            let mut mine = Vec::new();
            write_str(&mut mine, &text);
            assert_eq!(mine, rmp_serde::to_vec(&text).unwrap(), "str len {len}");
        }
        let mut one = Vec::new();
        write_map_len(&mut one, 15);
        write_map_len(&mut one, 16);
        write_map_len(&mut one, 65_535);
        write_map_len(&mut one, 65_536);
        assert_eq!(
            one,
            [0x8f, 0xde, 0x00, 0x10, 0xde, 0xff, 0xff, 0xdf, 0x00, 0x01, 0x00, 0x00]
        );
    }

    /// The `bin` writer on each side of the length boundaries.
    #[test]
    fn bin_matches_rmp() {
        #[derive(Serialize)]
        struct Bytes<'a>(#[serde(with = "serde_bytes_shim")] &'a [u8]);
        mod serde_bytes_shim {
            pub fn serialize<S: serde::Serializer>(b: &&[u8], s: S) -> Result<S::Ok, S::Error> {
                s.serialize_bytes(b)
            }
        }
        for len in [0usize, 1, 255, 256, 65_535, 65_536, 70_000] {
            let cells: Vec<u8> = (0..len).map(|i| (i * 7) as u8).collect();
            let mut mine = Vec::new();
            write_bin(&mut mine, &cells);
            assert_eq!(mine, rmp_serde::to_vec(&Bytes(&cells)).unwrap(), "len {len}");
        }
    }

    /// Every frame kind of a running world, plus the transport's extra keys,
    /// encodes to the same bytes as `rmp_serde`.
    #[test]
    fn frames_match_rmp_serde_byte_for_byte() {
        let mut sim = Simulation::new(42);
        for _ in 0..400 {
            sim.tick();
        }
        let mut seen_tiles = false;
        let mut seen_hot = false;
        for round in 0..130u64 {
            for _ in 0..3 {
                sim.tick();
            }
            let mut frame = match round % 13 {
                0 => sim.state_frame(),
                6 => sim.state_frame_periodic_full(),
                _ => sim.state_frame_incremental(),
            };
            frame.insert("frame_id", serde_json::json!(round));
            frame.insert(
                "server_sent_at_ms",
                serde_json::json!(1_700_000_000_000u64 + round),
            );
            frame.insert("frame_kind", serde_json::json!("full"));
            let entries = frame.entries();
            seen_hot |= entries.iter().any(|(k, _)| *k == "organisms_hot");
            seen_tiles |= entries.iter().any(
                |(_, e)| matches!(e, FrameEntry::Grid(g) if g.tiles.is_some() && g.fertility_dense.is_some()),
            );
            drop(entries);
            assert_eq!(encode(&frame).unwrap(), reference(&frame), "round {round}");
        }
        assert!(
            seen_hot && seen_tiles,
            "the run must cover delta and tile-carrying frames"
        );
    }

    /// The typed buildings section encodes to the bytes the `Value` objects it
    /// replaced did (floats widened to `f64`, `null` for non-finite ones, keys
    /// sorted), for every kind in odd states.
    #[test]
    fn typed_buildings_encode_like_the_value_frame() {
        use crate::sim::buildings::{Building, BuildingKind};
        let mut sim = Simulation::new(42);
        sim.buildings.clear();
        sim.tick_count = 5_000;
        for (i, kind) in BuildingKind::all().iter().enumerate() {
            let owner = (i % 3 != 0).then(|| format!("lineage-{}", i % 5));
            let mut b = Building::new(i as u32 + 1, *kind, i as i32 % 600, i as i32 % 300, owner, 12);
            b.condition = [1.0, 0.37, f32::NAN, 0.999, 0.0][i % 5];
            match i % 4 {
                1 => b.damage = 0.3,
                2 => {
                    b.damage = f32::NAN;
                    b.ruined_at_tick = Some(4_000);
                }
                3 => {
                    b.damage = 0.5;
                    b.last_damage_tick = Some(4_960);
                    b.last_repair_tick = Some(4_990);
                    b.condition = 1.0;
                }
                _ => {}
            }
            sim.buildings.push(b);
        }
        // Through `Value` the grid's byte layers turn into number arrays; this test is about buildings.
        let mut typed = sim.state_frame();
        typed.grid = None;
        let mut value = sim.state_frame().into_value();
        value.as_object_mut().unwrap().remove("grid");
        let via_value = FramePayload::from(value);
        assert!(typed.entries().iter().any(|(k, _)| *k == "buildings"));
        assert_eq!(encode(&typed).unwrap(), reference(&via_value));
    }

    /// Optional layers present or absent in every combination, with values on
    /// the width boundaries, in a hand-built grid.
    #[test]
    fn grid_layers_match_rmp_serde_in_every_combination() {
        for mask in 0..1024u32 {
            let has = |bit: u32| mask & (1 << bit) != 0;
            let grid = GridJson {
                biomes: has(0).then(|| [0, 127, 128, 255].repeat(3)),
                depth_map: has(1).then(|| (0..300u32).map(|i| i as u8).collect()),
                fertility: has(2).then(|| vec![[0, 127, 128], [255, 256, 65_535]]),
                fertility_dense: has(3).then(|| (0..=255u8).collect()),
                fire: vec![[0, 0, 1], [299, 599, 65_535]],
                hazard: has(4).then(|| vec![[3, 4, 5]]),
                height: 300,
                origin_x: -17,
                origin_y: 70_000,
                roads: has(7).then(|| vec![[0, 1, 1], [299, 599, 2]]),
                structure: has(8).then(Vec::new),
                structure_delta: has(9).then(|| vec![[1, 2, 0]]),
                tiles: has(5).then(|| {
                    [-128i8, -33, -32, -1, 0, 1, 127]
                        .repeat(4)
                        .into_iter()
                        .map(|t| t as u8)
                        .collect()
                }),
                trails: has(6).then(|| vec![[1, 2, 3, 4, 65_535]]),
                width: 600,
            };
            let frame: FramePayload = serde_json::json!({ "tick": 1, "zeta": [1, 2, 3] }).into();
            let mut with_grid = frame;
            with_grid.set_grid(grid);
            assert_eq!(encode(&with_grid).unwrap(), reference(&with_grid), "mask {mask}");
        }
    }
}
