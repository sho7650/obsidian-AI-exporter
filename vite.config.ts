import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';
import manifest from './src/manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        {
          src: 'src/_locales',
          dest: '.'
        }
      ]
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Vite injects `<link rel="modulepreload" crossorigin>` into every HTML
    // entry. Chrome refuses to reuse those preloads inside an extension —
    // "cross-world extension resource mismatch" — so each is fetched twice and
    // logs two warnings: five per popup open, three per offscreen document.
    // They are harmless, but the extension error console is where real
    // failures get diagnosed (issue #433 and ADR-030 were both read out of it),
    // and burying it under fixed noise costs more than the preloads save:
    // these are chrome-extension:// URLs, so there is no network latency to
    // hide, and nothing here is imported dynamically. `false` also drops the
    // polyfill chunk, which exists only to emulate the same feature.
    modulePreload: false,
    rollupOptions: {
      input: {
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173
    }
  }
});
