import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { galleriaContent } from './build/content.js';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [galleriaContent({ root })],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173 },
});
