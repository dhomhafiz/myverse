# Phase 2 developer boot sequence refinement

Verified 23 October 2026 against the production preview at http://127.0.0.1:3004/.

## Checks

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed with zero warnings.
- `npm.cmd run build`: passed.
- 16 actual-browser assertions passed; no runtime exceptions or console errors. See `browser-report.json`.
- SHA-256 comparison: all `components/canvas/*.tsx` files and `lib/room-config.ts` are unchanged from before this refinement. The 3D room, camera and Free Look implementation are preserved.
- No new dependencies or Phase 3 work.

## Sequence captures

1. `01-initializing-typing.png`: partial command and partial SVG trace; scene still pending, bar 0/3, entry disabled.
2. `02-initializing-trace.png`: later trace extent and completed command; the same real request remains pending. Animation time does not increase readiness.
3. `04-ready.png`: real scene checks complete, live rows show OK and entry is enabled.
4. `05-cached-ready-animation.png`: cached navigation remains responsive, with no animation gate on entry.
5. `06-entry-transition.png`: keyboard-activated entrance dissolving into the existing room.
6. `07-room-unchanged.png`: room after entry.
7. `08-mobile-terminal.png`: 390 × 844 layout and reachable CTA.
8. `09-reduced-motion.png`: full command/trace, static cursor and no decorative drawing/typing.

## Terminal visual follow-up

- `10-terminal-initializing.png`: partial typed command, 0% readiness, and disabled entry.
- `11-terminal-loading-progress.png`: captured during the real loading-to-ready transition at 81%; the visual fill is catching up and the enabled entry does not wait on it.
- `10-ready-terminal.png`: all three real checks complete, all `[OK]` rows visible, 100% fill and enabled entry.
- The readiness indicator uses ten compact rounded segments inside a slim capsule outline, retaining the original green accent. Terminal and graph label fonts are slightly larger on desktop and mobile.
- Final `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build` all passed. Browser checks verified a single CTA, hover glow, visible keyboard focus, pressed feedback, reduced-motion behavior, and a 390 × 844 layout without horizontal overflow.

The real renderer/compilation stages are quick on this machine. Their actual `INITIALIZING → LOADING → READY` transitions and 0 → 2 → 3 progress mutations are recorded in `browser-report.json`; no screenshot is mislabelled as a prolonged LOADING stage. Captures were taken over time in the real browser, rather than generated from static mockups.

## Test method and limits

Headless Google Chrome with software WebGL. The external harness holds the actual dynamic scene-bundle request to reproduce pending loading while the boot UI animates. Application readiness is not mocked, and the application contains no artificial load-completion timer. The harness then releases the request and observes compilation/first-frame readiness, cached navigation and keyboard entry. Browser CSS media emulation verifies reduced motion, and viewport emulation verifies mobile layout without horizontal overflow.

The graph is an original decorative initialization signal. It is not telemetry, a performance benchmark or machine-learning training data. The progress bar and status labels use the existing real readiness events.

Remaining limits: mobile testing is viewport emulation, not a physical device; no FPS or cross-browser claim. Cached/fast visits may show intermediate states only briefly, intentionally avoiding a forced wait. No Phase 3 hotspots or Blender assets were implemented.

## Cinematic hero typography refinement

- The normal-motion sequence was activated in the browser and sampled every 20 ms (247 samples). The observed order was `closeup → lighting → pullback → home → hero → collapse → exploring`.
- Live reveal values reached 0.42 chroma opacity and 24 displacement units at peak. Displacement and chroma returned to 0 before the caption appeared; the title then entered the existing collapse stage and settled into persistent branding.
- With `prefers-reduced-motion: reduce`, the entrance CTA still reached `exploring`; displacement and scanlines remained at 0, and the persistent subtitle appeared.
- At a 390 × 844 emulated viewport, the persistent title remained within the viewport (left 20 px, bottom 47 px), Work Sans loaded at weight 800, the caption was 18 px, and document width remained 390 px. At a 1280 × 800 emulated viewport, computed typography also used Work Sans; the caption was 24 px.
- The new block cursor blinked with the 1 s CSS cycle (visible/hidden states observed) on desktop (1008 × 503) and mobile (390 × 844). Its baseline offset was 2.41 px on desktop and 0.80 px on mobile; mobile text-to-cursor gap was 2.58 px with no horizontal overflow.
- Cursor blinking began with the caption reveal and stopped when the collapse stage began. The measured blink-start-to-collapse interval was 1.75 s on desktop and 1.79 s on mobile, matching the existing reveal interval plus the requested 1.2 s hold extension.
- The name-collapse tween ran for 48 samples and completed at the persistent brand anchor; the final cinematic step was `exploring`. With reduced motion enabled, the visible cursor stayed static (`animation-name: none`, opacity 1), displacement and scanlines remained at 0, and entry still reached `exploring`.
- The browser's screenshot capture is constrained to a 600 × 375 physical viewport even when a larger CSS viewport is emulated. Consequently, the following are browser-rendered, parameter-matched visual snapshots—not exact captures of transient animation frames. Live transition timing and peak values were verified separately:
  1. `hero-01-reveal.png` — reveal styling.
  2. `hero-02-peak-crt.png` — peak CRT styling using the measured 0.42 chroma and 24 displacement values.
  3. `hero-03-settled-title.png` — settled title.
  4. `hero-04-caption.png` — settled title with the enlarged caption.
  5. `hero-05-name-collapse.png` — intermediate collapse composition.
  6. `hero-06-persistent-brand.png` — persistent brand.
- Mobile typography and overflow were verified through computed browser layout values; the capture utility did not preserve the emulated mobile viewport well enough to include a reliable mobile screenshot.
- No browser runtime exceptions were observed. The existing `THREE.Clock` deprecation and Work Sans preload warnings remain.

## Changed files

- `components/ui/BootScreen.tsx`: GSAP typing/cursor/log reveal, live status and progress, entry availability.
- `components/ui/BootGraph.tsx`: lightweight original SVG signal.
- `components/ui/RoomPreview.tsx`: pass the existing reduced-motion preference into the boot UI.
- `components/ui/HeroBrand.tsx`: accessible hero title, caption, decorative CRT layers, and hidden-from-assistive-tech cursor.
- `hooks/useEntranceTimeline.ts`: distortion reveal/settle stages, cursor lifecycle, and extended hold before the existing title-collapse transition.
- `app/globals.css`: terminal window, graph, progress, responsive/reduced-motion styles, and cursor blink animation.
- `README.md`: implementation and validation notes.
- `artifacts/phase2-boot-refinement/`: browser screenshots and reports.
