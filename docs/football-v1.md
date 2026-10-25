# Interactive Football v1.0

This is an independently approved, isolated feature. Phase 3 portfolio hotspots remain unimplemented and their plans are unchanged.

## Configuration and rendering

`lib/football.ts` owns the scene name `football`, starting X/Z position, radius, carpet surface height, play boundaries and physics parameters. Starting centre is (-1.12, 0.147, -0.48) metres; radius is 0.12 m. The ball occupies the clear left portion of the carpet, away from the chair and desk legs.

`components/canvas/Football.tsx` uses `public/models/football-stars-compact.glb` as its visual model. Its per-instance material clones retain the GLB's base-colour and metallic/roughness maps while adding the existing hover emissive highlight. The mesh is centered and scaled from its bounds to match the configured 0.12 m physics radius. A separate invisible sphere of that radius remains the raycast target. The visual group still rotates independently from its world position and HTML label.

The 148,700-byte compact asset contains the centered spherical Poly Haven football mesh by Amal Kumar ([CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/), [asset source](https://polyhaven.com/a/football)) with an unbranded pearl-charcoal star texture. Its `Pearl_Charcoal_Stars` PBR material retains the base-colour and metallic/roughness maps. No node rotation or translation is present, so no orientation correction is needed; the existing Three.js GLTF loader loads its textures.

## Physics

Pure `createBall`, `kickBall` and `stepBall` functions are separate from rendering. A ref stores position and velocity. R3F `useFrame` accumulates time in 1/120-second steps, accepting at most 0.05 seconds of elapsed time per rendered frame. Long stalls discard excess elapsed time rather than attempting an unstable catch-up. Sleeping balls do not keep requesting frames.

Gravity, floor restitution (0.48), wall restitution (0.6), air drag, rolling friction and a settling threshold dissipate energy. Horizontal displacement drives angular rotation. New impulses add to existing velocity; total speed is capped at 2.8 m/s. The camera's horizontal forward vector supplies direction, with an opposite lateral bias from the clicked side of the ball. A small upward impulse creates a bounce.

The conservative outer play volume is X [-1.55, -0.52], Z [-0.82, 0.48], from the carpet surface at Y 0.027 to Y 0.75 m. Radius-aware boundaries keep the full ball inside this volume, including during repeated airborne kicks. These invisible boundaries intentionally approximate a safe play area; they are **not furniture collision detection**. The whole play volume was checked against the existing furniture and wall mesh bounds, and its floor footprint is supported by the carpet. Recheck this volume if the scene layout changes.

## Input and accessibility

- Kicking is enabled only in `exploring`. Boot and cinematic controls/poses are untouched.
- Native pointer listeners observe the canvas without taking pointer capture or stopping propagation. `CameraRig` retains camera and capture ownership.
- A primary pointer-down hit records its camera-relative lateral offset. Pointer movement at or above the existing 8 px threshold cancels the kick, even if the pointer returns to its start. Pointer-up produces the single impulse; no second click kick handler exists.
- Mouse and touch use the same gesture logic. Cancelled gestures and window blur clear the pending kick. Rotation does not reset ball state.
- Hover adds restrained emissive emphasis, a pointer cursor and a small `Kick Me!` label.
- A real HTML button labelled `Kick football` is available to Tab navigation after entry. Focus makes the label visible; Enter/Space invokes a centred kick. It moves with the ball; visitors can look down using the existing arrow-key controls if needed.
- Reduced motion uses a gentler, short grounded roll with stronger friction and no upward kick. There is no decorative idle animation or audio.

## Changed files and evidence

- Added `lib/football.ts`: configuration and deterministic motion functions.
- Added `components/canvas/Football.tsx`: visual model, gesture observer, frame updates and accessible label/button.
- Updated `components/canvas/RoomCanvas.tsx`: mount the isolated football with phase/reduced-motion inputs.
- Updated `app/globals.css`: restrained hover/focus label and cursor styles.
- Uses `public/models/football-stars-compact.glb`: optimized CC0 football visual asset with a star-pattern finish.
- Added this document and `artifacts/football-v1/` browser screenshots/reports.

No edits to CameraRig, room placements, furniture geometry, boot components, entrance timeline/poses, dependencies or hotspot plans. SHA comparisons against the pre-feature snapshot confirmed protected files stayed unchanged.

See `artifacts/football-v1/VALIDATION.md` for actual tests and limitations. Stop for review after v1.0.
