# Phase 2 cinematic refinement validation

Implemented Parts A–D of the supplied cinematic entry specification. Part E hotspot requirements are documented only in `docs/implementation-plan.md`. Phase 3 has not started. No dependencies were added.

## Verification

- `npm.cmd run typecheck` — passed.
- `npm.cmd run lint` — passed without warnings.
- `npm.cmd run build` — passed.
- Actual headless Chrome production-browser run: **78 assertions passed, zero runtime errors**. See `browser-report.json`.
- Desktop and mobile entry, lighting progression, exact final Home position/direction/FOV, restored original light intensities, semantic heading continuity, persistent brand placement, cleared blur/scanlines, resumed mouse/touch exploration, Skip, Escape, reload, resize and reduced-motion changes were exercised.
- Initial reduced motion uses a short simplified reveal without camera travel or visual distortion.
- Camera geometry check: 21 samples each at desktop 1440×900, mobile 390×844 and mobile 360×800. Both monitors remain entirely in frame, and the camera remains at least 5 cm clear of mesh bounds. See `camera-path-check.txt`.
- Pre/post SHA comparison confirmed no changes to protected room geometry and boot sources: `Workstation.tsx`, `PlaceholderRoom.tsx`, `PersonalProps.tsx`, `BootScreen.tsx`, `BootGraph.tsx`. Room configuration and phone placement were preserved.

## Actual browser captures

These are screenshots from running the production application in Chrome, sampled across real replays to capture the short stages reliably. The production timeline was not paused or artificially delayed for capture.

1. `01-closeup-lamp-off.png` — dark dual-monitor workstation close-up.
2. `02-lighting-activation.png` — monitor/PC glow and warm lamp activation.
3. `03-home-arrival.png` — approved Home arrival before the hero name.
4. `04-name-and-hello-world.png` — large name and exact supporting caption.
5. `05-name-collapsing.png` — same heading compressing/travelling toward its anchor.
6. `06-clear-room-persistent-brand.png` — clear room, smaller persistent brand and exploration hint.
7. `07-mobile-closeup.png` — portrait close-up.
8. `08-mobile-name-and-caption.png` — portrait hero without horizontal overflow.
9. `09-mobile-persistent-brand.png` — portrait final state.
10. `10-reduced-motion.png` — simplified final reveal.

## Changed files

- `lib/entrance.ts` — configurable entrance poses and shared numeric motion channels.
- `hooks/useEntranceTimeline.ts` — coordinated GSAP sequence, safe completion and accessibility paths.
- `components/ui/HeroBrand.tsx` — single semantic heading, caption and measured persistent anchor.
- `components/ui/RoomPreview.tsx` — entrance coordination and UI state.
- `components/canvas/CameraRig.tsx` — apply cinematic channels through the existing authoritative rig; preserve exploration behavior.
- `components/canvas/RoomCanvas.tsx` — connect shared motion/invalidation and existing light names.
- `components/canvas/SceneLighting.tsx` — animate and restore existing emissive materials and lights.
- `app/globals.css` — hero, temporary treatment, persistent brand and skip control styling.
- `app/page.tsx` — fresh entrance state when the review view changes.
- `docs/implementation-plan.md` — current Phase 2 plan and deferred Phase 3 indicator specification.
- `README.md` — updated entrance architecture and review instructions.
- `artifacts/phase2-cinematic/` — screenshots and validation evidence.

## Remaining limitations

Browser verification used Chrome with software WebGL and emulated mobile viewports. Physical-device frame rates and other browsers have not been measured. Condensed typography uses system fonts, so its appearance can vary by operating system. Room assets remain the approved placeholders. The normal cinematic lasts approximately 4.18 seconds and can be skipped immediately; reduced motion settles in approximately 0.12 seconds.

Stopped for review before Phase 3.
