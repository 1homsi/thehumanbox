# Living world: design note

Part of #1076. Related: #1077 (visible trade), #1078 (daily rhythm), #1079 (specialised towns), #1080 (the land remembers), #1081 (refugee routes), #1082 (leaders and dynasties), #1083 (visible culture), #1084 (every object has a reason), #1062 (performance at thousands of people).

This note covers three things. It explains why the world looks random today, with references to the code. It describes the model we want to move to. It lays out stages that each ship on their own. All paths are relative to `crates/sim-core/src/sim/` unless they start with `apps/`. Line numbers are from `main` at `1a5cdaaf6` (release 0.8.31).

## 0. Why the world looks random

Five structural causes explain almost everything in the owner's screenshot:

1. **A tribe, its settlement and its town are the same thing, and its centre moves.** A settlement is a lineage (`civ/society/settlements.rs:75`). There is no spatial clustering. Most placement anchors on `lineage_center`, which is the average position of the living members (`civ/civ_tick/mod.rs:293-311`). The anchor moves every time people wander, so whatever is placed against it later lands somewhere else.
2. **Most buildings are placed by id-derived jitter, not by a plan.** Homes and seven civic kinds get street frontage or plaza corners (`civ/civ_tick/town.rs:209-240`). Every other kind (workshops, stations, factories, lampposts, stalls, fences) gets `centre + ((next_building_id*3)%16-8, (next_building_id*5)%14-7)` (`civ/civ_tick/construction.rs:1336-1339`). The site search then takes the first free tile in square rings out to 12 (`construction.rs:448-477`). Props use a fixed table of 18 offsets, indexed by the building-id counter (`civ/civ_tick/props.rs:187-218`).
3. **The wishlist is a catalogue to complete, not a list of needs.** `next_target_building` returns the first kind the tribe does not own yet (`civ/civ_tick/targets.rs:276`). Every industrial tribe of about 60 people therefore builds one `TrainStation`, one `Substation`, one `PowerPlant`, and so on (`targets.rs:185-201`). Once it reaches about 70 people it adds one `StreetLight`, one `TelephonePole` and one `BusStop` (`targets.rs:202-214`). None of these is tied to a line, a street or a grid.
4. **Infrastructure has no owner and never goes away.** Rail lines are never removed (`tech/railways.rs:292` is the only write to `rail_lines`). Village roads are never removed (`civ/land/village_roads.rs:348`). Plaza paving stays after the town dies (`civ/civ_tick/town.rs:99-110`). Decorative props are skipped by every decay system (`civ/society/vacancy.rs:213`, `civ/land/building_damage/damage.rs:16`).
5. **There is nothing above the tribe.** Diplomacy, war, trade and government are all keyed by lineage strings. Alliances form from averaged personal opinions (`civ/civ_tick/politics.rs:44`). Wars start from averaged personal opinions (`civ/society/warfare/spawning.rs:95-105`) and change no land when they end (`warfare/battles.rs:242-261`). Trade partners are the nearest tribe in reach (`civ/society/trade_routes/merchants.rs:132-149`). Nothing groups tribes into a country.

Three more causes are specific to the screenshot:

- **"Stations without lines"** come from cause 3. Construction builds a `TrainStation` from the wishlist (`targets.rs:187`) at a jittered point, with no rail. Only `tech/railways.rs` lays track. Its `station_for` reuses an existing station only when that station is within 6 tiles of the trade-route centre (`railways.rs:376-383`), so the wishlist station usually stays unconnected and a second station is raised next to the line.
- **"Short pieces of rail going nowhere"** have three sources:
  - The station sprite draws a strip of track across its whole front (`apps/web/src/game/render/pixel-art/buildings/civic.ts:262-273`). Every unconnected station therefore shows a stub of rail as wide as its footprint.
  - Real lines get cut into pieces. `lay_town` writes `ROAD_TRACK` over the plaza and streets without checking what is already there (`civ/civ_tick/town.rs:176`, `:190`), so a town founded on a line breaks it. Construction does not look at the road layer at all (`construction.rs:150-203`), so buildings go up on top of track. Floods wash rail away (`world/grid.rs:338`) and nothing repairs it.
  - Line ends never move. A line's ends are fixed when it is laid, while the town's centre keeps drifting (cause 1), so old lines end in fields.
- **"Overhead lines crossing for no reason"** are not in the sim at all. The renderer puts a pole on every finished building of an industrial tribe and wires each pole to its two nearest neighbours within 7 tiles (`apps/web/src/game/render/cf/overlays/paint-power.ts:8-41`, `:47-60`). The wires follow building scatter, so they look as random as the buildings. The same code is O(poles²) per lineage per frame.

## 1. How it works today

### 1.1 Roads, bridges, canals and rail (the road layer)

All four live in one byte per cell, `WorldGrid::road` (`world/grid.rs:32-43`): `ROAD_NONE`, `ROAD_TRACK`, `ROAD_BRIDGE`, `ROAD_RAIL`, `ROAD_CANAL`. A cell holds one kind, and the last writer wins.

| Writer | What | Decision | Ref |
|---|---|---|---|
| Village roads | `ROAD_TRACK` or `ROAD_BRIDGE` from a village centre to its nearest goal | Every 300 ticks. A tier-3+ settlement whose tribe knows `road_building` links to the nearest of: its own wells (24 tiles), its fields (24), any village (40). At most 2 links per pass, 12 per tribe, 240 in the world. | `civ/land/village_roads.rs:20-33`, `:71-113`, `:307-364` |
| Town plaza | 3×3 paved plaza plus four 9-tile streets along the axes | Once, when a lineage reaches tier 2. Writes `ROAD_TRACK` unconditionally. | `civ/civ_tick/town.rs:103-137`, `:172-196` |
| Rail | `ROAD_RAIL` along a trade route | Every 400 ticks. For trade routes with 3+ deliveries and an industrial-age tribe at one end (`railways.rs:213-242`). The two ends must be 10-80 tiles apart (Chebyshev, `:251-253`), the path at most 110 tiles, and at least 40% of the path on roads or trodden trails (`:272-278`). At most 3 lines per tribe and 16 in the world. | `tech/railways.rs:26-47`, `:246-332` |
| Canals | `ROAD_CANAL` | Irrigation actions and fields | `civ/land/village_irrigation.rs:117`, `actions/construction/build_irrigation_canal.rs:31` |
| Player | any kind | Commands | `command/roads.rs:39` |
| Floods | clear to `ROAD_NONE` | Ground that is no longer open | `world/grid.rs:324-347` |

Pathfinding is shared. `plan_road_avoiding` (`civ/land/village_roads.rs:164-300`) is an A* with 8-neighbour moves, cost 1 on a "cheap" cell and 2 on open ground, bridges as straight spans of up to 6 water tiles, a box padded by 32 tiles, and a 20,000-cell budget. It has no slope cost and no terrain classes beyond "road ground or not".

