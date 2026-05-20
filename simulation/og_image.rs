//! Renders a 1200×630 PNG snapshot of the current world for OG/Twitter
//! social-share previews. Designed to be cheap enough to run on demand
//! and cached by the route layer.

use image::{ImageBuffer, Rgba, RgbaImage, ImageFormat};
use std::io::Cursor;

use crate::world::tiles::Tile;

/// Compact, snapshot-able view of the world used to render the OG png.
/// The route handler builds this under the sim lock, then releases the
/// lock and hands it to `render()` (cheap to move; no shared borrows).
pub struct OgSnapshot {
    pub width:   usize,
    pub height:  usize,
    pub tiles:   Vec<i8>,
    pub biome:   Vec<u8>,
    pub orgs:    Vec<OgOrg>,
    pub tick:    u64,
    pub day_t:   f32,   // 0..1, position in day cycle
}

#[derive(Clone, Copy)]
pub struct OgOrg {
    pub x: f32,
    pub y: f32,
    /// First 3 bytes of a hash of lineage_id, mapped to a dot color.
    pub color: [u8; 3],
}

// Target output dimensions — standard OG card aspect.
pub const OG_W: u32 = 1200;
pub const OG_H: u32 = 630;
// Header strip height where we draw the title text.
const HEADER_H: u32 = 30;

fn tile_color(t: Tile, biome: u8, day_t: f32) -> [u8; 3] {
    // Day/night tint. day_t ∈ [0,1) with 0=midnight, 0.25=dawn, 0.5=midday, 0.75=dusk.
    // We map this to a brightness multiplier ∈ [0.55, 1.0].
    let night = (1.0 - (day_t * std::f32::consts::TAU).sin().max(0.0)).min(1.0);
    let mut bright = 1.0 - 0.45 * night;
    // Slightly orange at dawn/dusk for warmth.
    let warm = ((day_t * std::f32::consts::TAU).cos()).abs(); // peaks at midday & midnight; just used for hue tweak
    let _ = warm;

    let base = match t {
        Tile::Grass    => match biome {
            // Forest / Wetland / Tundra / Volcanic / default
            1 => [ 42,  82,  46],
            4 => [ 38,  90,  74],
            6 => [124, 138, 110],
            7 => [ 96,  60,  44],
            _ => [ 70, 110,  56],
        },
        Tile::Water    => [ 36,  78, 134],
        Tile::Food     => [124, 162,  70],
        Tile::Fire     => [220,  90,  30],
        Tile::Rock     => [110, 104,  96],
        Tile::Ash      => [ 86,  78,  72],
        Tile::Campfire => [200, 120,  60],
        Tile::Hut      => [160, 120,  72],
        Tile::Flooded  => [ 72, 110, 150],
        Tile::Mineral  => [142, 134, 110],
        Tile::Scorched => [ 60,  46,  40],
        Tile::Snow     => [232, 236, 244],
        Tile::Sand     => [206, 188, 138],
        Tile::Void     => [ 12,  12,  20],
    };

    // Water and fire glow at their own light. Solid tiles dim at night.
    let dim = if matches!(t, Tile::Fire | Tile::Campfire) { 1.0 } else { bright };
    bright = dim;
    [
        (base[0] as f32 * bright).clamp(0.0, 255.0) as u8,
        (base[1] as f32 * bright).clamp(0.0, 255.0) as u8,
        (base[2] as f32 * bright).clamp(0.0, 255.0) as u8,
    ]
}

