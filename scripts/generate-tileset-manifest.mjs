import { readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tilesetRoot = path.join(rootDir, 'public', 'assets', 'tilesets');
const outputFile = path.join(rootDir, 'src', 'editor', 'tilesetManifest.ts');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const defaultTileSize = Number.parseInt(process.env.TILE_SIZE ?? '32', 10) || 32;

async function main() {
  const categories = existsSync(tilesetRoot)
    ? await readCategories(tilesetRoot)
    : [];

  const content = renderManifest(categories);
  await writeFile(outputFile, content, 'utf8');

  console.log(`[tilesets] Generated ${outputFile}`);
  console.log(`[tilesets] Categories: ${categories.length}`);
}

async function readCategories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const categories = [];

  for (const directory of directories) {
    const categoryId = normalizeId(directory.name);
    const categoryPath = path.join(root, directory.name);
    const assets = await readAssets(categoryPath, categoryId, directory.name);

    categories.push({
      id: categoryId,
      name: toTitle(directory.name),
      assets,
    });
  }

  return categories;
}

async function readAssets(categoryPath, categoryId, folderName) {
  const entries = await readdir(categoryPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const basename = path.basename(entry.name, path.extname(entry.name));
      return {
        id: `${categoryId}-${normalizeId(basename)}`,
        name: toTitle(basename),
        categoryId,
        url: `/assets/tilesets/${folderName}/${entry.name}`,
        tileWidth: defaultTileSize,
        tileHeight: defaultTileSize,
      };
    });
}

function renderManifest(categories) {
  return `import type { EditorTilesetCategory } from './types';\n\n` +
`/**\n` +
` * Auto-generated from public/assets/tilesets.\n` +
` * Run \`npm run tilesets:generate\` after adding/removing tileset images.\n` +
` */\n` +
`export const TILESET_CATEGORIES: EditorTilesetCategory[] = ${JSON.stringify(categories, null, 2)};\n`;
}

function normalizeId(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toTitle(value) {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
