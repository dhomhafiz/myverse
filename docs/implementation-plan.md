# Interactive developer room — current implementation plan

## Approval and scope

Phase 1 is approved. Phase 2 includes the approved Developer Boot Sequence and Free Look, followed by the cinematic entry and branded name transformation described below. This refinement is pending review. Phase 3 is not started. Furniture, object names, phone placement, portfolio destinations and the Phase 4 Blender strategy remain unchanged. No new dependencies, audio, Lenis or ScrollTrigger.

## Phase 2 coordinated entrance

One GSAP timeline in `useEntranceTimeline` owns boot exit, numeric camera/light channels, CSS room treatment, name/caption presentation, name collapse and final exploration readiness. `CameraRig` remains the only writer of Three.js camera transforms. Input stays disabled throughout `entering`, including the hero and collapse stages.

1. Fade the existing boot UI over an already compiled/rendered room. The lamp starts off and the room fill is dimmed; no blank frame is exposed.
2. Start at configurable workstation close-up poses in `lib/entrance.ts`. Desktop and portrait framing both show the monitors, with a clear path left of the chair.
3. Reveal monitor emissive glow, PC emissive rings, warm lamp and existing room fill in sequence. Reuse current materials and lights.
4. Pull back with smooth easing to the exact approved Home position, direction and lens. Hold Home while introducing the brand.
5. Temporarily apply subtle CSS blur/dimming and scanlines. Reveal large off-white **MOHD HAFIZ**, then **Hello, World!**. System Impact/Haettenschweiler typography supplies the condensed treatment without downloading a font. A short duplicate visual smear is aria-hidden; the actual name remains readable HTML.
6. Compress and translate the same heading toward an invisible measured brand anchor using position and scale. Fade caption/scanlines and clear the room filter during travel. At settlement the same heading reads **Mohd Hafiz** in the smaller UI typography. Do not create a duplicate semantic heading.
7. Final brand position: desktop left 32 px/bottom 28 px, 24 px type; mobile left 20 px/bottom 24 px, 20 px type. It stays separate from future navigation/hotspot labels.
8. Only after settlement enable Free Look and show **Drag to explore**. Final lights match the original scene intensities and the default camera exactly matches Home.

The normal sequence is approximately four seconds. Skip intro and Escape complete it safely. Reduced motion uses a brief simplified reveal at Home with no camera travel, blur, scanline or smear animation. Resize finishes safely at the responsive brand anchor. Unmount kills the timeline; changing review route remounts a fresh boot/entrance state. No independent entrance timers or competing camera tweens.

## Phase 3 — animated hotspot indicators (requirements only)

Do not implement these until Phase 3 approval.

| Object | Destination/indicator label | Stable anchor plan |
| --- | --- | --- |
| Left monitor | Projects | Existing `screen_left_anchor`, with a configurable visual offset |
| Right monitor | Skills | Existing `screen_right_anchor`, with a configurable visual offset |
| Both guitars as one zone | About Me | Shared wall-zone anchor; retain both separate guitar objects |
| iPhone | Contact | Existing configurable `contact_anchor`, following the phone/flip pivot |
| Pegboard | Beyond the Code | Pegboard-local interaction anchor |

Visual design: small luminous dot/orb, restrained pulsing ring, compact readable label and an optional fine connecting line. Indicators should make the five objects discoverable without covering the room in a game HUD. The bike may have a smaller secondary indicator or hover-only Easter Egg and must not compete with these five destinations.

- Idle: visible gentle float/pulse and readable label.
- Hover: modest stronger glow, lightweight object emphasis and more prominent label.
- Click: brief response; fade/reduce emphasis during the focus transition.
- Focus: hide/de-emphasise irrelevant indicators while the HTML panel is open.
- Reduced motion: static indicators without idle float/pulse.

Technical plan: attach visual indicators to stable anchors and track them correctly as the camera rotates. Handle mobile label spacing and overlap where practical. Keep hotspot interaction logic separate from indicator rendering and reuse the existing drag/click threshold. Avoid unnecessary per-frame DOM work and heavyweight glow/postprocessing. Provide equivalent semantic HTML navigation and keyboard focus, independent of WebGL picking. Preserve the planned Contact flip and accessible destination-panel architecture; neither is implemented in this Phase 2 refinement.

## Remaining phases

- Phase 3: indicators, five hotspots, focus/return, accessible panels and confirmed content, bike Easter Egg. Requires approval and remains pending.
- Phase 4: Blender assets, including refined keyboard/mouse; editable sources and optimised GLBs. Other workstation props remain unfinished; this PC milestone does not complete Phase 4.
  - Guitar spotlight refinement: the two existing spots were re-aimed lower and softened without adding lights, shadows, dependencies, or changing intro timing. TypeScript, ESLint, isolated production build, desktop/mobile runtime, refresh, and reduced-motion checks passed. Matched 1008×503 baseline/final captures were taken; visual review remains pending.
  - Right-wall cycling triptych: three approved WebP panel assets are loaded directly as textures on matte framed panels, with no generated artwork or new lighting. The left and center photos and right typography poster are mounted at `[2.5825, 1.82, -0.225]`, facing into the room. Each print is approximately 0.37 × 0.535 m with 0.015 m gaps; the outer row width remains about 1.17 m to keep all panels visible in Home. TypeScript, ESLint, isolated production build, and production browser smoke checks at Home and bike-focused Free Look passed; no runtime errors were observed. Captures are attached to the review handoff; visual review remains pending.
