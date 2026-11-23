import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CORE = fileURLToPath(new URL('../MonsterFusion-Core/src', import.meta.url));

/**
 * Where this build will live, as one value.
 *
 * The address used to be written out in four places - the base path, two
 * `og:` tags, the text of a shared streak - and moving the site meant finding
 * all four. It is one environment variable now and everything else is derived
 * from it, so a new domain is one line in the workflow.
 *
 * `MONSTERFUSION_SITE` is the whole address, trailing slash and all:
 *
 *   https://kossihana-ui.github.io/MonsterFusion/   (GitHub Pages, in a path)
 *   https://monsterfusion.example/                  (a domain of its own)
 *
 * Absent, it falls back to the published address, so a plain `vite build`
 * still produces a page whose share card points somewhere real.
 */
export const PUBLISHED_SITE = 'https://kossihana-ui.github.io/MonsterFusion/';

export function siteFromEnv(env: NodeJS.ProcessEnv = process.env): URL {
  const given = env.MONSTERFUSION_SITE?.trim();
  if (!given) return new URL(PUBLISHED_SITE);
  // A site is a directory, not a file: without the slash, `new URL('og.jpg',
  // site)` resolves against its parent and loses the last segment.
  return new URL(given.endsWith('/') ? given : `${given}/`);
}

/**
 * Where people are sent, which is not always where this build is served.
 *
 * It was the same value until the game went up on itch.io, and there the two
 * come apart: the page a player opens is
 * `https://kureating544.itch.io/monsterfusion`, but the files run inside an
 * iframe on `https://html-classic.itch.zone/html/<id>/`. A shared streak that
 * carried the address it was served from would hand out that second one - a
 * bare game with no page around it, and an id that changes on every upload.
 *
 * So `MONSTERFUSION_HOME` is the front door: the address a player gives to
 * somebody else. `MONSTERFUSION_SITE` stays what it was - where this
 * particular build's files live - and with no home set they are the same
 * thing, as they are for GitHub Pages on its own.
 */
export function homeFromEnv(env: NodeJS.ProcessEnv = process.env): URL {
  const given = env.MONSTERFUSION_HOME?.trim();
  if (!given) return siteFromEnv(env);
  // Left exactly as given, unlike a site: nothing is resolved against this,
  // and a page is not a directory. itch.io answers
  // `/monsterfusion/` with a 301 to `/monsterfusion`, and there is no reason
  // to hand somebody an address that bounces.
  return new URL(given);
}

/**
 * The prefix every asset URL carries.
 *
 * Taken from the site address when one was given, because the two cannot be
 * allowed to disagree: a page served from /MonsterFusion/ but built for /
 * 404s on every file it asks for.
 *
 * With nothing set at all it is the root, NOT the published site's path. A
 * plain `vite build` is what the local dist server serves, from the root, and
 * deriving the path from the fallback address broke it - every asset 404ing
 * and a blank page. `MONSTERFUSION_BASE` still overrides both.
 */
export function baseFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  if (env.MONSTERFUSION_BASE) return env.MONSTERFUSION_BASE;
  return env.MONSTERFUSION_SITE?.trim() ? siteFromEnv(env).pathname : '/';
}

/**
 * Rewrites the share card's absolute URLs at build time.
 *
 * They have to be absolute and they have to be in the HTML, because a crawler
 * reads the tags without running any of the page's JavaScript. Writing them
 * out by hand is what put the address in four places; the file keeps the
 * published address as its default, and this swaps it for wherever this
 * particular build is going.
 */
function shareCardSite(site: URL, sharing: boolean): Plugin {
  return {
    name: 'monsterfusion-share-card-site',
    transformIndexHtml(html) {
      // No card at all where the game may not point anywhere else. The tags
      // do nothing on a host that serves the game inside its own page, and
      // they would leave another site's address in the first file a
      // reviewer opens.
      if (!sharing) {
        return html.replace(
          new RegExp('[ \t]*<meta[^>]*(?:property="og:|name="twitter:)[^>]*>\n?', 'g'),
          '',
        );
      }
      if (site.href === PUBLISHED_SITE) return html;
      return html.split(PUBLISHED_SITE).join(site.href);
    },
  };
}

/**
 * Whether this build may hand a run to another website.
 *
 * ふりーむ！ does not allow a browser game to open one: 「WEBサイトへ
 * ジャンプするもの」は掲載されません. The share buttons open X and LINE, so
 * that build is made with MONSTERFUSION_SHARE=off and ships without them.
 *
 * A build-time constant rather than a runtime check, so the addresses are
 * not merely unreachable - they are not in the file a reviewer opens.
 */
export function sharingFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MONSTERFUSION_SHARE?.trim().toLowerCase() !== 'off';
}

const site = siteFromEnv();
const home = homeFromEnv();

export default defineConfig({
  base: baseFromEnv(),
  plugins: [shareCardSite(site, sharingFromEnv())],
  define: {
    // Read by src/shared/share.ts, so a shared streak carries the page a
    // player can open rather than one written into the source - and rather
    // than the address this build happens to be served from, which on
    // itch.io is an iframe on a CDN.
    __MONSTERFUSION_HOME__: JSON.stringify(home.href),
    // Read by src/components/ShareStreak.tsx. A literal, so the bundler can
    // see the dead branch and drop the X and LINE addresses with it.
    __MONSTERFUSION_SHARE__: JSON.stringify(sharingFromEnv()),
  },
  resolve: { alias: { '@core': CORE } },
  server: { fs: { allow: [ROOT, CORE] } },
});