Rail details that matter for the look:

- A `RailLine { id, lineage, towns, a, b, path }` (`railways.rs:72-80`) records the track. One train shuttles on it (`:300-316`) and carries grain from the fuller stores to the emptier ones (`:531-540`).
- Stations come from `station_for` (`:369-407`): an existing station of the owner within `STATION_RING = 6` of the route centre, or else the first free 3×3 site in rings around that centre. The station is complete at once (`:410-428`).
- The cheap cells for the rail search are the ones `is_busy_way` accepts: any road, or a trail of 0.3 or more (`:355-357`). Caravans leave trail marks along the straight line between the two route centres, not along roads (`civ/society/trade_routes/upkeep.rs:3-28`). Rail therefore follows those diagonal caravan trails.
- No code removes a `RailLine`. When a station is gone the train just stalls for 300 ticks at a time (`:503-506`).

Rendering: `apps/web/src/game/render/cf/roads/road-driver.ts` draws each road cell as a joined tile. Rail is drawn as a horizontal or vertical rail cell (`:157-160`). The client also plans its own roads for trade routes (`apps/web/src/game/render/trade-paths.ts:1-4`). It runs a second A* over the land and merges the result into the road layer, so the roads on screen are partly sim roads and partly client guesses.

### 1.2 Construction and town layout

- **Cadence:** `tick_buildings_construct` runs every 240 ticks on its own phase (`civ/civ_tick/mod.rs:83-85`). It first founds plazas (`town.rs:103`) and then loops over living lineages in name order (`construction.rs:1078-1086`).
- **Per lineage:** a project limit of `workers.div_ceil(6).clamp(1, 3)` (`:1107`). Priority order:
  1. research building
  2. market on the plaza
  3. the craft it lacks most
  4. fountain
  5. a home, or a workshop first
  6. a devout target
  7. the craft it lacks most, then the first unowned wishlist kind (`:1122-1344`)
- **Where:**
  - `placement_point` (`town.rs:277-289`) puts harbour kinds on the nearest shore.
  - Homes go to street frontage, slot `homes % (streets*2)` (`town.rs:217-219`). The slot wraps, so the 9th home on a short street aims at an occupied slot and the ring search pushes it to the first free tile nearby.
  - The seven `CIVIC_KINDS` take plaza corners (`town.rs:234-236`).
  - Every other kind uses the jitter in §0.
- **Site validity:** `construction_terrain_is_valid` (`construction.rs:150-203`) checks only bounds and tile kind. Roads, rail and fields are not checked. Plaza and street tiles are reserved (`construction.rs:422-433`), but village roads and rail are not.
- **One town per lineage:** `TownPlaza { lineage, center, streets }` (`town.rs:50-57`). A tribe that has spread into two clusters still has one plaza.
- **Caps:** 1,200 functional and 1,500 total buildings (`construction.rs:4-6`).

### 1.3 Props, furniture, homes

- **Props** (`civ/civ_tick/props.rs`) run every 150 ticks (`civ_tick/mod.rs:89-91`). They add up to 48 decorative `Building`s per lineage. The kind is `palette[next_building_id % len]` (`props.rs:187-188`), and the site is one of 18 fixed offsets around the lineage centre (`:192-218`). The only check is that the tile is open grass, sand or snow (`:12-34`). The Modern palette includes `Lamppost`, `StreetLight`, `TelephonePole`, `BillBoard`, `BusStop`, `FoodTruck` and `Fence` (`:100-121`). Props have no parent. Their only owner is the lineage, they are not operational (`tech/buildings/building.rs:187-189`), and they never decay. They are deleted only by overlap (`props.rs:38-60`) or when the world passes the 1,500 cap (`construction.rs:1441-1466`).
- **Functional small kinds** (StreetLight, Lamppost, TelephonePole, BillBoard, BusStop, Fence, MarketStall) also come from the wishlist and the same jitter (`targets.rs:76-84`, `:206-210`).
- **Home furniture** (`civ/civ_tick/homes.rs:3-88`, `civ/moments/furniture.rs:1-42`) runs every 1,200 ticks. It pushes item names into `Organism::home_furniture`. It belongs to the person and is not drawn on the map. Auras (`homes.rs:91-236`) apply effects from nearby operational buildings.
- **Client-side yards** (`apps/web/src/game/render/cf/buildings/yard-marks.ts:22-49`) give about two in three homes a garden plot, chosen by id hash, at `b.x + 1`. For a 2×2 house that tile lies under the house's own second column. The wire format does not send `decorative` (`storage/serialize/payload.rs:38-79`), so the client cannot tell scenery from function.

### 1.4 Land: fields, stores, carts, livestock, failure

- **Fields** (`civ/land/village_fields.rs`): sown every 600 ticks in spring. `field_site` picks the first grass tile with fertility ≥ 0.3 in rings 2-6 around each dwelling (`:98-126`). The occupied set uses building origins only (`:245-250`), so fields can be sown under the other tiles of larger buildings. Fields decay to fallow and then to wild after 3,000-9,000 idle ticks (`civ/land/fields.rs:140-235`).
- **Stores** (`civ/land/village_stores.rs`): one Granary, Barn, Watermill, Windmill and Pen per tribe. Each goes on the first tile that fits in rings 2-4 around the lowest-x dwelling (`:408-431`). `place_at` takes the id `max(id)+1` and does not advance `next_building_id` (`:340-346`). That is a possible id collision; I found it by reading and have not reproduced it.
- **Carts** (`civ/land/village_carts.rs`) run field to granary on planned roads. Each plan rebuilds `occupied_tiles` (`:86-99`). Carts are never removed when their granary disappears.
- **Livestock** (`civ/land/village_livestock.rs`): animals record `keeper` and `pen`, and go wild when the pen goes (`:96-108`). This is the only true parent link in the land systems and the pattern to copy.
- **Village failure** (`civ/land/village_failure.rs`) covers crop failure and famine (`:49-188`), not abandonment.

### 1.5 Society

