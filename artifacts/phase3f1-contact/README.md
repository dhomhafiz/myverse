# Phase 3F.1 Contact validation

**Visual approval PENDING. Overall Phase 3 remains incomplete.**

Configured destinations:

- Email: `mailto:dhomhafiz@gmail.com`
- WhatsApp: `https://wa.me/60197860823` (displayed as +60 19-786 0823 / MY)

## Evidence

- [53 passing production-browser assertions](browser-report.json), with zero runtime errors: full-card activation, icons, hover/press/focus, reduced motion, touch, mobile fit, direct return, five persistent phone/Contact/room cycles, original phone/camera restoration, listener cleanup and other destinations.
- [Before/after layout metrics and idle Work draw counts](comparison-report.json).
- [Controlled Work pixel comparison](work-pixel-comparison.json): maximum color-channel difference 1/255; both shader strings unchanged. [Shared pointer replay checks](ripple-regression-report.json).
- [Contrast samples](contrast-report.json): sampled normal text >=8.71:1; card boundary 4.63:1. [Unavailable-card noninteractive fixture](unavailable-card-report.json).
- [Hover/ripple frame viewer](interaction-filmstrip.html).

| View | Before | After |
| --- | --- | --- |
| 1920x1080 | [Before](before-contact-1920.png) | [After](after-contact-1920.png) |
| 1366x768 | [Before](before-contact-1366.png) | [After](after-contact-1366.png) |
| 768x1024 | [Before](before-contact-768.png) | [After](after-contact-768.png) |
| 390x844 | [Before](before-contact-390.png) | [After](after-contact-390.png) |
| 320x740 | [Before](before-contact-320.png) | [After](after-contact-320.png) |

Side by side: [Desktop](comparison-contact-1366.png), [Mobile](comparison-contact-390.png). Before is left; After is right.

Interactions: [Hover](contact-hover.png), [Press](contact-press.png), [Keyboard focus](contact-keyboard-focus.png), [Ripple](contact-ripple.png), [Five cycles returned Home](five-contact-cycles-home.png).

Work parity: [Before](before-work-fixed-ripple.png), [After](after-work-fixed-ripple.png). Inputs were fixed only in the comparison browser, not in production source.

## Architecture and limits

The shared layer is `lib/pointer-ripples.ts`. Work retains its WebGL shader/media adapter. Contact uses `SharedHtmlRipple`, an 80x60, at-most-30Hz 2D displacement map feeding an SVG filter on its grid backdrop. It shares the original wave timing and slope but does not reproduce Work's image/bubble material shading. Contact creates no WebGL renderer; content and focus rings are never filtered. Continuous ripple is disabled for touch and reduced motion.

At 390x844 the complete Email action is visible, with most of WhatsApp visible; the WhatsApp action may require a small scroll. At 320x740 the complete first action remains visible. External native actions were intercepted during tests to inspect destinations; actual mail delivery and WhatsApp account availability are unverified. Physical devices, other browsers/GPUs, full screen-reader coverage and comprehensive performance benchmarks were not tested.

## Files changed

- `lib/contact.ts`, new `lib/pointer-ripples.ts`
- `components/contact/ContactPage.tsx`, new `ContactCard.tsx`
- `components/ui/ReturnToRoom.tsx`, new `SharedHtmlRipple.tsx`
- `components/work/GalleryLiquid.tsx`
- `app/globals.css`
- `docs/implementation-plan.md`
- Tests, reports and captures in this directory.

No room/phone model, CameraRig, navigation, readiness, dependency or other destination style files were changed.

## Rerun

The final isolated build is `.tmp/phase3f1-final`. In one PowerShell session:

```powershell
$env:NEXT_BUILD_DIR='.tmp/phase3f1-final'
npm.cmd run start -- --port 3032
```

From the repository root in another session:

```powershell
$env:TEST_URL='http://127.0.0.1:3032'
node artifacts/phase3f1-contact/browser-test.cjs
node artifacts/phase3f1-contact/ripple-regression.cjs
node artifacts/phase3f1-contact/card-checks.cjs
```

The comparison script also expects baseline `.tmp/phase3f1-before` served at port 3030. It uses the saved baseline shader source fixture and native Chrome CDP; no test dependencies were installed. Local test browsers use temporary profiles and close their own processes. The workspace's existing Google Fonts need network access when building.
