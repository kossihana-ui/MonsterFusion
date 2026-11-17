// The share card is the one thing a stranger sees before they see the game,
// and it fails silently: a typo in a meta name just means no card. So it is
// checked rather than trusted.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const built = await readFile('dist/index.html', 'utf8').catch(() => null);
assert.ok(built, 'dist/index.html is missing - run `npm run build` first');

const meta = (attr, name) => new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*content=["']([^"']+)["']`);
const want = [
  ['name', 'description'],
  ['property', 'og:type'], ['property', 'og:title'], ['property', 'og:description'],
  ['property', 'og:image'], ['property', 'og:image:width'], ['property', 'og:image:height'],
  ['property', 'og:locale'], ['property', 'og:site_name'],
  ['name', 'twitter:card'], ['name', 'twitter:title'],
  ['name', 'twitter:description'], ['name', 'twitter:image'],
];
for (const [attr, name] of want) {
  for (const [label, source] of [['index.html', html], ['dist/index.html', built]]) {
    const found = source.match(meta(attr, name));
    assert.ok(found, `${label} has no ${name}`);
    assert.ok(found[1].trim().length > 0, `${label}: ${name} is empty`);
  }
}

const card = html.match(meta('name', 'twitter:card'))[1];
assert.equal(card, 'summary_large_image', 'a small card wastes the art');

const description = html.match(meta('name', 'description'))[1];
assert.ok(description.length >= 60, 'the description is too short to say anything');
assert.ok(description.length <= 200, `the description is ${description.length} characters and will be cut`);

// A crawler never runs the page, so both addresses have to be absolute, and
// the image has to sit under the address the card points at. Checked on the
// BUILT page, because that is the one that gets served, and because the build
// rewrites these to wherever MONSTERFUSION_SITE points - the source file only
// carries the default.
const site = built.match(meta('property', 'og:url'))[1];
const src = built.match(meta('property', 'og:image'))[1];
for (const [name, value] of [['og:url', site], ['og:image', src]]) {
  assert.ok(/^https:\/\//.test(value), `${name} is "${value}" - a crawler needs the host`);
}
assert.ok(site.endsWith('/'), `og:url is "${site}" - it should end at the site root`);
assert.ok(src.startsWith(site), `og:image "${src}" is not under og:url "${site}"`);

// The source has to be a correct page on its own too: somebody reading it, or
// serving it off disk, should not find a placeholder.
const sourceSite = html.match(meta('property', 'og:url'))[1];
assert.ok(/^https:\/\/[^/]+\//.test(sourceSite), `index.html's og:url is "${sourceSite}"`);
assert.ok(
  html.match(meta('property', 'og:image'))[1].startsWith(sourceSite),
  "index.html's og:image is not under its own og:url",
);

// The asset prefix and the address the build was made for cannot disagree: a
// page built for one path and served from another 404s on every file it asks
// for, which is a blank screen, not a broken image.
//
// Only checked against MONSTERFUSION_SITE, because that is what says where
// this build is going. A plain `npm run build` is the local one - it is
// served from the root while og:url still names the published site, and that
// is correct rather than a mismatch.
const asset = built.match(/<script[^>]*src=["']([^"']+)["']/)?.[1] ?? '';
assert.ok(asset.startsWith('/'), `the build asks for "${asset}", which is not an absolute path`);
const going = process.env.MONSTERFUSION_SITE?.trim();
if (going) {
  const path = new URL(going.endsWith('/') ? going : `${going}/`).pathname;
  assert.ok(asset.startsWith(path), `built for "${going}" but asks for "${asset}"`);
  assert.equal(site, new URL(going.endsWith('/') ? going : `${going}/`).href, 'og:url follows the build');
}

// The address a player hands to somebody else has to survive into the build.
// It is a `define`, so a typo in its name does not fail anything - it simply
// leaves the fallback in place, and every shared streak quietly points at the
// old site.
const going_home = process.env.MONSTERFUSION_HOME?.trim();
if (going_home) {
  const want = going_home;
  // `dist/` is the root of what gets served, so the asset's own prefix - the
  // path the site sits under - has to come off before it names a file.
  const prefix = going ? new URL(going.endsWith('/') ? going : `${going}/`).pathname : '/';
  const file = `dist/${asset.replace(/^\.\//, '').replace(prefix, '')}`;
  const bundle = await readFile(file, 'utf8').catch(() => null);
  assert.ok(bundle, `${file} is missing`);
  assert.ok(bundle.includes(want),
    `the build was made for ${want} but no shared streak will carry it`);
}

// The image has to exist in the build, be an image, and be the shape a large
// card wants. The build is what is served AT og:url, so the path is relative.
const path = `dist/${src.slice(site.length)}`;
const info = await stat(path).catch(() => null);
assert.ok(info, `${path} is not in the build`);
assert.ok(info.size > 10_000, `${path} is only ${info.size} bytes - did it render?`);
assert.ok(info.size < 2_000_000, `${path} is ${info.size} bytes, too heavy for a preview`);

const bytes = await readFile(path);
const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
assert.ok(isJpeg || isPng, `${path} is neither a JPEG nor a PNG`);

const width = Number(html.match(meta('property', 'og:image:width'))[1]);
const height = Number(html.match(meta('property', 'og:image:height'))[1]);
assert.ok(width >= 600 && height >= 315, `${width}x${height} is below the large-card minimum`);
const ratio = width / height;
assert.ok(ratio > 1.7 && ratio < 2.1, `${ratio.toFixed(2)}:1 will be cropped; a large card wants about 1.91:1`);

console.log(`Share card: 13 tags present in source and build, ${src} is a valid ${isJpeg ? 'JPEG' : 'PNG'} at ${width}x${height} (${ratio.toFixed(2)}:1, ${Math.round(info.size / 1024)}KB).`);
