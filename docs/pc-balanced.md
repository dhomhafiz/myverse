# Gaming PC tower GLB integration

## Asset and placement

`public/models/pc-balanced.glb` replaces the procedural PC tower while keeping the `gaming_pc` scene identifier and the existing desk/Home camera arrangement.

- Source: “Gaming Pc with RGB lighting” by fakiAZer (iden.balci), [Sketchfab model](https://sketchfab.com/3d-models/gaming-pc-with-rgb-lighting-a6a9d60791cf4d33a13109eb43230725).
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The GLB's embedded copyright metadata records the attribution and optimization summary.
- Transfer size: 342,764 bytes (`Content-Length` from the production HTTP response).
- Geometry: 26,483 triangles.
- Scene bounds before placement: approximately 0.1997 m wide × 0.4500 m tall × 0.3955 m deep.
- Uniform scale: 1.25, yielding approximately 0.2497 × 0.5625 × 0.4944 m.
- Desk-local transform: position `[1.14, 0.795, -0.06]`, rotation `[0, π, 0]`, scale `[1.25, 1.25, 1.25]`.

The GLB's origin is at the case feet, not at its center. The desk top is at Y=0.795 m, so the model's local minimum Y of zero is placed directly on that surface. The 180° yaw turns the model's local -Z front toward the room and presents its +X glass side toward the Home camera. The scaled footprint fits the right-hand desk surface without moving the camera or surrounding workstation objects.

No separate hierarchy/validation document was present in the project. The node hierarchy, material assignments, animation clips and bounds were inspected from the supplied GLB metadata.

## Hierarchy and fan control

The scene root is `PC_Tower`. Relevant nodes include:

| Assembly | Rotor pivot / blades | Stationary housing and ring |
| --- | --- | --- |
| Front lower | `Fan_Front_Bottom_Rotor` / `Fan_Front_Bottom_Blades` | `Fan_Front_Bottom_Housing`, `Fan_Front_Bottom_RGB` |
| Front upper | `Fan_Front_Top_Rotor` / `Fan_Front_Top_Blades` | `Fan_Front_Top_Housing`, `Fan_Front_Top_RGB` |
| Rear | `Fan_Rear_Rotor` / `Fan_Rear_Blades` | `Fan_Rear_Housing` |
| Top 1–3 | `Fan_Top_1_Rotor`, `Fan_Top_2_Rotor`, `Fan_Top_3_Rotor` | Separate rotor assemblies |

The six corresponding GLB clips target independent rotor-pivot rotations. Their channels confirm local-Z spin; the housing and front RGB nodes are separate. `GamingPc` rotates only those six pivot transforms. It uses no React state updates per frame, caps delta at 50 ms, eases speed from the shared PC power value, and stops requesting frames when the scene is inactive or the page is hidden. Node transforms are restored on unmount.

## RGB and cinematic behavior

Authored emissive materials are retained and controlled by the existing `motion.lights.pc` channel in `SceneLighting`:

- Front rings: `RGB_Front_Bottom` and `RGB_Front_Top` (blue).
- Internal: `RGB_Internal_Cyan` and `RGB_Internal_Violet`.
- Existing `Power_LED_Blue` and other authored emissive material assignments remain intact.

The initial intro state sets PC emissives to zero. The existing GSAP entrance raises the PC channel at workstation activation; the same value starts fan acceleration, so there is no second timeline. The room-lamp and guitar-spot sequence and the camera path are unchanged. Reduced-motion entry reaches the powered-on state without continuous fan rotation.

The supplied GLB contains no dedicated green internal RGB material; its named internal RGB materials are cyan and violet, and another unnamed emissive material is red. To avoid recoloring unrelated or ambiguous source materials, the integration preserves the GLB's authored palette. This is a known palette limitation for visual review.

## Performance

- One cached GLB is loaded through Drei `useGLTF`; the scene and materials are not cloned.
- No dependencies, extra lights, dynamic shadow maps, glass effects or post-processing were added.
- Per-frame work updates only the six rotor Z rotations and their speed/angle accumulators.
- Existing `frameloop="demand"` is invalidated only while the fans need to move.

## Validation and review status

- TypeScript: `npm.cmd run typecheck` passed.
- ESLint: `npm.cmd run lint` passed.
- Isolated production build: `npm.cmd run build` passed.
- Production endpoint: page and model returned HTTP 200; model `Content-Length` was 342,764 bytes.
- Production browser: model loaded as part of scene readiness; intro entry settled to `exploring`; refresh during intro and after the intro returned safely to the ready boot state.
- Reduced motion: entry settled to `exploring` with `data-reduced-motion="true"` and the PC remained powered on without continuous rotor animation.
- Free Look keyboard input and the accessible football control remained available and responsive.
- Home powered-off and powered-on, reduced-motion powered-on, front-fan close-up and Free Look glass-side close-up screenshots were captured in the review handoff. The PC visibly contacts the desk at the corrected transform.
- No new runtime exceptions were observed. Existing `THREE.Clock` deprecation and focus/`aria-hidden` browser warnings remain outside this PC change.

**Milestone:** Implemented / Technically Validated. **Visual Approval:** Pending user review. Phase 3 Hotspots, remaining workstation props and final performance/accessibility audits remain pending.
