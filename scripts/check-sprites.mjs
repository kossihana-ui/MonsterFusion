import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const core = await server.ssrLoadModule("@core/core/index.ts");
  const renderer = await server.ssrLoadModule(
    "/src/components/sprites/renderer.ts",
  );
  const game = await server.ssrLoadModule("/src/mocks/game.ts");
  const manifest = renderer.partManifest;
  assert.deepEqual(
    Object.keys(manifest).sort(),
    core.requiredPartKeys(renderer.appearanceConfig).sort(),
  );
  const colors = new Set(
    core.referenceColors().map((v) => v.slice(1).toLowerCase()),
  );
  // All body/wing/size combinations must use a back/body/front sandwich.
  for (const bodyShape of Object.keys(renderer.appearanceConfig.rigs))
    for (const wings of ["feathered", "membrane", "crystal", "ethereal"])
      for (const size of Object.keys(renderer.appearanceConfig.sizeScales)) {
        const c = renderer.compositionFor({ ...game.initialMonsters[0].phenotype, bodyShape, wings, size });
        const back = c.layers.findIndex(l => l.part === `wings/${wings}-far`);
        const front = c.layers.findIndex(l => l.part === `wings/${wings}-near`);
        const body = c.layers.findIndex(l => l.kind === "body");
        assert.ok(back < body && body < front, "wing depth order");
        assert.ok(c.layers[back].scale < c.layers[front].scale, "far wing perspective");
      }
  for (const [key, spec] of Object.entries(manifest)) {
    const png = readFileSync(resolve("src/mocks/assets/parts-detailed", key + ".png"));
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    const w = png.readUInt32BE(16),
      h = png.readUInt32BE(20);
    assert.equal(w, spec.width);
    assert.equal(h, spec.height);
    assert.ok(
      spec.origin.x >= 0 &&
        spec.origin.x < w &&
        spec.origin.y >= 0 &&
        spec.origin.y < h,
      key + " origin",
    );
    const blocks = [];
    for (let n = 8; n < png.length;) {
      const length = png.readUInt32BE(n);
      if (png.toString("ascii", n + 4, n + 8) === "IDAT")
        blocks.push(png.subarray(n + 8, n + 8 + length));
      n += length + 12;
    }
    const data = inflateSync(Buffer.concat(blocks));
    let visible = 0, left = w, right = -1, bottom = -1;
    const usedColors = new Set();
    for (let y = 0; y < h; y++) {
      assert.equal(data[y * (w * 4 + 1)], 0);
      for (let x = 0; x < w; x++) {
        const i = y * (w * 4 + 1) + 1 + x * 4,
          alpha = data[i + 3];
        assert.ok(alpha === 0 || alpha === 255, key + " antialiasing");
        if (alpha) {
          visible++;
          left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y);
          const color = data.subarray(i, i + 3).toString("hex");
          usedColors.add(color);
          assert.ok(colors.has(color), key + " palette");
          if (key.startsWith("body/")) assert.notEqual(color, "ff00ff");
        }
      }
    }
    assert.ok(visible > 0, key + " is empty");
    if (key.startsWith("jaw/")) {
      assert.ok(right - left + 1 <= 18, key + " compact width");
      assert.deepEqual(spec.origin, { x: 14, y: 2 });
    }
    if (key === "horns/upright") {
      assert.ok(bottom <= 27, "upright below brow");
      assert.deepEqual(spec.origin, { x: 16, y: 25 });
    }
    if (key === "horns/spiral") {
      assert.ok(bottom <= 16, "spiral below brow");
      assert.deepEqual(spec.origin, { x: 16, y: 10 });
    }
    if (/^(wings|horns|jaw)\//.test(key))
      assert.ok(usedColors.size <= 5, key + " detail density");
    if (key.startsWith("wings/")) {
      assert.deepEqual(spec.origin, { x: 4, y: 27 });
      assert.equal(data[27 * (w * 4 + 1) + 1 + 4 * 4 + 3], 255, key + " attachment pixel");
    }
  }
  const bytes = new Uint8ClampedArray([27, 32, 48, 255, 255, 0, 255, 0]);
  renderer.recolorPixels(bytes, [{ from: "#1b2030", to: "#123456" }]);
  assert.deepEqual([...bytes], [18, 52, 86, 255, 255, 0, 255, 0]);
  const before = JSON.stringify(game.getCoreMonster("starter-moss"));
  let parent = game.initialMonsters[0];
  for (let n = 0; n < 200; n++) {
    parent = (
      await game.gameAdapter.fuseMonsters(
        parent,
        game.initialMonsters[(n + 1) % 3],
      )
    ).child;
    assert.ok(parent.phenotype);
    assert.equal(parent.image, "");
    for (const layer of renderer.compositionFor(parent.phenotype).layers)
      assert.ok(manifest[layer.part]);
  }
  assert.equal(JSON.stringify(game.getCoreMonster("starter-moss")), before);
  // Verify transform order and reflection around the attachment point.
  const calls = [];
  const ctx = {
    canvas: { width: 64, height: 64 },
    clearRect() {},
    save() {},
    restore() {},
    translate(...v) {
      calls.push(["translate", ...v]);
    },
    rotate(...v) {
      calls.push(["rotate", ...v]);
    },
    scale(...v) {
      calls.push(["scale", ...v]);
    },
    drawImage(...v) {
      calls.push(["draw", ...v.slice(1)]);
    },
  };
  const pose = {
    layers: [
      {
        part: "horns/spiral",
        anchor: { x: 26, y: 14 },
        scale: 0.75,
        flipX: false,
        transform: {
          offsetX: 2,
          offsetY: 1,
          rotation: 10,
          scaleX: 1,
          scaleY: 1,
          opacity: 1,
        },
      },
    ],
    flash: 0,
  };
  renderer.drawPose(
    ctx,
    pose,
    new Map([["horns/spiral", { width: 32, height: 32 }]]),
    true,
  );
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["translate", "rotate", "scale", "draw"],
  );
  assert.deepEqual(calls[0], ["translate", 40, 15]);
  assert.deepEqual(calls[2], ["scale", -1, 1]);
  assert.deepEqual(calls[3], ["draw", -12, -7.5, 24, 24]);
  renderer.drawPose(
    ctx,
    { layers: [{ ...pose.layers[0], part: "missing/part" }], flash: 0 },
    new Map(),
  );
  console.log(
    "PASS: 40 parts, compact jaw/horn bounds, exact palette/binary alpha/origins, recoloring, 200 fused generations, immutable core, anchor transforms, mirroring, missing-layer skip.",
  );

  // Optional offline visual QA using an installed native Canvas implementation.
  if (process.env.SPRITE_CANVAS_MODULE) {
    const { createCanvas, loadImage } = await import(
      pathToFileURL(process.env.SPRITE_CANVAS_MODULE).href
    );
    const raw = new Map();
    for (const key of Object.keys(manifest))
      raw.set(
        key,
        await loadImage(resolve("src/mocks/assets/parts-detailed", key + ".png")),
      );
    function render(phenotype, options = { animation: "idle", timeMs: 0 }) {
      const composition = renderer.compositionFor(phenotype),
        assets = new Map();
      for (const layer of composition.layers) {
        const img = raw.get(layer.part),
          c = createCanvas(img.width, img.height),
          ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height);
        renderer.recolorPixels(data.data, renderer.materialMappings(layer.part, composition.colorMappings));
        ctx.putImageData(data, 0, 0);
        assets.set(layer.part, c);
      }
      const c = createCanvas(64, 64);
      renderer.drawPose(
        c.getContext("2d"),
        core.poseAt(composition, options),
        assets,
        options.facingRight,
      );
      return c;
    }
    const preview = createCanvas(768, 512),
      ctx = preview.getContext("2d");
    ctx.fillStyle = "#141b1f";
    ctx.fillRect(0, 0, 768, 512);
    ctx.imageSmoothingEnabled = false;
    const specimens = [
      ...game.initialMonsters.map((m) => m.phenotype),
      ...["slim", "serpentine", "winged"].map((bodyShape) => ({
        ...parent.phenotype,
        bodyShape,
        size: "small",
      })),
    ];
    specimens.forEach((p, i) => {
      ctx.drawImage(
        render(p),
        (i % 3) * 256,
        Math.floor(i / 3) * 256,
        256,
        256,
      );
    });
    mkdirSync("artifacts/sprites", { recursive: true });
    const compact = createCanvas(1152, 1152), cc = compact.getContext("2d");
    cc.fillStyle = "#141b1f"; cc.fillRect(0, 0, 1152, 1152); cc.imageSmoothingEnabled = false;
    ["horns/upright", "horns/spiral", "jaw/fangs", "jaw/tusks", "jaw/beak", "jaw/maw"].forEach((key, row) => {
      Object.keys(renderer.appearanceConfig.rigs).forEach((bodyShape, col) => {
        const [kind, value] = key.split("/");
        const phenotype = { ...game.initialMonsters[1].phenotype, bodyShape,
          wings: "none", crest: "none", horns: "none", jaw: "normal", size: "medium",
          [kind]: value };
        cc.drawImage(render(phenotype), col * 192, row * 192, 192, 192);
      });
    });
    writeFileSync("artifacts/sprites/compact-preview.png", compact.toBuffer("image/png"));
    const wingSheet = createCanvas(1152, 768), wc = wingSheet.getContext("2d");
    wc.fillStyle = "#141b1f"; wc.fillRect(0, 0, 1152, 768); wc.imageSmoothingEnabled = false;
    ["feathered", "membrane", "crystal", "ethereal"].forEach((wings, row) => {
      Object.keys(renderer.appearanceConfig.rigs).forEach((bodyShape, col) => {
        const phenotype = { ...game.initialMonsters[1].phenotype, bodyShape, wings,
          size: "medium", horns: "none", crest: "none", jaw: "normal" };
        wc.drawImage(render(phenotype), col * 192, row * 192, 192, 192);
      });
    });
    writeFileSync("artifacts/sprites/wing-pairs-preview.png", wingSheet.toBuffer("image/png"));
    writeFileSync(
      "artifacts/sprites/composition-preview.png",
      preview.toBuffer("image/png"),
    );
    const motion = createCanvas(1024, 384),
      mc = motion.getContext("2d");
    mc.fillStyle = "#141b1f";
    mc.fillRect(0, 0, 1024, 384);
    mc.imageSmoothingEnabled = false;
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 8; col++)
        mc.drawImage(
          render(game.initialMonsters[1].phenotype, {
            animation: row ? "hurt" : "attack",
            timeMs: col * (row ? 50 : 80),
            facingRight: true,
          }),
          col * 128,
          row * 192,
          128,
          128,
        );
    writeFileSync(
      "artifacts/sprites/motion-preview.png",
      motion.toBuffer("image/png"),
    );
    console.log(
      "Rendered composition and motion contact sheets in artifacts/sprites.",
    );
  }
} finally {
  await server.close();
}
