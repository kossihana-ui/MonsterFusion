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

Ignis and Aqua currently use the original full-colour image as one layer, with
breathing/attack/hurt movement. Their head, jaw, fins and tail separation,
blinking and mouth replacement frames are not implemented yet.

Fused descendants still use the existing generic part renderer. These
starter-specific masks are not yet reusable anatomy parts for every body rig.
The next art step is covered joint artwork and full-colour/material-channel
parts compatible with all six body shapes; do not use a starter picture as a
substitute for a child's phenotype.

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
