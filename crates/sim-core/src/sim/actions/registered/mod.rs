//! One line per registered action. See `registry.rs` and `docs/ADDING_ACTIONS.md`.

use super::*;

/// Declares each listed module and collects its `DEF` into `ALL`.
macro_rules! register_actions {
    ($($(#[$meta:meta])* $name:ident),* $(,)?) => {
        $($(#[$meta])* pub(super) mod $name;)*
        pub(super) const ALL: &[&ActionDef] = &[$($(#[$meta])* &$name::DEF,)*];
    };
}

register_actions! {
    #[cfg(test)]
    sample,
}
