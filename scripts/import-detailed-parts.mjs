// Deterministic atlas extraction, nearest-neighbour sizing and material indexing.
// Artwork is generated with imagegen; this script does not invent replacement art.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
const { default: sharp } = await import(process.env.SPRITE_SHARP_MODULE
  ? pathToFileURL(process.env.SPRITE_SHARP_MODULE).href : "sharp");
const root = resolve("src/mocks/assets/parts-detailed");
const manifest = JSON.parse(readFileSync("src/mocks/assets/parts/manifest.json"));
const palette = {
  outline: "#1b2030",
  body: ["#4a4a6a", "#8a8ab0", "#c8c8e0"],
  belly: ["#6a5a3a", "#b09a6a", "#e0d0a0"],
  keratin: ["#3a5a4a", "#6aa88a", "#a8e0c0"],
  membrane: ["#5a3a6a", "#a06ac0", "#d0a8e8"],
  eye: ["#7a2a2a", "#d04a4a", "#f09a9a"],
};
const rows = [
  ["body/round", "body/slim", "body/muscular", "body/serpentine", "body/winged", "body/finned"],
  ["eyes/normal", "eyes/sharp", "eyes/round", "eyes/multi", "eyes/glowing", "eyes/slit"],
  ["crest/flower", "crest/fin", "crest/crystal", "crest/mane", "crest/antenna", "crest/crown"],
  ["horns/single", "horns/twin", "horns/crown", "horns/spiral", "jaw/fangs", "jaw/tusks"],
  ["jaw/beak", "jaw/maw", "tail/short", "tail/long", "tail/spiked", "tail/twin"],
  ["tail/vine", "wings/feathered", "wings/membrane", "wings/crystal", "wings/ethereal"],
];
const bodyBoxes = [[14,21,36,34],[19,13,28,44],[15,13,38,44],
  [12,11,40,46],[16,13,34,43],[12,24,42,29]];
const ys = [0, 285, 442, 660, 828, 1030, 1254];
function crc(bytes) {
  let n = 0xffffffff;
  for (const b of bytes) {
    n ^= b;
    for (let k = 0; k < 8; k++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  }
  return (n ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type), n = Buffer.alloc(4), c = Buffer.alloc(4);
  n.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([n, t, data, c]);
}
function png(w, h, rgba) {
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h,4);
  header[8] = 8; header[9] = 6;
  const scan = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(scan, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from("89504e470d0a1a0a","hex"),
    chunk("IHDR",header),chunk("IDAT",deflateSync(scan)),chunk("IEND",Buffer.alloc(0))]);
}
function indexed(r,g,b,key) {
  const light = .25*r+.55*g+.2*b;
  if (light < 48) return palette.outline;
  let material = "body";
  if (key.startsWith("horns/") || key === "jaw/fangs" || key === "jaw/tusks" || key === "jaw/beak")
    material = "keratin";
  else if (key.startsWith("eyes/")) material = light > 220 ? "belly" : "eye";
  else if (r > b * 1.12 && g > b * 1.08) material = "belly";
  else if (key.startsWith("crest/") || key.startsWith("wings/")) material = "membrane";
  else if (g > r * 1.08 && g > b * 1.08) material = "keratin";
  return palette[material][light < 105 ? 0 : light < 185 ? 1 : 2];
}
for (let row = 0; row < rows.length; row++) for (let col = 0; col < rows[row].length; col++) {
  const key = rows[row][col], spec = manifest[key];
  const source = row === 0 ? "source-bodies.png" : "source-atlas.png";
  const meta = await sharp(resolve(root,source)).metadata();
  const xs = row === 3 ? [0,210,420,630,884,1040,1254] : [0,220,422,632,836,1040,1254];
  const box = row === 0 ? {
    left: Math.floor(col % 3 * meta.width / 3), top: Math.floor(Math.floor(col/3)*meta.height/2),
    width: Math.floor(meta.width/3), height: Math.floor(meta.height/2),
  } : { left: xs[col], top: ys[row], width: xs[col+1]-xs[col], height: ys[row+1]-ys[row] };
  const { data, info } = await sharp(resolve(root,source)).extract(box).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=info.width,y0=info.height,x1=0,y1=0;
  for (let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) {
    if(data[(y*info.width+x)*4+3] > 190) { x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y); }
  }
  let target = row === 0 ? bodyBoxes[col] : [1,1,spec.width-2,spec.height-2];
  if(key.startsWith("eyes/")) target=[1,1,18,8];
  if(key === "horns/spiral") target=[1,1,42,25];
  if(key.startsWith("jaw/") && key !== "jaw/maw") target=[5,8,18,12];
  const [dx,dy,w,h] = target;
  const resized = await sharp(data,{raw:info}).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1})
    .resize(w,h,{fit:"fill",kernel:"nearest"}).raw().toBuffer();
  const out = Buffer.alloc(spec.width*spec.height*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*4;
    if(resized[i+3] < 190) continue;
    const hex=indexed(resized[i],resized[i+1],resized[i+2],key).slice(1);
    const o=((y+dy)*spec.width+x+dx)*4;
    out[o]=parseInt(hex.slice(0,2),16);out[o+1]=parseInt(hex.slice(2,4),16);out[o+2]=parseInt(hex.slice(4,6),16);out[o+3]=255;
  }
  const dest=resolve(root,key+".png");mkdirSync(dirname(dest),{recursive:true});
  writeFileSync(dest,png(spec.width,spec.height,out));
}
writeFileSync(resolve(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
writeFileSync(resolve(root,"manifest.ts"),"export const partUrls: Record<string, string> = {\n"+
  Object.keys(manifest).map(key=>`  "${key}": new URL("./${key}.png", import.meta.url).href,`).join("\n")+"\n};\n");
console.log("Imported 35 detailed, material-indexed parts. Original artwork and legacy parts preserved.");
