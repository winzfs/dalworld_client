#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientDataDir = resolve(root, 'data');
const serverDataDir = resolve(root, '../dalworld_server/data');

const DATA_FILES = ['items.json', 'recipes.json', 'monsters.json', 'buildingParts.json'];

function readNormalizedJson(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return JSON.stringify(parsed, null, 2);
}

if (!existsSync(serverDataDir)) {
  console.warn('[game-data-sync] Skipped: server data directory was not found at ../dalworld_server/data.');
  console.warn('[game-data-sync] To enable cross-repository data checks, keep dalworld_client and dalworld_server as sibling folders.');
  process.exit(0);
}

const mismatches = [];
for (const fileName of DATA_FILES) {
  const clientPath = resolve(clientDataDir, fileName);
  const serverPath = resolve(serverDataDir, fileName);

  if (!existsSync(clientPath)) {
    mismatches.push(`${fileName}: missing in client`);
    continue;
  }
  if (!existsSync(serverPath)) {
    mismatches.push(`${fileName}: missing in server`);
    continue;
  }

  const clientJson = readNormalizedJson(clientPath);
  const serverJson = readNormalizedJson(serverPath);
  if (clientJson !== serverJson) {
    mismatches.push(`${fileName}: client/server contents differ`);
  }
}

if (mismatches.length > 0) {
  console.error('[game-data-sync] Client/server game data mismatch detected.');
  for (const mismatch of mismatches) {
    console.error(`  - ${mismatch}`);
  }
  process.exit(1);
}

console.log('[game-data-sync] Client/server data/*.json files are aligned.');
