import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const CORE = fileURLToPath(new URL('../MonsterFusion-Core/src', import.meta.url));

export default defineConfig({
  resolve: { alias: { '@core': CORE } },
  server: { fs: { allow: [ROOT, CORE] } },
});
