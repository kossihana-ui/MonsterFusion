// Import the six requested revisions without changing other parts or core rigs.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { default: sharp } = await import(process.env.SPRITE_SHARP_MODULE
  ? pathToFileURL(process.env.SPRITE_SHARP_MODULE).href : "sharp");
const root = resolve("src/mocks/assets/parts-detailed");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json")));
const specs = [
  ["horns/upright", 0, 0, 30, 26, 16, 25],
  ["horns/spiral", 1, 0, 30, 16, 16, 10],
  ["jaw/fangs", 2, 0, 18, 11, 14, 2],
  ["jaw/tusks", 0, 1, 18, 14, 14, 2],
  ["jaw/beak", 1, 1, 18, 14, 14, 2],
  ["jaw/maw", 2, 1, 18, 16, 14, 2],
];
const outline = "#1b2030", bone = ["#3a5a4a", "#6aa88a", "#a8e0c0"];
function color(r, g, b, key) {
  const light = .25*r + .55*g + .2*b;
  if (light < 51) return outline;
  if (key.startsWith("horns/") || key === "jaw/beak")
    return bone[light < 100 ? 0 : light < 170 ? 1 : 2];
  return g > r*1.05 && g > b*.92
    ? bone[light < 160 ? 1 : 2] : light < 112 ? "#4a4a6a" : "#8a8ab0";
}
const measurements = {};
for (const [key, col, row, artWidth, artHeight, ox, oy] of specs) {
  // Top-left horns extend just below the nominal half-height cell boundary.
  const top = row ? 560 : 0, bottom = row ? 1024 : 550;
  const { data, info } = await sharp(resolve(root, "source-compact-v3.png"))
    .extract({ left: col*512, top, width: 512, height: bottom-top })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0=info.width, y0=info.height, x1=-1, y1=-1;
  for (let y=0; y<info.height; y++) for (let x=0; x<info.width; x++)
    if (data[(y*info.width+x)*4+3] > 210) {
      x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
    }
  if (x1 < x0) throw new Error("Empty source: "+key);
  const scaled = await sharp(data, { raw: info })
    .extract({ left:x0, top:y0, width:x1-x0+1, height:y1-y0+1 })
    .resize(artWidth, artHeight, { fit:"fill", kernel:"nearest" }).raw().toBuffer();
  const jaw=key.startsWith("jaw/"), width=jaw?28:32, height=jaw?24:32;
  const dx=jaw?5:1, dy=jaw?2:1, out=Buffer.alloc(width*height*4);
  const bounds={left:width,top:height,right:0,bottom:0};
  for (let y=0; y<artHeight; y++) for (let x=0; x<artWidth; x++) {
    const i=(y*artWidth+x)*4;
    if (scaled[i+3]<=210) continue;
    const hex=color(scaled[i],scaled[i+1],scaled[i+2],key);
    out.set([... [1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)),255], ((y+dy)*width+x+dx)*4);
    bounds.left=Math.min(bounds.left,x+dx); bounds.right=Math.max(bounds.right,x+dx);
    bounds.top=Math.min(bounds.top,y+dy); bounds.bottom=Math.max(bounds.bottom,y+dy);
  }
  await sharp(out,{raw:{width,height,channels:4}})
    .png({adaptiveFiltering:false}).toFile(resolve(root,key+".png"));
  manifest[key]={width,height,origin:{x:ox,y:oy}};
  measurements[key]={...manifest[key],bounds,artWidth:bounds.right-bounds.left+1};
}
writeFileSync(resolve(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
writeFileSync(resolve(root,"manifest.ts"),"export const partUrls: Record<string, string> = {\n"+
  Object.keys(manifest).map(key=>`  "${key}": new URL("./${key}.png", import.meta.url).href,`).join("\n")+"\n};\n");
writeFileSync(resolve(root,"compact-measurements.json"),JSON.stringify(measurements,null,2)+"\n");
console.log("Imported upright horns and five compact revisions; "+Object.keys(manifest).length+" active parts.");
