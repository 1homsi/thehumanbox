#![allow(clippy::needless_range_loop)]
pub mod organism;
pub mod physics;
pub mod sim;
pub mod world;

#[cfg(target_arch = "wasm32")]
mod wasm_facade {
    use crate::sim::persistence::SaveState;
    use crate::sim::simulation::Simulation;
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen]
    pub struct Sim {
        inner: Simulation,
    }

    #[wasm_bindgen]
    impl Sim {
        #[wasm_bindgen(constructor)]
        pub fn new(seed: u64) -> Sim {
            Sim {
                inner: Simulation::new(seed),
            }
        }

        #[wasm_bindgen(js_name = fromSerialized)]
        pub fn from_serialized(seed: u64, bytes: &[u8]) -> Result<Sim, JsValue> {
            let state = serde_json::from_slice::<SaveState>(bytes)
                .map_err(|error| JsValue::from_str(&format!("invalid world save: {error}")))?;
            if state.version != 0 && state.version > crate::sim::simulation::SAVE_SCHEMA_VERSION {
                return Err(JsValue::from_str(&format!(
                    "world save schema v{} is newer than supported v{}",
                    state.version,
                    crate::sim::simulation::SAVE_SCHEMA_VERSION
                )));
            }
            let terrain_seed = if state.world_seed > 0 {
                state.world_seed
            } else {
                seed
            };
            Ok(Sim {
                inner: Simulation::from_save(terrain_seed, state),
            })
        }

        pub fn tick(&mut self) {
            self.inner.tick();
        }

        #[wasm_bindgen(js_name = tickN)]
        pub fn tick_n(&mut self, n: u32) {
            for _ in 0..n {
                self.inner.tick();
            }
        }

        #[wasm_bindgen(js_name = fullFrame)]
        pub fn full_frame(&mut self, frame_id: u32, now_ms: f64) -> String {
            let mut v = self.inner.state_json();
            stamp(&mut v, frame_id, now_ms, true);
            v.to_string()
        }

        #[wasm_bindgen(js_name = deltaFrame)]
        pub fn delta_frame(&mut self, frame_id: u32, now_ms: f64) -> String {
            let mut v = self.inner.state_json_incremental();
            let full = v
                .get("organisms_complete")
                .and_then(|b| b.as_bool())
                .unwrap_or(false);
            stamp(&mut v, frame_id, now_ms, full);
            v.to_string()
        }

        pub fn serialize(&self) -> Vec<u8> {
            serde_json::to_vec(&self.inner.to_save_state()).unwrap_or_default()
        }

        pub fn command(&mut self, json: &str) -> bool {
            self.inner.apply_command_json(json)
        }

        #[wasm_bindgen(js_name = orgDetail)]
        pub fn org_detail(&self, id: &str) -> String {
            self.inner
                .organisms
                .iter()
                .find(|org| org.id == id)
                .and_then(|org| serde_json::to_string(&org.to_detail_json()).ok())
                .unwrap_or_default()
        }

        #[wasm_bindgen(js_name = orgLife)]
        pub fn org_life(&self, id: &str) -> String {
            self.inner
                .organisms
                .iter()
                .find(|org| org.id == id)
                .and_then(|org| serde_json::to_string(&org.to_life_json()).ok())
                .unwrap_or_default()
        }

        #[wasm_bindgen(js_name = tickCount)]
        pub fn tick_count(&self) -> u64 {
            self.inner.tick_count
        }
    }

    fn stamp(v: &mut serde_json::Value, frame_id: u32, now_ms: f64, full: bool) {
        if let Some(o) = v.as_object_mut() {
            o.insert("frame_id".into(), serde_json::json!(frame_id));
            o.insert("server_sent_at_ms".into(), serde_json::json!(now_ms));
            o.insert(
                "frame_kind".into(),
                serde_json::json!(if full { "full" } else { "delta" }),
            );
        }
    }

    #[wasm_bindgen(start)]
    pub fn __start() {}
}
