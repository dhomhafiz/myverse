# Works Coming Soon review

Route: `/work/coming-soon`. The old `/work/project-preview` redirects here.

- [Gallery teaser](coming-soon-gallery.png)
- [Desktop placeholder page](coming-soon-desktop.png)
- [Mobile placeholder page](coming-soon-mobile.png)
- [Gallery/chapter/mobile smoke report](smoke-report.json)
- [Successful direct-entry keyboard ReturnToRoom report](return-smoke-report.json)

TypeScript, changed-file ESLint and diff whitespace checks passed. The combined mobile mouse-simulation Return check was inconclusive; the separate keyboard check reached Home. No production build or exhaustive testing was run.

Changed implementation files: `lib/projects.ts`, `components/work/ProjectsGallery.tsx`, `components/work/ProjectMedia.tsx`, new `components/work/ComingSoonCaseStudy.tsx`, `app/work/[slug]/page.tsx`, scoped styles in `app/globals.css`, and `docs/implementation-plan.md`. Existing unrelated edits and Netflix content were preserved.

The neutral teaser is CSS/HTML artwork; there are no new image assets or dependencies. Visual approval is pending; overall Phase 3 remains incomplete.
