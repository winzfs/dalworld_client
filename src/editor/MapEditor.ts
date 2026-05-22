import type { Application, Container } from 'pixi.js';
import type { EditorMapDraft } from './types';

const ORIGINAL_IMPORT_TIMEOUT_MS = 5000;

export type MapEditorOptions = {
  app: Application;
  world: Container;
  uiRoot?: HTMLElement;
  tileSize?: number;
  mapName?: string;
  worldWidth?: number;
  worldHeight?: number;
  onMoveCameraTo?: (x: number, y: number) => void;
};

export type WorldCellTransition = {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  targetX: number;
  targetY: number;
};

type OriginalEditor = {
  readonly placement: { readonly mapDraft: EditorMapDraft };
  start(): void;
  stop(): void;
  setWorldSize(width: number, height: number): void;
  transitionWorldCell(transition: WorldCellTransition): Promise<void>;
};

export class MapEditor {
  private instance: OriginalEditor | null = null;
  private loading: Promise<OriginalEditor> | null = null;

  constructor(private readonly options: MapEditorOptions) {}

  get placement(): { readonly mapDraft: EditorMapDraft } {
    return this.instance?.placement ?? {
      mapDraft: {
        version: 1,
        name: this.options.mapName ?? 'dalworld-map',
        tileSize: this.options.tileSize ?? 32,
        placements: [],
      },
    };
  }

  async start(): Promise<void> {
    if (!this.loading) {
      this.loading = this.loadAndStart();
    }
    await this.loading;
  }

  stop(): void {
    this.instance?.stop();
  }

  setWorldSize(width: number, height: number): void {
    this.instance?.setWorldSize(width, height);
  }

  async transitionWorldCell(transition: WorldCellTransition): Promise<void> {
    const editor = await this.ensureLoaded();
    await editor.transitionWorldCell(transition);
  }

  private async ensureLoaded(): Promise<OriginalEditor> {
    if (this.instance) return this.instance;
    if (!this.loading) this.loading = this.loadAndStart();
    return this.loading;
  }

  private async loadAndStart(): Promise<OriginalEditor> {
    this.reportStage('MapEditorOriginal import started...');
    const module = await withTimeout(
      import('./MapEditorOriginal'),
      ORIGINAL_IMPORT_TIMEOUT_MS,
      'MapEditorOriginal import timed out',
    );

    this.reportStage('MapEditorOriginal import resolved. Creating instance...');
    const editor = new module.MapEditorOriginal(this.options);
    this.instance = editor;

    this.reportStage('MapEditorOriginal instance created. Mounting DOM...');
    editor.start();
    this.reportStage('MapEditorOriginal started.');
    return editor;
  }

  private reportStage(message: string): void {
    console.log('[EditorBoot]', message);
    const panel = document.getElementById('editor-stage-panel');
    if (panel) panel.textContent = message;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  });
}
