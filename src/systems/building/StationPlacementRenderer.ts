import { Container, Rectangle, Sprite, Texture } from 'pixi.js';
import { getIsoZIndex, gridToScreen } from './IsoBuildingMath';
import type { BuildingSnapshot, PlacedBuildPart } from './BuildingTypes';

const STATION_PART_IDS = new Set<string>(['station_workbench']);
const STATION_LAYER_Z_INDEX = 62;
const STATION_SPRITE_SRC = '/assets/station/Anvil01.png';
const STATION_COLUMNS = 8;
const STATION_ROWS = 5;
const STATION_FRAME_COUNT = 35;
const STATION_FPS = 12;

type StationView = {
  container: Container;
  sprite: Sprite | null;
  part: PlacedBuildPart;
  frame: number;
};

export class StationPlacementRenderer {
  readonly container = new Container();
  private readonly views = new Map<string, StationView>();
  private frames: Texture[] | null = null;
  private animTime = 0;
  private craftingUntilMs = 0;

  constructor(parent: Container) {
    this.container.sortableChildren = true;
    this.container.zIndex = STATION_LAYER_Z_INDEX;
    parent.addChild(this.container);
    void this.loadFrames();
  }

  applySnapshot(snapshot: BuildingSnapshot): void {
    const aliveIds = new Set(snapshot.parts.filter(isStationPart).map((part) => part.entityId));
    for (const entityId of this.views.keys()) {
      if (!aliveIds.has(entityId)) this.remove(entityId);
    }
    for (const part of snapshot.parts) {
      if (isStationPart(part)) this.addOrUpdate(part);
    }
  }

  addOrUpdate(part: PlacedBuildPart): void {
    if (!isStationPart(part)) return;

    let view = this.views.get(part.entityId);
    if (!view) {
      const container = new Container();
      view = { container, sprite: null, part, frame: -1 };
      this.views.set(part.entityId, view);
      this.container.addChild(container);
      this.applyTexture(view, 0);
    }

    view.part = part;
    const screen = gridToScreen(part.x, part.y, part.z);
    view.container.position.set(screen.x, screen.y);
    view.container.zIndex = getIsoZIndex(part.x, part.y, part.z, 18);
  }

  remove(entityId: string): void {
    const view = this.views.get(entityId);
    if (!view) return;
    view.container.destroy({ children: true });
    this.views.delete(entityId);
  }

  clear(): void {
    for (const view of this.views.values()) view.container.destroy({ children: true });
    this.views.clear();
  }

  setCraftingWindow(startsAtMs: number, completesAtMs: number): void {
    if (!Number.isFinite(startsAtMs) || !Number.isFinite(completesAtMs)) return;
    const now = Date.now();
    if (completesAtMs <= now) return;
    this.craftingUntilMs = Math.max(this.craftingUntilMs, completesAtMs);
    if (now <= startsAtMs + 50) this.animTime = 0;
  }

  stopCrafting(): void {
    this.craftingUntilMs = 0;
  }

  update(dt: number): void {
    if (this.views.size === 0) return;
    const crafting = Date.now() < this.craftingUntilMs;
    if (crafting) this.animTime += dt;

    const frame = crafting
      ? 1 + (Math.floor(this.animTime * STATION_FPS) % Math.max(1, STATION_FRAME_COUNT - 1))
      : 0;

    for (const view of this.views.values()) {
      this.applyTexture(view, frame);
    }
  }

  private async loadFrames(): Promise<void> {
    const image = await loadImage(STATION_SPRITE_SRC);
    const sheet = Texture.from(image);
    sheet.source.scaleMode = 'nearest';
    const frameWidth = Math.floor(image.naturalWidth / STATION_COLUMNS);
    const frameHeight = Math.floor(image.naturalHeight / STATION_ROWS);

    this.frames = Array.from({ length: STATION_FRAME_COUNT }, (_, frameIndex) => {
      const row = Math.floor(frameIndex / STATION_COLUMNS);
      const column = frameIndex % STATION_COLUMNS;
      return new Texture({
        source: sheet.source,
        frame: new Rectangle(column * frameWidth, row * frameHeight, frameWidth, frameHeight),
      });
    });

    for (const view of this.views.values()) this.applyTexture(view, 0);
  }

  private applyTexture(view: StationView, frame: number): void {
    if (!this.frames || this.frames.length === 0) return;
    const safeFrame = Math.max(0, Math.min(this.frames.length - 1, frame));
    if (view.frame === safeFrame && view.sprite) return;

    view.frame = safeFrame;
    const texture = this.frames[safeFrame];

    if (!view.sprite) {
      view.sprite = new Sprite(texture);
      view.sprite.anchor.set(0.5, 0.82);
      view.sprite.scale.set(1);
      view.container.addChild(view.sprite);
      return;
    }

    view.sprite.texture = texture;
  }
}

function isStationPart(part: PlacedBuildPart): boolean {
  return STATION_PART_IDS.has(part.partId);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load station sprite: ${src}`));
    image.src = src;
  });
}
