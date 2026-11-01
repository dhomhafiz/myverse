# Floor uplighter

`public/models/floor-uplighter-optimized.glb` is an original low-poly procedural model based on the user-supplied floor-lamp reference. The electrical cable is omitted as requested; the inline pole switch remains.

The model has a weighted rounded base, a satin-black pole and tapered shade housing, a shallow warm-opal bowl, and a small warm practical bulb. It preserves the existing `room.lamp` placement and `floor_lamp` lighting channel. The bulb emissive is controlled by the existing scene-light animation.

The bowl uses a matte ivory exterior with a subtle height-based emissive gradient, strongest near the lower bulb and softening toward the rim, plus a warmer cream interior. The existing lamp channel fades both shade emissives and the bulb together with a warm point light centered at the bulb; its falloff provides nearby spill without additional lights, textures, or shadow passes.

| Property | Value |
| --- | ---: |
| Dimensions | 0.50 × 2.174 × 0.50 m |
| Triangles | 2,040 |
| Meshes / materials | 7 / 4 |
| GLB size | 46,476 bytes |
| Embedded textures | None |

Regenerate the asset with `node scripts/generate-floor-uplighter.mjs`. The reference image's original source and publication rights were not provided; treat this model as unverified for public redistribution until those rights are confirmed.