- Phase 3 Hotspots and final performance/accessibility audits remain pending.
  - Gaming PC tower — **Implemented / Technically Validated; Visual Approval Pending**. Replaced the procedural placeholder with `public/models/pc-balanced.glb`, credited to fakiAZer under CC BY 4.0. The GLB is 342,764 bytes / 26,483 triangles. Its measured unscaled bounds are approximately 0.200 × 0.450 × 0.395 m; uniform scale 1.25 gives approximately 0.250 × 0.563 × 0.494 m. Desk-local transform is `[1.14, 0.795, -0.06]`, yaw `π`, scale `[1.25, 1.25, 1.25]`; its model origin is at the feet, so Y matches the desk surface at 0.795 m. Two front rotors and four rear/top rotors use validated independent GLB pivots and local-Z rotation, while rings and housings remain stationary. Authored front-blue and internal emissive materials are driven by the shared PC intro-light channel; reduced motion leaves the powered-on fans static. TypeScript, ESLint, production build, HTTP 200/size, production browser entry/refresh/reduced-motion, Free Look and football-control checks passed. Review screenshots are attached to the handoff. The supplied GLB has cyan/violet internal RGB and no dedicated green material; source materials were not altered. Visual approval remains pending. See [pc-balanced.md](./pc-balanced.md) for hierarchy, behavior and validation details.
  - RGB keyboard — **Implemented / Technically Validated; Visual Approval Pending**. Replaced the procedural placeholder with the user-provided FBX converted to `public/models/mechanical-rgb-keyboard-optimized.glb`. Final file is 86,852 bytes (below the 100 KB target), with 9,168 triangles and measured model bounds of approximately 0.430 × 0.037 × 0.131 m. It retains the `Board` and `keys` nodes, authored base-color/emissive/normal maps, and board metallic-roughness map; seven maps are WebP at 256 × 256. Geometry uses Draco compression and simplification. The keyboard is placed at workstation-local `[-0.42, 0.809, 0.2]` with uniform scale `1.3`, giving scene dimensions of approximately 0.559 × 0.048 × 0.170 m while remaining within the mousepad. Its emissive materials follow the existing `monitors` channel in the shared intro timeline; no additional timeline or real-time lights were added. TypeScript, ESLint, production build, GLB validation, HTTP 200, and browser rendering passed with no runtime errors. The GLB validator reports non-fatal tangent-space warnings and does not validate Draco itself; browser loading was confirmed. Source author/license details were not present in the provided archive, so attribution remains unresolved. Visual approval remains pending. See [rgb-keyboard-v1.md](./rgb-keyboard-v1.md) for optimization, integration and validation details.
  - RGB mouse — **Implemented / Technically Validated; Visual Approval Pending**. Replaced the workstation box placeholder with a lightweight procedural gaming-mouse form using a rounded shell, separate click surfaces, scroll wheel, side-button hint and emissive wheel/side accents. No external model, additional lights, dependencies or per-frame animation were introduced. The accents follow the existing `monitors` startup channel, powering on with the keyboard. Desk-local position is `[0.2, 0.797, 0.23]`, with the shell resting on the mousepad. The chair placement was corrected to a natural, centered workstation seating position; PC Tower visibility is intentionally deprioritized and chair occlusion is acceptable. The swivel behavior remains unchanged. TypeScript, ESLint, production build and production browser smoke checks passed. Screenshots are attached in the milestone docs. See [rgb-mouse-v1.md](./rgb-mouse-v1.md) and [gaming-chair-v1.md](./gaming-chair-v1.md) for implementation and review evidence.
  - Gaming chair placement correction — **Implemented / Technically Validated; Visual Approval Pending**. Centered the chair from measured keyboard/monitor world positions, moved it closer to the desk, and set its default root yaw to face the monitors while preserving the independent swivel pivot and controls. PC Tower visibility is explicitly deprioritized in favor of natural seating. Home-camera and side-angle evidence are in `artifacts/gaming-chair-placement-v2/`; visual approval remains pending. See [gaming-chair-v1.md](./gaming-chair-v1.md).
- Phase 5: asset integration, camera/light/material polish and optimisation.
- Phase 6: production, accessibility, SEO, device/browser and performance audits.

Each phase stops for review. Browser captures, actual checks, changed files and limitations accompany the Phase 2 cinematic handoff.
