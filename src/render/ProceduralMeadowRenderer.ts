import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

const TILESET_URL = '/assets/tilesets/fantasy/Art/Ground Tileset/Tileset_Ground.png';
const TILE_SIZE = 16;
const TILESET_COLUMNS = 12;
const RENDER_SCALE = 4;

/**
 * Only use visually filled ground tiles for the base pass.
 * Edge/corner/transition tiles from the Tiled wang set leave transparent gaps
 * when placed randomly, so those are intentionally excluded here.
 */
const BASE_GRASS_TILES = [14, 20];
const DETAIL_GRASS_TILES = [96, 97, 98, 99, 100, 101, 108, 109, 110, 111, 112, 113];
const DARK_GRASS_DETAIL_TILES = [96, 97, 98, 99, 100, 101];
const DIRT_DETAIL_TILES = [108, 109, 110, 111, 112, 113];

export type ProceduralMeadowOptions = {
  worldWidth: number;
  worldHeight: number;
  seed?: number;
};

export class ProceduralMeadowRenderer {
  readonly layer = new Container();

  private readonly textures = new Map<number, Texture>();
  private readonly seed: number;
  private readonly worldWidth: number;
  private readonly worldHeight: number;
  private ready = false;

  constructor(parent: Container, options: ProceduralMeadowOptions) {
    this.worldWidth = options.worldWidth;
    this.worldHeight = options.worldHeight;
    this.seed = options.seed ?? 20260518;
    this.layer.label = 'procedural-meadow';
    parent.addChild(this.layer);
  }

  async load(): Promise<void> {
    if (this.ready) return;

    const image = await loadImage(TILESET_URL);
    const sheet = Texture.from(image);
    sheet.source.scaleMode = 'nearest';

    const cols = Math.ceil(this.worldWidth / (TILE_SIZE * RENDER_SCALE));
    const rows = Math.ceil(this.worldHeight / (TILE_SIZE * RENDER_SCALE));

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        this.placeTile(sheet, this.pickBaseTile(x, y), x, y, 0);

        const detailTile = this.pickDetailTile(x, y);
        if (detailTile !== null) {
          this.placeTile(sheet, detailTile, x, y, 1);
        }
      }
    }

    this.ready = true;
  }

  private placeTile(sheet: Texture, tileId: number, x: number, y: number, zIndex: number): void {
    const sprite = new Sprite(this.getTileTexture(sheet, tileId));
    sprite.x = x * TILE_SIZE * RENDER_SCALE;
    sprite.y = y * TILE_SIZE * RENDER_SCALE;
    sprite.zIndex = zIndex;
    sprite.scale.set(RENDER_SCALE);
    this.layer.addChild(sprite);
  }

  private pickBaseTile(x: number, y: number): number {
    return pickWeighted(BASE_GRASS_TILES, x, y, this.seed + 11);
  }

  private pickDetailTile(x: number, y: number): number | null {
    const patch = noise2d(x * 0.08, y * 0.08, this.seed);
    const detail = noise2d(x * 0.43 + 19.7, y * 0.43 - 3.1, this.seed + 77);
    const speckle = rand2d(x, y, this.seed + 1337);

    if (patch > 0.74 && detail > 0.58) {
      return pickWeighted(DIRT_DETAIL_TILES, x, y, this.seed + 3);
    }

    if (patch < 0.18 || speckle > 0.96) {
      return pickWeighted(DARK_GRASS_DETAIL_TILES, x, y, this.seed + 5);
    }

    if (speckle > 0.9) {
      return pickWeighted(DETAIL_GRASS_TILES, x, y, this.seed + 7);
    }

    return null;
  }

  private getTileTexture(sheet: Texture, tileId: number): Texture {
    const cached = this.textures.get(tileId);
    if (cached) return cached;

    const col = tileId % TILESET_COLUMNS;
    const row = Math.floor(tileId / TILESET_COLUMNS);
    const texture = new Texture({
      source: sheet.source,
      frame: new Rectangle(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE),
    });

    this.textures.set(tileId, texture);
    return texture;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load meadow tileset: ${src}`));
    image.src = src;
  });
}

function pickWeighted(values: number[], x: number, y: number, seed: number): number {
  const value = rand2d(x, y, seed);
  return values[Math.floor(value * values.length) % values.length];
}

function noise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;

  const a = rand2d(x0, y0, seed);
  const b = rand2d(x0 + 1, y0, seed);
  const c = rand2d(x0, y0 + 1, seed);
  const d = rand2d(x0 + 1, y0 + 1, seed);

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

function rand2d(x: number, y: number, seed: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
