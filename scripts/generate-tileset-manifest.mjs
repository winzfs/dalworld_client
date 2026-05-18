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
  console.log(`[tilesets] Assets: ${categories.reduce((total, category) => total + category.assets.length, 0)}`);
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
    const assets = await readAssetsRecursive({
      categoryPath,
      categoryId,
      folderName: directory.name,
    });

    categories.push({
      id: categoryId,
      name: toTitle(directory.name),
      assets,
    });
  }

  return categories;
}

async function readAssetsRecursive({ categoryPath, categoryId, folderName }) {
  const files = await walkImageFiles(categoryPath);

  return files
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map((file) => {
      const basename = path.basename(file.name, path.extname(file.name));
      const relativeUrlPath = file.relativePath.split(path.sep).join('/');
      const relativeIdPath = file.relativePath
        .slice(0, -path.extname(file.relativePath).length)
        .split(path.sep)
        .map(normalizeId)
        .filter(Boolean)
        .join('-');

      return {
        id: `${categoryId}-${relativeIdPath}`,
        name: toTitle(basename),
        categoryId,
        url: `/assets/tilesets/${folderName}/${relativeUrlPath}`,
        tileWidth: defaultTileSize,
        tileHeight: defaultTileSize,
      };
    });
}

async function walkImageFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkImageFiles(root, fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!imageExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    files.push({
      name: entry.name,
      fullPath,
      relativePath: path.relative(root, fullPath),
    });
  }

  return files;
}

function renderManifest(categories) {
  return `import type { EditorTilesetCategory } from './types';\n\n` +
`/**\n` +
` * Auto-generated from public/assets/tilesets.\n` +
` * Supports nested folders. The first folder below tilesets becomes the category.\n` +
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
