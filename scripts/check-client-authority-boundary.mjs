#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = resolve(root, 'src');

const ignoredDirs = new Set(['node_modules', 'dist', '.git', '.wrangler']);
const ignoredFiles = new Set([
  'src/protocol/messages.ts',
]);

const forbiddenPatterns = [
  {
    name: 'client-side item grant/removal finalization',
    pattern: /\b(inventory\.(?:add|remove|set)|addItem|removeItem|grantItem|consumeItem)\b/i,
    hint: 'Inventory changes must be confirmed by server snapshot/event.',
  },
  {
    name: 'client-side damage/death finalization',
    pattern: /\b(applyDamage|dealDamage|takeDamage|killPlayer|respawnPlayer|setDead|markDead)\b/i,
    hint: 'Damage, death, and respawn must be decided by the server.',
  },
  {
    name: 'client-side building finalization',
    pattern: /\b(placeBuildingFinal|removeBuildingFinal|commitBuilding|confirmBuilding|applyBuildPlacement)\b/i,
    hint: 'Buildings may only become real after server BUILD_* events or snapshots.',
  },
  {
    name: 'client-side resource harvest finalization',
    pattern: /\b(harvestComplete|completeHarvest|destroyResource|grantGatherReward)\b/i,
    hint: 'Gathering success and rewards must be confirmed by the server.',
  },
  {
    name: 'client-side monster AI authority',
    pattern: /\b(decideTarget|selectAggroTarget|runMonsterAi|updateMonsterAi)\b/i,
    hint: 'Monster AI decisions belong to Durable Objects on the server.',
  },
];

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
    } else if (['.ts', '.tsx'].includes(extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

const violations = [];
for (const filePath of walk(srcRoot)) {
  const rel = relative(root, filePath).replaceAll('\\', '/');
  if (ignoredFiles.has(rel)) continue;
  const source = readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);
  for (const rule of forbiddenPatterns) {
    lines.forEach((line, index) => {
      if (rule.pattern.test(line)) {
        violations.push({
          file: rel,
          line: index + 1,
          rule: rule.name,
          hint: rule.hint,
          text: line.trim(),
        });
      }
    });
  }
}

if (violations.length > 0) {
  console.error('[authority-boundary] Possible client authority violations detected.');
  for (const violation of violations) {
    console.error(`\n${violation.file}:${violation.line}`);
    console.error(`  Rule: ${violation.rule}`);
    console.error(`  Code: ${violation.text}`);
    console.error(`  Hint: ${violation.hint}`);
  }
  console.error('\nIf this is a false positive, rename the client-side preview/helper API to make its non-authoritative role explicit.');
  process.exit(1);
}

console.log('[authority-boundary] No obvious client-side authority violations found.');
