import type { Pose } from "@core/core/index.ts";

type Region = "body" | "crest" | "tail" | "head" | "belly" | "tail-tip" | "jaw" | "fin" | "dorsal";
export interface IllustrationPart {
  kind: Region;
  canvas: HTMLCanvasElement;
  anchor: readonly [number, number];
  parent?: { kind: Region; anchor: readonly [number, number] };
}
const mossUrl = new URL("../../mocks/assets/starters/moss-v2-64.png", import.meta.url).href;
const ignisUrl = new URL("../../mocks/assets/starters/ignis-v2-64.png", import.meta.url).href;
const aquaUrl = new URL("../../mocks/assets/starters/aqua-v2-64.png", import.meta.url).href;
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
  if (kind === "head") return 3 * Math.sin(timeMs / 3400 * turn);
  if (kind === "tail-tip") return 5 * Math.sin(timeMs / 1500 * turn);
  if (kind === "jaw") return 3.5 * (1 - Math.cos(timeMs / 2800 * turn));
  if (kind === "fin") return 8 * Math.sin(timeMs / 1300 * turn);
  if (kind === "dorsal") return 4 * Math.sin(timeMs / 1900 * turn);
  return 0;
}
export function ignisRegion(x: number, y: number): Region {
  if (x >= 54 && y >= 34) return "tail-tip";
  if (x >= 47 && y >= 35) return "tail";
  if (y < 32) return "head";
  if (x >= 20 && x < 31 && y >= 32 && y < 47) return "belly";
  return "body";
}
export function aquaRegion(x: number, y: number): Region {
  if (x >= 52 && y >= 28) return "tail";
  if (x >= 28 && y < 24) return "dorsal";
  if (x >= 38 && y >= 43) return "fin";
  if (x < 39 && y >= 35) return "jaw";
  return "body";
}
type PartSpec = Omit<IllustrationPart, "canvas">;
function illustrationRig(url: string): { region: (x: number, y: number) => Region; parts: PartSpec[] } {
  if (url === mossUrl) return { region: mossRegion, parts: [
    { kind: "body", anchor: [32, 54] }, { kind: "tail", anchor: [45, 49] },
    { kind: "crest", anchor: [27, 34] },
  ] };
  if (url === ignisUrl) return { region: ignisRegion, parts: [
    { kind: "body", anchor: [32, 54] }, { kind: "belly", anchor: [25, 39] },
    { kind: "tail", anchor: [47, 48] },
    { kind: "tail-tip", anchor: [54, 44], parent: { kind: "tail", anchor: [47, 48] } },
    { kind: "head", anchor: [31, 32] },
  ] };
  if (url === aquaUrl) return { region: aquaRegion, parts: [
    { kind: "body", anchor: [32, 38] }, { kind: "tail", anchor: [52, 38] },
    { kind: "dorsal", anchor: [35, 24] }, { kind: "jaw", anchor: [36, 37] },
    { kind: "fin", anchor: [40, 44] },
  ] };
  return { region: () => "body", parts: [{ kind: "body", anchor: [32, 54] }] };
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
        const rig = illustrationRig(url);
        resolve(rig.parts.map(spec => {
          const { kind } = spec;
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 64;
          const ctx = canvas.getContext("2d")!;
          const copy = ctx.createImageData(64, 64);
          for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            const owner = rig.region(x, y);
            // Two source pixels of underlap at the attachment prevent cracks.
            const attachment = rig.parts.find(part => part.kind === owner);
            const underlap = kind === "body" && owner !== "body" && attachment &&
              Math.hypot(x - attachment.anchor[0], y - attachment.anchor[1]) < 5;
            if (owner === kind || underlap) {
              const i = (y * 64 + x) * 4;
              copy.data.set(pixels.data.subarray(i, i + 4), i);
            }
          }
          ctx.putImageData(copy, 0, 0);
          return { ...spec, canvas };
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
  highlight?: string,
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
    const motionKind = part.kind === "head" ? "horns" :
      part.kind === "tail-tip" ? "tail" : part.kind === "fin" ? "wings-front" :
      part.kind === "dorsal" ? "crest" : part.kind === "belly" ? "body" : part.kind;
    const local = pose.layers.find(layer => layer.kind === motionKind)?.transform;
    ctx.save();
    if (independentIdle && idleTimeMs !== null && part.parent) {
      const [px, py] = part.parent.anchor;
      ctx.translate(px, py);
      ctx.rotate(illustrationIdleAngle(part.parent.kind, idleTimeMs) * Math.PI / 180);
      ctx.translate(-px, -py);
    }
    // Only highlight actual isolated artwork; never pretend an entire head is an eye.
    const selected = highlight === part.kind || (highlight === 'tail' && part.kind === 'tail-tip') || (highlight === 'crest' && part.kind === 'dorsal') || (highlight === 'body' && part.kind === 'belly');
    const canHighlight = parts.some(p => p.kind === highlight || (highlight === 'crest' && p.kind === 'dorsal'));
    if (canHighlight) { ctx.globalAlpha = selected ? 1 : .45; if (selected) { ctx.shadowColor='#ffe680'; ctx.shadowBlur=8; } }
    const [x, y] = part.anchor;
    ctx.translate(x, y);
    if (independentIdle && idleTimeMs !== null) {
      ctx.rotate(illustrationIdleAngle(part.kind, idleTimeMs) * Math.PI / 180);
      if (part.kind === "belly") {
        const breath = Math.sin(idleTimeMs / 2700 * Math.PI * 2);
        ctx.scale(1 + .025 * breath, 1 + .035 * breath);
      }
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
