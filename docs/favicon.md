# Brand favicon

`assets/branding/terminal-vine.svg` is the full-detail vector master, recreated
from the approved Green Vine Terminal Logo. The solid chevron and underscore
use League Spartan Black (900) as a visual reference while following the approved
image's geometry. All glyphs are paths; no font or embedded image is required.
The opaque background is charcoal (`#111111`), the terminal is white, and the
flat green vine (`#60bd28`) passes behind and in front of the chevron.

The generator derives a small-size version with tighter outer padding, a heavier
border and terminal, solid leaves without fine notches, and no tiny rear curl.
It retains the wrapping vine and all four main leaves. Larger PNGs retain the
full-detail design and original reference proportions. Both versions share the
same vector master; do not edit generated `app/icon.svg` directly.

Next.js App Router discovers these root files and emits their icon links on every
route. Keep icon configuration here rather than adding `metadata.icons` or manual
`<link>` tags in layouts:

| File | Purpose |
| --- | --- |
| `app/icon.svg` | Scalable favicon, optimized for browser tab sizes |
| `app/icon1.png` | 32 × 32 PNG fallback |
| `app/icon2.png` | 192 × 192 PNG |
| `app/apple-icon.png` | 180 × 180 Apple touch icon |
| `app/favicon.ico` | 16 × 16, 32 × 32, and 48 × 48 legacy tab frames |

After editing the master SVG, run `node scripts/generate-favicons.mjs` to regenerate all
raster assets and the small SVG using the existing Next.js `sharp` installation.
No new packages are required. There is no manifest, so no manifest or 512px app
icon is added. `docs/favicon-preview.png` compares native 16px, 32px, and 64px
renderings on light and dark surfaces, alongside the larger full-detail mark.

## Local verification

Run `npm.cmd run dev` on Windows and open the printed localhost URL. Inspect the tab icon and
the document head on the home page and a nested route, such as `/about/`.
Expect four `rel="icon"` links (ICO, SVG, and two PNG sizes) and one
`rel="apple-touch-icon"` link, with no manual duplicate declarations.
Open `/icon.svg`, `/icon1.png`, `/icon2.png`, `/apple-icon.png`, and `/favicon.ico`
directly to inspect the assets. Compare at native 16px, 32px, and 180px sizes on
light and dark backgrounds; the opaque charcoal canvas preserves white contrast
in either theme.

Run `npm run lint`, `npm run typecheck`, `npm run build`, and
`npm run check:export` to validate the production static export.

Browsers cache favicons independently and may retain an older tab icon after a
normal refresh. Next.js adds generated query hashes to file-based icon links;
browsers may also request the conventional `/favicon.ico` URL directly. If an old icon persists, close
and reopen the tab, use a fresh private window, or clear the site's cached data.
These changes are local until a separately approved deployment.
