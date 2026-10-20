import type { Pose } from "@core/core/index.ts";

type Region = "body" | "crest" | "tail";
export interface IllustrationPart {
  kind: Region;
  canvas: HTMLCanvasElement;
  anchor: readonly [number, number];
}
const mossUrl = new URL("../../mocks/assets/starters/moss-v2-64.png", import.meta.url).href;
const cache = new Map<string, Promise<IllustrationPart[]>>();

// Presentation-only idle motion. Each attachment has its own clock rather than
// being a smaller copy of the body's breathing cycle. Null means truly still.
export function illustrationIdleAngle(kind: Region, timeMs: number): number {
  const turn = Math.PI * 2;
  if (kind === "crest")
    return 5 * Math.sin(timeMs / 3100 * turn);
  if (kind === "tail")
    return 8 * Math.sin(timeMs / 2300 * turn) +
      1.5 * Math.sin(timeMs / 1150 * turn);
  return 0;
}

// Source-space masks, not replacement artwork. Every original colour survives.
// The split crosses the narrow flower stem and vine root, not the face.
export function mossRegion(x: number, y: number): Region {
  if (x >= 45 && y >= 22) return "tail";
  if (y < 35 && x < 45) return "crest";
  return "body";
}
export function prepareIllustration(url: string): Promise<IllustrationPart[]> {
  const existing = cache.get(url);
  if (existing) return existing;
  const pending = new Promise<IllustrationPart[]>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => { cache.delete(url); reject(new Error("Illustration unavailable")); };
    image.onload = () => {
      try {
        if (image.naturalWidth !== 64 || image.naturalHeight !== 64)
          throw new Error("Starter illustration must be 64 × 64");
        const source = document.createElement("canvas");
        source.width = source.height = 64;
        const context = source.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, 64, 64);
        const split = url === mossUrl;
        const regions: Region[] = split ? ["body", "tail", "crest"] : ["body"];
        resolve(regions.map(kind => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 64;
          const ctx = canvas.getContext("2d")!;
          const copy = ctx.createImageData(64, 64);
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            const owner = mossRegion(x, y);
            // Two source pixels of underlap at the attachment prevent cracks.
            const underlap = kind === "body" && (
              (owner === "crest" && y >= 33) ||
              (owner === "tail" && x < 47 && y >= 43)
            );
            if (!split || owner === kind || underlap) {
              const i = (y * 64 + x) * 4;
              copy.data.set(pixels.data.subarray(i, i + 4), i);
            }
          }
          ctx.putImageData(copy, 0, 0);
          return { kind, canvas, anchor: kind === "crest" ? [27, 34] :
            kind === "tail" ? [45, 49] : [32, 54] };
        }));
      } catch (error) { cache.delete(url); reject(error); }
    };
    image.src = url;
  });
  cache.set(url, pending);
  return pending;
}

export function drawIllustration(
  ctx: CanvasRenderingContext2D, pose: Pose,
  parts: IllustrationPart[], facingRight: boolean,
  idleTimeMs: number | null = null,
) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;
  const body = pose.layers.find(layer => layer.kind === "body")?.transform;
  if (!body) return;
  const independentIdle = parts.length > 1 && pose.animation === "idle";
  ctx.save();
  // A 64-pixel source remains unchanged; a 4x drawing surface permits smoother
  // movement than rounding every position to one whole source pixel.
  ctx.scale(ctx.canvas.width / 64, ctx.canvas.height / 64);
  ctx.translate(32 + (independentIdle ? 0 : body.offsetX),
    54 + (independentIdle ? 0 : body.offsetY));
  ctx.scale(facingRight ? -1 : 1, 1);
  if (!independentIdle) {
    ctx.rotate(body.rotation * Math.PI / 180 * (facingRight ? -1 : 1));
    ctx.scale(1 + (body.scaleX - 1) * .45, 1 + (body.scaleY - 1) * .45);
  }
  ctx.translate(-32, -54);
  for (const part of parts) {
    const local = pose.layers.find(layer => layer.kind === part.kind)?.transform;
    ctx.save();
    const [x, y] = part.anchor;
    ctx.translate(x, y);
    if (independentIdle && idleTimeMs !== null) {
      ctx.rotate(illustrationIdleAngle(part.kind, idleTimeMs) * Math.PI / 180);
    } else if (!independentIdle && part.kind !== "body" && local) {
      // Inherit the body's movement once; only secondary sway is local.
      ctx.rotate((local.rotation - body.rotation) * .55 * Math.PI / 180 *
        (facingRight ? -1 : 1));
    }
    ctx.drawImage(part.canvas, -x, -y);
    ctx.restore();
  }
  ctx.restore();
  if (pose.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = pose.flash;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}
