import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node22", format: "cjs", external: ["electron"], sourcemap: true, logLevel: "info" };
await build({ ...common, entryPoints: ["src/desktop/main.ts"], outfile: "dist/desktop/main.cjs" });
await build({ ...common, entryPoints: ["src/desktop/preload.ts"], outfile: "dist/desktop/preload.cjs" });
