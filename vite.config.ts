import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Fajlovi iz public/ (ikonice, manifest) sa putanjom od korena sajta. */
function publicFiles(dir = 'public'): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? publicFiles(p) : ['/' + relative('public', p).replace(/\\/g, '/')];
  });
}

/** Pravi sw.js pri build-u: src/pwa/sw.js + spisak svih fajlova aplikacije i verzija (heš spiska). */
function serviceWorker(): Plugin {
  return {
    name: 'alutim-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['/index.html', ...publicFiles(), ...Object.keys(bundle).map((f) => '/' + f)].filter((f) => f !== '/sw.js');
      const version = createHash('sha256').update(files.sort().join('\n')).digest('hex').slice(0, 12);
      const source = `const PRECACHE = ${JSON.stringify(files)};\nconst VERSION = '${version}';\n${readFileSync('src/pwa/sw.js', 'utf8')}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/tests/**/*.test.ts'],
    setupFiles: ['src/tests/setup.ts'],
  },
});
