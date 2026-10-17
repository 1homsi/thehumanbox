#![allow(clippy::needless_range_loop)]
pub mod hashing;
pub mod math;
pub mod organism;
pub mod physics;
pub mod sim;
pub mod world;

#[cfg(any(target_arch = "wasm32", test))]
use crate::sim::serialize::FramePayload;

#[cfg(any(target_arch = "wasm32", test))]
fn frame_is_complete(frame: &FramePayload) -> bool {
    frame
        .get("organisms_complete")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(false)
}

#[cfg(any(target_arch = "wasm32", test))]
fn stamp_frame(frame: &mut FramePayload, frame_id: u32, now_ms: f64, full: bool) {
    frame.insert("frame_id", serde_json::json!(frame_id));
    frame.insert("server_sent_at_ms", serde_json::json!(now_ms));
    frame.insert(
        "frame_kind",
        serde_json::json!(if full { "full" } else { "delta" }),
    );
}

#[cfg(target_arch = "wasm32")]
mod wasm_facade {
    use super::{frame_is_complete, stamp_frame};
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
            let mut frame = self.inner.state_frame();
            stamp_frame(&mut frame, frame_id, now_ms, true);
            serde_json::to_string(&frame).expect("frame payload serialization cannot fail")
        }

        #[wasm_bindgen(js_name = deltaFrame)]
        pub fn delta_frame(&mut self, frame_id: u32, now_ms: f64) -> String {
            let mut frame = self.inner.state_frame_incremental();
            let full = frame_is_complete(&frame);
            stamp_frame(&mut frame, frame_id, now_ms, full);
            serde_json::to_string(&frame).expect("frame payload serialization cannot fail")
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

    #[wasm_bindgen(start)]
    pub fn __start() {}
}

#[cfg(test)]
mod wasm_frame_tests {
    use super::{frame_is_complete, stamp_frame};
    use crate::sim::simulation::Simulation;

    #[test]
    fn stamped_typed_wasm_frames_match_value_frames() {
        let mut typed_world = Simulation::new(17);
        let mut value_world = Simulation::new(17);
        for _ in 0..400 {
            typed_world.tick();
            value_world.tick();
        }

        let mut typed_deep = typed_world.state_frame();
        let mut value_deep = value_world.state_json();
        assert_stamped_equal(&mut typed_deep, &mut value_deep, 1, true);

        let mut typed_periodic = typed_world.state_frame_periodic_full();
        let mut value_periodic = value_world.state_json_periodic_full();
        assert_stamped_equal(&mut typed_periodic, &mut value_periodic, 2, true);

        for _ in 0..3 {
            typed_world.tick();
            value_world.tick();
        }
        let mut typed_delta = typed_world.state_frame_incremental();
        let mut value_delta = value_world.state_json_incremental();
        assert!(!frame_is_complete(&typed_delta));
        assert!(value_delta["organisms_hot"].is_object());
        assert_stamped_equal(&mut typed_delta, &mut value_delta, 3, false);
    }

    fn assert_stamped_equal(
        typed: &mut crate::sim::serialize::FramePayload,
        value: &mut serde_json::Value,
        frame_id: u32,
        expected_full: bool,
    ) {
        let full = frame_is_complete(typed);
        assert_eq!(full, expected_full);
        assert_eq!(
            value["organisms_complete"].as_bool().unwrap_or(false),
            expected_full
        );
        stamp_frame(typed, frame_id, 1_700_000_000_000.0, full);
        let object = value.as_object_mut().unwrap();
        object.insert("frame_id".into(), serde_json::json!(frame_id));
        object.insert("server_sent_at_ms".into(), serde_json::json!(1_700_000_000_000.0));
        object.insert(
            "frame_kind".into(),
            serde_json::json!(if full { "full" } else { "delta" }),
        );
        assert_eq!(
            serde_json::to_string(typed).unwrap(),
            value.to_string(),
            "stamped frame id {frame_id}"
        );
    }
}
