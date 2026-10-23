// Import the imagegen revision: preserve source art, enforce palette/alpha/grid.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
const { default: sharp } = await import(process.env.SPRITE_SHARP_MODULE
  ? pathToFileURL(process.env.SPRITE_SHARP_MODULE).href : "sharp");
const root = resolve("src/mocks/assets/parts-detailed");
const manifest = JSON.parse(readFileSync(resolve(root,"manifest.json")));
const types = ["feathered","membrane","crystal","ethereal"];
const rows = [types.map(t=>`wings/${t}-far`),types.map(t=>`wings/${t}-near`),
  ["horns/single","horns/twin","horns/crown","horns/spiral"],
  ["jaw/fangs","jaw/tusks","jaw/beak","jaw/maw"]];
const source = resolve(root,"source-perspective-v2.png");
const ys=[0,290,610,855,1122], xs=[0,350,700,1050,1402];
const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const outline="#1b2030", body=["#4a4a6a","#8a8ab0"],
  bone=["#3a5a4a","#6aa88a","#a8e0c0"], membrane=["#5a3a6a","#a06ac0","#d0a8e8"];
function colour(r,g,b,key) {
  const lum=.25*r+.55*g+.2*b;
  if(lum<51) return outline;
  if(key.startsWith("horns/")) return bone[lum<100?0:lum<170?1:2];
  const green = g>r*1.05 && g>b*.92;
  if(key.startsWith("jaw/")) return green ? bone[lum<160?1:2] : body[lum<112?0:1];
  if(green) return bone[1];
  if(key.includes("ethereal")) return lum>170 ? "#ff00ff" : membrane[lum<100?0:1];
  if(key.endsWith("-far")) return membrane[lum<135?0:1];
  return membrane[lum<100?0:lum<180?1:2];
}
for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
  const key=rows[row][col];
  const crop={left:xs[col],top:ys[row],width:xs[col+1]-xs[col],height:ys[row+1]-ys[row]};
  const {data,info}=await sharp(source).extract(crop).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=info.width,y0=info.height,x1=0,y1=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>210) {
    x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  }
  const width=row===3?28:32,height=row===3?24:32;
  const target=row===0?[4,8,18,20]:row===1?[4,2,27,26]:row===2?[1,1,30,27]:[1,2,26,20];
  const [dx,dy,w,h]=target;
  const scaled=await sharp(data,{raw:info}).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1})
    .resize(w,h,{fit:"fill",kernel:"nearest"}).raw().toBuffer();
  const out=Buffer.alloc(width*height*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*4; if(scaled[i+3]<210) continue;
    const o=((y+dy)*width+x+dx)*4;
    out.set([...rgb(colour(scaled[i],scaled[i+1],scaled[i+2],key)),255],o);
  }
  // Locate the attachment on the imported silhouette, not on transparent padding.
  let origin;
  if(row<2) {
    // The root is the leftmost solid pixel in the bottom quarter.
    const candidates=[];
    for(let y=height-9;y<height;y++) for(let x=0;x<width;x++)
      if(out[(y*width+x)*4+3]) candidates.push({x,y});
    candidates.sort((a,b)=>a.x-b.x || b.y-a.y);
    const actual=candidates[0];
    if(!actual) throw new Error(`No wing root: ${key}`);
    const shifted=Buffer.alloc(out.length);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const nx=x+4-actual.x,ny=y+27-actual.y;
      if(nx>=0&&nx<width&&ny>=0&&ny<height)
        out.copy(shifted,(ny*width+nx)*4,(y*width+x)*4,(y*width+x+1)*4);
      else if(out[(y*width+x)*4+3]) throw new Error(`Clipped wing: ${key}`);
    }
    shifted.copy(out); origin={x:4,y:27};
  } else if(row===2) origin={x:16,y:col===3?10:25};
  else origin={x:14,y:2};
  const destination=resolve(root,key+".png");mkdirSync(dirname(destination),{recursive:true});
  await sharp(out,{raw:{width,height,channels:4}}).png({adaptiveFiltering:false}).toFile(destination);
  manifest[key]={width,height,origin};
}
for(const type of types) delete manifest[`wings/${type}`]; // Legacy PNGs remain on disk.
writeFileSync(resolve(root,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
writeFileSync(resolve(root,"manifest.ts"),"export const partUrls: Record<string, string> = {\n"+
  Object.keys(manifest).map(key=>`  "${key}": new URL("./${key}.png", import.meta.url).href,`).join("\n")+"\n};\n");
console.log("Imported 8 perspective wings, 4 horns and 4 jaws; 39 active parts.");
