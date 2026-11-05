import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// BASE_PATH lets the same build run at a domain root (Vercel/Netlify) or under
// /<repo>/ on GitHub Pages. VITE_SPACE=sample builds the practice copy with
// fake clients, published at <base>sample/.
const sample = process.env.VITE_SPACE === 'sample';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  resolve: { alias: { '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) } },
  plugins: [
    react(),
    {
      // iPhone labels the Home Screen icon from this tag, so the copies are easy to tell apart.
      name: 'space-title',
      transformIndexHtml: (html) => (sample ? html.replace('content="Fit Habits" />', 'content="FH Practice" />').replace('<title>Fit Habits</title>', '<title>Fit Habits Practice</title>') : html),
    },
    VitePWA({
      registerType: 'autoUpdate',
      // Keep the main app's service worker from answering for the practice copy.
      workbox: { navigateFallbackDenylist: sample ? [] : [/\/sample\//] },
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon-48.png', 'brand/logo-mark-sm.png', 'brand/logo-full-sm.png'],
      manifest: {
        name: sample ? 'Fit Habits Practice' : 'Fit Habits',
        short_name: sample ? 'FH Practice' : 'Fit Habits',
        id: sample ? 'fit-habits-practice' : 'fit-habits',
        description: 'Clients, payments and progress for Fit Habits training.',
        theme_color: '#15171C',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
