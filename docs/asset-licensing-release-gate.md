# Asset licensing release gate

Public deployment is blocked until the provenance and redistribution rights for every published asset are verified or the asset is removed or replaced. Static export includes files in `public/`, so unused model files in that directory are also part of the release.

## Unresolved findings

- `public/models/mechanical-rgb-keyboard-optimized.glb`: `docs/rgb-keyboard-v1.md` says the supplied archive had no identifiable author, source URL, or license. `lib/credits.ts` currently claims the asset is by BigBrotherHCH under CC BY 4.0, but the inspected asset notes do not support that attribution. Do not treat the credit entry as evidence of permission.
- The inspected repository records do not establish file-specific source and license information for:
  - `public/models/barstool-black-unbranded-compact.glb`
  - `public/models/beanbag-black-unbranded-compact.glb`
  - `public/models/football-compact.glb`
  - `public/models/gaming-chair-all-black-compact.glb`
  - `public/models/gravel-white-black-unbranded-compact.glb`
  - `public/models/v-guitar-black-lime-longer.glb`
  - `public/models/v-guitar-black-lime-unbranded-compact.glb`
  - `public/models/v-guitar-black-white-longer.glb`
  - `public/models/vertical-bike-display-stand.glb`
- `public/models/wooden-bike-stand.glb` is documented as custom geometry based on a user-provided photograph, but the photograph's rights or permission are not recorded.
- `public/models/guitar-wall-two-spot-track-light.glb` is documented as procedural, but its authorship and rights are not explicitly recorded.

## Existing provenance records

- `public/models/football-stars-compact.glb` is documented as based on the Poly Haven football by Amal Kumar, released under CC0 1.0.
- `public/models/gaming-chair-all-black-swivel-compact.glb` is attributed to Vlad under CC BY 4.0.
- `public/models/pc-balanced.glb` is attributed to fakiAZer under CC BY 4.0.

These records do not establish rights for other model files or variants. Verify the source asset and applicable license for each file before release. Do not infer permission from a filename, embedded metadata alone, or a credit for a different variant.

## Release status

Rights remain unverified for the findings above. Do not enable a public deployment until they are resolved and a final release is explicitly approved.
