import type { Application, Container } from 'pixi.js';
import type { EditorMapDraft } from './types';

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

type EditorInstance = {
  readonly placement: { readonly mapDraft: EditorMapDraft };
  start(): Promise<void> | void;
  stop(): void;
  setWorldSize(width: number, height: number): void;
  transitionWorldCell(transition: WorldCellTransition): Promise<void>;
};

export class MapEditor {
  private instance: EditorInstance | null = null;
  private loading: Promise<EditorInstance> | null = null;

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
    if (!this.loading) this.loading = this.loadAndStart();
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

  private async ensureLoaded(): Promise<EditorInstance> {
    if (this.instance) return this.instance;
    if (!this.loading) this.loading = this.loadAndStart();
    return this.loading;
  }

  private async loadAndStart(): Promise<EditorInstance> {
    this.reportStage('MapEditorBootMinimal import started...');
    const module = await import('./MapEditorBootMinimal');
    this.reportStage('MapEditorBootMinimal import resolved. Creating instance...');
    const editor = new module.MapEditorBootMinimal(this.options);
    this.instance = editor;
    this.reportStage('MapEditorBootMinimal instance created. Mounting DOM...');
    await editor.start();
    this.reportStage('MapEditorBootMinimal started.');
    return editor;
  }

  private reportStage(message: string): void {
    console.log('[EditorBoot]', message);
    const panel = document.getElementById('editor-stage-panel');
    if (panel) panel.textContent = message;
  }
}
