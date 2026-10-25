# Phone layout refinement

- Moved the phone beside the keyboard at desk-local `(-0.87, 0.8045, 0.2)` metres, outside the left edge of the mousepad.
- Screen faces down; rear camera module, three raised lenses and flash face up. The screen rests at desktop height 0.795 m.
- `phone` in `lib/room-config.ts` owns placement, scale, object name, Contact anchor and centre flip-pivot name. Root name remains `iphone_15_pro_max` and destination remains Contact (metadata only).
- The provisional Contact camera target derives from the configured phone and desk transforms. `contact_anchor` follows `iphone_flip_pivot`.
- Future flip plan is documented in README: lift for clearance, rotate local X by π, then settle using model bounds. No animation or hotspot handler is implemented.

Checks passed: TypeScript, ESLint (zero warnings), production build, and spatial checks in `spatial-check.txt`. Mousepad clearance is 4.07 cm; the phone does not intersect keyboard, mouse, mousepad, monitor arm, PC, plant or audio interface. The transformed Contact anchor exactly matches the configured target.

SHA-256 comparisons confirm that protected camera, boot and other scene files are unchanged. Comparing the workstation source outside the phone block confirms that all other geometry, including keyboard and mouse placeholders, is unchanged.

Changed application files: `lib/room-config.ts`, `components/canvas/Workstation.tsx`. Documentation: `README.md` and this validation record. No new dependencies, flip implementation or Phase 3 work.

This pass uses geometric verification and the required development checks; no new browser screenshot is claimed.
