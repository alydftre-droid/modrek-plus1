import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const OFFICIAL_PRODUCTION_SUPABASE_URL = "https://qteuqfntsocsdbjmdvmr.supabase.co";
const OFFICIAL_PRODUCTION_SUPABASE_PROJECT_ID = "qteuqfntsocsdbjmdvmr";
const OFFICIAL_PRODUCTION_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_rN8ogJuF9T1Dy6aMkdLVeQ__RbfP19A";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.EXTERNAL_SUPABASE_URL || OFFICIAL_PRODUCTION_SUPABASE_URL),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(process.env.EXTERNAL_SUPABASE_PROJECT_REF || OFFICIAL_PRODUCTION_SUPABASE_PROJECT_ID),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(OFFICIAL_PRODUCTION_SUPABASE_PUBLISHABLE_KEY),
  },
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
