import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";

// Optional native canvas harness; production uses the browser's own Canvas API.
if (!process.env.SPRITE_CANVAS_MODULE)
  throw new Error("Set SPRITE_CANVAS_MODULE to an installed @napi-rs/canvas entry.");
const { createCanvas, Image, loadImage } = await import(pathToFileURL(process.env.SPRITE_CANVAS_MODULE).href);
globalThis.document = { createElement: () => createCanvas(64, 64) };
globalThis.Image = class extends Image {
  set src(url) {
    super.src = readFileSync(resolve("src/mocks/assets/starters", url.split("/").at(-1)));
  }
};
const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
try {
  const { prepareIllustration, drawIllustration } = await server.ssrLoadModule("/src/components/sprites/illustration.ts");
  const core = await server.ssrLoadModule("@core/core/index.ts");
  const monsters = core.createStarterMonsters({ rng: core.createSeededRandom(12345) });
  const sheet = createCanvas(1024, 768), sc = sheet.getContext("2d");
  sc.fillStyle = "#141b1f"; sc.fillRect(0, 0, 1024, 768);
  const filenames = ["moss", "ignis", "aqua"];
  for (let row = 0; row < 3; row++) {
    const url = pathToFileURL(resolve(`src/mocks/assets/starters/${filenames[row]}-v2-64.png`)).href;
    const parts = await prepareIllustration(url);
    assert.equal(parts.length, row === 0 ? 3 : 1);
    const composition = core.composeAppearance(monsters[row].phenotype);
    const rest = createCanvas(64, 64), rc = rest.getContext("2d");
    drawIllustration(rc, core.restPose(composition), parts, false);
    const original = createCanvas(64, 64), oc = original.getContext("2d");
    const img = await loadImage(readFileSync(new URL(url))); oc.drawImage(img, 0, 0);
    assert.ok(Buffer.from(rc.getImageData(0, 0, 64, 64).data).equals(Buffer.from(oc.getImageData(0, 0, 64, 64).data)),
      `${filenames[row]}: rest pose must retain every source pixel`);
    const frames = [];
    for (let col = 0; col < 4; col++) {
      const c = createCanvas(256, 256);
      drawIllustration(c.getContext("2d"), core.poseAt(composition, {
        animation: "idle", timeMs: col * 650,
      }), parts, false);
      frames.push(c.toBuffer("image/png"));
      sc.drawImage(c, col * 256, row * 256);
    }
    assert.notDeepEqual(frames[0], frames[1], "Animation must move");
  }
  mkdirSync("artifacts/sprites", { recursive: true });
  writeFileSync("artifacts/sprites/illustration-motion.png", sheet.toBuffer("image/png"));
  console.log("Original pixels preserved for all 3 starters; Moss has 3 layers; animation frames differ.");
} finally { await server.close(); }

