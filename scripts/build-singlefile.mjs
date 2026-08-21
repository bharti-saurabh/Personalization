/**
 * Produces dist-single/prosports-personalization-demo.html: the whole prototype
 * as one self-contained file that runs from a file:// URL or any static host.
 *
 * The normal build code-splits and lazy-loads, which is right for a served app
 * and wrong for a file you email to someone. This target rebuilds with
 * splitting disabled, then inlines the single JS and CSS bundle into the HTML.
 */
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const OUT = 'dist-single';
const STAGE = '.single-stage';

rmSync(STAGE, { recursive: true, force: true });

await build({
  configFile: false, // do not inherit the served build's manualChunks
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(process.cwd(), './src') } },
  build: {
    outDir: STAGE,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000, // fold fonts/images into the JS
    rollupOptions: {
      output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: 'app[extname]' },
    },
  },
  logLevel: 'warn',
});

// assetFileNames without a directory puts the bundle at the stage root.
const assets = readdirSync(STAGE, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.js') || f.endsWith('.css'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
const js = readFileSync(path.join(STAGE, jsFile), 'utf8');
const css = cssFile ? readFileSync(path.join(STAGE, cssFile), 'utf8') : '';

let html = readFileSync(path.join(STAGE, 'index.html'), 'utf8');
// Drop the emitted tags and re-add the same content inline.
html = html
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '')
  .replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '')
  // Replacement *functions*, not strings: String.replace treats `$$`, `` $` ``
  // and `$'` in a replacement string as escapes, which silently rewrites
  // React's `$$typeof` to `$typeof` and corrupts the bundle into a parse error.
  .replace('</head>', () => `<style>${css}</style>\n</head>`)
  .replace('</body>', () => `<script type="module">${js}</script>\n</body>`);

mkdirSync(OUT, { recursive: true });
const target = path.join(OUT, 'prosports-personalization-demo.html');
writeFileSync(target, html);
rmSync(STAGE, { recursive: true, force: true });

console.log(`${target}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
