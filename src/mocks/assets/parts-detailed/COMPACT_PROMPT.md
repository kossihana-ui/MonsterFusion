# Compact parts revision

Generated with the built-in image generation tool. Original preserved as `source-compact-v3.png`; deterministic palette/grid conversion: `scripts/import-compact-parts.mjs`.

```text
MonsterFusion part sprite. Pixel art, no anti-aliasing, no gradients, no text, no background, fully transparent outside the shape.
VIEW: three-quarter view, the creature faces slightly LEFT and toward the viewer. Every part must be drawn for this same view. Never draw a part straight-on or in pure side view.
LIGHT: single UPPER LEFT source. Upper-left light, lower-right shade.
OUTLINE: 1px outline #1b2030 on silhouettes, interiors never heavier.
COLOURS: only outline #1b2030; body shade #4a4a6a base #8a8ab0 light #c8c8e0; belly shade #6a5a3a base #b09a6a light #e0d0a0; keratin shade #3a5a4a base #6aa88a light #a8e0c0; membrane shade #5a3a6a base #a06ac0 light #d0a8e8; eye shade #7a2a2a base #d04a4a light #f09a9a; accent #ff00ff. Material channels, no other colours. DETAIL DENSITY 3 to 5 colours per part, simple strong readable pixel clusters.
Create ONE transparent atlas of SIX separate sprites in exactly THREE columns and TWO rows, equal cells and generous transparent margins. No labels/grid. Each cell has one asset. Order:
TOP LEFT upright oryx HORNS: tall pair sweeps UP slightly BACK. Left horn narrower and foreshortened, right nearer larger. Never curves down toward face. Ridges dense at roots. Conceptual 32x32 canvas, root midpoint (16,25), no art below y27. Green keratin plus dark outline ONLY.
TOP MIDDLE RAM SPIRAL HORNS: SHALLOW wide heavy ridged curls beside head, not dangling across eyes. Unequal sizes for left/far and right/near. Conceptual32x32, attachment midpoint (16,10), absolute LOWEST edge y16. Horn tips must stay beside head, open space below centre. Shallow sideways spiral shape maximum16pixels tall and30wide, green keratin+outline ONLY.
TOP RIGHT CLOSED FANG MOUTH: lip with two short upper fangs protruding down/left. Compact mouth,18px of art width inside28x24 canvas, attachment top centre(14,2). Body-shade dark lip/interior, green keratin teeth.
BOTTOM LEFT TUSK MOUTH: compact lower jaw, two tusks curving up, left farther/smaller. 18px art width inside28x24, top centre attachment(14,2). Protrudes lower LEFT, green keratin teeth and body shade dark mouth.
BOTTOM MIDDLE HOOKED BEAK: compact short forward/down-left hooked beak, not long nose.18px art width inside28x24, attachment top centre(14,2). Green keratin+outline.
BOTTOM RIGHT OPEN MAW: small readable open jaw with a few chunky teeth top/bottom, dark mouth.18px art width inside28x24, top centre attachment(14,2), protrudes down-left. Body shade interior, green keratin teeth.
All jaws designed for a22px wide face, very compact and readable at tiny resolution. No head/body/eyes. Plain transparent background. Never make the ram horns tall or drooping. All sprites are independent, no touching across cells.
```
