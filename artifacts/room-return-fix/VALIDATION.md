# Room return and React root lifecycle fix - 2026-10-27

## Root causes

The user-provided development overlay identified InteractiveChair's Drei `Html`. The installed Drei implementation creates a separate ReactDOM root in a layout effect and synchronously unmounts it during effect cleanup. Removing those nested roots addresses that mechanism rather than deferring cleanup with timers or suppressing React diagnostics. The original warning is evidenced by the supplied screenshot/source path; the new automated runs validate the replacement rather than claiming an automated pre-fix reproduction.

The return path immediately navigated away from the gallery. RoomPreview then rendered an opaque `.room-return-cover` while the dynamic Canvas loaded, models compiled, and a hidden 1.15-second camera restoration ran. The cover itself was the visible black interval. There was no retained gallery visual across the route boundary.

## Fix

- New `RoomLabel` creates/removes ordinary DOM elements, projects their existing scene anchors with the existing R3F loop, and updates their classes without creating a ReactDOM root. Chair hover text and the football's real keyboard-operable button remain. Existing swivel physics, raycasts, football physics and gesture handling are unchanged.
- `retainGalleryForReturn` captures a static gallery clone before router navigation. GalleryLiquid draws once on a synchronous capture event; its canvas is copied into a bitmap image and replaced in the clone. The retained tree is inert and aria-hidden, contains no live renderer, and is removed after the handoff.
- The room compiles/renders behind that still, restores the saved pose (or approved Home fallback) immediately, then starts a compositor-only 450 ms opacity crossfade. This is an animation duration, not an arbitrary loading delay. Actual scene readiness and completed camera restoration gate the fade. Reduced motion skips the fade.
- Free Look and existing prop interactions remain disabled until the fade completes. Canvas focus returns through the normal exploration effect after its input handlers are installed. No developer boot replay occurs on return.
- Camera Euler values are stored canonically in YXZ order; exploration normalizes the camera's rotation order and invalidates a frame. This preserves orientation across repeated mounts and avoids mixing a fresh camera's default XYZ order with Free Look's YXZ values.
- Browser history returns also retain the gallery; navigation to another destination or a room-rendering failure clears the retained visual. Unmount cancels the reveal animation. Back to Room remains the only return action. No Projects floating label was added.

## Changed source files

- `components/canvas/RoomLabel.tsx` (new).
- `components/canvas/InteractiveChair.tsx`, `components/canvas/Football.tsx` (replace Html labels only).
- `lib/gallery-handoff.ts` (new).
- `components/ui/RouteHandoff.tsx` (new), `app/layout.tsx` (stale-handoff cleanup across routes).
- `components/work/ProjectsGallery.tsx`, `components/work/GalleryLiquid.tsx` (capture before return, synchronous bitmap copy).
- `components/ui/RoomPreview.tsx`, `components/canvas/RoomCanvas.tsx`, `components/canvas/CameraRig.tsx` (readiness gate, immediate covered restoration, canonical rotation).
- `app/globals.css` (remove black return cover; retained snapshot stacking).
- `docs/implementation-plan.md` (milestone and validation record).

Next dev also generated `AGENTS.md` automatically; no dependencies were added or changed.

## Validation

- TypeScript: PASS.
- ESLint: PASS, zero warnings.
- Isolated production build (`NEXT_BUILD_DIR=.next-projects-review`): PASS.
- Development Chrome/SwiftShader: 30 assertions PASS, three complete native monitor-click/Back-to-Room cycles, no runtime errors or root-unmount warning.
- Production Chrome/SwiftShader: 16 assertions PASS, including the complete return path and native chair/football controls; no runtime errors.
- Verified retained gallery immediately after click, locked input during restoration, native crossfade observation, exact saved camera values (within 1e-9), one room canvas after return, restored keyboard Free Look, and no repeated boot.
- Native chair hover/drag still swivels. Native Enter on the visible football action still kicks the ball. Direct `/work` returns to approved Home without boot. Browser Back/Forward leaves no stale overlay.
- Harness waits for client hydration before native clicks on direct URL entry, waits for Free Look damping before comparing captured values, and uses actual Enter key codes for native button activation.
- Development used the existing font fallback because the sandbox could not fetch Google Fonts. That server warning and upstream Three.js deprecation/SwiftShader-extension warnings were not suppressed. Production build succeeded with the existing font setup.

## Evidence and limits

`development-report.json` and `production-report.json` contain assertions, sampled overlay opacity/input mode/readiness states and expected/restored camera values. Screenshots are from the production run:

- `01-original-room-pose.png`: room exploration before monitor entry.
- `02-retained-gallery-during-room-load.png`: gallery still covers room preparation instead of a black screen.
- `03-restored-room.png`: restored room after the handoff.

These are emulated/headless Chrome checks, not a physical mobile or cross-browser performance certification. Snapshot retention lasts until real readiness; unusually slow asset loading may show a still longer. Visual approval remains PENDING. Overall Phase 3 remains incomplete.
