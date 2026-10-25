# Typography refinement validation

Implemented only the requested typography, shadows, rightward smear and persistent subtitle. No dependencies were added. Camera poses/controls, room geometry, lighting, boot contents, football and hotspot plans are unchanged.

## Changes

- `app/layout.tsx`: load variable Work Sans using built-in `next/font/google`, exposing a scoped CSS variable. Next.js bundles/self-hosts the font; the boot's existing typography is preserved.
- `app/globals.css`: Work Sans 800 for both name sizes, soft contrast shadows, masked rightward visual echo, increased caption type (14 px desktop/13 px mobile), persistent subtitle at weight 400, responsive alignment and reduced-motion suppression of the smear.
- `components/ui/HeroBrand.tsx`: uppercase name and exact subtitle `Web Designer | Kuala Lumpur, MY`. The same semantic heading persists; the visual duplicate and measurement anchor are aria-hidden. Caption/subtitle have no distortion.
- `hooks/useEntranceTimeline.ts`: synchronize the stronger reveal/collapse echo and subtitle appearance with the existing timeline. Clear inline echo properties on completion so the persistent name uses its much lighter static CSS treatment. No camera/light timing changes or extra cinematic sequence.
- `README.md`: update font, persistent typography and anchor documentation.
- `artifacts/typography-refinement/`: actual browser screenshots, assertion report and protected-file comparison.

## Behavior

The crisp name remains readable in front of its softly blurred, horizontally stretched echo. The hero echo is strongest during reveal/collapse; exploration uses a static 0.045-opacity echo with a 3 px right offset. Reduced motion hides distortion entirely.

The collapse still moves/scales the same heading to the measured anchor. Hero and persistent type use matching font weight, letter spacing and 1.1 line-height proportions to avoid a glyph-proportion change at settlement. Existing stage timings and approximately 4.18-second duration are preserved. The subtitle fades in during the final 0.18 seconds of the existing transition.

The persistent block stays below the guitar area: desktop left 32 px/bottom 28 px; mobile left 20 px/bottom 24 px. Its 24 px desktop/20 px mobile name is 7 px above the 11 px subtitle's 16 px line box. These offsets apply to the block; the measured name anchor includes the subtitle's reserved space.

## Tests actually performed

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed without warnings.
- `npm.cmd run build`: passed with the requested font bundled.
- Actual headless Chrome production-browser run: **145 assertions passed; zero runtime exceptions or console errors**. See `browser-report.json`. Some final-state assertions repeat across interruption/accessibility paths.
- Verified loaded Work Sans 800, uppercase heading, exact subtitle, lighter subtitle weight, shadows, rightward stretch, aria-hidden echo, caption sizes, subtitle alignment and viewport fit.
- Verified full entry, same-heading continuity, real compression/travel, exact final Home camera and original light intensities, clear room/hint/exploration readiness, mouse drag and touch swipe.
- Verified Skip, Escape, reload interruption, resize interruption, initial reduced motion and reduced motion enabled midway. Reduced motion removes the smear and camera travel.
- Desktop 1440×900 and mobile 390×844 captures were reviewed visually. Mobile hero and final UI have no horizontal overflow.
- SHA comparison of 14 protected source/dependency files found **zero changes**. See `protected-files-check.txt`.

QA used `.tmp/typography-test.cjs`, the existing Chrome installation and native Node CDP WebSocket support. No browser-test dependency was installed.

## Actual browser screenshots

- `04-name-and-hello-world.png`: large Work Sans hero, larger caption and shadows.
- `11-rightward-smear-reveal.png`: rightward echo during reveal, with crisp primary letters.
- `05-name-collapsing.png`: heading travelling to the persistent anchor.
- `06-clear-room-persistent-brand.png`: uppercase persistent name and exact subtitle.
- `08-mobile-name-and-caption.png`: mobile hero/caption.
- `09-mobile-persistent-brand.png`: mobile name/subtitle alignment.
- `10-reduced-motion.png`: simplified final state without distortion.

Screenshots were captured from real unpaused entrance replays to sample short stages. Other numbered captures record the preserved close-up, lighting and Home stages.

## Limits and scope

Testing used Chrome software WebGL and emulated mobile viewports, not physical-device performance or other browser engines. Font retrieval requires network access on an uncached production build, as expected for `next/font/google`; visitors receive the bundled font from the application.

Stopped for review. No new phase or feature started.
