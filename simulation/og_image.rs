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
    /// Alive animals as small species-tinted dots. Rendered smaller
    /// than organisms so the social card stays legible.
    pub animals: Vec<OgAnimal>,
    pub tick:    u64,
    pub day_t:   f32,   // 0..1, position in day cycle
    /// Current era label (e.g. "stone age", "iron age") for the
    /// header overlay. Short — typically ≤16 chars.
    pub era:     String,
    /// Active alive population — used in the bottom-right stat ribbon.
    pub alive:   u32,
}

#[derive(Clone, Copy)]
pub struct OgOrg {
    pub x: f32,
    pub y: f32,
    /// First 3 bytes of a hash of lineage_id, mapped to a dot color.
    pub color: [u8; 3],
}

#[derive(Clone, Copy)]
pub struct OgAnimal {
    pub x: f32,
    pub y: f32,
    /// Species-tinted color (fish blue, deer brown, wolf grey, etc.).
    pub color: [u8; 3],
}

/// Species → tint mapping. Kept here next to the OG renderer so the
/// social card colors stay in lock-step with the 2D map emoji
/// rendering on the live page.
pub fn animal_color(kind: &str) -> [u8; 3] {
    match kind {
        "fish"   => [140, 175, 230],
        "bird"   => [212, 160,  64],
        "deer"   => [168, 130,  90],
        "boar"   => [106,  82,  64],
        "rabbit" => [204, 204, 204],
        "wolf"   => [ 92,  92,  92],
        "dog"    => [176, 136,  80],
        _        => [180, 160, 110],
    }
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
        'A' => [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
        'B' => [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
        'C' => [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
        'D' => [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
        'E' => [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
        'F' => [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
        'G' => [0b01110, 0b10001, 0b10000, 0b10011, 0b10001, 0b10001, 0b01110],
        'H' => [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
        'I' => [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
        'J' => [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
        'K' => [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
        'L' => [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
        'M' => [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
        'N' => [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
        'O' => [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
        'P' => [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
        'Q' => [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
        'R' => [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
        'S' => [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
        'T' => [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
        'U' => [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
        'V' => [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
        'W' => [0b10001, 0b10001, 0b10001, 0b10001, 0b10101, 0b11011, 0b10001],
        'X' => [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
        'Y' => [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
        'Z' => [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
        '0' => [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
        '1' => [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
        '2' => [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
        '3' => [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
        '4' => [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
        '5' => [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
        '6' => [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
        '7' => [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b10000],
        '8' => [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
        '9' => [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
        '-' => [0b00000, 0b00000, 0b00000, 0b01110, 0b00000, 0b00000, 0b00000],
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

    // Animals first (smaller than organisms — 2-pixel radius) so
    // they sit under the organism dots when colocated. Without this
    // the OG card showed an empty world from the wildlife
    // perspective.
    for a in &snap.animals {
        let cx = (a.x * tile_w) as i32;
        let cy = (a.y * tile_h) as i32 + HEADER_H as i32;
        for dy in -2i32..=2 {
            for dx in -2i32..=2 {
                if dx*dx + dy*dy > 4 { continue; }
                let px = cx + dx;
                let py = cy + dy;
                if px < 0 || py < (HEADER_H as i32) || px >= OG_W as i32 || py >= OG_H as i32 {
                    continue;
                }
                img.put_pixel(px as u32, py as u32, Rgba([a.color[0], a.color[1], a.color[2], 255]));
            }
        }
    }

    // Organisms as small filled circles (3-pixel radius) coloured by
    // lineage. Drawn last so they sit on top of the map + animals.
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

    // Status ribbon along the bottom: alive pop · era · tick. Drawn
    // over a translucent dark strip so it stays legible against any
    // terrain background. Centered horizontally, plus a small left
    // and right anchor for the labels.
    const STAT_H: u32 = 28;
    let stat_y0 = OG_H - STAT_H;
    for py in stat_y0..OG_H {
        for px in 0..OG_W {
            let p = img.get_pixel(px, py);
            // Mix existing pixel with dark band at 80% strength.
            let r = (p[0] as u32 * 20 + 10 * 80) / 100;
            let g = (p[1] as u32 * 20 + 10 * 80) / 100;
            let b = (p[2] as u32 * 20 + 16 * 80) / 100;
            img.put_pixel(px, py, Rgba([r as u8, g as u8, b as u8, 255]));
        }
    }
    // Left: alive count.
    let alive_text = format!("ALIVE {}", snap.alive);
    draw_text(&mut img, &alive_text, 16, stat_y0 + 6, 2, [220, 215, 200]);
    // Center: era (ASCII-fold; bitmap font only knows uppercase + digits).
    let era_safe: String = snap.era.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == ' ' || c == '-' { c } else { '-' })
        .collect();
    let era_text = format!("ERA {}", era_safe.trim());
    // Crude horizontal centering: each glyph is 6 px wide at scale=2 → 12 px,
    // so center pixel = OG_W/2 - len*12/2.
    let era_x = (OG_W as i32 / 2 - (era_text.len() as i32) * 6).max(0) as u32;
    draw_text(&mut img, &era_text, era_x, stat_y0 + 6, 2, [220, 215, 200]);
    // Right: tick counter.
    let tick_text = format!("TICK {}", snap.tick);
    let tick_w = (tick_text.len() as u32) * 12;
    let tick_x = OG_W.saturating_sub(tick_w + 16);
    draw_text(&mut img, &tick_text, tick_x, stat_y0 + 6, 2, [220, 215, 200]);

    let mut buf = Vec::with_capacity(64 * 1024);
    // PNG encode can fail (extremely rare — the image is well-formed
    // here) but it's not worth panicking the request thread for. Log
    // and return an empty buffer; the route will surface it to the
    // client as a 0-byte response, which any real social crawler
    // treats as "image unavailable, fall back to text card."
    if let Err(e) = image::DynamicImage::ImageRgba8(img)
        .write_to(&mut Cursor::new(&mut buf), ImageFormat::Png)
    {
        tracing::warn!(target: "og", "PNG encode failed: {e}");
        buf.clear();
    }
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