/// Bare 5×7 bitmap font for the few ASCII characters used in the OG
/// header. Each char is 5 cols × 7 rows; bit `col` of row `r` is the
/// `col`-th leftmost pixel.
fn glyph(c: char) -> Option<[u8; 7]> {
    Some(match c {
        'T' => [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
        'H' => [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
        'E' => [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
        'U' => [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
        'M' => [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
        'A' => [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
        'N' => [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
        'B' => [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
        'O' => [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
        'X' => [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
        '·' | ' ' => [0,0,0,0,0,0,0],
        _   => return None,
    })
}

fn draw_text(img: &mut RgbaImage, text: &str, x: u32, y: u32, scale: u32, color: [u8; 3]) {
    let mut cur_x = x;
    for ch in text.chars() {
        let Some(rows) = glyph(ch.to_ascii_uppercase()) else {
            cur_x += 6 * scale;
            continue;
        };
        for (ry, row) in rows.iter().enumerate() {
            for cx in 0..5u32 {
                let bit = (row >> (4 - cx)) & 1;
                if bit == 0 { continue; }
                for sy in 0..scale {
                    for sx in 0..scale {
                        let px = cur_x + cx * scale + sx;
                        let py = y + (ry as u32) * scale + sy;
                        if px < img.width() && py < img.height() {
                            img.put_pixel(px, py, Rgba([color[0], color[1], color[2], 255]));
                        }
                    }
                }
            }
        }
        cur_x += 6 * scale;
    }
}

pub fn render(snap: &OgSnapshot) -> Vec<u8> {
    // Each world tile renders at TILE_W × TILE_H pixels into the map
    // area below the header strip.
    let map_h = OG_H - HEADER_H;
    let tile_w = (OG_W as f32) / (snap.width  as f32);
    let tile_h = (map_h as f32) / (snap.height as f32);

    let mut img: RgbaImage = ImageBuffer::from_pixel(OG_W, OG_H, Rgba([16, 18, 28, 255]));

    // Map body: nearest-neighbour upscale per tile.
    for py in 0..map_h {
        let world_y = ((py as f32) / tile_h) as usize;
        if world_y >= snap.height { break; }
        let row_off = world_y * snap.width;
        for px in 0..OG_W {
            let world_x = ((px as f32) / tile_w) as usize;
            if world_x >= snap.width { continue; }
            let idx = row_off + world_x;
            let t = Tile::from_i8(snap.tiles[idx]);
            let b = snap.biome.get(idx).copied().unwrap_or(0);
            let c = tile_color(t, b, snap.day_t);
            img.put_pixel(px, py + HEADER_H, Rgba([c[0], c[1], c[2], 255]));
        }
    }

    // Organisms as small filled circles (3-pixel radius) coloured by
    // lineage. Drawn last so they sit on top of the map.
    for o in &snap.orgs {
        let cx = (o.x * tile_w) as i32;
        let cy = (o.y * tile_h) as i32 + HEADER_H as i32;
        for dy in -3i32..=3 {
            for dx in -3i32..=3 {
                if dx*dx + dy*dy > 9 { continue; }
                let px = cx + dx;
                let py = cy + dy;
                if px < 0 || py < (HEADER_H as i32) || px >= OG_W as i32 || py >= OG_H as i32 {
                    continue;
                }
                img.put_pixel(px as u32, py as u32, Rgba([o.color[0], o.color[1], o.color[2], 255]));
            }
        }
    }

    // Header band (dark) + title text.
    for py in 0..HEADER_H {
        for px in 0..OG_W {
            img.put_pixel(px, py, Rgba([10, 10, 16, 235]));
        }
    }
    draw_text(&mut img, "THE HUMAN BOX", 16, 6, 2, [220, 215, 200]);

    let mut buf = Vec::with_capacity(64 * 1024);
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
        .expect("PNG encode failed");
    buf
}

/// Hash a lineage_id to an RGB colour. Deterministic — same lineage
/// renders the same dot every time.
pub fn lineage_color(lid: &str) -> [u8; 3] {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    lid.hash(&mut h);
    let n = h.finish();
    // HSL → RGB at fixed saturation/lightness for legibility.
    let hue = ((n & 0xffff) as f32) / 65535.0;
    let s: f32 = 0.65;
    let l: f32 = 0.55;
    let c: f32 = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let h6: f32 = hue * 6.0;
    let x: f32 = c * (1.0 - (h6 % 2.0 - 1.0).abs());
    let (r1, g1, b1) = match h6 as i32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };
    let m = l - c / 2.0;
    [
        (((r1 + m) * 255.0).clamp(0.0, 255.0)) as u8,
        (((g1 + m) * 255.0).clamp(0.0, 255.0)) as u8,
        (((b1 + m) * 255.0).clamp(0.0, 255.0)) as u8,
    ]
}
