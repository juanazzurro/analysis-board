import * as esbuild from "esbuild";
import fs from "node:fs";
// Limpia los recursos generados (fuentes y piezas con hash) antes de volver a armar.
fs.rmSync("renderer/assets", { recursive: true, force: true });
await esbuild.build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", target: "chrome130", outfile: "renderer/app.js", minify: false, sourcemap: false, logLevel: "warning" });
await esbuild.build({
  entryPoints: ["src/styles.css"], bundle: true, outfile: "renderer/styles.css", logLevel: "warning",
  loader: { ".svg": "file", ".woff2": "file" }, assetNames: "assets/[name]-[hash]"
});
console.log("build ok");
