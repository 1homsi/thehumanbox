//! The grid's per-tile layers in a save, written compactly and read back bit for bit.
//!
//! A layer is 320,000 numbers. Written as JSON text, the float layers made up most of a mature world's
//! 41 MB save, and formatting them was most of the time an autosave held the simulation still. Most
//! layers are long runs of one value (trails, fire, hazard and pressure are nearly all zero; water
//! depth and temperature repeat for miles), so a layer is now written as runs: a count, then the
//! value's bytes, the whole base64-encoded behind a short prefix. Floats are compared and stored by
//! their bits, so every value (and -0.0, and any NaN) comes back exactly as it was.
//!
//! Reading still accepts the plain number arrays of older saves.

use serde::de::{self, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serializer};
use std::fmt;
use std::marker::PhantomData;

/// Marks a packed layer, and which encoding it uses.
const PREFIX: &str = "rle1:";
/// The most cells a layer may decode to: several times any world's map.
const MAX_CELLS: usize = 4 * 1024 * 1024;

/// A value a layer holds, as the bytes it is stored as.
trait Cell: Copy {
    const SIZE: usize;
    fn bits(self) -> u32;
    fn write(self, out: &mut Vec<u8>);
    fn read(bytes: &[u8]) -> Self;
}

impl Cell for f32 {
    const SIZE: usize = 4;
    fn bits(self) -> u32 {
        self.to_bits()
    }
    fn write(self, out: &mut Vec<u8>) {
        out.extend_from_slice(&self.to_bits().to_le_bytes());
    }
    fn read(bytes: &[u8]) -> Self {
        f32::from_bits(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
    }
}

impl Cell for u8 {
    const SIZE: usize = 1;
    fn bits(self) -> u32 {
        u32::from(self)
    }
    fn write(self, out: &mut Vec<u8>) {
        out.push(self);
    }
    fn read(bytes: &[u8]) -> Self {
        bytes[0]
    }
}

fn put_varint(out: &mut Vec<u8>, mut value: u64) {
    loop {
        let byte = (value & 0x7f) as u8;
        value >>= 7;
        if value == 0 {
            out.push(byte);
            return;
        }
        out.push(byte | 0x80);
    }
}

fn get_varint(bytes: &[u8], at: &mut usize) -> Option<u64> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let byte = *bytes.get(*at)?;
        *at += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
    }
    None
}

fn encode<T: Cell>(values: &[T]) -> String {
    let mut raw = Vec::with_capacity(values.len() / 8 + 16);
    let mut i = 0;
    while i < values.len() {
        let bits = values[i].bits();
        let mut run = 1;
        while i + run < values.len() && values[i + run].bits() == bits {
            run += 1;
        }
        put_varint(&mut raw, run as u64);
        values[i].write(&mut raw);
        i += run;
    }
    let mut out = String::with_capacity(PREFIX.len() + raw.len().div_ceil(3) * 4);
    out.push_str(PREFIX);
    base64_encode(&raw, &mut out);
    out
}

fn decode<T: Cell>(text: &str) -> Result<Vec<T>, String> {
    let body = text.strip_prefix(PREFIX).ok_or_else(|| {
        let head: String = text.chars().take(8).collect();
        format!("unknown grid layer encoding {head:?}")
    })?;
    let raw = base64_decode(body)?;
    let mut values = Vec::new();
    let mut at = 0;
    while at < raw.len() {
        let run = get_varint(&raw, &mut at).ok_or("grid layer run count is cut off")?;
        let bytes = raw.get(at..at + T::SIZE).ok_or("grid layer value is cut off")?;
        at += T::SIZE;
        let value = T::read(bytes);
        let run = usize::try_from(run).map_err(|_| "grid layer run is too long")?;
        // No world has a layer anywhere near this (one is 320,000 cells): a save claiming more is damaged or
        // hostile, and is refused before it can claim the memory.
        if run > MAX_CELLS || values.len() + run > MAX_CELLS {
            return Err("grid layer is larger than any world".into());
        }
        values.resize(values.len() + run, value);
    }
    Ok(values)
}

const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64_encode(bytes: &[u8], out: &mut String) {
    for chunk in bytes.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(ALPHABET[(n >> 18) as usize & 63] as char);
        out.push(ALPHABET[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            ALPHABET[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            ALPHABET[n as usize & 63] as char
        } else {
            '='
        });
    }
}

fn base64_decode(text: &str) -> Result<Vec<u8>, String> {
    let digit = |c: u8| -> Result<u32, String> {
        Ok(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return Err(format!("grid layer has a stray character {:?}", c as char)),
        } as u32)
    };
    let bytes = text.as_bytes();
    if !bytes.len().is_multiple_of(4) {
        return Err("grid layer has a cut-off encoding".into());
    }
    let mut out = Vec::with_capacity(bytes.len() / 4 * 3);
    for quad in bytes.chunks(4) {
        let pad = quad.iter().rev().take_while(|&&c| c == b'=').count();
        let mut n = 0u32;
        for (k, &c) in quad.iter().enumerate() {
            n <<= 6;
            if k < 4 - pad {
                n |= digit(c)?;
            }
        }
        out.push((n >> 16) as u8);
        if pad < 2 {
            out.push((n >> 8) as u8);
        }
        if pad < 1 {
            out.push(n as u8);
        }
    }
    Ok(out)
}

