import { readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const tilesetRoot = path.join(rootDir, 'public', 'assets', 'tilesets');
const outputFile = path.join(rootDir, 'src', 'editor', 'tilesetManifest.ts');
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function main() {
  const categories = existsSync(tilesetRoot)
    ? await readCategoriesFromImageFolders(tilesetRoot)
    : [];

  const content = renderManifest(categories);
  await writeFile(outputFile, content, 'utf8');

  console.log(`[tilesets] Generated ${outputFile}`);
  console.log(`[tilesets] Categories: ${categories.length}`);
  console.log(`[tilesets] Assets: ${categories.reduce((total, category) => total + category.assets.length, 0)}`);
}

async function readCategoriesFromImageFolders(root) {
  const folders = await walkImageFolders(root);

  return folders
    .filter((folder) => folder.files.length > 0)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map((folder) => {
      const categoryId = normalizeId(folder.relativePath || 'root');
      const categoryName = toCategoryTitle(folder.relativePath || 'Root');

      return {
        id: categoryId,
        name: categoryName,
        assets: folder.files
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((file) => {
            const basename = path.basename(file.name, path.extname(file.name));
            const assetId = `${categoryId}-${normalizeId(basename)}`;
            const urlPath = path
              .join(folder.relativePath, file.name)
              .split(path.sep)
              .filter(Boolean)
              .join('/');

            return {
              id: assetId,
              name: toTitle(basename),
              categoryId,
              url: `/assets/tilesets/${urlPath}`,
            };
          }),
      };
    });
}

async function walkImageFolders(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const currentFiles = [];
  const folders = [];

  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      folders.push(...await walkImageFolders(root, fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!imageExtensions.has(path.extname(entry.name).toLowerCase())) continue;

    currentFiles.push({
      name: entry.name,
      fullPath,
    });
  }

  folders.push({
    fullPath: current,
    relativePath: path.relative(root, current),
    files: currentFiles,
  });

  return folders;
}

function renderManifest(categories) {
  return `import type { EditorTilesetCategory } from './types';\n\n` +
`/**\n` +
` * Auto-generated from public/assets/tilesets.\n` +
` * Every folder containing images becomes an editor category.\n` +
` * Asset placement uses each texture's natural size unless tileWidth/tileHeight is manually set.\n` +
` * Run \`npm run tilesets:generate\` after adding/removing tileset images.\n` +
` */\n` +
`export const TILESET_CATEGORIES: EditorTilesetCategory[] = ${JSON.stringify(categories, null, 2)};\n`;
}

function normalizeId(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9가-힣_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toCategoryTitle(value) {
  return value
    .split(path.sep)
    .filter(Boolean)
    .map(toTitle)
    .join(' / ');
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
