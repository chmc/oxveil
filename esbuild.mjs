import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "es2020",
  sourcemap: true,
  minify: false,
};

/** @type {import('esbuild').BuildOptions} */
const mcpServerConfig = {
  entryPoints: ["src/mcp/server.ts"],
  bundle: true,
  outfile: "dist/mcp-server.js",
  external: [],
  format: "cjs",
  platform: "node",
  target: "es2020",
  sourcemap: true,
  minify: false,
};

if (watch) {
  const ctx = await esbuild.context(extensionConfig);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(mcpServerConfig),
  ]);
  console.log("Build complete.");
}
