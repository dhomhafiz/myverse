# MyVerse companion robot v2

Original rigid-part service robot built for MyVerse from the supplied approved blueprint. Clean white metal, grey mechanisms, expressive binocular eyes, a tracked base and the exact lowercase `dhomhafiz.dev` wordmark. No third-party character mesh or external texture/font assets.

## Deliverables

- Runtime asset: `public/models/myverse_companion_robot_v2.glb`
- Editable Blender source: `assets/companion-robot/myverse_companion_robot.blend`
- Reproducible source generator: `scripts/build-companion-robot.py`
- Studio preview: `artifacts/companion-robot/robot-studio.png`
- Measured report: `artifacts/companion-robot/validation.json`
- Local browser review: `scripts/review-companion-robot.mjs`

The Blender source includes a separate `REVIEW_STUDIO_not_exported` collection. Export only `companion_root` and its descendants. The generator does this automatically. The studio camera, lights and ground plane are never included in the GLB.

## Geometry and materials

| Measurement | Value |
| --- | --- |
| Triangles | 35,372 |
| File size | 1,051,572 bytes (1.003 MiB) |
| Mesh primitives / batches | 42 |
| Shared PBR materials | 8 |
| Textures | 0; no texture requests, UV atlas or external image dependencies |
| Native posed dimensions, glTF XYZ | 0.39853 × 0.40273 × 0.20807 m |
| Scene height | 0.540 m |
| PC tower scene height | 0.5625 m; robot is 96% of tower height |

Materials are white metal, porcelain panels, brushed grey alloy, graphite mechanisms, dark eye lenses, clean track rubber, cyan eye/status emission and dim cyan indicators. Meshes are batched by material within each independently moving joint. Small bevels and weighted normals retain clean shading. The branding is real geometry and remains readable without a texture.

The GLB is self-contained and uncompressed: its approximately 1 MiB size avoids adding a Draco/Meshopt dependency or decoder request for this asset. Existing room props retain their existing loading architecture.

## Axes, hierarchy and pivots

glTF uses metres, Y-up and +Z forward. Origin is at the centre of the track contact plane. Blender uses Z-up / -Y forward; the exporter performs the coordinate conversion. Mesh transforms are baked to their rigid joint frames; node scales are one. This is an object hierarchy, not a deforming skinned character or an armature dependency.

| Node | glTF axis | Motion / authored limits |
| --- | --- | --- |
| `head_yaw` | Y | Head yaw, −180° to +180° |
| `neck_pitch` | X | Upper neck pitch, −35° to +45°; negative pitch looks up |
| `neck_roll` | Z | Neck-base tilt, −15° to +15° |
| `shoulder_left`, `shoulder_right` | Z | Shoulder raise/lower, −120° to +120° |
| `elbow_left`, `elbow_right` | X | Elbow flexion, −135° to 0° in this rig's signed coordinate convention |
| `wrist_left`, `wrist_right` | Y | Hand yaw/twist, −180° to +180° |
| `track_left`, `track_right` | — | Optional independent track groups |

Limits are metadata for future animation tools, not physics constraints. Save each joint's rest rotation and apply/clamp local animation deliberately. Collision-free extremes across every possible combined pose are not promised. Both arms rest alongside the torso with slightly different shoulder, elbow and wrist rotations; either shoulder remains independently available for future gestures. The existing hover greeting, blinking, subtle head tracking and reduced-motion behavior are retained.

`head_pivot` is a compatibility focus group containing the head geometry, centred at the eye housing. `head_pivot_eyes_cyan` remains the independent expression mesh. These names preserve the existing camera/mobile framing contract. A companion-only `CameraRig` completion correction commits the final camera pose before clearing its tween, preventing a missed demand-render frame in reduced-motion mode. General room transitions and hotspot navigation are unchanged.

## Scene integration

Placement is centralized in `lib/companion-robot-config.ts`:

