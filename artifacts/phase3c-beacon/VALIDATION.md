# Phase 3C - Left-monitor downward-arrow beacon

Implemented 2026-10-27. Technical validation PASS. Visual approval PENDING. Proof of concept is limited to the LEFT monitor; overall Phase 3 remains incomplete.

## Implementation

`HotspotIndicator` is reusable through target object, anchor object, local position, caption, active state, reduced-motion state and activation callback. It uses the same native DOM ownership pattern as RoomLabel; there are no Drei Html instances, ReactDOM roots, portals, new renderers or added dependencies.

Projects config: target `monitor_left`, anchor `screen_left_anchor`, anchor-local offset `[0, 0.48, 0.04]`, caption `View My Works`, existing `onOpenProjects` callback. The offset puts the arrow slightly above the monitor and keeps its circle clear of the screen on desktop and portrait mobile.

- 34px dark translucent circle inside a 44px native button. Ice-white/cyan outline, soft restrained glow, inline SVG arrow with rounded joins and stroke ends. No idle text.
- CSS idle float is +/-2px with gentle breathing. Hover or keyboard focus increases brightness/scale and reveals a compact caption; its side flips near the right viewport edge. Caption accepts no pointer input.
- Existing direct monitor hover also activates the caption/edge cue. Temporary cyan EdgesGeometry outlines only the first monitor frame mesh, without mutating authored materials, lights, shadows or geometry. It is hidden at rest, and its geometry/material are disposed on deactivation.
- A native 130ms press animation finishes before invoking the existing cinematic callback. Repeated activation is guarded; dragging/cancellation does not activate. Reduced motion skips this animation and disables idle/transition motion.
- The existing R3F frame projects the anchor against CameraRig's current transform, explicitly updating the camera matrix to avoid stale-frame placement. No React state is updated by idle animation or projection. The button is hidden when outside the view, instead of clamping a misleading indicator onto the screen edge.
- Only the button's 44px area accepts pointer input. It is a real keyboard/touch-accessible button; it is absent during boot, cinematic entry, project camera travel and gallery navigation. Native elements and animation are removed on cleanup, with no separate root lifecycle. Existing camera, chair, football, room-return handoff and gallery shader behavior were not redesigned.

## Changed files

- `components/canvas/HotspotIndicator.tsx` (new reusable indicator).
- `components/canvas/ProjectsHotspot.tsx` (connect monitor hover and existing entry callback).
- `components/canvas/RoomCanvas.tsx` (pass existing reduced-motion preference).
- `app/globals.css` (scoped beacon appearance and reduced-motion rules).
- `docs/implementation-plan.md` (milestone and validation).

## Validation

- TypeScript PASS; ESLint PASS with zero warnings; isolated production build PASS (`NEXT_BUILD_DIR=.next-projects-review`).
- Production Chrome/SwiftShader: 35 assertions PASS, zero errors. Three mouse-beacon room/gallery round trips plus native keyboard entry and touch entry. Netflix remains first and exactly one clean beacon returns after each visit.
- Development Chrome/SwiftShader: 25 assertions PASS, zero errors/root lifecycle warnings. Repeated mouse, keyboard and touch entry/return paths exercise development cleanup.
- Verified absence during boot/cinematic, idle caption hidden, Home/Free Look/return/mobile projected alignment within 1 CSS pixel, 44px hit area, hover caption/cursor and left-monitor edge visibility, original monitor hover sharing that cue, beacon removal during entry, and no duplicate indicators after return.
- Fresh 390x844 mobile entry uses the portrait camera; native touch tap enters Projects. Reduced motion removes both float and breathing. No horizontal/vertical document overflow.
- Runtime source still uses the original native monitor click handler and camera entry callback. No other object gets an indicator. Gallery/case-study sources are unchanged in this phase.

Evidence: `production-report.json`, `development-report.json`, desktop idle (`01-home-idle.png`), hover (`02-beacon-hover.png`), Free Look (`03-free-look-anchor.png`), mobile (`04-mobile-idle.png`), and reduced motion (`05-reduced-motion.png`). Additional development captures are in `development/`.

Limits: Chrome is headless with software WebGL and emulated viewport/touch. Physical-device and cross-browser performance remain unverified. No zero-regression performance claim is made. Visual approval awaits the user; other beacon targets remain pending.
