# Brand favicon

`app/icon.svg` is the vector source for the white terminal mark on charcoal
(`#111111`). The mark uses geometry without fonts, with a thick rounded border
and optical spacing between the chevron and underscore.

Next.js App Router discovers these root files and emits their icon links on every
route. Keep icon configuration here rather than adding `metadata.icons` or manual
`<link>` tags in layouts:

| File | Purpose |
| --- | --- |
| `app/icon.svg` | Scalable favicon |
| `app/icon1.png` | 32 × 32 PNG fallback |
| `app/icon2.png` | 192 × 192 PNG |
| `app/apple-icon.png` | 180 × 180 Apple touch icon |
| `app/favicon.ico` | 16 × 16 and 32 × 32 legacy tab frames |

After editing the SVG, run `node scripts/generate-favicons.mjs` to regenerate all
raster assets using the existing Next.js `sharp` installation. No new packages
are required.

## Local verification

Run `npm run dev` and open the printed localhost URL. Inspect the tab icon and
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
