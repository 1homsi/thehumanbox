# Adding an action

An action is something an organism can choose to do on a tick: brew beer, comfort a friend, chart a star. A new action is **one file and one line**.

## 1. Write the file

Create `crates/sim-core/src/sim/actions/registered/<name>.rs`:

```rust
use super::*;

pub const DEF: ActionDef = ActionDef {
    id: 5931,                       // unique, in 5930..=6143 (see below)
    name: "greet_stranger",
    category: "social",             // how it is counted in the action stats
    // When it may be chosen: era, age, company, place, resource, qualification.
    band: band!(5931, 5931, Stone, AdultOrElder, Stranger, PlaceGate::Anywhere, None, Q_NONE),
    possible: None,                 // or Some(|sim, idx, ix, iy| ...) for an extra check
    records_experiment: false,      // true if it should feed research
    apply,
};

fn apply(ctx: &mut ActionCtx) -> f32 {
    ctx.think("greeting a stranger");
    ctx.org_mut().comfort = (ctx.org().comfort + 0.02).min(1.0);
    0.01                            // the reward
}
```

`ctx` gives you the actor (`ctx.org()`, `ctx.org_mut()`), the world (`ctx.sim`), nearby kin and others (`ctx.kin`, `ctx.near`), the tile, and helpers such as `ctx.think`, `ctx.discover` and `ctx.event`. `registered/sample.rs` is a complete working example (it is compiled in tests only), and any file in `actions/` shows richer uses of the context.

## 2. Register it

Add one line to the list in `registered/mod.rs`:

```rust
register_actions! {
    greet_stranger,
}
```

That is all. The macro declares the module, and the registry feeds the action into candidate selection, eligibility checks, dispatch, statistics and experiment tracking.

## Ids

Registered actions use ids `5930..=6143` (`FIRST_REGISTERED_ID..=LAST_REGISTERED_ID`). Pick the next free one; a test fails if two actions share an id, if an id is outside the range, or if a band does not cover exactly its own id. `registered_actions()` lists what is taken.

## Gates

`band!(start, end, Era, Age, Social, Place, Resource, Qualification)`:

| Gate | Choices |
|---|---|
| Era | the first era it is available in, e.g. `Stone`, `Industrial` |
| Age | `Child`, `TeenOrOlder`, `AdultOrElder`, `Elder` |
| Social | `None`, `Anyone`, `Kin`, `KinCount(n)`, `Stranger`, `KinAndStranger` |
| Place | `PlaceGate::Anywhere`, `Home`, `Water`, `Fire`, `Rock`, `WildLand`, `Workspace(..)`, ... (see `band_types.rs`) |
| Resource | `None`, `Food`, `Materials`, `Wood`, `Stone`, `Wealth`, ... |
| Qualification | `Q_NONE`, or `qualification(&["discovery"], &["specialty"], 0.0)` |

Use `possible` for conditions the gates cannot express.

## Tests

Test an action like the sample does: build a `Simulation`, make an organism eligible, call `available_actions` to check it is offered and `try_apply` to run it. Keep the test next to the action in the same file.

## The older actions

Actions with ids below 5930 are described by the tables in `base_bands.rs` and `band_table.rs` and dispatched by id range in `mod.rs`. They keep working as they are. To change one, edit its category module and its band; to retire the table style, move an action into `registered/` with the same gates and a new id.
