# Interactive Football v1.0 validation

## Checks performed

- `npm.cmd run typecheck` — passed.
- `npm.cmd run lint` — passed, zero warnings.
- `npm.cmd run build` — passed.
- Actual Chrome production-browser tests: **24 assertions passed, no runtime exceptions or console errors**. Details and sampled positions are in `browser-report.json`.
- Desktop 1440×900 and emulated touch viewport 390×844 were exercised using real mouse, keyboard and touch input events.
- Boot readiness and the complete normal cinematic ran with the football remaining stationary/inactive. Final approved Home position and lamp lighting were checked.
- Hover label/cursor, mouse click, lateral click bias, visible rotation, repeat kicks during motion, camera movement during motion, drag-out-and-back cancellation, subthreshold jitter, keyboard focus/Enter, boundary reflection and observed floor/area containment were verified.
- The first mouse gesture's bounce height was checked against a single impulse to detect duplicate click kicks.
- Mobile tap, swipe from the ball, touch cancellation and absence of scrolling/overflow were checked.
- Reduced-motion entry and a gentle grounded kick/settling were checked.
- **11 pure physics tests passed**, including all four walls, gravity/bounce decay, settling, deterministic replay, side bias, additive speed-limited kicks, 10,000 bounded simulation steps, repeated airborne kicks against the upper boundary and a finite horizontal direction fallback. See `physics-check.txt`.
- Static mesh-bound checks confirmed the complete configured play volume clears workstation, chair, bike, guitars, pegboard, lamp and walls. It remains entirely over the carpet. See `clearance-check.txt`.
- SHA comparison of 12 protected source/dependency files found **zero changes**. Camera controls, cinematic, boot, room placements, phone and furniture sources were preserved.

Temporary local QA helpers used: `.tmp/football-physics-test.cjs`, `.tmp/football-clearance-test.cjs`, `.tmp/football-browser-test.cjs`. They use the existing TypeScript/Three packages and native Node CDP WebSocket support. No dependencies were installed. The clearance helper emits a Three CommonJS deprecation notice; browser runtime tests reported no errors.

## Actual screenshots

These v1.0 captures come from the running application, not mockups; they predate the GLB visual-model follow-up and show the original procedural placeholder. The camera was looked downward using its existing arrow-key controls for closer views; no camera configuration was changed. The updated textured GLB was visually inspected in the running development browser.

- `01-home-football.png` — full resting ball in the approved Home composition.
- `02-hover-kick-me.png` — recognisable black/white model and restrained hover label.
- `03-kicked-football.png` — ball moving after repeated kicks.
- `04-mobile-football.png` — mobile portrait view.
- `05-reduced-motion.png` — reduced-motion state.

## Changed files

- `lib/football.ts` — new configuration and motion functions.
- `components/canvas/Football.tsx` — new primitive model and isolated input/rendering.
- `components/canvas/RoomCanvas.tsx` — football mount and phase gating.
- `app/globals.css` — football label/focus/cursor styles.
- `docs/football-v1.md` — behavior, configuration, architecture and simplifications.
- `artifacts/football-v1/` — this report, screenshots and test evidence.

## Limitations

Physics uses an invisible conservative rectangular play volume, including a 0.75 m upper edge, rather than detailed furniture collision. Long rendering stalls drop excess simulation time. Desktop keyboard access uses a projected HTML button, so looking toward the ball gives the clearest focus feedback.

Browser tests used Chrome software WebGL and mobile emulation. Physical phones, other browser engines and hardware frame rates were not tested. No scoring, sound, portfolio hotspots, Blender assets or additional phases were implemented.

Stopped for review after v1.0.

## Optimized GLB visual model follow-up

- The component now loads `public/models/football-stars-compact.glb` (148,700 bytes); the previous `football-compact.glb` remains unused.
- Its GLB metadata reports centered bounds approximately ±0.11 m on each axis, a single `Pearl_Charcoal_Stars` PBR material with base-colour and metallic/roughness textures, and no node rotation or translation. The star-pattern texture is part of the supplied asset.
- Bounds normalization scales the 0.22 m source diameter to the existing 0.24 m visual diameter (radius 0.12 m); the initial center remains `(-1.12, 0.147, -0.48)`.
- In the development browser the new GLB request returned HTTP 200; its resource entry decoded to 148,700 bytes. The existing readiness checks completed, and the textured ball rendered at its configured carpet position.
- Captured the updated Home view in `05-football-stars.png`.
- The fresh development load logged a React console error, `Cannot update a component (SceneReadiness) while rendering a different component (Football)`, while the GLTF was loading. The scene still became ready and rendered; there were no uncaught page errors. The existing `useGLTF`/readiness flow was not changed for this asset-only swap.
- Hovering the ball produced the existing pointer/hover state through the unchanged invisible spherical raycast target. Activating the existing accessible kick button moved with the ball after the kick; the fixed-step physics and kick logic in `lib/football.ts` were not modified.
- After this asset switch, `npm.cmd run typecheck` and `npm.cmd run lint` passed. A production build was not run because a shared Next.js development server was already using the `.next` output directory.