/// Reads a layer written either way: a packed string or a plain array of numbers.
struct LayerVisitor<T>(PhantomData<T>);

impl<'de, T: Cell + Deserialize<'de>> Visitor<'de> for LayerVisitor<T> {
    type Value = Vec<T>;

    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("a packed grid layer or an array of numbers")
    }

    fn visit_str<E: de::Error>(self, text: &str) -> Result<Vec<T>, E> {
        decode(text).map_err(E::custom)
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Vec<T>, A::Error> {
        let mut values = Vec::with_capacity(seq.size_hint().unwrap_or(0));
        while let Some(value) = seq.next_element()? {
            values.push(value);
        }
        Ok(values)
    }
}

/// `#[serde(with = "packed::f32s")]` for a float layer.
pub(crate) mod f32s {
    use super::*;

    pub(crate) fn serialize<S: Serializer>(values: &[f32], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&encode(values))
    }

    pub(crate) fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<f32>, D::Error> {
        deserializer.deserialize_any(LayerVisitor::<f32>(PhantomData))
    }
}

/// `#[serde(with = "packed::u8s")]` for a byte layer.
pub(crate) mod u8s {
    use super::*;

    pub(crate) fn serialize<S: Serializer>(values: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&encode(values))
    }

    pub(crate) fn deserialize<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Vec<u8>, D::Error> {
        deserializer.deserialize_any(LayerVisitor::<u8>(PhantomData))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Serialize, serde::Deserialize, PartialEq, Debug)]
    struct Layers {
        #[serde(with = "f32s")]
        floats: Vec<f32>,
        #[serde(with = "u8s")]
        bytes: Vec<u8>,
    }

    fn bits(values: &[f32]) -> Vec<u32> {
        values.iter().map(|v| v.to_bits()).collect()
    }

    /// Every float comes back with the same bits: runs, lone values, signed zeros, NaN, infinities,
    /// subnormals, and layers whose length leaves base64 padding of 0, 1 and 2 characters.
    #[test]
    fn layers_come_back_bit_for_bit() {
        let mut state = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = move || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            state
        };
        for len in [0usize, 1, 2, 3, 4, 5, 999, 320_000] {
            let floats: Vec<f32> = (0..len)
                .map(|i| match next() % 9 {
                    0..=3 => 0.0,
                    4 => -0.0,
                    5 => f32::from_bits(next() as u32),
                    6 => [
                        f32::NAN,
                        f32::INFINITY,
                        f32::NEG_INFINITY,
                        f32::MIN_POSITIVE / 2.0,
                    ][i % 4],
                    _ => (i / 7) as f32 * 0.37,
                })
                .collect();
            let bytes: Vec<u8> = (0..len)
                .map(|i| {
                    if next() % 3 == 0 {
                        (next() % 256) as u8
                    } else {
                        (i / 50) as u8
                    }
                })
                .collect();
            let text = serde_json::to_string(&Layers {
                floats: floats.clone(),
                bytes: bytes.clone(),
            })
            .unwrap();
            let back: Layers = serde_json::from_str(&text).unwrap();
            assert_eq!(bits(&back.floats), bits(&floats), "floats, length {len}");
            assert_eq!(back.bytes, bytes, "bytes, length {len}");
        }
    }

    #[test]
    fn plain_number_arrays_from_older_saves_still_load() {
        let back: Layers =
            serde_json::from_str(r#"{"floats":[0.0,1.5,-11.0,0.009632203],"bytes":[2,2,7]}"#).unwrap();
        assert_eq!(bits(&back.floats), bits(&[0.0, 1.5, -11.0, 0.009632203]));
        assert_eq!(back.bytes, vec![2, 2, 7]);
    }

    #[test]
    fn a_mostly_empty_layer_takes_a_few_bytes_instead_of_megabytes() {
        let mut trail = vec![0.0f32; 320_000];
        for i in (0..320_000).step_by(997) {
            trail[i] = 0.42;
        }
        let packed = serde_json::to_string(&Layers {
            floats: trail.clone(),
            bytes: vec![2; 320_000],
        })
        .unwrap();
        let plain = serde_json::to_string(&trail).unwrap();
        assert!(
            packed.len() * 50 < plain.len(),
            "packed {} bytes against {} plain",
            packed.len(),
            plain.len()
        );
    }

    #[test]
    fn a_damaged_layer_is_refused_with_a_reason() {
        for bad in [
            r#""rle9:AAAA""#,
            r#""rle1:AA""#,
            r#""rle1:A*AA""#,
            r#""rle1:gA==""#,
        ] {
            let text = format!(r#"{{"floats":{bad},"bytes":[]}}"#);
            assert!(
                serde_json::from_str::<Layers>(&text).is_err(),
                "{bad} was accepted"
            );
        }
    }
}
