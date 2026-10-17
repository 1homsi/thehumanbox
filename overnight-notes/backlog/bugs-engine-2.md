# Engine bugs, scout 2 (2026-10-16)

Scope: physics (`packages/physics`), ECS/world, tilemap, animation, camera, tweening/timeline, lifecycle, React hooks, asset loading, devtools hooks. Target: xip `origin/main` `05095b1` (detached worktree, removed after the run). Skipped: BUG-43..68 (`bugs.md`), `engine.md`, and merged xip PRs #1-#75.

Method: read the code, then ran throwaway vitest repros in the worktree (not committed). Repro files are copied to `backlog/repros-engine-2/`; copy each back into its package (paths listed per entry) to run it. "Confirmed" = a repro fails for the predicted reason. "Confirmed by reading" = no repro run.

Run results: 12 findings (XB-01..XB-11 and XB-14) have a repro that fails for the predicted reason. XB-12, XB-13 and XB-15 are confirmed by reading only. Control: the same physics level without a restore passes.

Ranked, most severe first:

| ID | Title | Severity | Evidence |
|---|---|---|---|
| XB-01 | Physics keeps stale column IDs after `restoreSnapshot`/`clear`, then throws every step | High | confirmed |
| XB-02 | `restoreSnapshot`/`clear` silently turns deterministic RNG off | High | confirmed |
| XB-03 | TriMesh BVH is frozen at spawn position and keyed by a reusable entity id | High | confirmed |
| XB-04 | One `Script` slot per entity: a second hook silently replaces the first | Med-High | confirmed |
| XB-05 | Tilemap async load is never cancelled: colliders leak after unmount, double under StrictMode | Med-High | confirmed |
| XB-06 | After stop + replay, a looping audio track can no longer be stopped | Medium | confirmed |
| XB-07 | A failed `loadImage` is cached forever | Medium | confirmed |
| XB-08 | Non-looping animation fires its last-frame event once per excess step of a long update | Medium | confirmed |
| XB-09 | Looping `createTimeline` drops frame overshoot each cycle and runs slow | Med-Low | confirmed |
| XB-10 | Restore never fires `onDestroyEntity`, so Selection keeps dead or recycled ids | Med-Low | confirmed |
| XB-11 | Snapshots turn `Infinity`/`NaN` into `null` | Med-Low | confirmed |
| XB-12 | `useLevelTransition`: an instant transition during a fade is overwritten by the fade's timer | Low-Med | by reading |
| XB-13 | Tilemap never strips Tiled flip/rotation bits from GIDs | Low-Med | by reading |
| XB-14 | Repeating `tween` clamps carried overshoot to one duration after a hitch | Low | confirmed |
| XB-15 | Tilemap legacy collider path ignores `solidTiles` | Low | by reading |

---

## XB-01 Physics keeps stale column IDs after `restoreSnapshot`/`clear`, then throws every step

