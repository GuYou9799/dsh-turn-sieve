#!/usr/bin/env node
/**
 * Diagnose DSH plugin-update failures caused by pnpm's minimumReleaseAge policy.
 *
 * DeepSeek Harness installs plugins with pnpm and enables a supply-chain policy that
 * refuses packages published less than N hours ago. pnpm 11 verifies the WHOLE profile
 * lockfile before any mutation, so a single young package — even one unrelated to the
 * plugin you are updating — aborts the install with
 * ERR_PNPM_RESOLUTION_POLICY_VIOLATIONS_UNHANDLED.
 *
 * This script reads the profile manifest, asks the npm registry when each registry
 * dependency was published, marks the ones already allowed by
 * `minimumReleaseAgeExclude`, and prints the lines still missing.
 *
 * Usage:
 *   node scripts/check-release-age.mjs [profileDir] [--hours=24]
 *
 * `link:` and `file:` dependencies are skipped: pnpm never resolves them from the
 * registry, so they can never trip the policy.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const argv = process.argv.slice(2);
const hoursArg = argv.find((item) => item.startsWith('--hours='));
const windowHours = hoursArg ? Number(hoursArg.slice('--hours='.length)) : 24;
const dirArg = argv.find((item) => !item.startsWith('--'));
const profileDir = dirArg ?? join(homedir(), '.dsh', 'profiles', 'desktop');

if (!Number.isFinite(windowHours) || windowHours <= 0) {
  console.error('--hours must be a positive number');
  process.exit(2);
}

const manifestPath = join(profileDir, 'package.json');
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  console.error(`cannot read ${manifestPath}: ${error.message}`);
  process.exit(1);
}

const deps = { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}) };
const names = Object.keys(deps);
const linked = names.filter((name) => /^(link|file|workspace):/.test(String(deps[name])));
const registry = names.filter((name) => !linked.includes(name));

console.log(`profile: ${profileDir}`);
console.log(`dependencies: ${names.length} (${registry.length} from the registry, ${linked.length} local)`);
if (linked.length > 0) console.log(`skipped local dependencies: ${linked.join(', ')}`);
console.log(`window: ${windowHours}h\n`);

function readExclusions(dir) {
  const path = join(dir, 'pnpm-workspace.yaml');
  const allowed = new Map();
  if (!existsSync(path)) return { path, allowed };
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  let inside = false;
  for (const line of lines) {
    if (/^minimumReleaseAgeExclude:\s*$/.test(line)) {
      inside = true;
      continue;
    }
    if (!inside) continue;
    if (line.trim() !== '' && /^\S/.test(line)) {
      inside = false;
      continue;
    }
    const match = line.match(/^\s+-\s+(.+)$/);
    if (!match) continue;
    const entry = match[1].trim().replace(/^['"]|['"]$/g, '');
    const at = entry.indexOf('@');
    if (at <= 0) continue;
    const name = entry.slice(0, at);
    const versions = entry.slice(at + 1).split('||').map((item) => item.trim()).filter(Boolean);
    if (!allowed.has(name)) allowed.set(name, new Set());
    for (const version of versions) allowed.get(name).add(version);
  }
  return { path, allowed };
}

const exclusions = readExclusions(profileDir);
const isExcluded = (name, version) => exclusions.allowed.get(name)?.has(version) === true;

const specVersion = (spec) => {
  const text = String(spec).trim();
  const exact = text.replace(/^[\^~>=<*\s]+/, '');
  const match = exact.match(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  return match ? match[0] : null;
};

const now = Date.now();
const rows = [];
for (const name of registry) {
  const spec = deps[name];
  let version = specVersion(spec);
  try {
    const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`);
    if (!response.ok) {
      rows.push({ name, version: version ?? String(spec), age: Number.NaN, reason: `HTTP ${response.status}` });
      continue;
    }
    const data = await response.json();
    if (!version) version = data['dist-tags']?.latest;
    const stamp = data.time?.[version];
    if (!stamp) {
      rows.push({ name, version, age: Number.NaN, reason: 'no publish time' });
      continue;
    }
    rows.push({ name, version, age: (now - Date.parse(stamp)) / 3_600_000 });
  } catch (error) {
    rows.push({ name, version: version ?? String(spec), age: Number.NaN, reason: error.message.slice(0, 60) });
  }
}

rows.sort((a, b) => (Number.isNaN(a.age) ? 0 : a.age) - (Number.isNaN(b.age) ? 0 : b.age));
for (const row of rows) {
  const age = Number.isNaN(row.age) ? `? ${row.reason ?? ''}` : `${row.age.toFixed(1)}h`;
  let state = 'ok      ';
  if (!Number.isNaN(row.age) && row.age < windowHours) {
    state = isExcluded(row.name, row.version) ? 'excluded' : 'YOUNG   ';
  }
  console.log(`${state} ${row.name}@${row.version}  ${age}`);
}

const young = rows.filter(
  (row) => !Number.isNaN(row.age) && row.age < windowHours && !isExcluded(row.name, row.version),
);

console.log('');
if (young.length === 0) {
  console.log(`No unexcluded dependency is younger than ${windowHours}h — the policy is not the blocker.`);
  process.exit(0);
}

console.log(`Add these lines under minimumReleaseAgeExclude in ${exclusions.path}:`);
for (const row of young) console.log(`  - ${row.name}@${row.version}`);
console.log('');
console.log('Then retry the plugin update. To bypass the window once, run the same pnpm');
console.log('command with --config.minimum-release-age=0.');
