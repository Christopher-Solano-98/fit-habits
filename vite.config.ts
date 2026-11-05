import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

// BASE_PATH lets the same build run at a domain root (Vercel/Netlify) or under
// /<repo>/ on GitHub Pages.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  resolve: { alias: { '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)) } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/icon.svg'],
      manifest: {
        name: 'Fit Habits',
        short_name: 'Fit Habits',
        description: 'Clients, payments and progress for Fit Habits training.',
        theme_color: '#15171C',
        background_color: '#F4F3EF',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
