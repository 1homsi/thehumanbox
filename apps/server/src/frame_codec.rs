//! Msgpack encoding of a frame.
//!
//! `rmp_serde::to_vec_named(&payload)` is the reference: this module writes
//! exactly the same bytes, but writes the grid section (four 180k-tile arrays
//! on a full frame, thousands of `[row, col, value]` rows on every frame)
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

/// An array of unsigned bytes, each in its smallest form.
fn write_u8_array(out: &mut Vec<u8>, bytes: &[u8]) {
    write_array_len(out, bytes.len());
    out.reserve(bytes.len() * 2);
    for &b in bytes {
        if b < 128 {
            out.push(b);
        } else {
            out.extend_from_slice(&[0xcc, b]);
        }
    }
}

/// An array of signed bytes, each in its smallest form.
fn write_i8_array(out: &mut Vec<u8>, bytes: &[i8]) {
    write_array_len(out, bytes.len());
    out.reserve(bytes.len() * 2);
    for &b in bytes {
        if b >= -32 {
            // Positive fixint and negative fixint are the byte itself.
            out.push(b as u8);
        } else {
            out.extend_from_slice(&[0xd0, b as u8]);
        }
    }
}

fn write_u8_rows(out: &mut Vec<u8>, rows: &[Vec<u8>]) {
    write_array_len(out, rows.len());
    for row in rows {
        write_u8_array(out, row);
    }
}

fn write_i8_rows(out: &mut Vec<u8>, rows: &[Vec<i8>]) {
    write_array_len(out, rows.len());
    for row in rows {
        write_i8_array(out, row);
    }
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
        structure,
        tiles,
        trails,
        width,
    } = grid;
    let optional = [
        biomes.is_some(),
        depth_map.is_some(),
        fertility.is_some(),
        fertility_dense.is_some(),
        hazard.is_some(),
        tiles.is_some(),
        trails.is_some(),
    ];
    // fire, height, origin_x, origin_y, structure and width are always present.
    write_map_len(out, 6 + optional.iter().filter(|present| **present).count());

    if let Some(rows) = biomes {
        write_str(out, "biomes");
        write_u8_rows(out, rows);
    }
    if let Some(rows) = depth_map {
        write_str(out, "depth_map");
        write_u8_rows(out, rows);
    }
    if let Some(rows) = fertility {
        write_str(out, "fertility");
        write_u16_rows(out, rows);
    }
    if let Some(dense) = fertility_dense {
        write_str(out, "fertility_dense");
        write_u8_array(out, dense);
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
    write_str(out, "structure");
    write_u16_rows(out, structure);
    if let Some(rows) = tiles {
        write_str(out, "tiles");
        write_i8_rows(out, rows);
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

    /// The byte-array writers over every value, including the width boundaries.
    #[test]
    fn byte_arrays_match_rmp() {
        let unsigned: Vec<u8> = (0..=255u8).chain([0, 127, 128, 255]).collect();
        let mut mine = Vec::new();
        write_u8_array(&mut mine, &unsigned);
        assert_eq!(mine, rmp_serde::to_vec(&unsigned).unwrap());
        let signed: Vec<i8> = (-128..=127i8).chain([-33, -32, -1, 0, 127]).collect();
        let mut mine = Vec::new();
        write_i8_array(&mut mine, &signed);
        assert_eq!(mine, rmp_serde::to_vec(&signed).unwrap());
        let empty = Vec::<u8>::new();
        let mut mine = Vec::new();
        write_u8_array(&mut mine, &empty);
        assert_eq!(mine, rmp_serde::to_vec(&empty).unwrap());
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

    /// Optional layers present or absent in every combination, with values on
    /// the width boundaries, in a hand-built grid.
    #[test]
    fn grid_layers_match_rmp_serde_in_every_combination() {
        for mask in 0..128u32 {
            let has = |bit: u32| mask & (1 << bit) != 0;
            let grid = GridJson {
                biomes: has(0).then(|| vec![vec![0, 127, 128, 255]; 3]),
                depth_map: has(1).then(|| vec![vec![255, 1]; 2]),
                fertility: has(2).then(|| vec![[0, 127, 128], [255, 256, 65_535]]),
                fertility_dense: has(3).then(|| (0..=255u8).collect()),
                fire: vec![[0, 0, 1], [299, 599, 65_535]],
                hazard: has(4).then(|| vec![[3, 4, 5]]),
                height: 300,
                origin_x: -17,
                origin_y: 70_000,
                structure: Vec::new(),
                tiles: has(5).then(|| vec![vec![-128, -33, -32, -1, 0, 1, 127]; 4]),
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
