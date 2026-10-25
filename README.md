# dhomhafiz.dev — interactive developer room

Phase 2: Entrance and Camera. Original primitive geometry based on the supplied Room1/Room2 photographs and guitar/bicycle references. This is a new standalone project. No existing portfolio/reference-site code or assets are reused. The approved Phase 1 layout and object names are preserved.

## Run locally

Node 22.20.0 or newer. In Windows PowerShell use `npm.cmd` because the default execution policy may block `npm.ps1`.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Next (normally http://127.0.0.1:3000). Wait for actual scene readiness, select **ENTER MY ROOM**, then drag/swipe to explore. The room also supports arrow keys and Home to reset. There are no hotspots, portfolio panels or Blender assets yet. No sound plays.

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

## Verified dependency pins

The npm registry's stable tags and peer requirements were queried on 23 October 2026. Exact direct versions are pinned in package.json; package-lock.json records the resolved graph.

| Package | Version | Compatibility |
| --- | --- | --- |
| Next.js / eslint-config-next | 16.4.2 | Node >=20.9; supports React 19 |
| React / React DOM | 19.3.1 | Matching versions |
| Three.js | 0.186.1 | Meets Fiber/Drei peer ranges |
| React Three Fiber | 9.8.2 | React >=19 <19.4; Three >=0.156 |
| Drei | 10.7.9 | Fiber ^9; React ^19; Three >=0.159 |
| GSAP | 3.15.0 | Entrance camera/lens and lighting reveal |
| Tailwind / PostCSS adapter | 4.3.3 | Matching versions |
| TypeScript | 6.0.3 | Latest supported stable 6.x; lint parser requires <6.1 |
| ESLint | 9.39.5 | Compatible with bundled React/Next plugins; ESLint 10 deferred |
| Node types | 22.20.5 | Matches Node 22 major |
| React / React DOM types | 19.3.0 | Matches React 19.3 |
| Three types | 0.186.0 | Matches Three r186 |

TypeScript 7.0.2 was tested but rejected by typescript-eslint; 6.0.3 is deliberately pinned. ESLint 9 is marked unsupported by npm; migration to 10 awaits compatibility across the Next-bundled plugins. No additional application runtime libraries were added. Lenis/ScrollTrigger remain deferred. Drei supplies loading state; GSAP supplies the entrance reveal.

Sources: [npm registry metadata](https://registry.npmjs.org/next/latest), [Fiber installation](https://r3f.docs.pmnd.rs/getting-started/installation), [Drei metadata](https://registry.npmjs.org/@react-three%2fdrei/latest), [Fiber metadata](https://registry.npmjs.org/@react-three%2ffiber/latest).

## Room and asset contract

- Unit: **one Three.js unit = one metre**. Right-handed Y-up. Floor-centre origin `(0,0,0)`. Back is negative Z; right is positive X. The interior is currently 5.2 × 4.8 × 2.8 m, an adjustable composition study, not a room measurement.
- `lib/room-config.ts` owns room size, placements, Home lens/pose and future focus poses. Dimensions and object placements are independent; changing the room size requires reviewing placements, not automatic repositioning.
- Window behind the monitors; L-desk return and pegboard on the right; guitars on the back wall's left side. A generated-texture neon sign and framed developer typography poster form a minimal vertical stack on the left wall. The PC moves onto an enlarged desktop as requested. The bike occupies the right wall farther from the workstation. Clutter is intentionally omitted.
- Home starts at `(-1.35, 1.6, 1.7)`, looking toward `(-0.15, 1.23, -1.65)`. The lateral offset clears both monitors and the PC while retaining the chair in the foreground. Lens: 66° desktop, 86° portrait. `/?view=bike` selects a fixed bike review composition without adding camera controls, transitions or scene interactions.
- Major configurable groups use a floor pivot (desk, chair, guitar wall, bike, lamp) or a mounting-centre pivot (window, pegboard). Wall props face local +Z. Placements use XYZ Euler rotation in radians; the current configuration changes yaw only.
- Preserve `room_root`, `room_floor`, `wall_back`, `wall_right`, `wall_left`, `wall_front`, `room_ceiling`, `desk_main`, `desk_side`, `monitor_left`, `monitor_right`, `monitor_arm`, `keyboard`, `mousepad`, `mouse`, `pc_tower`, `gaming_chair`, `carpet`, `curtain`, `window`, `floor_lamp`, `iphone_15_pro_max`, `pegboard`, `guitar_01`, `guitar_02`, `gravel_bike`, `headphones`, `ps4_controller`, `cap_01`, `plant_small`, `audio_interface`.
- `guitar_01` is the outlined V (Guitar 2.webp); `guitar_02` is the superstrat (Guitar 1.webp). They remain separate objects.
- Screen anchors are children of their monitor groups, just ahead of the screen. Camera anchors are world-space empty objects named `camera_home`, `camera_projects`, `camera_skills`, `camera_about`, `camera_contact`, `camera_beyond_code`. Their `userData.lookAtTarget` records a world-space target. Future focus poses derive from configurable prop transforms. They do not implement interaction.
- Blender exports must preserve names, pivots, metre scale and the same world arrangement after glTF's axis conversion. Do not manually double-rotate for Y-up. For prop-level GLBs, export at the documented local origin and apply the configured placement once. Full-room exports must use world placement once. CameraRig remains the sole camera writer.
- `CameraRig` is the only writer of camera transforms. Phase 2 adds orientation damping and entrance offsets; see the controller contract below. No per-frame React state is used.
- One shadowed directional light, limited fill lights, DPR capped at 1.5. No external textures, postprocessing or downloaded model assets. Work Sans is bundled and self-hosted through Next.js's built-in font loader.

## Components

`app/page.tsx` supplies the heading and preview labels. `RoomPreview` loads the client Canvas and contains an error boundary/basic no-JS/WebGL message. `RoomCanvas` owns renderer and light setup. `PlaceholderRoom` composes architecture and props. `Workstation`, `PersonalProps` and two small primitives keep scene files manageable. No state manager or interaction abstraction is introduced.

The complete semantic portfolio fallback awaits confirmed Phase 3 content. Phase 2 includes a semantic introduction/retry on graphics failure, plus a no-JavaScript introduction. Preview metadata remains noindex until production content is confirmed.

## Phase 1 validation and limitations

The refinement pass includes actual headless Chrome screenshots at 1440 × 900 (Home and bike review) and 390 × 844 (mobile Home), saved in `artifacts/phase1/`. The user authorized headless Chrome after the native Windows capture API timed out. Chrome uses software WebGL for these captures. Mobile is an emulated viewport, not a physical-device test. No FPS measurement is claimed.

`artifacts/phase1/spatial-check.txt` records geometry bounds, major-prop mesh bounding-box separation, PC support height, camera-frustum coverage and chair occlusion sampling. The L-shaped workstation is checked per mesh, avoiding a false collision from the empty space inside its overall bounding box. Both monitors and the PC have zero chair hits across 25 front-face ray samples each. These geometry checks supplement browser inspection; they do not replace it.

Refinements: move Home left while retaining its 1.6 m height; move and slightly turn the floor-resting bike along the right wall; add PC feet resting at desktop height (0.795 m); lower/inset the window assembly so the curtain rod clears the ceiling; select Three's supported PCF shadow map explicitly. Curtains retain a central opening approximately 1.3 m wide for future scenery; no detailed outdoor assets were added. Browser runtime errors are recorded in `artifacts/phase1/browser-errors.json`.

The dependency audit reports five high-severity development-only entries in the Next ESLint glob dependency chain, rooted in [braces pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The audit's proposed automatic fix downgrades eslint-config-next to 14.2.35, so it was not applied to this Next 16 project. Recheck upstream tooling before production. There are no known production dependency findings in the current audit.

Phase 1 is approved. No repository was initialized and no commits were made because this workspace initially contained no repository.

## Phase 2 — entrance and camera

- `loading → ready → entering → exploring`. `SceneReadiness` waits for renderer creation, actual shader compilation and a rendered frame. Drei reports any real loaded assets; the current procedural room explicitly reports that no model downloads are needed. No timer simulates progress or delays readiness.
- `BootScreen` has one entry button, keyboard focus styling and a live readiness log. During loading the Canvas is excluded from the accessibility tree/tab order. After entry, focus moves to the labelled Canvas.
- One coordinated GSAP timeline now controls the approximately four-second cinematic entrance: dark workstation close-up, monitor/PC/lamp reveal, pullback to approved Home, temporary CSS treatment, name/caption reveal and name collapse. Skip intro/Escape finish it safely. Reduced motion uses a brief simplified reveal and no camera travel or damping; manual input remains available afterward.
- `CameraRig` writes the camera in `useFrame`. GSAP writes shared numeric camera/light channels in `EntranceMotion`, never Three.js camera transforms. The rig's `transition` mode excludes drag input throughout the hero introduction; `explore` enables it only after brand settlement; `focus` is reserved for Phase 3. No focus transitions or destinations are implemented.
- Exploration keeps the exact approved Home position `(-1.35, 1.6, 1.7)`. Relative yaw is bounded to [-1.25, 0.75] rad; relative pitch to [-0.34, 0.22] rad. The room is enclosed on all sides. These bounds include a clear view of the whole gravel bike without moving the camera or props.
- Mouse and touch use Pointer Events, primary-pointer filtering, pointer capture, cancel/blur cleanup and an 8 CSS-pixel movement threshold. Drags suppress the subsequent click in capture phase. Touch-action is restricted only on the Canvas; HTML UI retains normal interaction. Arrow keys rotate; Home resets orientation. Escape/focus panels belong to Phase 3.
- Demand rendering is invalidated during the GSAP reveal or while damping settles. Idle views stop requesting frames. Vector/angle math uses refs and scalar values rather than React state per frame.
- A renderer error or context loss exposes a semantic introduction and retry. Retry reloads the scene. Content is intentionally limited to confirmed identity/interests until Phase 3 content is supplied.

### Phase 2 verification

Actual headless Chrome tests exercise keyboard entry, normal entrance state progression/focus transfer, short gestures versus drags, mouse rotation, rotation clamps, keyboard look/reset, touch swipe, mobile overflow/scroll prevention, reduced motion, context loss, retry and WebGL startup failure. Screenshots/report are in `artifacts/phase2/`. Bike screenshots are reached through real mouse/touch input on the default Home route, not the alternate Phase 1 review camera.

Limitations: browser tests use software WebGL and an emulated 390 × 844 touch viewport rather than physical mobile hardware; no FPS or cross-browser claims are made. The forced WebGL-failure scenario logs expected context-creation errors, recorded separately from normal interaction errors. No hotspots, destination panels, final Blender assets, Lenis, ScrollTrigger or new runtime dependencies are introduced. Stop for approval before Phase 3.

### Developer boot sequence visual refinement

The entrance now uses a typed startup command, blinking cursor, sequentially revealed live status rows and a lightweight SVG signal drawn with GSAP. The signal is explicitly decorative, not measured performance or model-training data. Its SVG path length is measured once, and fractional dash offsets prevent the stroke from jumping between hidden and fully drawn.

The segmented bar represents three actual scene checks: browser renderer, mounted geometry/lights, and compilation plus the first rendered frame. Status follows `INITIALIZING → LOADING → READY`. Future asset counts still come from Drei. The decorative animation never sets readiness or controls the button; **ENTER MY ROOM** unlocks directly from the existing ready phase. Reduced motion shows complete command/graph/log presentation without typing, drawing, blinking or progress colour transitions.

Only `BootScreen`, the new `BootGraph`, boot-specific CSS and one reduced-motion prop at the UI shell changed. All Canvas/scene/camera source hashes and room configuration match the pre-refinement versions. No dependency changes.

Actual-browser screenshots and 16 passing assertions are saved in `artifacts/phase2-boot-refinement/`. A real scene-bundle network request was held in the external test harness to expose slow loading; no application readiness state was mocked and no loading delay was added to the application. The report records the actual LOADING/READY mutations, partial progress, typing/drawing samples, cached entry, keyboard entry, mobile layout and reduced-motion checks.

### Phone placement refinement

The phone lies face down beside the keyboard, outside the left edge of the mousepad. Its three rear lenses and flash face upward. Keyboard and mouse geometry remain placeholders for Blender refinement in Phase 4.

`phone` in `lib/room-config.ts` owns the desk-local position, XYZ Euler rotation (radians), scale, object name, Contact anchor name/offset and flip-pivot name. The root remains `iphone_15_pro_max`; local +Z is the screen and local -Z is the rear. The configured +π/2 X rotation puts the screen on the desk. The screen underside rests at desktop height 0.795 m.

`contact_anchor` is a child of `iphone_flip_pivot`, so it follows the phone during a future flip. The provisional `camera_contact` target derives from the full phone and desk transforms, including scale. The phone root records its future `contact` destination as metadata only; no click behaviour is added.

Future Contact animation plan: preserve the root's configured placement, lift the phone at least roughly 0.10 m above the desk for clearance, rotate the centre pivot around local X by π to reveal the screen, then settle using the model's bounds (including the camera bump). Read the moving anchor's world position during focus. Cancel/reverse the animation cleanly on exit. This is a plan only: no GSAP timeline, flip handler or hotspot is implemented in this refinement.

### Cinematic workstation and branded hero refinement

The current implementation plan is in `docs/implementation-plan.md`, including the Phase 3 indicator requirements as documentation only.

`lib/entrance.ts` supplies configurable desktop/portrait close-up poses and the shared camera/light data shape. `useEntranceTimeline` coordinates the entire entrance; `CameraRig` remains the only transform writer, and the existing Pointer Events/keyboard Free Look block is retained. `SceneLighting` routes existing emissive materials and lights into separate monitor, PC, lamp and room channels. Idle lighting does not perform repeat material updates.

After the Home pullback, `HeroBrand` presents one real HTML **MOHD HAFIZ** heading in Work Sans 800 and the exact **Hello, World!** caption. Subtle CSS blur/dimming and scanlines are temporary. A short aria-hidden rightward smear accompanies the crisp name during reveal and collapse. The same heading compresses and travels to the measured lower-left anchor, retaining uppercase Work Sans in its smaller form. The persistent smear is static and restrained; reduced motion hides distortion. No duplicate accessible heading is mounted.

Final brand block: desktop left 32 px/bottom 28 px; mobile left 20 px/bottom 24 px. The name uses 24 px desktop/20 px mobile type, positioned 7 px above the 16 px subtitle line, **Web Designer | Kuala Lumpur, MY**. Soft shadows improve contrast on the name, caption and subtitle. Resize and a mid-introduction reduced-motion change finish safely at a consistent clear Home state. Review-route changes remount a fresh entry. No audio, extra animation packages, hotspot indicators, destination panels or Blender models are introduced.

Screenshots, exact renderer camera/light checks and camera-path geometry checks are stored in `artifacts/phase2-cinematic/`. Captures use actual Chrome replays to sample the short sequence. Software WebGL and emulated mobile viewports do not establish physical-device FPS or cross-browser performance.
