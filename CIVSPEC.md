# Civilization expansion spec

Internal coordination doc for the BC→2000s expansion. Agents read this before touching shared code.

## Eras (per-lineage)

Add `Era` enum to `simulation/sim/era.rs`:

```rust
pub enum Era { PreStone, Stone, Bronze, Iron, Classical, Medieval, Renaissance, Industrial, Modern, Information }
```

Progression: each lineage has `era: Era`, advances when its members collectively unlock the era's required discoveries.

Required discoveries per era (additive; later eras include earlier):
- PreStone: foraging
- Stone: fire, stone_tools, shelter
- Bronze: smelting, agriculture, pottery
- Iron: ironworking, writing, wheel
- Classical: mathematics, philosophy, masonry
- Medieval: feudalism, mill, plow
- Renaissance: printing, gunpowder, astronomy
- Industrial: steam_engine, railroad, factory
- Modern: electricity, internal_combustion, antibiotics
- Information: computer, internet, satellite

## Age stages (per-organism)

Add `AgeStage` enum derived from `age` and `max_age`:

```
infant  : 0 to 0.10 of life
child   : 0.10 to 0.25
teen    : 0.25 to 0.35
adult   : 0.35 to 0.75
elder   : 0.75 to 1.0
```

Helper `Organism::age_stage()` returns it. Wire it through serialize as `age_stage: "adult"` etc.

## Inventory & tools

Add to Organism:

```rust
pub inventory: HashMap<ToolKind, u8>  // count up to 8 per kind
```

`ToolKind` enum lives in `simulation/sim/tools.rs`. Each tool has era_unlock + effect.

Examples:
- StoneAxe (Stone era): wood gather +200%
- BronzeSpear (Bronze): hunt range +2
- IronSword (Iron): combat +50%
- Plow (Medieval): farm yield +100%
- Musket (Renaissance): combat +200%
- Rifle (Industrial): combat +400%
- Book (after writing): knowledge transfer
- Computer (Information): knowledge transfer ×10

## Buildings

Extend `Tile` enum or add a parallel `Structure` registry with kinds:

- Hut (Stone)
- House (Bronze) — bigger sprite, 2x2 footprint
- Manor (Medieval) — 3x3 footprint
- TownHouse (Renaissance) — 2x3
- Apartment (Modern) — 4x4
- School (Classical) — 3x3, teaches literacy
- University (Renaissance) — 4x4, grants degrees
- Library (Classical) — knowledge persistence
- Market (Iron) — trade hub
- Temple (Bronze) — religion
- Factory (Industrial) — mass production
- Hospital (Modern) — healing
- Forge (Bronze) — tool crafting
- Mill (Medieval) — grain processing

Each structure has: era_unlock, footprint (w,h), capacity (orgs that can be inside), construction_cost (wood/stone/etc.).

## Education

Per-org: `literacy: f32` (0..1), `degrees: Vec<DegreeKind>`.
DegreeKinds: Philosophy, Medicine, Engineering, Law, Science, Arts.
Schools raise literacy. Universities (requires literacy > 0.7) grant degrees.
Degreed orgs unlock specialist actions and pass knowledge faster.

## Economy

Per-org: `wealth: u32` (currency units). Per-lineage: `currency_unit: String` ("shells", "coins", "gold").
Markets enable price-based trades. Specialization tags: Farmer, Smith, Soldier, Scholar, Doctor, Merchant.

## Wire protocol additions

`organisms_hot` SoA gains:
- `age_stages: Vec<u8>` (enum tag)
- `wealths: Vec<u32>`
- `literacys: Vec<u8>` (literacy * 100)
- sparse `inventory: Vec<(idx, tool_kind, count)>` (changes only)
- sparse `degrees: Vec<(idx, degree_tags)>` (rare changes)

Cold per-org: `era: u8`, `specialty: Option<String>`.

Per-lineage `lineage_eras: Vec<(lineage_id, era)>`.

## Rendering

### 2D
- Sprites differ by AgeStage (4 variants per sex)
- Sprites differ by Era (era-appropriate clothing/tools shown)
- Total 4 stages × 2 sex × 10 eras = 80 sprite slots (start with subset, fall back to base)
- Buildings render at their footprint size, not single-tile

### 3D
- Mirror: 4 age + 2 sex models, era-appropriate accessory meshes (helmet, hat, glasses, lab coat) toggled by era

## File ownership (no two agents touch the same file)

Per agent, declared exclusive files (others must coordinate):
- simulation/sim/era.rs (era agent)
- simulation/sim/age_stage.rs (age agent)
- simulation/sim/tools.rs (tools agent)
- simulation/sim/buildings.rs (buildings agent)
- simulation/sim/education.rs (education agent)
- simulation/sim/economy.rs (economy agent)
- simulation/sim/culture.rs (culture agent)
- simulation/sim/warfare.rs (warfare agent)
- simulation/sim/medicine.rs (medicine agent)
- simulation/sim/language_tech.rs (language tech agent)
- simulation/sim/transportation.rs (transport agent)
- simulation/sim/agriculture.rs (agriculture agent)
- client/src/three/buildings3d/ (3d buildings agent)
- client/src/world/buildings2d.ts (2d buildings agent)
- client/public/sprites/people/ (sprite assets)
- client/public/models/people/ (3d model assets)

Shared files modified ONLY through small append-style edits:
- simulation/organism/organism.rs (add field, no remove)
- simulation/sim/simulation.rs (add field to State)
- simulation/sim/serialize.rs (add wire key)
- client/src/types/index.ts (add type field)
- client/src/simulation/wire.ts (add decode branch)

## No-comments rule

Zero comments in any code anywhere. This applies to all agents.
