# Original illustration animation — first stage

The original 64 × 64 starter PNGs are unchanged. `MonsterView` supplies the
starter image to `MonsterSprite`; `illustration.ts` splits Moss at draw time into
body, flower and vine layers, retaining the original RGBA values. Two-pixel
underlaps at the joints reduce gaps. Anchors are in original image coordinates.

While idle, Moss's body stays planted. The flower swings ±5 degrees over 3.1s;
the vine uses a separate 2.3s cycle (±8 degrees plus a small secondary oscillation).
Both rotate about their attachment, without moving the whole image. These are
UI-only decorative clocks, independent of game randomness.
During attack/hurt, all layers inherit body movement once and add secondary
anchor-based sway from core's `poseAt`. Timing and battle decisions remain in
core. Reduced-motion mode uses `restPose` and disables the decorative clocks.
A 256 × 256 backing canvas
allows quarter-source-pixel movement; source artwork is still 64 × 64 and
interpolation is disabled.

Ignis uses five layers: body, belly, head (including horns), tail, tail tip.
The belly breathes; the head nods; the tail tip inherits the tail's rotation.
Aqua uses five layers: body, jaw, dorsal fin, front fin, tail. Jaw and fins
have different motion periods. All three retain the source pixels at rest.
Dedicated blinking and mouth replacement frames remain unimplemented.

Fused descendants use 39 material-channel assets in `parts-detailed`, with
near/far wing pairs and the public core appearance configuration. These
starter-specific masks are a separate rendering path, never a substitute for
a child's phenotype. Source atlases and import instructions are documented
in `src/mocks/assets/parts-detailed/README.md`.

Public core imports only: `poseAt`, `restPose`, `Pose`, and existing composition
APIs via `@core/core/index.ts`. No additional game API or core mutation needed.
Core now exposes material palettes; the part validation uses `referenceColors()`.

Validation:

- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run sprites:check`
- With `SPRITE_CANVAS_MODULE` pointing to an installed `@napi-rs/canvas/index.js`,
  `node scripts/check-illustration.mjs` checks pixel-exact rest reconstruction,
  three Moss layers and different moving frames; writes a review contact sheet.

No image generation or alteration of the source PNGs is used in this stage.
