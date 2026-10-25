# Guitar-wall track light

`public/models/guitar-wall-two-spot-track-light.glb` is a procedural, low-poly, two-head LED track light. The GLB contains one mesh with two material primitives: matte-black housing and warm emissive lenses. It uses no textures. Its dimensions are approximately 0.98 × 0.205 × 0.157 m, with 426 vertices and 532 triangles.

`room.guitarTrackLight` places the rail at `[-1.87, 2.8, -1.98]`, flush to the room ceiling and parallel to the back wall. The two heads align with the guitar centres and angle toward the wall. Their warm spotlights and emissive lenses follow the floor-lamp lighting channel: they remain off during the close-up and fade on as the camera pulls back.

## Guitar spotlight refinement

The existing spots were adjusted to carry a little more light down each guitar while keeping the headstocks visible and softening the wall pools. The track, guitars, hangers, and intro choreography are unchanged.

| Setting | Previous | Final |
| --- | --- | --- |
| Left target (track-local) | `[-0.23, -1, -0.42]` | `[-0.23, -1.3, -0.3]` |
| Right target (track-local) | `[0.23, -1, -0.42]` | `[0.23, -1.3, -0.3]` |
| Spotlight positions (track-local) | `[-0.23, -0.187, -0.106]`, `[0.23, -0.187, -0.106]` | Unchanged |
| Intensity | `3.4` | `3.0` |
| Distance | `1.25` | `1.75` |
| Cone angle | `0.45` | `0.42` |
| Penumbra | `0.78` | `0.90` |
| Color / decay | `#ffe1bb` / `2` | Unchanged |

Both lights remain on the existing floor-lamp animation channel. They do not cast shadows; no lights or shadow maps were added. The existing directional light remains the scene's only shadow-casting light. Scene lighting stops updating once its animated channels settle.

### Validation status

- TypeScript, ESLint, and an isolated production build passed.
- Browser checks passed on desktop (`1008×503`) and mobile (`390×844`), including first entry, refresh, reduced motion, and Free Look. No new console errors were observed; the existing `THREE.Clock` deprecation warning remains.
- Matched before/after Home, guitar-wall, and pre-activation workstation captures were taken at `1008×503`. Visually, the final pools are broader and softer, with a modest improvement to the guitar bodies while retaining the white/lime accents. No FPS benchmark was collected; light count and shadow settings are unchanged.
- Final visual review is pending. The refinement is stopped here for review; no PC tower or Phase 3 work was started.
