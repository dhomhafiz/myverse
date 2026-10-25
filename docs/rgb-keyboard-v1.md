# RGB keyboard asset — v1

## Source and attribution

- Source file: user-provided `mechanical-rgb-keyboard.zip`, containing the keyboard FBX and its textures.
- The archive did not include an identifiable author, source URL, or license. Confirm those details before adding a formal third-party attribution; no author or license is inferred here.

## Model and optimization

- Integrated asset: `public/models/mechanical-rgb-keyboard-optimized.glb`.
- Final transfer size: **86,852 bytes** (86.852 KB / approximately 84.8 KiB), below the 100 KB target.
- Final geometry: **9,168 triangles**, reduced from 16,120.
- Measured model bounds: approximately **0.43006 × 0.03701 × 0.13070 m** (width × height × depth), with its base at local Y = 0.
- Hierarchy: scene `AuxScene`, with `Board` and `keys` nodes. There are two mesh/material groups (`board` and `keys`); neither has animated transforms.
- Authored PBR maps are retained: base color and emissive maps for both materials, normal maps for both, and a metallic-roughness map for the board. Seven WebP textures are limited to 256 × 256.
- Optimization used Draco geometry compression, mesh simplification, and WebP texture recompression. The original FBX and 4K source textures were not modified.

## Room integration and lighting

- `RgbKeyboard` loads one cached GLB instance through the existing Drei `useGLTF` infrastructure and preserves the scene object identifier `rgb_keyboard`.
- Workstation-local position is `[-0.42, 0.809, 0.2]` with uniform scale `1.3`, placing the keyboard on the mousepad. The resulting scene dimensions are approximately **0.559 × 0.048 × 0.170 m**; the model's local base remains at Y = 0, and the enlarged footprint stays within the mousepad.
- The authored emissive textures and factors are preserved. `SceneLighting` associates the `rgb_keyboard` group with the existing `monitors` light channel, so the keyboard RGB follows the workstation activation in the shared entrance timeline. No separate timeline, extra real-time lights, or cloned materials were introduced.

## Validation and status

- `npm.cmd run build`: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `gltf-transform validate`: no validation errors; it reports non-fatal generated tangent-space warnings and notes that its validator does not support `KHR_draco_mesh_compression`.
- Browser check: GLB request returned HTTP 200 and the room rendered with no runtime errors.
- Milestone: **Implemented / Technically Validated**. **Visual Approval Pending** user review.

## Copy-ready credit description

> Converted the supplied RGB keyboard FBX to an optimized GLB, simplified its geometry, and reduced/recompressed its textures to keep the model below 100 KB. Integrated it in place of the procedural keyboard and synchronized its existing emissive RGB materials with the workstation lighting in the room’s shared startup sequence.
