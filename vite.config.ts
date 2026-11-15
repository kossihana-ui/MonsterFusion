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
function shareCardSite(site: URL): Plugin {
  return {
    name: 'monsterfusion-share-card-site',
    transformIndexHtml(html) {
      if (site.href === PUBLISHED_SITE) return html;
      return html.split(PUBLISHED_SITE).join(site.href);
    },
  };
}

const site = siteFromEnv();

export default defineConfig({
  base: baseFromEnv(),
  plugins: [shareCardSite(site)],
  define: {
    // Read by src/shared/share.ts, so a shared streak carries the address
    // this build was made for rather than one written into the source.
    __MONSTERFUSION_SITE__: JSON.stringify(site.href),
  },
  resolve: { alias: { '@core': CORE } },
  server: { fs: { allow: [ROOT, CORE] } },
});
