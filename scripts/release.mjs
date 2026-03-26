#!/usr/bin/env node
// release.mjs — detect conventional commit bump, update package.json, commit, tag
// Usage: node scripts/release.mjs [major|minor|patch]
//        (auto-detects from conventional commits if omitted)

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8" }).trim();
}

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// ── read current version ────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const current = pkg.version;

// ── determine tag range ─────────────────────────────────────────────────────

const tags = run("git tag -l 'v*'")
  .split("\n")
  .filter(Boolean);
const lastTag = tags.length > 0 ? tags.at(-1) : null;

const log = lastTag
  ? run(`git log "${lastTag}..HEAD" --format="%s"`)
  : run('git log --format="%s"');

if (!log) {
  console.log(`No commits since ${lastTag ?? "beginning"} — nothing to release.`);
  process.exit(0);
}

const subjects = log.split("\n").filter(Boolean);

// ── auto-detect bump type ───────────────────────────────────────────────────

const BREAKING = /^[a-z]+(\(.+\))?!:/;
const FEAT = /^feat(\(.+\))?:/;

function detectBump(subjects) {
  let hasBreaking = false;
  let hasFeat = false;
  for (const s of subjects) {
    if (BREAKING.test(s)) hasBreaking = true;
    if (FEAT.test(s)) hasFeat = true;
  }
  if (hasBreaking) return "major";
  if (hasFeat) return "minor";
  return "patch";
}

// ── resolve bump ────────────────────────────────────────────────────────────

const explicit = process.argv[2];
if (explicit && !["major", "minor", "patch"].includes(explicit)) {
  die(`Unknown bump type '${explicit}'. Use major, minor, or patch.`);
}

const bump = explicit ?? detectBump(subjects);

// ── bump version ────────────────────────────────────────────────────────────

run(`npm version ${bump} --no-git-tag-version`);

const next = JSON.parse(readFileSync("package.json", "utf8")).version;

console.log(`Detected bump: ${bump}  (${current} → ${next})`);

// ── commit and tag ──────────────────────────────────────────────────────────

run("git add package.json");
run(`git commit -m "chore: release v${next}"`);
run(`git tag -a "v${next}" -m "chore: release v${next}"`);

console.log(`Released v${next}. Push commit+tag and publish to complete.`);
