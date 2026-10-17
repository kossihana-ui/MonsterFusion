import { composeAppearance, poseAt } from "@core/core/index.ts";
import type {
  MonsterPhenotype,
  Pose,
  SpriteComposition,
  PoseOptions,
} from "@core/core/index.ts";
import manifestData from "../../mocks/assets/parts/manifest.json";
import { partUrls } from "../../mocks/assets/parts/manifest";

export interface PartAsset {
  width: number;
  height: number;
  origin: { x: number; y: number };
}
export const partManifest: Record<string, PartAsset> = manifestData;
const images = new Map<string, Promise<HTMLImageElement | null>>();
const tinted = new Map<string, HTMLCanvasElement>();
const compositions = new Map<string, SpriteComposition>();
function cache<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  if (map.size > 256) map.delete(map.keys().next().value!);
  return value;
}
export function compositionFor(phenotype: MonsterPhenotype) {
  const next = composeAppearance(phenotype);
  return compositions.get(next.key) ?? cache(compositions, next.key, next);
}
export function loadPart(key: string): Promise<HTMLImageElement | null> {
  if (!partUrls[key] || !partManifest[key]) return Promise.resolve(null);
  const previous = images.get(key);
  if (previous) return previous;
  const result = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      images.delete(key);
      resolve(null);
    };
    img.src = partUrls[key];
  });
  images.set(key, result);
  return result;
}
const rgb = (hex: string) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
export function recolorPixels(
  data: Uint8ClampedArray,
  mappings: SpriteComposition["colorMappings"],
) {
  const lut = new Map(
    mappings.map((m) => [parseInt(m.from.slice(1), 16), rgb(m.to)]),
  );
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const color = lut.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (color) {
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
    }
  }
}
export async function prepareParts(composition: SpriteComposition) {
  const assets = new Map<string, HTMLCanvasElement>();
  await Promise.all(
    composition.layers.map(async (layer) => {
      const key =
        layer.part + "|" + composition.colorMappings.map((m) => m.to).join(",");
      const existing = tinted.get(key);
      if (existing) {
        assets.set(layer.part, existing);
        return;
      }
      const img = await loadPart(layer.part);
      if (!img) return;
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      recolorPixels(pixels.data, composition.colorMappings);
      ctx.putImageData(pixels, 0, 0);
      cache(tinted, key, canvas);
      assets.set(layer.part, canvas);
    }),
  );
  return assets;
}
export function drawPose(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  assets: Map<string, HTMLCanvasElement>,
  facingRight = false,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;
  for (const layer of pose.layers) {
    const t = layer.transform;
    const key =
      t.partOverride && assets.has(t.partOverride)
        ? t.partOverride
        : layer.part;
    const part = assets.get(key),
      spec = partManifest[key];
    if (!part || !spec) continue;
    ctx.save();
    ctx.globalAlpha = t.opacity;
    ctx.translate(
      (facingRight ? ctx.canvas.width - layer.anchor.x : layer.anchor.x) +
        t.offsetX,
      layer.anchor.y + t.offsetY,
    );
    ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scaleX * (layer.flipX !== facingRight ? -1 : 1), t.scaleY);
    ctx.drawImage(
      part,
      -spec.origin.x * layer.scale,
      -spec.origin.y * layer.scale,
      part.width * layer.scale,
      part.height * layer.scale,
    );
    ctx.restore();
  }
  if (pose.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = pose.flash;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}
export async function renderMonster(
  phenotype: MonsterPhenotype,
  options: PoseOptions = { timeMs: 0 },
) {
  const composition = compositionFor(phenotype),
    assets = await prepareParts(composition);
  const canvas = document.createElement("canvas");
  canvas.width = composition.canvas.width;
  canvas.height = composition.canvas.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  drawPose(ctx, poseAt(composition, options), assets, options.facingRight);
  return canvas;
}