- Desk-local position: `[1.25, 0.795, 0.72]` m, in the existing robot area on the L-shaped return.
- Body yaw: −0.78 radians (−44.69°), toward the Home camera.
- Fitted height: 0.54 m, increased from the old 0.30 m to meet the explicit PC-height requirement.
- Track contact: tabletop Y = 0.795 m.
- Rotated track footprint: approximately 0.445 × 0.444 m, inside the 0.55 m-wide desk return.
- Home camera/face direction difference: approximately 2.73° in the authored rest pose.

The animation component preserves the authored track origin rather than recentering around a moving arm. Its invisible click target is fitted from measured bounds. The hotspot anchor follows the new height. Model preloading and static-export verification reference v2. The old v1 GLB remains available for rollback but is no longer requested by the room.

The fitted model scale is constant from room load through companion focus and return; selection feedback animates articulated joints only. The camera retains its intentional perspective zoom, so apparent screen size changes with distance, but no model-scale tween is applied. No full animation suite or glTF clips were added.

## Rebuild and validation

From the project root, with Blender 5.2 available:

```powershell
& 'D:\Blender 5.2 LTS\blender.exe' --background --python scripts/build-companion-robot.py
node --experimental-strip-types scripts/validate-companion-robot.mjs
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:companion
npm.cmd run build
npm.cmd run check:export
node scripts/review-companion-robot.mjs
```

`-- --skip-render` after the Blender script arguments regenerates source/GLB without the studio render. The browser review uses an isolated local Chrome profile, serves `out/` locally, blocks production backend requests, and serves existing Draco decoder requests from installed Three.js files. Set `CHROME_PATH` for another local Chromium installation. Its test profile stays under ignored `.tmp/`.

Geometry validation imports the real GLB with Three.js `GLTFLoader`, verifies all nine joints move geometry around fixed pivots, checks the natural asymmetric arm rest pose and hand clearance, finite normals/unit mesh scales, desk contact/support, PC and monitor-envelope clearance, triangle/file-size budgets and face/camera alignment. Browser review repeats desktop focus/return three times and compares fitted world scale and bounds throughout the camera transition; it also checks reduced-motion mobile focus, work navigation, room return and the existing hover greeting. Screenshots and JSON evidence are under `artifacts/companion-robot/`.

No Cloudflare systems, backend source, general room-transition paths or hotspot-navigation logic were changed. Existing camera focus, room snapshot handoff, completion handling and `ROOM_SNAPSHOT_EXCLUDE` behavior remain intact. No commit, push or deployment is part of this task.

## Completed validation

| Check | Result |
| --- | --- |
| Three.js GLTFLoader import, geometry/normals and size budgets | PASS |
| All nine articulated pivots: fixed origin and moving child geometry | PASS |
| Track/table contact, support, PC/monitor/tabletop/wall clearance | PASS |
| Existing camera focus and independent cyan-eye contracts | PASS |
| Desktop canvas click, chat focus and close | PASS |
| Work navigation and return to room | PASS |
| Mobile head fully visible above chat sheet at 390 × 844 | PASS; head bounds approximately X 34–360 px, Y 208–367 px, sheet begins at 473 px |
| Default arms rest naturally; articulated pivots and hand clearances | PASS |
| Three desktop room/focus/return cycles preserve fitted world scale | PASS |
| Reduced-motion mobile focus, close and room return | PASS |
| Existing hover greeting drives the articulated shoulder | PASS |
| Browser runtime/console errors | 0 |
| Existing Companion client tests | 30 passed, 0 failed/skipped |
| TypeScript, ESLint, production build and static-export checks | PASS |

This fix changes the robot scale ownership in `components/canvas/MyVerseAICompanion.tsx`, the authored rest pose in `scripts/build-companion-robot.py`, and the focused geometry/browser checks in `scripts/validate-companion-robot.mjs` and `scripts/review-companion-robot.mjs`. It regenerates the Blender source and v2 GLB plus the related validation and visual-review evidence. Other pre-existing worktree changes are preserved.
