import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves this repo at /Personalization/, so built asset URLs
  // need that prefix. Local dev and the single-file build both want '/', which
  // is what BASE_PATH defaults to.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // The storefront is what the demo opens on and it draws no charts.
        // Splitting the charting library out keeps it off the first-paint
        // critical path; it loads when someone opens an intelligence tab.
        manualChunks: {
          charts: ['recharts'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
