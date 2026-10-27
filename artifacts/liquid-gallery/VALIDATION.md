# Full-page gallery liquid validation - 2026-10-27

Scope: Task 3 full-viewport liquid visual layer only, plus the gallery sizing needed to keep viewport UV coordinates coherent. No bedroom, case-study, project-data or navigation-state files were changed in this refinement. Back to Room remains the only exit action. The earlier room-return blackout and Drei root-lifecycle investigation are separate, unresolved work; this validation does not claim to fix either.

## Implementation

`components/work/GalleryLiquid.tsx` renders one fullscreen quad with one Three.js renderer and one displacement shader. The shader composes the atmospheric charcoal backdrop, low-contrast depth bands, featured media, frame and soft shadow in shared viewport UV coordinates. The same displaced UV samples background and media, so waves cross the image boundary continuously. Up to 12 pointer impulses overlap, with an expanding radial wave packet, exponential temporal decay and bounded refraction. There are no decorative ring DOM elements, postprocessing targets, particles or extra shadow maps.

HTML titles, categories, descriptions, technology labels, counters, navigation, image link hit areas and placeholder typography remain in a separate layer above the canvas. No global filter or HTML snapshot is used. Removed the previous image-link transforms and moving cursor text so UI stays stationary. Project entry/switching fades remain; they no longer translate content.

The existing authorized placeholder artwork is used; no real Netflix screenshot is present. Configured `project.image` sources can load as textures with cover-fit UVs; failed/pending loads retain the DOM media fallback. This real-image path was source reviewed but not browser exercised because current project records have no images.

## Performance and lifecycle

- Two triangles per draw, 12 fixed-size impulse uniforms, at most 1.25 device pixel ratio; passive pointer input is sampled at most every 45 ms and after 4 px movement.
- No pointer-driven React state updates; one demand-driven requestAnimationFrame chain renders only while waves are active (up to 2.8 seconds after movement), or once for layout/media updates. Resize buffer allocations occur only when viewport dimensions change. Browser visibility changes clear waves and stop drawing.
- Project switching resets impulses and updates texture/accent without recreating the renderer. Version checks dispose stale asynchronous textures.
- Exit removes observers/listeners/RAF work and disposes textures, material, geometry and renderer, then explicitly releases the WebGL context.
- Touch/coarse-pointer and reduced-motion modes create no gallery WebGL renderer. Creation failure, shader failure, or context loss keeps/restores static DOM content. The canvas has pointer-events:none and is aria-hidden.
- One new renderer is a deliberate gallery-only cost relative to the prior DOM gallery. Software WebGL tests establish behavior, not real-device GPU FPS, battery impact, or zero performance regression.

## Layout

The previous gallery had a 760 px minimum height plus fixed content spacing. The gallery now has a 100dvh flex shell with min-height:0; header/footer remain visible and the middle grid has a deliberate keyboard/touch-scrollable overflow region when content does not fit. No global body overflow rule was added. Case-study scrolling remains unchanged.

## Results

- `npm.cmd run typecheck`: PASS.
- `npm.cmd run lint`: PASS, zero warnings.
- `NEXT_BUILD_DIR=.next-projects-review npm.cmd run build`: PASS.
- Production headless Chrome with SwiftShader: 21 assertions PASS. Full results, DOM geometry, draw counts, and browser performance counters are in `browser-report.json`.
- Netflix first; mouse input beyond the image starts rendering; pixel differences confirm background and media respond; title/description/navigation/media-link bounds and transform/filter values remain unchanged.
- Previous/Next and keyboard ArrowLeft work; clicking the featured link opens `/work/netflix`; the case study has no liquid canvas. Re-entry creates a clean gallery; switching keeps one context; route exit releases it.
- Zero gallery runtime exceptions or console errors in normal operation. Forced WebGL unavailability emits the expected Three.js creation diagnostic, recorded separately in `expectedFallbackErrors`.
- 1366x768, 1920x1080, and 390x844: no document overflow. Mobile navigation remains in view; its internal content scroll and featured link were exercised.
- Reduced-motion preference changes destroy the canvas and restore static media; touch creates no canvas. Forced unavailable WebGL also leaves usable static artwork and controls.
- Resting draw calls over a 350 ms interval: 0. After decay, a further 200 ms interval also produced 0 draws. These are draw-call observations, not hardware frame-rate measurements.

## Visual evidence

- `01-gallery-rest.png`: desktop baseline.
- `02-background-wave.png`: impulse outside the featured image.
- `03-liquid-across-media.png`: overlapping waves over the media visual layer.
- `04-next-project.png`: switched project.
- `05-gallery-1920.png`: large desktop layout.
- `06-reduced-motion.png`: static fallback.
- `07-mobile-gallery.png`, `08-mobile-internal-scroll.png`: mobile layout and internal scrolling.
- `09-no-webgl-fallback.png`: failed-WebGL fallback.
- `liquid-motion.mp4`: 24 actual Chrome screenshot frames, encoded at 10 fps for visual review; not a real-time performance recording.

Visual approval: PENDING. Overall Phase 3 remains incomplete.
