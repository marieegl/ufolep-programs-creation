import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Safari (including iOS) refuses to run a `type="module"` script from a file:// URL, so
// a double-clicked or AirDropped copy opens blank on a phone while it works in Chromium.
// The bundle uses no module-only syntax (no import/export, no import.meta, no dynamic
// import), so it runs fine as a classic script — we just move it to the end of <body> so
// #root already exists when it executes (a module is deferred, a classic inline script is not).
function classicScriptForFileUrls(): Plugin {
  return {
    name: "classic-script-for-file-urls",
    enforce: "post", // after vite-plugin-singlefile has inlined the script into the html
    generateBundle(_options, bundle) {
      const html = bundle["index.html"];
      if (!html || html.type !== "asset" || typeof html.source !== "string") return;
      const match = html.source.match(/<script type="module"[^>]*>([\s\S]+?)<\/script>/);
      if (!match) return; // not inlined yet, or already patched — leave it alone
      const code = match[1];
      // Function replacers, so `$$`/`$&` in the minified bundle (React's $$typeof, etc.)
      // are inserted verbatim instead of being read as replacement patterns.
      html.source = html.source
        .replace(match[0], () => "")
        .replace("</body>", () => `<script>${code}</script></body>`);
    },
  };
}

// Relative base so the same build works from GitHub Pages and from a file:// double-click.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile(), classicScriptForFileUrls()],
  build: { outDir: "dist", assetsInlineLimit: 100_000_000 },
  // Stamped into the footer so a shared copy carries the day it was generated.
  define: { __DATE_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
});
