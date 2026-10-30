# Asset licensing release gate

**Current status: TECHNICAL RELEASE PREPARATION: AUTHORIZED. PUBLIC ASSET RIGHTS CLEARANCE: NOT FULLY VERIFIED. PRODUCTION PUBLICATION: SUBJECT TO FINAL REVIEW.**

This focused remediation uses the existing audit and owner-declared provenance; it does not repeat the broad asset audit. The authorization is not independent legal clearance and does not establish that all third-party rights are satisfied. The dated audit findings below remain as recorded. No deployment, push, DNS change, or GitHub Pages setting change was made.

The asset totals remain **A — Verified: 5; B — Original: 1; C — Attribution corrections: 0; D — Unverified: 29; E — Restricted: 0** across the 35 tracked model/image files. They are split between 21 production assets in `public/` (11 GLBs and 10 raster images) and 14 D files retained under `assets/source-only/unused-unverified/`. Next static export copies the production assets and notice file, but not the source-only directory. Ten GLBs and ten images are referenced by the current application. The unused verified CC0 football remains in `public/`.

## Remediation status

| Matter | Result |
|---|---|
| Work Sans and Space Mono | `public/third-party-notices.txt` includes both copyright lines and the full SIL OFL 1.1 text. The Credits page links to this notice document. |
| Next.js, React, React DOM, Three.js, React Three Fiber, and Drei | Installed versions and license metadata were checked after `npm ci`; the notice document includes the authentic MIT license texts and copyright statements. React Three Fiber's v9.8.2 upstream license text is used because its installed npm package omits a root `LICENSE` file. |
| GSAP 3.15.0 | Not MIT. Installed metadata identifies the GreenSock Standard “no charge” license; the source banner points to its terms. The production bundler strips that JS comment, but the exported notice document preserves the exact banner text and official terms URL. |
| 14 unused, unverified assets | Four models and ten images moved outside `public/` to `assets/source-only/unused-unverified/`. Source files remain in the repository; Next no longer copies them into static output. Their D classifications remain unchanged. |
| Public Credits | The four supported credit entries and existing modification notices remain. The footer now states five verified models (the football entry covers two files) and links to third-party notices. No unverified image/model is presented as independently verified. |

## Release-blocker matrix

| Priority | Asset / matter | Evidence and actual risk | Minimum action |
|---|---|---|---|
| **Resolved — former P0** | Shipped Work Sans and Space Mono WOFF2 fonts | Nine generated WOFF2 files are exported; their SIL OFL 1.1 copyright and license text is now included in the exported notice document. | Preserve `/third-party-notices.txt` with the font files in every release. |
| **Resolved — former P0** | `next`, `react`, `react-dom`, `three`, `@react-three/fiber`, and `@react-three/drei` runtime bundles | Installed versions and package license files/metadata were checked; the required MIT text and copyright notices are included in the notice document. | Preserve `/third-party-notices.txt` with the runtime bundles in every release. |
| **Resolved — notice preserved** | `gsap` 3.15.0 runtime bundle | GSAP Standard “no charge” license, not MIT. The production bundler strips the JS source comment; the exported notice document retains the exact proprietary banner and official terms URL. No license violation is asserted. | Preserve `/third-party-notices.txt` with the runtime bundle in every release. |
| **P1** | Five used AI-assisted models: bar stool, gravel bike, two guitars, and track light | The owner confirms AI-assisted generation from reference pictures, optimization to GLB, generic designs, and removal of branding/logos. This is provenance evidence, not an independent license or public-use permission. | Record the applicable provider terms or other public-use evidence. Do not assign CC0/CC BY without evidence; replace only if a material publication concern cannot be cleared. |
| **P1** | Nine used images with unknown/incomplete source, plus `selectedwork1.webp` | `selectedwork1.webp` is owner-directed AI-generated concept art. The owner also identifies AI-assisted Beyond the Code concept artwork, but existing notes do not map it to individual files. Other images include a portrait of the owner, photo-described cycling panels, a poster, and artwork with incomplete/unknown source records. | Map the Beyond declaration to files; establish source, public-use rights, and attribution conditions for each image. Record AI-provider terms and review the selected-work image's material brand concerns. Do not infer ownership or third-party status from appearance. |
| **Excluded; D status retained** | Four unused models and ten unused images (14 D files) | No active runtime references, model-loader paths, case-study gallery references, responsive fallbacks, CSS references, or dynamic-path use were found. All remain in the repository outside `public/` and are excluded from static output. | Keep source-only unless rights are documented before any future return to `public/`. The verified CC0 football is not excluded. |
| **P2** | Photograph used as the wooden bike stand reference | The photo is not bundled or displayed. The stand uses project-created geometry and two baked wood textures; those textures are not the photograph. The available record identifies no distinctive designer product or copied branded design. The photo's source/permission and design details remain unknown; using a reference alone does not establish infringement. | If available, document source/permission and check for distinctive copied expression. No model replacement is indicated by current evidence. |

## Preserved verified findings

