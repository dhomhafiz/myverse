# Nature terminal boot screen

The telemetry presentation in `BootScreen.tsx` is replaced by the nature terminal
loader. `NatureTerminal.tsx` renders vector terminal geometry and a shared 43,448
byte WebP converted from the approved Green Vine Terminal Logo2 image. Existing
favicon and brand master assets are untouched. No new dependencies are used.

## Background artifact repair

The approved PNG is 1254 x 1254, 8-bit sRGB, RGB without alpha or an embedded ICC
profile. The deployed WebP is 1000 x 1000, also 8-bit sRGB, RGB without alpha or
an ICC profile. Both contain a nonuniform blue-black backdrop. The lossy WebP
adds quantized color regions. That opaque backdrop differs from the loader's
solid `#0B0E12`, producing the visible square and uneven negative space. There
is no loader CSS gradient, backdrop filter, vignette, or glow generating this
boundary. Browser-independent renders reproduce the issue, so a GPU fault is
not required to explain it; device-specific banding could not be ruled out by
live screenshot inspection.

`nature-terminal-foreground.svg` supplies a foreground silhouette for the shared
artwork group in `NatureTerminal.tsx`, before the growth masks, botanical clips,
and final-frame use. The backdrop is transparent in every logo animation layer;
the loader's existing solid background shows through. This is an asset-level
SVG mask, not a CSS blend, blur, or color-key filter. The 43,448-byte bitmap stays
byte-for-byte unchanged, retaining its original foreground RGB colors and
botanical shading. The new mask is 52,362 bytes before HTTP compression. The
button artwork and interaction are unchanged.

The final frame retains the former opaque image's stacking behavior using a
solid `#0B0E12` backplate beneath the isolated artwork. This prevents the early
vector approximation from showing through negative space in the finished logo.
It follows the same existing final-frame opacity tween. If either image resource
fails, the backplate is omitted so the original vector fallback stays visible.

Regenerate the mask with `node scripts/generate-loader-foreground-mask.mjs`.
The offline script traces neutral terminal pixels and botanical green pixels,
with artwork-specific botanical bounds, and fills small enclosed shadow gaps.
It emits closed vector contours rather than doing per-pixel work in the browser.
Its thresholds are calibrated to this supplied artwork and dark loader; review
the result if the source changes. It is not a general-purpose extraction tool.
An imagegen cutout was evaluated and discarded because of edge noise; no generated
replacement logo is used.

Static before/after comparison and final-state renders at 420px, 300px, and 210px
were reviewed on `#0B0E12`. Sampled outer and inner negative-space regions changed
from 54 and 36 distinct RGB colors, respectively, to exactly one: `(11, 14, 18)`.
The code for animation timelines, loading readiness, the entrance button, and
CSS was checked against pre-fix hashes and preserved. Lint, TypeScript, production
build, and static-export validation were run. Browser screenshot capture timed
out twice, so live desktop/mobile edge rendering, GPU compositing, and motion
remain manual visual checks. Static previews are not browser screenshots.

## Motion and artwork

The symbol reveals over 0.5s; the border forms from 0.25s to 1.15s. Six curved
SVG mask strokes progressively reveal the approved textured stems. Nine clipped
botanical regions unfold from different stem origins between 1.2s and 3.9s,
including leaves, buds, and the two blossoms. Scale, small rotations, and stagger
communicate unfolding without bounce or spinning. The tagline enters at 3.1s.
The artwork resolves to the complete approved composition around 3.95s, closing
small mask-edge gaps. The original logo sequence completes before the entrance
button is revealed; no additional timer or second introduction is added.

## Entrance button

`NatureEntranceButton.tsx` adds a 350px wide, 70px high call to action below the
tagline. It uses bold existing Work Sans typography, a thick white rounded frame,
charcoal fill, a muted green hover/focus accent, and a small press displacement.
Its native button semantics support keyboard activation and disabled state.

After the original logo completes, a smaller vine grows around the button's
lower-right edge. The existing WebP is reused through a narrow curved stem mask
and two clipped leaf regions. Rear artwork is covered by the opaque button frame;
foreground fragments cross it at selected points, with the middle slipping behind
the border. Leaf unfolds are staggered. The label remains clear and all decorative
artwork ignores pointer events. No new bitmap, font, sound, or dependency is added.

The secondary vine takes about 1.5s and never gates activation. Once the original
logo and real room readiness have both completed, visitors may enter immediately,
including while button decoration is still growing. Both timelines use scoped
GSAP contexts and revert on cleanup. A reduced-motion preference seeks their
finished states without waiting. Completed animation guards prevent replay when
the preference changes after completion.

This is a hybrid masked-raster animation, not a rigged botanical simulation.
The final image preserves the reference's shading, veins, overlap, and geometry;
the intermediate clipped leaf unfolds approximate growth. Transparent isolated
leaves/stems and separate rear/front plant layers would improve intermediate
overlap and allow true leaf deformation. No pixel-perfect intermediate-frame
match is claimed.

GSAP is scoped and reverted on cleanup, including the tagline tween. Unique SVG
IDs prevent mask collisions. No repeating animation runs while waiting. Artwork
download failure leaves the vector terminal and accessible status available and
does not block room readiness. Reduced motion seeks the final state immediately.

## Lifecycle

The existing `SceneReadiness` still checks loaded assets, room objects, shader
compilation, camera validity, and a completed rendered frame. Readiness no longer
automatically starts the cinematic. The actual logo timeline completion callback
reveals the entrance button. The button enables only when the logo is complete,
the room is active, and both phase and readiness are `ready`. A synchronous ref
guards repeated click/keyboard activation before the phase update reaches React.
Clicking invokes the same `onEnter` transition as before. The existing
`useEntranceTimeline` fades `.boot-screen` and runs the unaltered cinematic.
There is no delay for the secondary vine, nor an added settle timer. Leaving for
2D suppresses entrance while inactive. Existing direct-entry,
Back-to-Room, return-from-boot, attempt, failure, and timeout logic remain intact.

No invented percentage is displayed. The live status reflects preparing versus
ready and is associated with the button using `aria-describedby`; the unavailable
button is disabled and marked busy. Continue in 2D remains keyboard accessible;
the leaving overlay is inert. The button has a visible focus outline. Sizing uses
viewport width/height caps, including a side-by-side composition on short wide
screens and a full-width capped mobile button.

## Validation and local review

Run `npm.cmd run dev`, then open the printed localhost URL in a fresh tab.
Throttle model requests in browser developer tools to inspect the disabled button
after the logo finishes. With a warm cache, confirm the ready page still waits for
a click. Press Tab to reach the button, inspect the focus ring, and activate using
Enter or Space. Rapidly activate twice and confirm one cinematic. The decorative
button vine must not delay a ready button.
Check desktop, mobile, a short landscape viewport, and reduced-motion emulation.
Navigate to Work and return to the room to confirm no boot replay. Force a room
asset failure to inspect the existing retry/fallback UI, and separately block
the loader WebP to verify its nonblocking vector fallback.

Validation for this enhancement: lint, TypeScript, production build and static
export checks. A static render was inspected for the textured border wrap and
label clearance. Chrome accessibility inspection observed the room-ready status
while the original logo completed, followed by the enabled ENTER MY 3D ROOM button;
it remained on the loader without automatically entering. Screenshot capture
timed out and click input geometry was unavailable. Desktop/mobile motion,
keyboard activation, short-screen clipping, the click-to-cinematic handoff,
Back-to-Room, and reduced-motion/error injection remain manual browser checks.
These are limitations, rather than claimed runtime passes.
