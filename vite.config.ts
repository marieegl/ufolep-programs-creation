import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Relative base so the same build works from GitHub Pages and from a file:// double-click.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { outDir: "dist", assetsInlineLimit: 100_000_000 },
});
