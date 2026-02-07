#!/usr/bin/env bun
/**
 * Build single-executable binaries for all platforms using Bun compile.
 * Outputs to packages/repterm/release/
 */
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const TARGETS = [
  ["bun-linux-x64", "repterm-linux-x64"],
  ["bun-linux-arm64", "repterm-linux-arm64"],
  ["bun-darwin-x64", "repterm-darwin-x64"],
  ["bun-darwin-arm64", "repterm-darwin-arm64"],
  ["bun-windows-x64", "repterm-windows-x64.exe"],
] as const;

const releaseDir = join(import.meta.dir, "..", "release");
const entry = join(import.meta.dir, "..", "src", "cli", "index.ts");

if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}

for (const [target, outName] of TARGETS) {
  const outfile = join(releaseDir, outName);
  console.log(`Building ${target} -> ${outName}...`);
  const result = await Bun.build({
    entrypoints: [entry],
    outfile,
    minify: true,
    sourcemap: "none",
    compile: {
      target,
      outfile,
    },
  });
  if (!result.success) {
    console.error(`Failed to build ${target}:`, result.logs);
    process.exit(1);
  }
  console.log(`  -> ${outfile}`);
}

console.log("All binaries built to", releaseDir);