| System | What it does | Key decision | Ref |
|---|---|---|---|
| Settlements | Census per lineage, every 1,200 ticks (offset 600) | One settlement per lineage. The centre is the anchor nearest the weighted mean of residents and buildings. | `civ/society/settlements.rs:74-151`, `simulation/tick.rs:188` |
| Trade routes | `TradeRoute`, `Caravan`. Caps: 64 routes, 128 caravans. | A merchant picks the nearest settlement within 60 tiles, or 120 under an agreement. Need is not considered. Caravans travel `manhattan*4` ticks, up to 35% faster on roads. On the map they move in a straight line. | `trade_routes/model.rs:3-52`, `merchants.rs:105-163`, `dispatch.rs:221-225`, `upkeep.rs:3-28` |
| Economy | Taxes, barter, currency | Barter and currency trade are O(N²) loops over all pairs of people within 3 tiles | `civ/society/economy_tick.rs:14-39`, `:519-535`, `:663-690` |
| Government | One `Government` per lineage | Type is a formula over era, population and literacy. "Empire" and "Federation" are labels on one tribe. | `civ/society/government.rs:149-200` |
| Politics | Leaders, laws, diplomacy | Alliance when both sides' average opinion is above 0.35. O(L²) pairs, every 800 ticks. No distance or trade check. | `civ/civ_tick/politics.rs:3-70`, `:271-398` |
| Warfare | `Battle`, `Treaty` | A raid targets the most-hated tribe at ≤ −0.45 with no treaty, at 35% odds. A border war needs ≤ −0.20 and 6 shared border tiles, at 55% odds. Sides are always one lineage, and no casus belli is stored. | `civ/society/warfare/spawning.rs:49-177`, `:179-341` |
| War outcome | Treaty only | Vassalage (35% when the winner keeps more than 75% of its fighters) or NonAggression/Trade. No land, tribute or people change hands. Vassalage has no mechanics, and `Defensive` treaties are never created. | `warfare/battles.rs:242-284`, `warfare/types.rs:117-123` |
| War weariness | Per-lineage tiredness | +0.08 per death. Two weary tribes sign NonAggression. This is the only memory of war, and it is not aimed at the enemy. | `civ/society/war_weariness.rs:17-142` |
| Opinion | Per person: `lineage_attitudes`, at most 24 entries | Standing on foreign land −0.002 per tick; hostile encounter −0.2/−0.3; caravan delivered +0.025. Battles add no grudge. | `organism/organism/mod.rs:79`, `simulation/organism_tick/setup.rs:91-128`, `agents/social/encounters.rs:63-64`, `trade_routes/delivery.rs:177-179` |
| Refugees | Remnant tribe of ≤3 that cannot reproduce | Joins the nearest tribe of 6+ within 60 tiles that it does not hate. This is the only merge in the code, and it rewrites only the people. | `civ/society/refugees.rs:14-91` |
| Vacancy | Abandonment, once a day | Empty homes and dead tribes' buildings wear down and crumble after 20 days. Landmarks never do. A tribe can take over a vanished tribe's building within 30 tiles. | `civ/society/vacancy.rs:18-326` |
| Culture | Religion, art, festivals | Faith is the only membership that crosses tribes. Festivals are per tribe. | `civ/civ_tick/religion.rs:79-243`, `civ/society/festivals.rs:15-66` |
| Gatherings | Evening place per lineage | Tavern, inn, café, worship or campfire | `civ/society/gatherings.rs:46-75` |

### 1.6 People and routines

