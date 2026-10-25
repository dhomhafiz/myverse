# Phase 2 — Entrance and Camera

Verified on 23 October 2026 against the production build at http://127.0.0.1:3003/.

## Result

- `npm.cmd run lint`: passed, zero warnings.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed.
- Production preview HTTP: 200.
- 19 browser assertions passed; details in `browser-report.json`.
- No runtime exceptions or console errors in normal entry, mouse, keyboard, touch or reduced-motion scenarios.
- Deliberately disabling WebGL produced three expected context-creation/error-boundary console records. The accessible fallback appeared and the page remained usable.
- Context-loss fallback and retry both passed. JavaScript-disabled introduction also passed and was visually inspected.

## Browser tests

Headless Chrome with software WebGL; desktop 1440 × 900 and mobile emulation 390 × 844. Tests use actual CDP keyboard, mouse and touch input. The isolated headless browser uses a temporary profile, leaving the user's normal browser profile alone.

Checked: real readiness and exactly one enabled entrance CTA; keyboard focus/activation; `ready → entering → exploring`; focus transfer to Canvas; clicks and sub-threshold motion leave orientation unchanged; mouse drag changes the view; repeated large drags stop at yaw/pitch boundaries; arrow-key rotation; Home reset; touch entry/swipe; no mobile page scrolling or width overflow; reduced-motion preference and near-immediate entry (106 ms in the final run); context loss/retry; unavailable WebGL; no JavaScript.

Home starts at the approved Phase 1 pose. Both bike screenshots were reached with mouse/touch from that same fixed exploration position on `/`. They do not use `?view=bike`. The bike's full silhouette is visible in both screenshots. Home deliberately retains partial bike cropping. Object positions, geometry and naming are unchanged from approved Phase 1.

## Screenshots

- `boot-ready.png`: desktop terminal and single entrance CTA.
- `entrance-transition.png`: terminal dissolve over the room reveal.
- `home-desktop.png`: approved Home composition after entry.
- `bike-free-look-desktop.png`: full bike reached by mouse drag.
- `boot-mobile.png`, `home-mobile.png`: mobile entrance and room.
- `bike-free-look-mobile.png`: full bike reached by touch swipe.
- `reduced-motion-home.png`: reduced-motion entry result.
- `webgl-context-loss.png`, `webgl-unavailable.png`: semantic fallback and retry.
- `javascript-disabled.png`: server-rendered introduction without JavaScript.

## Changed files

| File | Change |
| --- | --- |
| `app/page.tsx` | Delegate entrance/room UI to the client experience shell. |
| `app/layout.tsx` | Update Phase 2 preview metadata; retain noindex. |
| `app/globals.css` | Terminal, entry CTA, dissolve, focus styling, gesture cursor, hint, reduced-motion and fallback styles. |
| `components/ui/RoomPreview.tsx` | Entrance state, accessibility focus handoff, error boundary and no-JS fallback. |
| `components/ui/BootScreen.tsx` | Real readiness log, Drei loading information, one entry CTA. |
| `components/ui/RoomUnavailable.tsx` | Semantic introduction and retry on renderer/context failure. |
| `components/canvas/RoomCanvas.tsx` | Wire entrance, rig, readiness and lighting. |
| `components/canvas/CameraRig.tsx` | Authoritative GSAP entrance offsets and fixed-position damped Free Look with mouse/touch/keyboard input and bounds. |
| `components/canvas/SceneReadiness.tsx` | Actual compilation/first-frame readiness and context-loss handling. |
| `components/canvas/SceneLighting.tsx` | Reveal warm/blue lights and emissive materials. |
| `hooks/useReducedMotion.ts` | Subscribe to the user's motion preference. |
| `lib/room-state.ts` | Small state types, camera bounds and drag threshold. |
| `lib/room-config.ts` | Update review-pose comment only; no scene placements changed. |
| `README.md` | Current run instructions, controller contract, readiness behaviour, tests and limits. |
| `artifacts/phase2/` | Actual browser screenshots, report and this handoff. |

No dependency changes. No hotspots, destination panels, Blender modeling, Lenis or ScrollTrigger.

## Limitations

The touch viewport is emulated, not a physical mobile-device test. Software WebGL captures do not establish hardware FPS or cross-browser performance. Confirmed portfolio content and the complete semantic portfolio fallback remain Phase 3 work. Phase 2 is ready for review; no Phase 3 work has begun.
