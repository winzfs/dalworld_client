import { Container, Graphics } from 'pixi.js';
import { ProceduralMeadowRenderer } from '../../render/ProceduralMeadowRenderer';
import { GameWorldMapRenderer } from '../../render/GameWorldMapRenderer';
import type { WorldInfo } from '../../protocol/messages';
import { createActiveCellMapView } from '../../worldMap/activeCellMapView';
import { fetchRuntimeWorldMap } from '../../worldMap/fetchRuntimeWorldMap';
import { getRuntimeWorldMap, setRuntimeWorldMap } from '../../worldMap/runtimeMapStore';
import type { CameraSystem } from './CameraSystem';

export type RuntimeWorldSystemContext = {
  world: Container;
  background: Graphics;
  getWorldInfo: () => WorldInfo;
  cameraSystem: CameraSystem;
  worldMapRenderer: GameWorldMapRenderer;
};

export type RuntimeWorldLoadResult = {
  worldInfo: WorldInfo;
};

export class RuntimeWorldSystem {
  private meadowRenderer: ProceduralMeadowRenderer | null = null;

  constructor(private readonly context: RuntimeWorldSystemContext) {}

  async load(): Promise<RuntimeWorldLoadResult> {
    const runtimeMap = await this.resolveRuntimeWorldMap();
    this.destroyMeadowRenderer();

    if (runtimeMap) {
      const worldInfo: WorldInfo = {
        ...this.context.getWorldInfo(),
        width: runtimeMap.cellSize,
        height: runtimeMap.cellSize,
      };

      this.context.cameraSystem.setWorldSize(worldInfo);
      this.drawBackground(worldInfo);
      this.context.background.visible = true;

      try {
        await this.context.worldMapRenderer.render(createActiveCellMapView(runtimeMap));
      } catch (error) {
        console.error('[RuntimeWorldSystem] Failed to render active world cell.', error);
      }

      return { worldInfo };
    }

    await this.context.worldMapRenderer.render(null);

    const worldInfo = this.context.getWorldInfo();
    this.meadowRenderer = new ProceduralMeadowRenderer(this.context.world, {
      worldWidth: worldInfo.width,
      worldHeight: worldInfo.height,
      seed: 20260518,
    });

    try {
      await this.meadowRenderer.load();
      this.context.world.setChildIndex(this.meadowRenderer.layer, 1);
      this.context.background.visible = false;
    } catch (error) {
      console.warn('[RuntimeWorldSystem] Failed to load procedural meadow map. Using fallback background.', error);
      this.context.background.visible = true;
    }

    return { worldInfo };
  }

  drawBackground(worldInfo: WorldInfo = this.context.getWorldInfo()): void {
    const background = this.context.background;
    background.removeChildren().forEach((child) => child.destroy());
    background.clear();

    background
      .rect(0, 0, worldInfo.width, worldInfo.height)
      .fill({ color: 0x223843 });

    const step = 200;

    for (let x = 0; x <= worldInfo.width; x += step) {
      background
        .moveTo(x, 0)
        .lineTo(x, worldInfo.height)
        .stroke({ color: 0x2c4a55, width: 1 });
    }

    for (let y = 0; y <= worldInfo.height; y += step) {
      background
        .moveTo(0, y)
        .lineTo(worldInfo.width, y)
        .stroke({ color: 0x2c4a55, width: 1 });
    }
  }

  private async resolveRuntimeWorldMap() {
    const cached = getRuntimeWorldMap();
    if (cached) return cached;

    try {
      const fetched = await fetchRuntimeWorldMap();
      setRuntimeWorldMap(fetched);
      console.info('[RuntimeWorldSystem] Loaded runtime world map before welcome.', {
        cells: fetched?.cells.map((cell) => `${cell.gridX}:${cell.gridY}`) ?? [],
      });
      return fetched;
    } catch (error) {
      console.warn('[RuntimeWorldSystem] Failed to fetch runtime world map before welcome.', error);
      return null;
    }
  }

  private destroyMeadowRenderer(): void {
    if (!this.meadowRenderer) return;

    this.context.world.removeChild(this.meadowRenderer.layer);
    this.meadowRenderer.layer.destroy({ children: true });
    this.meadowRenderer = null;
  }
}
