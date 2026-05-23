import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const targetPath = resolve(__dirname, '../src/editor/MapEditorBootMinimal.ts');
const source = await readFile(targetPath, 'utf8');

if (source.includes('targetY: number;')) {
  console.log('MapEditorBootMinimal.ts already includes targetY.');
  process.exit(0);
}

const before = `export type WorldCellTransition = {\n  dx: -1 | 0 | 1;\n  dy: -1 | 0 | 1;\n  targetX: number;\n};`;
const after = `export type WorldCellTransition = {\n  dx: -1 | 0 | 1;\n  dy: -1 | 0 | 1;\n  targetX: number;\n  targetY: number;\n};`;

if (!source.includes(before)) {
  throw new Error('Expected WorldCellTransition block was not found. Refusing to patch.');
}

await writeFile(targetPath, source.replace(before, after));
console.log('Patched MapEditorBootMinimal.ts WorldCellTransition.targetY.');
