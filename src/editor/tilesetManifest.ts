import type { EditorTilesetCategory } from './types';

/**
 * Central tileset registry.
 *
 * Current limitation:
 * Browsers cannot recursively scan arbitrary public folders at runtime.
 *
 * Future upgrade path:
 * - Replace this file with `/api/editor/tilesets`
 * - Or generate this manifest automatically during build.
 */
export const TILESET_CATEGORIES: EditorTilesetCategory[] = [
  {
    id: 'nature',
    name: 'Nature',
    assets: [
      {
        id: 'grass-01',
        name: 'Grass 01',
        categoryId: 'nature',
        url: '/assets/tilesets/nature/grass_01.png',
        tileWidth: 32,
        tileHeight: 32,
      },
      {
        id: 'tree-01',
        name: 'Tree 01',
        categoryId: 'nature',
        url: '/assets/tilesets/nature/tree_01.png',
        tileWidth: 32,
        tileHeight: 32,
      },
    ],
  },
  {
    id: 'buildings',
    name: 'Buildings',
    assets: [
      {
        id: 'house-01',
        name: 'House 01',
        categoryId: 'buildings',
        url: '/assets/tilesets/buildings/house_01.png',
        tileWidth: 32,
        tileHeight: 32,
      },
    ],
  },
  {
    id: 'monsters',
    name: 'Monsters',
    assets: [
      {
        id: 'monster-spawn-wild-slime',
        name: 'Slime Spawn',
        categoryId: 'monsters',
        url: 'solid://monster-spawn-slime',
        tileWidth: 32,
        tileHeight: 32,
        solidColor: 0x7bdff2,
        gameplayDefaults: {
          kind: 'monsterSpawn',
          monsterType: 'wild_slime',
          spawnRadius: 160,
          maxAlive: 3,
          respawnMs: 30_000,
        },
      },
      {
        id: 'monster-spawn-sheep',
        name: 'Sheep Spawn',
        categoryId: 'monsters',
        url: 'solid://monster-spawn-sheep',
        tileWidth: 32,
        tileHeight: 32,
        solidColor: 0xf6f1df,
        gameplayDefaults: {
          kind: 'monsterSpawn',
          monsterType: 'sheep',
          spawnRadius: 160,
          maxAlive: 3,
          respawnMs: 30_000,
        },
      },
    ],
  },
];