import * as esbuild from "esbuild";
await esbuild.build({ entryPoints: ["src/app.js"], bundle: true, format: "iife", target: "chrome130", outfile: "renderer/app.js", minify: false, sourcemap: false, logLevel: "warning" });
await esbuild.build({ entryPoints: ["src/styles.css"], bundle: true, outfile: "renderer/styles.css", loader: { ".svg": "dataurl" }, logLevel: "warning" });
console.log("build ok");