- **Severity:** High. Undo, DevTools time-travel, rollback and the `onReady` reset all go through `ecs.clear()`. After one of them, physics either throws on every frame (the loop survives thanks to #57, so physics is dead for the session) or reads the wrong component.
- **File:line:** `packages/physics/src/physicsSystem.ts:106-121` (`tids()` computes `world.typeId(...)` once per world and caches it in a module `WeakMap`); `packages/core/src/ecs/world.ts:782-807` (`restoreSnapshot` calls `clear()`), `:1012-1031` (`clear()` empties `typeIds` and `columns`). Crash site: `physicsSystem.ts:1399` (`cc.enabled` on undefined).
- **Repro:** `repros-engine-2/physics-scoutXb.test.ts`, test "XB-i physics still reads the right columns after restoreSnapshot". Sequence: a world with a TriMesh and no CircleCollider yet; step once (physics interns `CircleCollider` at column N). Then `world.restoreSnapshot(new ECSWorld().getSnapshot())`, rebuild TriMesh then circle. The new circle's `CircleCollider` gets a lower column index, so `getComponent(id, N)` returns `undefined`. Result: `TypeError: Cannot read properties of undefined (reading 'enabled')` from `PhysicsSystem.step`. The no-restore control passes.
- **Why:** `tids()` assumes numeric column IDs are stable for the world's life. `clear()` breaks that. The silent variant: if the new index lands on another column, physics reads a different component as a collider. Callers: `useHistory.ts:90,99`, `useSnapshot.ts:53`, `DevTools.tsx:279`, `clientPrediction.ts:105,121`, and `Game.tsx:427-431` (`onReady.reset` calls `ecs.clear()`).
- **Fix:** Make `clear()` keep the interned type table and column objects (empty `dense`/`ownerSlot`/`sparse` only), so IDs never change. Also add a world `generation` counter bumped on clear and have `tids()` re-resolve when it changes. The physics side should not hold raw column numbers across a world reset.
- **Regression test:** `physics-scoutXb.test.ts` "XB-i" (should pass and leave the circle resting near y≈190). Add a core test: `typeId('X')` is unchanged after `clear()`.

## XB-02 `restoreSnapshot`/`clear` silently turns deterministic RNG off

- **Severity:** High for `<Game deterministic>` with rollback, undo or replay. Medium otherwise.
- **File:line:** `packages/core/src/ecs/world.ts:1030` (`clear()` sets `_deterministic = false`), `:782-807` (`restoreSnapshot` restores `_rngState` but not the mode; the snapshot does not carry the mode). Seeding happens once: `integrations/xip/src/components/Game.tsx:252`.
- **Repro:** `repros-engine-2/core-scoutXb.test.ts`, "XB-a restored world keeps deterministic RNG" and "XB-a2 ecs.clear() (onReset) keeps deterministic RNG". Two identically seeded worlds restored from the same snapshot produce different `rng()` sequences.
- **Why:** After any restore, `rng()` calls `Math.random()`. Affected: `packages/net/src/clientPrediction.ts:105,121` (rollback and server correction), `useHistory`, DevTools, and `packages/renderer/src/frameSim.ts:124-125,404-443` (camera shake and particle spawn). Two peers or a replay diverge.
- **Fix:** Keep `_deterministic` across `clear()` (it is world configuration, not state). Or add `deterministic` to `WorldSnapshot` and restore it in `restoreSnapshot`. Either way, `clear()` should not reset the mode.
- **Regression test:** the two "XB-a" tests in `core-scoutXb.test.ts` (should pass).

## XB-03 TriMesh BVH is frozen at spawn position and keyed by a reusable entity id

- **Severity:** High for moving or re-shaped TriMesh colliders (a moved mesh collides where it spawned). Medium for id reuse (a new mesh inherits the old geometry). Also a leak.
- **File:line:** `packages/physics/src/physicsSystem.ts:2857-2862` (BVH get/set by entity id `mid`; no eviction anywhere). `packages/physics/src/bvh.ts:116-128` (triangles get the mesh position baked in as `+ offsetX/offsetY` at build time). `triMeshManifold.ts:145-150` (the query uses only the box, not the mesh position). `physicsSystem.ts:346` says "IDs are never reused", which is false: `clear()` and `restoreSnapshot` reset `nextId`.
- **Repro:** `repros-engine-2/physics-scoutXb.test.ts`.
  - "XB-h a TriMesh that moves keeps colliding at its first-step position": mesh at x=0, one step, move it to x=1000, drop a circle at x=1000. Actual: `y = 1178` (falls through). Expected: rests near y≈190.
  - "XB-j a TriMesh created after an id is recycled (restore) uses its own geometry": after restore, a new lower mesh gets id 0. Actual: circle rests at y=190.5 (old floor). Expected: <120.
- **Why:** The BVH is only correct for the mesh's first position and vertex list. Moving a mesh, changing `vertices`/`indices` (generated or destructible terrain), or reusing an id all give wrong collisions. Destroyed TriMesh entities keep their BVH and vertex arrays forever.
- **Fix:** Build the BVH in mesh-local space (`buildBVH(vertices, indices, 0, 0)`). In the query, convert the box by subtracting the mesh position (`mt.x`, `mt.y`). Key the cache on the collider component object (a `WeakMap`), not the entity id, and rebuild when `vertices`/`indices` change. Evict on destroy as a fallback.
- **Regression test:** "XB-h" and "XB-j" in `physics-scoutXb.test.ts` (both should pass).

## XB-04 One `Script` slot per entity: a second hook silently replaces the first

- **Severity:** Med-High. Silent gameplay loss: `useCameraLookahead(id)` plus `usePlatformerController(id)` on the same player disables the platformer update.
- **File:line:** `packages/core/src/ecs/world.ts:477-486` (`addComponent` overwrites the same type in place). Callers writing `'Script'` on the caller's own entity: `integrations/gameplay/src/hooks/usePlatformerController.ts:147-148`, `integrations/gameplay/src/hooks/useTopDownMovement.ts:74-75`, `integrations/xip/src/hooks/useCameraLookahead.ts:68,79`, `integrations/xip/src/components/Script.tsx:41-42`. Hooks that spawn their own entity (useTimer, useCoroutine, useCutscene, useAudioListener, useGameStateMachine, useCinematicSequence) are not affected.
- **Repro:** `repros-engine-2/core-scoutXb.test.ts`, "XB-k two script-attaching hooks on one entity both keep running". Result: only `['platformer']` runs.
- **Why:** Each cleanup calls `removeComponent(entityId, 'Script')`, which removes whatever script is on the entity, including another hook's. Mount order decides which one survives.
- **Fix:** Make `Script` a list keyed by owner token (`addScript(id, owner, fn)` / `removeScript(id, owner)`), and have `ScriptSystem` iterate all entries. Or give each owner its own component type. Cleanup should remove only its own entry.
- **Regression test:** "XB-k" in `core-scoutXb.test.ts` (should pass). Add a hook-level test once the fix lands.

## XB-05 Tilemap async load is never cancelled: colliders leak after unmount, double under StrictMode

- **Severity:** Med-High. Each unmount or `src` change during the fetch leaks the colliders and sprite entities of the old map. In StrictMode (dev), mount→cleanup→mount runs two loads, and both survive, so every collider is doubled.
- **File:line:** `integrations/xip/src/components/Tilemap.tsx:191` (`createdEntities` is local to the effect), `:195-207` (`load()` awaits fetch and json, then creates entities), `:449` (`load()` is called without a cancel guard), `:451-456` (cleanup destroys only what is already in `createdEntities`).
- **Repro:** `repros-engine-2/xip-scoutXbTilemap.test.tsx` (needs to go in `integrations/xip/src/__tests__/`). It mounts `<Tilemap>` with a pending fetch, unmounts it with `rerender(null)`, then resolves the fetch. Actual: 1 BoxCollider survives. Expected: 0.
- **Why:** The cleanup runs while the fetch is in flight, before any entity exists. The entities created later are never tracked, so nothing destroys them.
- **Fix:** Add `let cancelled = false`; check it after each `await` and return early if set. The cleanup sets it to `true`. Also guard the `setSpawnedNodes` call. Test the StrictMode case as well: the first load must not create entities.
- **Regression test:** `xip-scoutXbTilemap.test.tsx` "XB-l" (should pass, expecting 0 colliders).

## XB-06 After stop + replay, a looping audio track can no longer be stopped

- **Severity:** Medium. Music keeps playing after a level change or restart, and `stopAudio` has no effect on it.
- **File:line:** `packages/core/src/assets/assetManager.ts:147-158` (`trackSource`: the `onended` closure holds the old `set`, then `activeSources.delete(src)` at `:156` deletes whatever set is now mapped to `src`). `:192-205` (`stopAudio` clears the set and drops the map entry; the browser fires `ended` asynchronously afterwards).
- **Repro:** `repros-engine-2/core-scoutXbAssets.test.ts`, "XB-f stop() then replay of a loop keeps the new source stoppable". Sequence: `playLoopAudio` (A), `stopAudio`, `playLoopAudio` (B), let A's `ended` fire, then `stopAudio`. Actual: B's `stop()` is never called.
- **Why:** The stale `onended` from A runs after B's set is installed. It deletes the map entry for `src`, which now belongs to B. B is no longer tracked.
- **Fix:** In `onended`, delete the map entry only when `this.activeSources.get(src) === set`. Delete the source from its own set only.
- **Regression test:** "XB-f" in `core-scoutXbAssets.test.ts` (should pass).

## XB-07 A failed `loadImage` is cached forever

- **Severity:** Medium. One transient network error means the image is never retried until a reload. Fallback sprites stay broken.
- **File:line:** `packages/core/src/assets/assetManager.ts:74-100` (the promise is stored at `:98`; the catch at `:87-90` never removes it). The audio path does evict on failure (`:138`, with the comment at `:141-142`), so the two paths are inconsistent. Not the same as BUG-65/#65, which concerns renderer per-frame re-requests.
- **Repro:** `repros-engine-2/core-scoutXbAssets.test.ts`, "XB-g a failed image load is retried on the next loadImage()". The second call returns the same rejection and creates no new `Image`.
- **Fix:** In the catch, `this.imagePromises.delete(resolved)` before rethrowing, matching the audio path.
- **Regression test:** "XB-g" in `core-scoutXbAssets.test.ts` (should pass).

## XB-08 Non-looping animation fires its last-frame event once per excess step of a long update

- **Severity:** Medium. A `hit`, `sfx` or `spawn` event on the last frame of an attack fires several times after a hitch (tab resume) or whenever `dt` exceeds `1/fps`.
- **File:line:** `packages/renderer/src/frameSim.ts:244-271`. The `while (anim.timer >= frameDuration)` at `:246` keeps running after the clip has stopped (`playing = false` at `:254`). Line `:270` then fires `frameEvents[currentIndex]` on every pass, including the clamped last index.
- **Repro:** `repros-engine-2/renderer-scoutXbAnim.test.ts`. One `updateAnimation(world, 1.0)` at fps 10 on a 3-frame non-looping clip fires the frame-2 event 9 times. Expected: 1.
- **Fix:** Break out of the loop once a non-looping clip completes, and set `anim.timer = 0` at that point. Fire `frameEvents` only when the index actually advances.
- **Regression test:** `renderer-scoutXbAnim.test.ts` (should pass).

## XB-09 Looping `createTimeline` drops frame overshoot each cycle and runs slow

- **Severity:** Med-Low. The timeline's cycle period is longer than its nominal duration, by up to one frame per cycle. A 1 s loop stepped at 0.3 s runs ~18% slow (40 frames for 10 s instead of 34).
- **File:line:** `packages/core/src/tweenTimeline.ts:164-168` (`elapsed = 0` when a repeat starts, so the overshoot of the completing frame is thrown away).
- **Repro:** `repros-engine-2/core-scoutXb.test.ts`, "XB-d looping timeline keeps real time". Expected ≤34 frames for 10 plays of 1 s at 0.3 s/frame. Actual: 40.
- **Fix:** Carry the remainder: `elapsed -= totalDuration()` instead of `elapsed = 0`, then start the next cycle's segments from the carried time. Check `seek` and `start` for the same reset.
- **Regression test:** "XB-d" in `core-scoutXb.test.ts` (should pass).

## XB-10 Restore never fires `onDestroyEntity`, so Selection keeps dead or recycled ids

- **Severity:** Med-Low. After undo, a selected entity id is either dead or (after `nextId` is reset) reused by a new entity that becomes selected implicitly.
- **File:line:** `packages/core/src/ecs/world.ts:1012-1031` (`clear()` and `restoreSnapshot` remove every entity without calling `destroyListeners`, `:456-463`). `integrations/xip/src/hooks/useSelection.tsx:56-67` prunes only on destroy events.
- **Repro:** `repros-engine-2/core-scoutXb.test.ts`, "XB-c onDestroyEntity fires for entities removed by restoreSnapshot". Actual: the listener is never called for the entity removed by restore.
- **Fix:** In `restoreSnapshot` and `clear`, copy the live ids and notify the destroy listeners for each one before the reset. Alternatively, emit a `reset` event that Selection can handle.
- **Regression test:** "XB-c" in `core-scoutXb.test.ts` (should pass).

## XB-11 Snapshots turn `Infinity`/`NaN` into `null`

- **Severity:** Med-Low. A component with `max: Infinity` restores as `null`, and `Math.min(null, x)` is `0`, so a "no limit" becomes a zero limit.
- **File:line:** `packages/core/src/ecs/world.ts:127-129` (`_cloneComponent` via JSON), `:855` (`JSON.stringify` in `getSnapshotBinary`), `:924` (`JSON.parse` in `restoreSnapshotBinary`).
- **Repro:** `repros-engine-2/core-scoutXb.test.ts`, "XB-b component Infinity survives the binary and JSON snapshot paths". Actual: `null` on both paths.
- **Fix:** Tag non-finite numbers in a JSON replacer and reviver (for example `{"$num":"Infinity"}`), which keeps the fast path. Or use `structuredClone` for snapshots (it preserves both values).
- **Regression test:** "XB-b" in `core-scoutXb.test.ts` (should pass).

## XB-12 `useLevelTransition`: an instant transition during a fade is overwritten by the fade's timer

- **Severity:** Low-Med. `transitionTo('B', {type:'instant'})` during a fade to `A` ends on `A`. A second fade can also be ended early by the first fade's `setIsTransitioning(false)` timer.
- **File:line:** `integrations/gameplay/src/hooks/useLevelTransition.ts:25-27` (instant path sets the level immediately, cancels nothing), `:47-53` (fade timers stored nowhere, so they can't be cleared; no unmount cleanup).
- **Repro:** confirmed by reading, not run. A renderHook test would do `transitionTo('A')`, then `transitionTo('B', {type:'instant'})`, wait past the fade, and expect `currentLevel === 'B'`.
- **Fix:** Keep the timer ids in a ref; clear them at the start of `transitionTo` and on unmount.

## XB-13 Tilemap never strips Tiled flip/rotation bits from GIDs

- **Severity:** Low-Med. Any flipped or rotated tile in a Tiled map (JSON or TMX export) renders the wrong frame, and a flipped solid tile gets no collider in the merged path.
- **File:line:** `integrations/xip/src/components/Tilemap.tsx:290-291` (`solidSet.has(gid)` with the raw GID), `:221` (`localId = gid - firstgid`), `:225-236` and `:248-259` (frame math on the raw GID). A grep for `0x1fffffff`, `0x80000000` or `& ~` in `integrations/xip/src` and `packages/core/src` finds no masking.
- **Repro:** confirmed by reading, not run. A flipped tile has `gid >= 2^31`, so `localId` is huge and the frame lies outside the sheet. A test would mount a map with `data: [0x80000001]` and check the entity's `Sprite` frame.
- **Fix:** Strip the top three bits (`gid & 0x1fffffff`) wherever GIDs are read. Map the flip flags onto the sprite (`SPRITE_FLIP_X`/`SPRITE_FLIP_Y` already exist in `render.ts`). Diagonal flip needs a rotation, so handle it or document it as unsupported.

## XB-14 Repeating `tween` clamps carried overshoot to one duration after a hitch

- **Severity:** Low. After a long `dt` (tab resume), the remaining passes play one per frame instead of finishing at once.
- **File:line:** `packages/core/src/tween.ts:209-212` (`elapsed = Math.min(overshoot, duration)`). Compare the delay handling at `:193-197`, which carries the full overshoot.
- **Repro:** `repros-engine-2/core-scoutXb.test.ts`, "XB-e repeating tween carries a large dt overshoot into the next pass". `tween(0→1, 1 s, {repeat: 3})`, `update(0.5)`, `update(10)`. Expected complete (10.5 s covers 4 passes). Actual: not complete.
- **Fix:** Loop: `while (elapsed >= duration && repeatsDone < maxRepeats) { elapsed -= duration; flip; repeatsDone++ }`, then complete if the loop ran out of repeats.
- **Regression test:** "XB-e" in `core-scoutXb.test.ts` (should pass).

## XB-15 Tilemap legacy collider path ignores `solidTiles`

- **Severity:** Low. Only when `mergeColliders={false}` (the default is `true`) and `solidTiles` is set: every non-zero tile in the layer becomes a collider.
- **File:line:** `integrations/xip/src/components/Tilemap.tsx:308-343` (run loop checks `!== 0` only). `solidSet` is used only in the merge path (`:285-291`). `collision` can be true through `autoColliders && solidTiles` (`:269`).
- **Repro:** confirmed by reading, not run. A map with tiles 1 and 2 and `solidTiles={[1]}`, `mergeColliders={false}`, should give one collider; actual gives collider(s) for both.
- **Fix:** Apply the same `solidSet` test in the run loop (treat non-solid tiles as empty).

---

## Checked, no bug found

- `spatialHash.ts`: cell math, packing, dedupe in `queryRect`, and the no-op update path.
- `tilemapMerge.ts`: greedy merge and rectangle centres are correct.
- `hierarchySystem.ts` / `hierarchy.ts`: `setParent` always gives the parent a `Hierarchy`, so the root and child traversal holds.
- `ScriptSystem`: stateless, safe with ID recycling.
- `useSceneTransition` and gameplay `useTween`: cleanup on unmount is correct. `useSceneTransition` drops a pending action when a newer one replaces it (design, not reported).
- `frameSim` animator and clip transitions: `resolveClip` sets `playing = true`, so `next` chaining works.
- World `addComponent`/`destroyEntity`/swap-remove bookkeeping and `GenerationCache`.
- Physics fixed-step accumulator (capped at 0.1 s).

## Not covered (time)

`DevTools.tsx` (1114 lines) and `debugSystem.ts`; camera `VirtualCamera`, `CameraZone`, `Camera2D`; `pathfind.ts` and `steering.ts`; most gameplay hooks beyond the lifecycle check; physics solver internals (only dt, caches and ID use were checked, not contact or sleep logic). A possible issue with `physics/snapshot.ts` `staticPrevPos` keyed by entity id (platform carry after id reuse) was noticed but not verified.
