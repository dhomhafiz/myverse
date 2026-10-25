# Gaming chair asset and swivel interaction

The room's `gaming_chair` uses `public/models/gaming-chair-all-black-swivel-compact.glb`. The optimized, all-black swivel-ready model replaces the earlier static chair asset. Its source bounds are approximately 0.740 × 1.200 × 0.694 m. The model's local `-Z` is its forward direction.

## Model hierarchy

- `chair_swivel` contains the seat, backrest, and armrests. Its local Y-axis is the rotation pivot.
- `chair_base` contains the wheels, legs, and lower gas lift. It remains stationary during swivel interaction.

The model nodes are resolved by name. If either required node is absent, the interaction is disabled with a warning rather than throwing. PBR materials and textures are cloned for the hover highlight; the model remains all-black.

## Controls and behavior

- Hover over the upper chair body to show a subtle highlight and “Give it a spin” label.
- Drag horizontally on the upper body to rotate it through repeated full turns. Vertical pointer movement does not tilt the chair.
- The chair claims upper-body pointer gestures before Free Look. Gestures beginning on the base or elsewhere remain available to Free Look.
- Normal-motion mode applies capped, damped inertia after release and preserves the final angle. Reduced-motion mode applies direct rotation without inertia.
- Mouse and touch ownership are released on pointer up/cancel, lost capture, blur, and component unmount. Mobile canvas touch handling uses the existing `touch-action: none`.

## Attribution

"Gaming chair" by Vlad  
[https://skfb.ly/oE8u7](https://skfb.ly/oE8u7)  
Licensed under Creative Commons Attribution 4.0  
[https://creativecommons.org/licenses/by/4.0/](https://creativecommons.org/licenses/by/4.0/)

The supplied model has been optimized and recoloured all-black.

## Validation

- TypeScript, ESLint, and the production build passed. The build ran from an isolated copy with a separate Turbopack root, leaving the shared development server's `.next` cache untouched.
- Browser loaded the swivel-ready GLB with HTTP 200; the actual transfer was 157,416 bytes, matching the asset file size. The cinematic reached the interactive room without uncaught page errors.
- Reduced-motion mouse drags covered approximately 90°, 180°, and 360°; the capture-phase owner class confirmed chair-only gestures. The stationary base's lower wheel region remained pixel-identical across the rotation screenshots.
- Base and off-chair drags activated Free Look without activating chair rotation. Home reset remained available.
- Portrait touch emulation rotated the swivel through a touch pointer; `is-chair-dragging` was active while `is-dragging` was not. Pointer ownership cleared on release.
- Normal-motion screenshots show additional rotation after release, then an unchanged settled pose, with no automatic return.
- The shared entrance timeline animates the root chair position and yaw alongside workstation power-on. Reduced-motion and skipped/finished entrance states apply the target pose directly; the existing swivel behavior remains independently owned by the chair's internal pivot.
- Production browser smoke test reached the interactive room with the new startup move and no page errors. Existing TypeScript, ESLint, and production-build checks passed after the change.
- The browser environment emitted software-WebGL shader warnings and the existing `THREE.Clock` deprecation and focused-canvas `aria-hidden` warnings. No uncaught JavaScript errors were reported.
- The updated production Home view confirms the centered startup pose faces the workstation. The chair hover target still activates at its new position.

## Chair placement correction — visual review pending

- Workstation world geometry: the desk root is `[0, 0, -1.65]`; its front edge is at Z `-1.23`. The keyboard center is `[-0.42, 0.809, -1.45]`; the two monitor centers are at X `-0.66` and `0.25`, with pair center X `-0.205`.
- The chair is centered at X `-0.31`, midway between the keyboard and monitor-pair centers. Its room-entry pose is `[-0.31, 0, -0.46]`; it glides toward the desk to the Home pose `[-0.31, 0, -0.60]`. Both root yaws are `0` radians so model-local `-Z` faces the monitors and the backrest faces the Home camera.
- At the settled pose, the model's scaled front extent is approximately 0.382 m from its center, leaving about 0.25 m between the chair front and desk front edge. Uniform scale remains `[1.1, 1.1, 1.1]`; the chair's floor-level model normalization and carpet offset are unchanged.
- PC Tower visibility is intentionally deprioritized in favor of natural workstation seating; partial or full occlusion from Home is acceptable. The PC Tower and all other room objects are unchanged.
- The model, `chair_swivel` hierarchy/pivot, stationary `chair_base`, pointer controls, inertia, and reduced-motion behavior are unchanged. Default root yaw sets workstation-facing orientation without changing the independently controlled swivel angle.
- TypeScript, ESLint, and an isolated-copy production build passed. In the browser, a continuous drag rotated the swivel approximately 90° and 180° while `is-chair-dragging` was active and `is-dragging` remained inactive; the base stayed stationary. Free Look side-angle capture and Home-key camera reset also passed.
- Visual approval status: **Pending**.

## Visual evidence

- [Before: Home camera, previous chair placement](../artifacts/gaming-chair-placement-v2/01-before-home.png)
- [After: Home camera, corrected chair placement](../artifacts/gaming-chair-placement-v2/02-after-home.png)
- [After: side-angle chair-to-desk clearance](../artifacts/gaming-chair-placement-v2/03-side-angle.png)
- [Swivel approximately 90°](../artifacts/gaming-chair-placement-v2/04-angle-90.png)
- [Swivel approximately 180°](../artifacts/gaming-chair-placement-v2/05-angle-180.png)
- [Approximately 90°](../artifacts/gaming-chair-swivel-v1/02-angle-90.png)
- [Approximately 180°](../artifacts/gaming-chair-swivel-v1/03-angle-180.png)
- [Approximately 360°](../artifacts/gaming-chair-swivel-v1/04-angle-360.png)
- [Hover highlight and label](../artifacts/gaming-chair-swivel-v1/05-hover.png)
- [Inertia after release](../artifacts/gaming-chair-swivel-v1/07-inertia-start.png)
- [Damped settled pose](../artifacts/gaming-chair-swivel-v1/08-inertia-settled.png)
- [Stable resting pose](../artifacts/gaming-chair-swivel-v1/09-inertia-rest.png)

The corrected Home view, side-angle clearance view, and swivel checks are attached to the review handoff above.
