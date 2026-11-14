import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CORE = fileURLToPath(new URL('../MonsterFusion-Core/src', import.meta.url));

/*
 * GitHub Pages serves this at /MonsterFusion/, not at the root, so every asset
 * URL has to carry that prefix. It is an environment variable and not a
 * constant because the same build runs at the root locally (scripts/local-app-
 * server.mjs) and would 404 on every asset if the prefix were baked in.
 */
const base = process.env.MONSTERFUSION_BASE || '/';

export default defineConfig({
  base,
  resolve: { alias: { '@core': CORE } },
  server: { fs: { allow: [ROOT, CORE] } },
});
