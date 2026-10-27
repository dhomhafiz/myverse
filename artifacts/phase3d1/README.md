# Phase 3D.1 validation evidence

Production build: `.tmp/phase3d1-validated`, served at `http://127.0.0.1:3026`.

- [Main report: 67 passing assertions](browser-report.json): direct entry, camera draw samples, five persistent cycles, exact saved pose and chair hierarchy, cancellation, context-loss Retry, history, hover, keyboard, touch and reduced motion. The recorded context-loss console error is intentional.
- [Interruption report: eight passing checks](interruptions-report.json): blocked model request and Retry, repeat activation, route cancellation, late network completions, refresh, actual hidden/visible tab switching. Recorded asset errors are intentional.
- [Pipeline report: six passing checks](pipeline-regression-report.json): includes controlled reproduction against the [original SceneReadiness source](SceneReadiness.baseline.txt). This establishes the cancelled-RAF latch defect; it does not establish the exact cause of the original historical browser stall.
- [Recorded return frames](return-filmstrip.html): manual viewer of real Chrome screencast frames. Frame 030 shows the right-monitor focus; later frames show Home. Exact filenames/frame counts can vary between reruns.

| Evidence | Image |
| --- | --- |
| Direct Skills loading | [01-skills-loading.png](01-skills-loading.png) |
| Real finalization | [02-skills-finalizing.png](02-skills-finalizing.png) |
| Successful direct return | [03-skills-return-home.png](03-skills-return-home.png) |
| Skills idle / hover / keyboard focus | [Idle](04-skills-idle.png), [Hover](05-skills-hover.png), [Focus](06-skills-focus.png) |
| Projects idle / hover | [Idle](07-work-idle.png), [Hover](08-work-hover.png) |
| Five alternating room cycles | [09-five-cycles-home.png](09-five-cycles-home.png) |
| Simulated context-loss recovery UI | [10-recoverable-failure.png](10-recoverable-failure.png) |
| Settled mobile Skills content | [11-mobile-skills.png](11-mobile-skills.png) |
| Actual blocked GLTF error recovery UI | [12-asset-error.png](12-asset-error.png) |

Run the existing production build in one PowerShell session:

```powershell
$env:NEXT_BUILD_DIR='.tmp/phase3d1-validated'
npm.cmd run start -- --port 3026
```

Then, from the repository root:

```powershell
$env:TEST_URL='http://127.0.0.1:3026'
node artifacts/phase3d1/browser-test.cjs
node artifacts/phase3d1/interruptions-test.cjs
node artifacts/phase3d1/pipeline-regression.cjs
```

Browser scripts use the already installed Chrome and native CDP/WebSocket APIs; no test dependencies were added. They create isolated profiles inside `.tmp` and close their own browser processes. The pipeline harness uses the installed TypeScript compiler and local mocks for deterministic lifecycle ordering.

Limitations: historical 22-second stall not reproduced in baseline Chrome; physical-device/cross-browser behavior, timed watchdog expiry and exhaustive per-pixel transition checks are not certified. An exploratory forced CDP frozen/active sequence did not resume initialization, while actual tab switching passed; forced-freeze recovery is not claimed fixed. See the Phase 3D.1 record in `docs/implementation-plan.md`.

Visual approval remains **PENDING**. Overall Phase 3 is **incomplete**.


Files changed for this task (existing unrelated edits were preserved):

- `lib/room-preparation.ts`
- `components/canvas/SceneReadiness.tsx`, `RoomCanvas.tsx`, `CameraRig.tsx`
- `components/ui/ExperienceShell.tsx`, `RoomPreview.tsx`, new `ReturnToRoom.tsx`
- `components/work/RoomReturnControl.tsx`, `ProjectsGallery.tsx`
- `components/skills/SkillsDashboard.tsx`
- `app/work/[slug]/page.tsx`, `app/globals.css`
- `docs/implementation-plan.md`
- New test scripts, original-source fixture, reports, screenshots and filmstrip under this evidence directory.