- The Mechanical RGB Keyboard remains **A — Verified for public use**: the owner identified [Mechanical RGB Keyboard by BigBrotherHCH](https://sketchfab.com/3d-models/mechanical-rgb-keyboard-4650f5bafe934a90b9f09396b843a966), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The existing credit correctly identifies the creator, license, optimization/RGB modifications, and non-endorsement notice. Do not revert it to Unverified.
- The used gaming chair and PC remain verified CC BY 4.0 assets with existing creator/source/license and modification credits.
- Both football GLBs remain verified CC0 1.0; the existing attribution is voluntary.
- No confirmed missing or incorrect CC BY attribution was found. There is no supported `lib/credits.ts` correction to make.

## Export verification

- Fresh local release-preparation checks on 2026-10-30: `npm.cmd ci`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run check:export`, and `git diff --cached --check` passed. No root `.env*` files or matches for PEM private keys, AWS access keys, GitHub tokens, or Stripe secret keys were found in source or exported files.
- `npm ci`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check` passed.
- All required static routes, including `/work/netflix/`, `/work/coming-soon/`, and `/work/project-preview/`, plus `robots.txt`, `sitemap.xml`, and `/third-party-notices.txt`, are present in `out/`.
- The export contains 11 GLBs (ten runtime models plus the intentionally retained unreferenced CC0 football), ten active raster images, and the notice document. All 14 source-only files are absent.
- Static browser checks returned HTTP 200 for all ten runtime GLBs, the CC0 football, all ten active images, and the notice. Runtime room readiness reached 51/51 assets, and the browser recorded all ten active GLBs. About, Beyond, Work, case-study, Credits, and notice-page checks completed without failed asset responses.
- The Credits link opens the exported notice document. The document is byte-identical to its public source; the installed MIT license texts were compared against package files. The GSAP source comment is stripped from generated JS, while the exact copyright/terms notice is retained in the accessible text file.

## Provenance classifications

- **Verified:** five A model files (the two football GLBs, used swivel chair, PC, and keyboard); one B project-created wooden bike stand. The reference photograph for the stand is assessed separately as P2.
- **Owner-declared custom AI generation:** the five used models listed above. Their license/public-use status remains D pending applicable provider terms.
- **Owner-directed AI artwork:** `selectedwork1.webp` and its source PNG are concept art, not an event photograph or screenshot. The unused PNG is excluded from output; the used WebP remains D pending provider terms and brand review.
- **Beyond the Code artwork:** AI-assisted concept artwork is owner-declared at page level, but no file-level mapping is recorded. Do not label individual Beyond images as AI-generated until that mapping is supplied.
- **Other used images:** the About portrait's photographer/rights holder is unknown; the cycling panels are described as photos in implementation notes but are not identified as owner-provided or third-party; other Beyond artwork, the poster, and the work-in-progress image remain source/rights unknown. No uncertain source is marked verified.
- **Unused, excluded:** 14 files remain D in `assets/source-only/unused-unverified/`; their absence from output does not change their provenance status.

## Remaining release concerns and next actions

1. Obtain and record provider/version terms or equivalent public-use evidence for the five AI-assisted custom models. If terms do not support release, choose a separately reviewed replacement or removal.
2. Map the Beyond page-level AI declaration to the exact file(s), and record the generation provider/terms. For the selected-work concept, record its provider/terms and complete the material depicted-brand review.
3. Establish source and rights for each remaining used image, including the owner portrait photographer, the triptych photo sources, the Beyond artwork/poster, and the work-in-progress image. Add public credits only where evidence establishes a required attribution; do not invent credits or claim verification.
4. If available, document the wooden bike-stand reference photograph's source/permission and assess whether any distinctive protected design was carried into the model.
5. Before CI/CD activation, require a clean `npm ci`, typecheck, lint, production export, and automated checks that the notice file, routes, active assets, GSAP notice text, and absence of the 14 excluded files are preserved. Complete the remaining provenance review and visual approval before any deployment or cutover decision.

**Final gate: STOP FOR RELEASE REVIEW.** The P0 notice gaps are remediated and export-verified, but P1 provenance/public-use concerns for five active models and ten active images remain. Non-blocking browser console notices included a Three.js `Clock` deprecation and font-preload hints; no missing asset or failed asset response was found. No commit, push, deployment, DNS change, or GitHub Pages change was made. Await owner release review.

## Owner risk acceptance and current preparation status — 2026-10-30

The owner authorizes technical release preparation to continue without repeating the broad licensing audit. This acceptance is limited to preparation; it is not independent legal clearance and does not prove that all third-party rights are satisfied.

- **Owner-declared AI-assisted models:** the five displayed models (bar stool, gravel bike, two guitars, and track light) were generated from generic reference designs, optimized for MyVerse, and stripped of branding. Provider terms and affirmative public-use rights remain unresolved. Their existing D classifications are unchanged.
- **RGB keyboard:** the owner confirms the source as Mechanical RGB Keyboard by BigBrotherHCH under CC BY 4.0. Preserve the existing source, license, and modification attribution in [the keyboard record](./rgb-keyboard-v1.md); its existing A classification is unchanged.
- **Image and provider uncertainty:** the owner acknowledges unresolved image-source and AI/provider-term questions already described in the audit. No image or other asset is upgraded to verified by this acceptance.
- **Restrictions:** the current audit identifies no known explicitly restricted asset (E — Restricted: 0). The absence of an identified restriction is not affirmative rights clearance.

| Separate decision | Status |
|---|---|
| Technical release preparation | **AUTHORIZED** |
| Public asset rights clearance | **NOT FULLY VERIFIED** |
| Production publication | **SUBJECT TO FINAL REVIEW** |

The production asset audit's A/B/C/D/E counts and unresolved evidence are preserved; preparation authorization does not change those findings. A push to `main` after this workflow is committed will trigger automatic Pages deployment, so publication must remain gated on the owner's final review and manual cutover decision.
