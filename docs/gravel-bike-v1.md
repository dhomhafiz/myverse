# Gravel bike asset integration v1

The room's `gravel_bike` visual now uses `public/models/gravel-white-black-unbranded-compact.glb`, loaded as one Drei `useGLTF` scene in `components/canvas/PersonalProps.tsx`. Its GLB hierarchy has the `gravel_bike_unbranded` root and eight mesh children for the brake calipers, drivetrain, drop cockpit, frame, front and rear wheels, rigid fork, and saddle/seatpost. The asset has 38,120 triangles, nine PBR materials, Draco mesh compression, and no texture images.

## Dimensions and placement

The unscaled, Y-up model is approximately 1.761 × 1.038 × 0.523 m, with its length along local X and width along local Z. The wheel centers are at local X ±0.53 m and Y 0.35 m; the lowest bound is approximately -0.0005 m, so the configured root sits on the floor without an added vertical offset.

`room.bike` retains its approved side-wall placement, facing direction, and unit scale: position `[2.22, 0, 0.68]`, yaw `-π/2 + 0.04`, scale `[1, 1, 1]`. The X position was moved 0.08 m inward from the prior placement to clear the handlebar envelope while keeping the bike against the side wall. The bike is level so both tires and the stand base meet the floor.

## Wooden rear-wheel stand

`Bike` loads `public/models/wooden-bike-stand.glb` alongside the bicycle, replacing the previous vertical display stand. This custom GLB contains wooden front/rear feet, paired rails, a tire seat, and the empty `Wheel_Axle_Anchor` at local `[0, 0.36453, 0]`. Its geometry is approximately 0.613 × 0.331 × 0.370 m and 5,072 triangles. The embedded asset metadata describes it as custom geometry based on a user-provided photograph; it credits no third-party 3D asset.

The rear wheel hub is at bike-local `[-0.53, 0.35, 0]`. `room.bikeStand` places the stand pivot at `[-0.53, 0, 0]` and scales uniformly to 0.96, bringing the axle anchor to approximately Y=0.350 while leaving the feet on the floor. Its two rails straddle the rear wheel in local Z. The bike's approved position, orientation, and Home camera remain unchanged.

## Validation

- TypeScript, ESLint, and the isolated production build passed after the stand replacement.
- The bike GLB is 172,516 bytes. The wooden stand GLB returned HTTP 200 with `Content-Length: 93,916` and contains 5,072 triangles.
- The production bike-review route reached `ready` and `exploring` with 40/40 assets ready. Its review screenshot shows the wooden tire seat centered beneath the rear wheel and the feet resting on the floor; no wall or drivetrain collision is visible. The bike transform and Home camera are unchanged.
- The Home, Free Look, and portrait captures linked below predate the wooden-stand swap. A fresh wooden-stand bike-review screenshot is attached to the current handoff; visual approval of the replacement remains pending. The browser emitted the existing `THREE.Clock` deprecation and focused-canvas `aria-hidden` warning.

## Previous stand visual evidence

- [Home camera view before wooden stand replacement](../artifacts/gravel-bike-integration/01-home.png)
- [Bike-focused review pose before wooden stand replacement](../artifacts/gravel-bike-integration/02-bike-focus.png)
- [Bike viewed using Free Look from Home before wooden stand replacement](../artifacts/gravel-bike-integration/03-bike-free-look.png)
- [Portrait mobile viewport before wooden stand replacement](../artifacts/gravel-bike-integration/04-mobile-bike.png)