`agents/working_day.rs` and `agents/daily_work.rs` are already on `main`. A tradesperson walks to the nearest workplace of their trade within 24 tiles of home in the morning (`working_day.rs:19-29`) and comes home at midday. People without a workplace fish, fell trees, quarry or hunt. Evening gatherings and school hours exist (`simulation/tick.rs:27-28`). These routines only set wander targets on top of the full per-person decision (`simulation/organism_tick/decide.rs`), so every person still perceives, scores about 800 offers and learns every tick (#1062). The `people-daily-routes` branch is one WIP commit (`96de64687`), 709 commits behind `main`. Most of it has since landed as `working_day.rs`.

### 1.7 Social agents and world events

`agents/social/*` holds actions people take with each other: challenging strangers, grooming, sharing food, food and danger signals, teaching. Only `challenge_stranger` acts across tribes, and it lowers opinions. `world_events/*` changes tiles and damages buildings: drought, outbreaks, weather, heat, lava, ice, fallout, and food regrowth in `evolution.rs`. It places no structures. Building damage (`civ/land/building_damage/*`) gives each kind a service life (20 years for stalls and fences, up to 600 for monuments) and handles repair and reclaiming. Decorative buildings, wells, fountains, bridges, roads, plaza paving and rail never decay.

## 2. Target model

Principles:

- **Every object has a parent.** That parent is a town lot, a network edge, a field, or another building. When the parent goes, the object decays.
- **Towns are places, not averages.** A town has a fixed centre and a plan.
- **Nations are the actors.** Lineages keep families, culture and identity. Nations decide war, trade and the networks.
- **Reuse the existing systems.** Each part below says which code it extends instead of duplicating.

The cost figures are for 5,000 people, 50 towns, about 8 nations, 60 lineages and about 1,200 buildings. They are estimates from the loop shapes, not measurements. Each stage measures its real cost on the stress saves.

### 2.1 Towns (the unit everything hangs on)

Towns come first because nations, networks, layout, trade and level of detail all hang on them.

```rust
pub struct Town {
    pub id: u32,
    pub lineage: String,
    pub nation: Option<u32>,
    pub centre: [i32; 2],
    pub founded_tick: u64,
    pub tier: u8,
    pub role: TownRole,
    pub plan: TownPlan,
    pub abandoned_tick: Option<u64>,
}
```

- **Formation:** every settlement pass (1,200 ticks), cluster each lineage's operational dwellings with union-find on a 12-tile bucket grid. A cluster of tier 2 or more that has no town gets one. Its centre is the plaza site found by the existing `find_plaza_site` (`town.rs:141`). **The centre never moves after founding.** This removes the drift behind §0 cause 1.
- **Reuse:** `TownPlaza` becomes `Town.plan`, keeping `center` and `streets`. `lineage_center` stays for people logic only. Construction uses `town.centre` and the lot plan.
- **Cost:** the cluster pass is O(buildings) = 1,200 every 1,200 ticks, about 1 µs per tick amortised.
- **Determinism:** clusters are numbered by the smallest dwelling (x, y), and town ids come from a counter.

### 2.2 Town layout model (#1076 "towns that look like towns", #1084)

```rust
pub struct TownPlan {
    pub streets: Vec<Street>,
    pub lots: Vec<Lot>,
    pub ring: u8,
}
pub struct Street { pub from: [i32; 2], pub to: [i32; 2], pub ring: u8 }
pub struct Lot { pub x: i32, pub y: i32, pub w: u8, pub h: u8, pub zone: Zone, pub building: Option<u32> }
pub enum Zone { Civic, Market, Housing, Craft, Industry, Farm, Rail }
```

- **Rings and zones:**

  | Ring | Distance from centre | Zone |
  |---|---|---|
  | 0 | plaza and corners | Civic, Market |
  | 1 | to 8 tiles | Housing along the four arms, with workshops at junctions |
  | 2 | 8-14 tiles | more Housing, plus Craft at the outer ends of streets |
  | 3 | edge | Industry (factory, power plant, refinery, station yard) on the side facing the network edge; Farm beyond |

- **Growth:** when ring *n* has no free Housing lot, add cross streets every 6 tiles along the arms. Each is a straight `ROAD_TRACK` run that stops at water, rock or another town's lots. Lots are cut on both sides of the new streets. Streets are laid by the network planner's cell writer, which never overwrites rail (§2.3).
- **Placement:** `placement_point` becomes `town.next_lot(kind)`. It maps the kind to a zone through `BuildingKind::function()` (`tech/buildings/profile.rs`), takes the first free lot of that zone nearest the centre, and reserves it. The id jitter at `construction.rs:1336-1339` and the 18-offset table in `props.rs` go away.
- **Street furniture:** lampposts, benches and stalls become **lot decorations**. They are placed at fixed spacing along streets and at plaza edges, with `parent = Parent::Street` or `Parent::Lot`.
- **The wishlist becomes needs:** `next_target_building` only offers a kind when a reason holds. A station needs a planned rail edge ending at this town. A substation needs a power edge. A bus stop needs a paved street of 6+ tiles. A fence needs a field or pen next to it.
- **Cost:** `next_lot` is O(lots in town), about 100. It runs only on construction passes (240 ticks), so it is negligible. The site search shrinks from up to 625 candidate tiles to one lot check.
- **Determinism:** lots are ordered by (ring, distance to centre, y, x). No RNG is needed.
- **Reuse:** `find_construction_site` remains the validator for a lot. `SiteSearch` stays for player-placed buildings.

### 2.3 Network planner: roads, rail, power (#1076 "planned infrastructure")

```rust
pub struct NetEdge {
    pub id: u32,
    pub kind: NetKind,
    pub a: NetNode,
    pub b: NetNode,
    pub owner: Owner,
    pub path: Vec<[i32; 2]>,
    pub built: u16,
    pub traffic: u32,
    pub last_used: u64,
    pub retired_tick: Option<u64>,
}
pub enum NetKind { Road, Rail, Power }
pub enum NetNode { Town(u32), Resource { x: i32, y: i32, kind: u8 }, Junction(u32) }
pub enum Owner { Lineage(String), Nation(u32) }
pub struct Network { pub edges: Vec<NetEdge>, pub cell_owner: BTreeMap<u32, u32>, pub next_id: u32 }
```

- **Destinations:**
  - **Roads:** town ↔ town within an owner, as a minimum spanning tree over towns plus a shortcut wherever the tree path is more than 1.5× the straight-line distance. Also town ↔ its resources (mine, quarry, harbour, forest camp, well), and town ↔ trade partner once a trade route has deliveries.
  - **Rail:** only as an **upgrade of an existing road edge** whose `traffic` passes a threshold, between two towns of tier 3 or more, once the owner reaches the industrial era. Stations are created only by the planner, at both ends of a rail edge (in the town's Rail zone) and at towns the path passes within 4 tiles of (stops).
  - **Power:** from a town with a `PowerPlant` along its existing road edges to towns of the same owner. Substations sit at the ends. Poles are derived from the path every 4 cells, not placed as buildings.
- **Pathfinding cost:** extend `plan_road_avoiding` with a cost closure instead of the cheap/blocked pair.

  | Cell | Road | Rail |
  |---|---|---|
  | existing road | 1 | 2 |
  | open grass or sand | 3 | 4 |
  | snow or ash | 5 | 6 |
  | elevation step | +8 × Δ | +20 × Δ |
  | water (bridge span ≤ 6) | 6 per cell | 10 per cell |
  | lot, plaza | blocked, except the end cells | blocked |
  | field | 6 | 8 |
  | rail (road crossing) | 4 | — |

  The heuristic stays Chebyshev × minimum cost. The budget stays 20,000 cells.
- **Build over time:** an edge is created with `built = 0`. Each road pass (300 ticks) advances `built` by up to 8 cells per owner, paid in stone and labour from the lineage pool (`construction.rs:62` `reserve_construction_cost`). Only built cells are written to `grid.road`. A Chronicles line marks the start and the finish ("the northern rail line reached Holivih").
- **Cell writer:** one function `write_edge_cell` replaces the five direct `grid.road[..] =` writes:
  - Track never overwrites rail.
  - Rail overwrites track only on its own edge.
  - Plaza paving skips rail cells and turns them into a level crossing.
  - It records `cell_owner[idx] = edge id`.
  - Construction then refuses lots that cover an owned rail cell.
- **Stray pieces:** a road-layer cell of kind rail with no `cell_owner` is a stray.
  - **Stray rail** reverts to `ROAD_TRACK` after 1 day and then joins road decay (§2.8).
  - **Stray stations** (no rail edge ends within 4 tiles) stop being operational and take vacancy wear (`civ/society/vacancy.rs:204-239`), becoming ruins in about 20 days.
  - **Retired edges:** an edge whose end town is abandoned, or whose `last_used` is older than 2 years, gets `retired_tick`. Its cells decay.
  - **Upgrade on load:** existing `RailLine`s become rail edges with full `built`, and their `path` cells get owners. Existing village roads become road edges where both ends match a town. Everything else is stray.
- **Reuse:**
  - `RailLine` and `run_trains` stay as the train runner. `RailLine.id` becomes the edge id.
  - `village_roads::tick_village_roads` becomes the road planner's pass.
  - Caravans and carts follow `edge.path` instead of straight lines.
  - The client's `trade-paths.ts` planner is removed, and the client draws sim edges, including their build progress.
  - `paint-power.ts` draws wires along power edge paths.
- **Cost:** at most 2 path searches per 300 ticks. Each is 20,000 cells × about 60 ns ≈ 1.2 ms worst case, so about 8 µs per tick amortised. Advancing builds is O(edges) ≈ 200 per 300 ticks. `traffic` is incremented by caravans and trains at their departure only, O(1). Spanning-tree recompute is per owner, O(T² log T) with T ≤ 50, only when a town is founded or abandoned.
- **Determinism:** edges are planned in (owner, town id) order. A* ties break on (f, g, y, x), as today through the `BinaryHeap` tuple. No RNG.

### 2.4 Nations above tribes (#1076 "tribes grow into countries")

```rust
pub struct Nation {
    pub id: u32,
    pub name: String,
    pub capital: u32,
    pub members: Vec<String>,
    pub colour: u8,
    pub founded_tick: u64,
    pub ruler_lineage: String,
    pub cohesion: f32,
}
```

The `Simulation` gains `nations: Vec<Nation>`, `lineage_nation: BTreeMap<String, u32>` and `next_nation_id: u32`.

- **Formation** (checked every 1,200 ticks, nation by nation):
  - **Union:** two lineages, or a lineage and a nation, that have held an `Alliance` or `Trade` treaty for 4+ years, share a road edge, and have relation ≥ 0.5 (§2.6) unite. The larger one's capital becomes the capital.
  - **Absorption:** a `Vassalage` treaty that runs to expiry without the vassal rebelling absorbs the vassal. Conquest outcomes (§2.6) can also absorb directly.
  - **Founding:** a lineage of tier 4 or more with 2+ towns becomes a one-lineage nation, so every large tribe reads as a country.
- **Capital:** the member town with the highest tier, ties broken by the oldest. It moves only if the capital is abandoned or taken.
- **Borders:** the union of member `territory` sets, which already exist (`simulation/mod.rs:247`). The client draws one outline per nation in the nation colour. Today it draws one per lineage.
- **Split rules:**
  - `cohesion` falls with distance of member towns from the capital (beyond 120 tiles), with unrest (`civ/society/unrest.rs`), with war weariness, and with a succession that passes to a lineage other than the ruler's.
  - Below 0.2, the member lineage furthest from the capital and with the lowest relation secedes and forms its own nation. That is a civil war if relation < 0, otherwise a peaceful split.
- **Who decides:** the ruler lineage's `Government` (`civ/society/government.rs`). Its leader's traits bias choices in #1082.
- **Same side:** one helper, `same_side(a, b)` (same lineage, or same nation), replaces string equality at the cross-tribe decision sites: raids, border wars, trade foreignness, refugees, vacancy takeover. Per-lineage maps stay as they are.
- **Cost:** formation and split checks are O(nations × members + treaties) per 1,200 ticks, which is negligible. `same_side` is two map lookups.
- **Determinism:** process candidate pairs in sorted id order. Name generation uses the existing name generator, seeded from (world seed, nation id).
- **Reuse:** `Treaty`, `Government`, `territory`, `governments`, war weariness and religion all stay per lineage. A nation is a grouping with a ruler, not a parallel state.

### 2.5 Specialisation by land (#1079)

```rust
pub enum TownRole { Farming, Fishing, Mining, Timber, Trade, Capital, Industry, Mixed }
pub struct TownLand { pub fertile: u16, pub coast: u16, pub rock: u16, pub mineral: u16, pub forest: u16, pub junction: u8 }
```

- **`TownLand`** counts tiles within 14 of the centre. It is computed on founding and refreshed yearly or when a terrain event touches the area.
- **Role:** the highest of these weighted scores, with Capital overriding. Trade is chosen when the town is a junction of 3 or more edges.
- **Role effects:**
  - It biases the town's lot zones: more Farm lots, a Harbour lot, a Quarry lot.
  - It biases the craft list (`targets.rs` `CRAFT_CIVIC`).
  - It biases `daily_work.rs` job choice (it already prefers what the land offers).
  - It sets the production weights the trade model reads (§2.6).
- **Role change:** quarry or mine depletion, a new edge, or silting re-scores the town. Each role change is a Chronicles line.
- **Cost:** a ring scan of about 800 tiles × 50 towns per year, which is negligible.
- **Reuse:** `trade_routes/specialty.rs` and `tribe_crafts.rs` already hold per-tribe specialties. They read the town role instead of re-deriving it.

### 2.6 Trade flows on the network, and diplomacy with memory (#1077, #1082)

**Trade.** Each town keeps a ledger, derived and not stored separately:

```rust
pub struct TownBalance { pub food: i32, pub wood: i32, pub stone: i32, pub tools: i32, pub goods: i32 }
```

- **Balance:** stock minus the need for the next season. It is computed daily from `village_stores` and lineage stock.
- **Matching:** once a day, a greedy match within each nation and then across friendly nations. The largest surplus goes to the largest shortage, at a cost equal to the network distance (all-pairs over ≤ 50 towns with Floyd-Warshall, recomputed only when edges change: 125,000 operations).
- **Shipments:** a match becomes a caravan, cart, boat or train on `edge.path`. Merchants (`merchants.rs`) pick partners from the match list instead of the nearest settlement. Each shipment adds `traffic` to its edges, which drives the road → paved → rail upgrades.
- **Famine relief:** an ally's town in famine (`civ/land/village_failure.rs:151-188`) gets top priority and a "relief" cargo flag that the client draws.
- **Cost:** O(T²) = 2,500 per day plus the shipments. About 5 µs per tick amortised.

**Diplomacy with memory.**

```rust
pub struct Relation { pub opinion: f32, pub memory: Vec<Memory> }
pub struct Memory { pub kind: MemoryKind, pub tick: u64, pub weight: f32 }
pub enum MemoryKind { Trade, Relief, Raid, WarLost, WarWon, LandTaken, CaravanRaided, Marriage, SharedFaith, Betrayal }
```

The `Simulation` gains `relations: BTreeMap<(u32, u32), Relation>`, keyed by actor id (nation id, or a lineage stand-in for tribes without a nation). Pairs are ordered.

- **Opinion:** the sum of memory weights decayed by age (a half-life per kind, e.g. raids 4 years, land taken 20 years), plus 20% of the members' average personal `lineage_attitudes`. Personal opinions stay as input and stop being the only source.
- **Memory:** at most 16 entries per pair, merged by kind.
- **Decisions read `Relation`:** alliances (replacing `politics.rs:44`), raids and border wars (`warfare/spawning.rs:95-105`, `:253-256`).
- **War has a reason:** a war carries a `CasusBelli { Land(region), Water, Revenge(memory), Tribute, Succession }`. The planner picks the casus with the biggest score: shortage of a resource the enemy's border land has, a grievance memory, a claim through marriage (#1082).
- **Outcomes:**
  - Land: transfer the contested border tiles in `territory` and any town in them.
  - Tribute: a recurring shipment through §2.6 trade.
  - Absorption: §2.4.
- **Allies join:** a `Defensive` treaty (finally created) adds the ally to `Battle.defenders`, which is already a `Vec`.
- **Cost:** pairs ≤ 60² / 2 = 1,800 but sparse. Only pairs with a memory or a shared border are stored, so a typical world has about 200. They are updated on events and recomputed daily: O(200 × 16).
- **Determinism:** `BTreeMap` order. Rolls use the existing seeded RNG in sorted pair order, as `spawning.rs` does now.

### 2.7 Daily routines (#1078)

```rust
pub struct Routine { pub slots: [Slot; 6], pub planned_tick: u64 }
pub struct Slot { pub from: u16, pub to: u16, pub place: Place, pub activity: Activity }
pub enum Place { Home, Work(u32), Field(u32), Shore { x: i32, y: i32 }, Gathering(u32), School(u32), Market(u32) }
```

- **Planning:** a routine is planned when someone gets a home, a job, a season change or a town role change. It comes from the existing choices in `working_day.rs`, `daily_work.rs`, `gatherings.rs` and the school places, so it has the same targets as today, just planned once per day instead of looked up every minute.
- **Following it:** a person on a routine walks a cached path to the slot's place and runs the slot's activity action, with no offer scoring.
- **Wake-ups** that re-run the full `decide` phase: need thresholds (hunger, thirst, energy, health), a danger signal or battle within range, a nearby event (fire, festival, birth, death of kin), an interaction initiated by someone else, the end of the routine, or a random "free time" slot of about 10% of the day kept for the learned policy, so learning still has data.
- **Seasons:** planting, harvest and winter change which slots exist. Festivals (`festivals.rs`) override the evening slot.
- **Cost:** a person on a routine costs about one path step plus a slot check per tick. See §3.
- **Determinism:** the routine is a pure function of state at planning time. Wake-ups are checked in organism order.

### 2.8 Decay and ruins (#1080, #1084)

```rust
pub enum Parent { Lot { town: u32, lot: u16 }, Edge(u32), Field(u32), Building(u32), Town(u32), None }
```

Every `Building` gains `parent: Parent`, defaulting to `None`.

- **Orphans:** each day, a building whose parent is gone loses condition at 3× normal wear. Today that wear is skipped for decorative buildings; the skip is removed (`vacancy.rs:213`, `damage.rs:16`).
- **Ruin stages:**

  | Stage | Shown as |
  |---|---|
  | 0 | standing |
  | 1 | empty (no smoke or lights) |
  | 2 | ruined (`ruined_at_tick`) |
  | 3 | foundations: a new `Building::stage` value that keeps the footprint; it does not block placement but is drawn |
  | 4 | gone |

  The steps use the existing `CRUMBLE_TICKS` (`vacancy.rs:18`), split in thirds. Landmarks stop at stage 3 instead of never decaying, and keep a name for Chronicles.
- **Roads:** add `grid.road_age: Vec<u8>`. It is saved sparse, only for cells with a road. Each road pass increments it for cells not on a live edge and resets it for cells on one. Track at age 8 or more is drawn faint, and at 32 it becomes `ROAD_NONE`. Rail goes rail → track (stray) → faint → none.
- **Plaza paving** of an abandoned town follows the same road decay.
- **Re-settling:** a ruin within a new town's lot plan can be reclaimed by the existing repair path (`civ/land/building_damage/repair.rs:29-33`).
- **Forests and fields:** fields already go wild (`civ/land/fields.rs`). Add tree regrowth on tiles where `tick_deforestation` (`civ_tick/mod.rs:129-131`) cleared forest, once no living town is within 20 tiles.
- **Cost:** O(buildings) per day plus O(road cells) per 300 ticks. The road cells are already indexed by the frame's static layer.

## 3. Performance architecture

The owner's goal in #1062 is 20× now and a 200× stretch at about 5,000 people (about 0.25 ms per tick, about 50 ns per person). Today a person costs about 20 µs per tick: perception about 15%, offer scoring about 8%, offer planning about 6%, learning about 5%, and the rest in phases and world systems. Exact per-person work (shared perception maps, shared offer sets, struct-of-arrays, the phase-split parallel tick) is the sim agent's track and can plausibly reach 10-30×. Going further means most people must not run the full per-person sim on most ticks. Towns, households and routines give us that, as level-of-detail (LOD) units.

### 3.1 Three tiers

| Tier | Who | Per tick | What runs |
|---|---|---|---|
| **Full** | People in an *active zone* | full phases | today's `tick_organism`, faster with the exact work |
| **Routine** | People of a town in the *calm* state, outside active zones | slot check plus one path step; full decide only on wake-ups | §2.7 |
| **Aggregate** | People of a town far from any activity for more than 1 day | nothing per person; one town step per 60 ticks | household and town ledger |

**Active zone.** This must be **derived from the sim, never from the camera**, or saves would differ by who watched them and the native/wasm match would break. An active zone is a 32×32 cell around any of:

- a battle, fire, disaster or festival;
- a person with an open journey across towns (refugee column, caravan crew, train rider);
- a newly founded town (first 2 days);
- a person the player selected or follows. Selection is already a command in the command log, so it replays the same everywhere.

The camera may only choose what the client draws in detail.

**Aggregate step** (per town, every 60 ticks):

- **Needs:** each household's energy, thirst and warmth move toward an equilibrium set by food in the town's stores, shelter and season. Food is drawn from `village_stores` exactly as eating would.
- **Production:** each worker yields their routine's activity output, as the average yield of the activity's action, into the stores.
- **Births and deaths:** rates from the same age and health curves `pairing` and `mortality` use, rolled per household on a stream seeded by `hash(world seed, town id, day)`. They do not draw from the main RNG.
- **Ageing, skills, literacy:** advanced per day in bulk.
- **Learning:** Q-tables are frozen. Nothing is learned without decisions.

**Re-materialising.** People are never deleted. They stay in `organisms` with all their state. When a town goes from Aggregate to Routine or Full, each person is placed at the position their routine slot implies for the current time, on the cached path. That placement is a pure function of (routine, tick), so it is deterministic. Births made in aggregate are real organisms, created when they happen, with the same constructor as today.

### 3.2 Cost model at 5,000 people, 50 towns

Assumed mix in a calm late-game world: 5-10% Full, 25% Routine, 65-70% Aggregate. In a big war more of the map is active, and cost then rises toward the Full cost of the people involved.

| Item | Count | Cost each | Per tick |
|---|---|---|---|
| Full people (after the exact 10× from perception, offers and layout) | 300 | 2 µs | 0.60 ms |
| Routine people (slot check + step, 5% wake to a full decide) | 1,250 | 0.08 µs + 5% × 2 µs | 0.23 ms |
| Aggregate people | 3,450 | 0 | 0 |
| Town aggregate step | 50 / 60 ticks | 20 µs | 0.017 ms |
| Shared perception maps (8×8 cells, dirty regions only) | 5,000 cells | 10 ns | 0.05 ms |
| Civ systems after §2 (networks, trade, relations, settlements; all on cadences) | | | 0.05 ms |
| World systems on dirty regions (land, weather, fields, smog) | | | 0.10 ms |
| **Total, one thread** | | | **≈ 1.0 ms** |
| With the phase-split parallel tick on 4 cores (Full and Routine decide in parallel) | | | **≈ 0.4 ms** |

Today's cost is about 100 ms per tick at 5,000 people, so this is about 100× on one thread and about 250× threaded. **200× is reachable only with LOD.** The exact work alone tops out around 10-30×. The biggest lever is the share of people in Aggregate. If the Full count is held at about 300 people the cost is bounded whatever the population, so a 20,000-person world costs only a little more in the town step.

### 3.3 Exact vs. outcome-changing

| Work | Changes outcomes? | Ships how |
|---|---|---|
| Shared perception maps, summed-area tables | No: same reads, computed once | Byte-identical: fingerprint, native/wasm match, sim-compare, stress-save 500-tick compare |
| Shared offer sets per situation | No | Byte-identical |
| Struct-of-arrays, integer ids, no per-tick allocations | No | Byte-identical |
| Phase-split parallel tick (decide over a snapshot, apply in order) | No, if the apply order is the organism order and no decide draws from the shared RNG | Byte-identical; needs per-person RNG streams first, which is itself a behaviour change shipped once |
| Network planner, town plans, nations (§2) | Yes | Behaviour stages (§4) with sim-compare summaries and screenshots |
| Routines as schedules (§2.7) | Yes: fewer decisions, less learning | Behaviour stage, owner OK |
| Aggregate tier (§3.1) | Yes: statistical needs, births and deaths | Behaviour stage, owner OK; a debug flag forces everyone Full so the two can be compared |
| Batched learning | Yes, unless exact batching works | Separately, owner OK |

### 3.4 Fit with the sim agent's track

- **Shared perception maps** are the world's feature grid (food, water, danger, people, buildings per 8×8 cell). The town aggregate step reads the same maps for its yields, and the network planner reads its density layer for cost, so there is one structure and not three.
- **Phase-split tick:** the decide phase runs over the Full people and the woken Routine people only, through `par::map_with` (`sim/par.rs`), which already guarantees index-order results. Routine stepping and the town step are apply-phase work in organism and town id order.
- **Offer sets per situation** map naturally onto (town role, zone, activity). Routine slots already name the situation.
- **Order of work:** the exact track goes first and needs nothing from this note. Towns (stage 4 below) are needed before Routine and Aggregate. Routines (stage 9) come before Aggregate (stage 10).

## 4. Migration and staging

Every stage ships as its own PR. Behaviour stages use the same evidence:

- **Sim-compare:** `make sim-compare BASE=<main headless>` on the standard seeds.
- **Screenshots:** before and after on three fixed seeds at three times. Suggested: seeds 1, 42 and 1337 at ticks 20,000, 60,000 and 120,000, plus the owner's stress save at load and after 5,000 ticks.
- **Old saves:** a fixture from the release before the stage loads, runs 500 ticks, and round-trips.

New saved fields always use `#[serde(default)]`. Derived structures are rebuilt in `from_save.rs`, next to `repair_loaded_state` (`trade_routes/upkeep.rs:155`).

### Stage 1: stop placing unconnected stations and breaking lines (cheapest visible win)

- **Change:**
  - Remove `TrainStation` and `Substation` from the wishlist (`civ/civ_tick/targets.rs:187`, `:196`). Stations come only from `tech/railways.rs`.
  - `lay_town` skips `ROAD_RAIL` cells (`civ/civ_tick/town.rs:176`, `:190`).
  - Automatic construction rejects sites whose footprint covers a `ROAD_RAIL` cell (`construction.rs` `SiteSearch::accepts`).
  - Fix `village_stores::place_at` to use `next_building_id` (`civ/land/village_stores.rs:340-346`).
- **On screen:** no new stations beside huts, and lines are no longer cut by plazas or buildings.
- **Risk:** low. Industrial tribes have fewer buildings, which may shift their score-driven tiers a little.
- **Saves:** no new fields. Existing stray stations stay until stage 2.
- **Checks:** sim-compare (expect fewer buildings in industrial seeds). Screenshots of one industrial town per seed.

### Stage 2: rail owns its cells; strays decay

- **Change:**
  - Add the cell-ownership index (derived from `rail_lines[*].path` on load and on each line).
  - Rail cells with no owning line revert to `ROAD_TRACK` after one day.
  - A station with no live line within 4 tiles is non-operational and takes vacancy wear.
  - `RailLine` gains `retired_tick: Option<u64>`. Lines whose town lineage is gone, or whose station is ruined, retire, and their cells decay.
  - Trade-route centres used for new lines become the town plaza centre when one exists (`town.rs`).
  - The station sprite keeps its track strip, but the client draws it only if a rail cell touches the footprint (`civic.ts:262-273`).
- **On screen:** old stubs fade and orphan stations fall to ruins over about 20 days.
- **Risk:** low to medium. The train cargo balance changes when lines retire.
- **Saves:** `retired_tick` defaults to `None`. The ownership index is derived and not saved.
- **Checks:** sim-compare. A unit test: no `ROAD_RAIL` cell outside a live line after 2 days. Screenshots of the stress save at load and after 2 game days.

### Stage 3: power lines follow the network (client only)

- **Change:** `paint-power.ts` wires a tribe's power-consuming buildings only to their nearest road or rail path, with poles every 4 cells along that path, and only when the tribe has an operational `PowerPlant`. Remove the O(poles²) nearest-neighbour step.
- **On screen:** wires run along streets and lines instead of crossing over roofs.
- **Risk:** low. No sim change, so worlds are byte-identical.
- **Saves:** n/a.
- **Checks:** renderer unit test for `powerNetwork`, screenshots, frame time at full zoom-out on the stress save.

### Stage 4: towns with fixed centres

- **Change:**
  - Introduce `Town` (§2.1), with `TownPlaza` folded in.
  - Cluster dwellings into towns, so a lineage can have several.
  - Construction anchors on the town centre instead of `lineage_center`.
  - Send towns on the wire. Settlement labels sit on town centres.
- **On screen:** buildings stop creeping with the population. Large tribes show two or three named towns.
- **Risk:** medium. Every placement moves. Settlement tiers stay per lineage for now.
- **Saves:** `towns: Vec<Town>` defaults to empty. On load, each `TownPlaza` becomes a town and the rest are clustered from dwellings.
- **Checks:** sim-compare. Test: a town's centre is unchanged after 10,000 ticks of wandering. Screenshots.

### Stage 5: lots and zones

- **Change:**
  - `TownPlan` lots and rings (§2.2). `placement_point` uses lots. The construction jitter is removed (`construction.rs:1336-1339`).
  - The wishlist gets reason gates (stations, substations, bus stops, fences).
  - `Building.parent` is introduced and set for every lot building.
- **On screen:** streets grow cross streets. Housing rings form, and industry and farms sit at the edge.
- **Risk:** medium to high. This is the biggest look change. Watch for towns boxed in by water. Fall back to `SiteSearch` from the lot anchor.
- **Saves:** `parent` defaults to `None`. Plans are built on load from the existing streets, and existing buildings are matched to the lot under them.
- **Checks:** sim-compare (building counts per kind and per era). Screenshots at three zooms.

### Stage 6: props with reasons (#1084)

- **Change:**
  - Props are placed as lot and street decorations with parents. The id-indexed palette and the offset table go (`props.rs:187-218`).
  - Decorative buildings take orphan wear.
  - Send `decorative` and `parent` on the wire.
  - Add a "stats for nerds" overlay coloured by parent kind (stray objects in red).
  - Add a test: a seeded world has no parentless infrastructure after N ticks.
  - Fix the yard tile for 2×2 homes (`yard-marks.ts:49`) and skip yards on decorative or ruined buildings.
- **On screen:** lamps line streets, stalls sit on the plaza, and old scattered props fade.
- **Risk:** low to medium.
- **Saves:** existing props get `parent = None` and fade over about 20 days.
- **Checks:** the overlay screenshot is the evidence, plus sim-compare.

### Stage 7: road network planner

- **Change:**
  - `NetEdge` road edges (§2.3) between towns, resources and trade partners, built over time through one cell writer.
  - Caravans and carts follow edge paths. Caravan trail marks follow the path.
  - Add `road_age` for decay.
  - The client draws sim edges and drops its own `trade-paths.ts` planner.
- **On screen:** roads connect towns, show the build in progress, and old roads fade.
- **Risk:** medium. Caravan travel times change, so trade volume changes.
- **Saves:** `network` defaults to empty. On load, village roads become edges and `road_age` starts at 0.
- **Checks:** sim-compare (trade volume, road cells). Screenshots. Planner cost per pass in the perf gate.

### Stage 8: rail and power as network upgrades

- **Change:**
  - Rail is planned only as the upgrade of a busy road edge between tier-3+ towns. Stations go at the ends and stops, in the Rail zone.
  - `RailLine` becomes a view of the rail edge.
  - Power edges and substations follow road edges from power plants. The client stage 3 code reads them.
- **On screen:** "the northern rail line reached Holivih". Lines run town to town with stops.
- **Risk:** medium.
- **Saves:** on load, existing `RailLine`s become rail edges.
- **Checks:** sim-compare. Test: every station is at a rail-edge end or stop. Screenshots.

### Stage 9: routines as schedules (#1078, performance)

- **Change:** `Routine` per person (§2.7), planned from `working_day.rs`, `daily_work.rs` and `gatherings.rs`. Full `decide` runs only on wake-ups.
- **On screen:** a readable day: people go out at dawn, eat at midday, gather in the evening, and village lights come on at night.
- **Risk:** high for balance. Learning gets less data. Keep a free-time slot.
- **Saves:** routines are derived and planned on load. They are not saved.
- **Checks:** sim-compare (deaths, births, food). Stress-save per-tick cost before and after. Owner OK before merge.

### Stage 10: aggregate tier (performance)

- **Change:** active zones, and the town aggregate step for calm towns (§3.1). Add a debug flag to force everyone Full.
- **On screen:** none intended. Distant towns may show fewer people walking when zoomed out, since they stand at their routine places.
- **Risk:** high. Statistical births and deaths change outcomes.
- **Saves:** a town's LOD state is derived and re-materialises on load.
- **Checks:**
  - Sim-compare against the forced-Full run: population, food and deaths within an agreed tolerance over 50,000 ticks on 5 seeds.
  - Perf gate 3k and 5k cases.
  - Owner OK.

### Stage 11: relations with memory, and war with reasons (#1082 groundwork)

- **Change:**
  - `relations` (§2.6). Alliances, raids and border wars read relations.
  - Battles and raids write memories.
  - Casus belli and outcomes: land, tribute, absorption.
  - `Defensive` treaties bring allies in.
- **On screen:** Chronicles says why a war started and what changed. Borders move.
- **Risk:** medium to high. War frequency shifts.
- **Saves:** `relations` defaults to empty and is seeded on load from members' average attitudes and from the treaty list.
- **Checks:** sim-compare (battles, treaties, territory per tribe). Screenshots of borders before and after a war.

### Stage 12: nations

- **Change:**
  - `Nation` (§2.4): formation, capital, split.
  - `same_side` at cross-tribe sites. The network and trade planners use nation ownership.
  - Nation borders and colours on the map, a nation view in Civilization, nation-level Chronicles.
- **On screen:** a handful of countries instead of 60 tiny tribes.
- **Risk:** high. This changes who fights whom.
- **Saves:** `nations` defaults to empty. On load, each tier-4+ multi-town lineage becomes a nation, and long alliances are checked at the first pass.
- **Checks:** sim-compare (nations formed and split over 100,000 ticks). Screenshots of the world panel.

### Stage 13: specialisation and trade by need (#1079, #1077)

- **Change:** `TownRole`, role-biased zones, jobs and crafts. `TownBalance` matching, shipments on edges, famine relief, traffic-driven upgrades.
- **On screen:** "a mining town in the hills". Carts and trains carry goods from surplus to shortage, and relief caravans are marked.
- **Risk:** medium.
- **Saves:** derived on load.
- **Checks:** sim-compare (trade volume, famine deaths). Screenshots.

### Stage 14: the land remembers, migration on routes (#1080, #1081)

- **Change:**
  - Ruin stages, foundations, landmarks with names, forest regrowth.
  - Refugee and migration groups walk along edges as a column toward allied or related towns. They are accepted or refused by relation and food. A new town is founded from refugees.
- **Risk:** medium.
- **Saves:** `Building.stage` defaults from `ruined_at_tick`.
- **Checks:** sim-compare and screenshots of an abandoned town at 0, 10 and 40 days.

### Stage 15: culture and leaders (#1083, #1082)

- **Change:**
  - Nation palettes and roof variants (client, from nation colour and culture id).
  - Shared festivals in town squares, pilgrim routines to holy sites along edges.
  - Ruler traits biasing nation choices (expansion, network building, war).
  - Dynastic marriages creating `Marriage` memories and claims.
- **Risk:** medium.
- **Saves:** traits default from existing personality values.
- **Checks:** sim-compare and screenshots.

Stages 1-3 are independent and can ship this week. Stages 4-8 are the infrastructure arc. Stages 9-10 are the performance arc, and both need stage 4. Stages 11-15 are the society arc, and stage 12 needs 11.

## 5. Per-issue map

| Issue | Today | First PR |
|---|---|---|
| #1076 | §0, §1.1-1.2 | Stage 1 |
| #1077 | Caravans go straight between centres to the nearest partner (`merchants.rs:132-149`, `upkeep.rs:3-28`) | Stage 7 (caravans on edge paths), then stage 13 |
| #1078 | `working_day.rs` and `daily_work.rs` set wander hints, and everyone still runs a full decide | Stage 9 |
| #1079 | Same wishlist everywhere (`targets.rs:55-276`); specialties per tribe in `trade_routes/specialty.rs` | Stage 13, after the stage 4 towns |
| #1080 | Props, roads, paving and landmarks never decay | Stage 2 (rail), stage 6 (props), stage 7 (`road_age`), stage 14 |
| #1081 | Remnants of 3 or fewer join the nearest tribe instantly (`refugees.rs:52-91`) | Stage 14, after stage 7 edges |
| #1082 | Leader score is personality plus literacy; personal-opinion averages drive war | Stage 11 (relations), then stage 15 |
| #1083 | Per-tribe festivals and faith; no visual identity | Stage 15, with a client-only palette PR possible any time |
| #1084 | `props.rs:187-218` offset table; jitter at `construction.rs:1336-1339`; `decorative` not on the wire | Stage 6, with the stage 1 wishlist cut |
| #1062 | 20 µs per person per tick, every person, every tick | Exact track (sim agent), then stages 9-10 |
