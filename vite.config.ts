import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// IMPORTANT:
// Lovable Cloud auto-injects VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY / VITE_SUPABASE_PROJECT_ID
// pointing to the *same* Supabase project that hosts the Edge Functions, Auth, Storage, and DB
// migrations. Overriding those values here causes a split-brain (frontend writes to one project,
// backend reads from another) which makes new user signups invisible to the admin dashboard and
// breaks every edge function call. Do NOT redefine them.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    VitePWA({
      strategies: "generateSW",
      filename: "sw.js",
      injectRegister: false,
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "modrek-brand-symbol.png", "site.webmanifest"],
      includeManifestIcons: true,
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: undefined,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/auth\/callback/, /^\/oauth\/native-callback/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,woff,woff2,ttf}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
            handler: "NetworkFirst",
            options: {
              cacheName: "mp-html-v4",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.(?:js|css|woff2?|ttf)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "mp-assets-v4",
              expiration: { maxEntries: 160, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => /\.(?:jpg|jpeg|png|webp|avif|gif|svg)$/i.test(url.pathname) && (url.hostname.endsWith(".b-cdn.net") || url.hostname.endsWith(".supabase.co")),
            handler: "CacheFirst",
            options: {
              cacheName: "mp-images-v4",
              expiration: { maxEntries: 350, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\.m3u8(?:\?.*)?$/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "mp-hls-manifests-v4",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request, url }) => !request.headers.has("range") && /\.(?:ts|m4s)(?:\?.*)?$/i.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "mp-hls-segments-v4",
              expiration: { maxEntries: 220, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    target: "es2019",
    cssCodeSplit: true,
    sourcemap: false,
    minify: "esbuild",
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "supabase": ["@supabase/supabase-js"],
          "ui-vendor": ["framer-motion", "lucide-react"],
          "query": ["@tanstack/react-query"],
        },
      },
    },
  },
}));
