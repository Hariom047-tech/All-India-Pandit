import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds as a standalone bundle that gets dropped into the static
// PanditConnect site (../public/assets/hero-widget) and mounted into
// a <div id="hero-root"> from index.html — this is an "island", not
// a full SPA, so the output uses fixed (unhashed) filenames.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // In dev, serve the real site's /assets so image paths resolve;
  // in build, don't copy the whole site into the widget's output dir.
  publicDir: command === "serve" ? "../public" : false,
  build: {
    outDir: "../public/assets/hero-widget",
    emptyOutDir: true,
    rollupOptions: {
      input: "src/main.tsx",
      output: {
        entryFileNames: "hero-widget.js",
        chunkFileNames: "hero-widget-[name].js",
        assetFileNames: "hero-widget[extname]",
      },
    },
  },
}));
