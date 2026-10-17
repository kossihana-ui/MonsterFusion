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
    core.requiredPartKeys().sort(),
  );
  const colors = new Set(
    Object.values(core.REFERENCE_PALETTE).map((v) => v.slice(1).toLowerCase()),
  );
  for (const [key, spec] of Object.entries(manifest)) {
    const png = readFileSync(resolve("src/mocks/assets/parts", key + ".png"));
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
    let visible = 0;
    for (let y = 0; y < h; y++) {
      assert.equal(data[y * (w * 4 + 1)], 0);
      for (let x = 0; x < w; x++) {
        const i = y * (w * 4 + 1) + 1 + x * 4,
          alpha = data[i + 3];
        assert.ok(alpha === 0 || alpha === 255, key + " antialiasing");
        if (alpha) {
          visible++;
          const color = data.subarray(i, i + 3).toString("hex");
          assert.ok(colors.has(color), key + " palette");
          if (key.startsWith("body/")) assert.notEqual(color, "ff00ff");
        }
      }
    }
    assert.ok(visible > 0, key + " is empty");
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
    for (const layer of core.composeAppearance(parent.phenotype).layers)
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
    new Map([["horns/spiral", { width: 44, height: 32 }]]),
    true,
  );
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["translate", "rotate", "scale", "draw"],
  );
  assert.deepEqual(calls[0], ["translate", 40, 15]);
  assert.deepEqual(calls[2], ["scale", -1, 1]);
  assert.deepEqual(calls[3], ["draw", -16.5, -9, 33, 24]);
  renderer.drawPose(
    ctx,
    { layers: [{ ...pose.layers[0], part: "missing/part" }], flash: 0 },
    new Map(),
  );
  console.log(
    "PASS: 35 parts, exact palette/binary alpha/origins, recoloring, 200 fused generations, immutable core, anchor transforms, mirroring, missing-layer skip.",
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
        await loadImage(resolve("src/mocks/assets/parts", key + ".png")),
      );
    function render(phenotype, options = { animation: "idle", timeMs: 0 }) {
      const composition = core.composeAppearance(phenotype),
        assets = new Map();
      for (const layer of composition.layers) {
        const img = raw.get(layer.part),
          c = createCanvas(img.width, img.height),
          ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height);
        renderer.recolorPixels(data.data, composition.colorMappings);
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
