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

// The image has to exist, be an image, and be the shape a large card wants.
const src = html.match(meta('property', 'og:image'))[1];
const path = `dist${src.startsWith('/') ? '' : '/'}${src.replace(/^https?:\/\/[^/]+/, '')}`;
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
