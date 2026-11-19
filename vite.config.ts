import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  publicDir: "public",
  build: { outDir: "../../dist/renderer", emptyOutDir: true, target: "es2022", assetsInlineLimit: 0 },
});
