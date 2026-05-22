import type { EditorMapDraft } from './types';
import { MapEditorBootStandaloneLite, type MapEditorBootStandaloneLiteOptions, type WorldCellTransition } from './MapEditorBootStandaloneLite';

type EditorLike = {
  readonly placement: { readonly mapDraft: EditorMapDraft };
  start(): Promise<void> | void;
  stop(): void;
  setWorldSize(width: number, height: number): void;
  transitionWorldCell(transition: WorldCellTransition): Promise<void>;
};

export type MapEditorBootParallelOptions = MapEditorBootStandaloneLiteOptions & {
  onMoveCameraTo?: (x: number, y: number) => void;
};

export { type WorldCellTransition };

export class MapEditorBootParallel {
  private readonly fallback: MapEditorBootStandaloneLite;
  private staged: EditorLike | null = null;
  private stagedStarted = false;

  constructor(private readonly options: MapEditorBootParallelOptions) {
    this.fallback = new MapEditorBootStandaloneLite(options);
  }

  get placement(): { readonly mapDraft: EditorMapDraft } {
    return this.stagedStarted && this.staged ? this.staged.placement : this.fallback.placement;
  }

  async start(): Promise<void> {
    await this.fallback.start();
    this.report('Fallback editor panel mounted. Loading existing UI in background...');
    window.setTimeout(() => {
      void this.startStagedEditor();
    }, 0);
  }

  stop(): void {
    this.staged?.stop();
    this.fallback.stop();
  }

  setWorldSize(width: number, height: number): void {
    this.staged?.setWorldSize(width, height);
    this.fallback.setWorldSize(width, height);
  }

  async transitionWorldCell(transition: WorldCellTransition): Promise<void> {
    if (this.stagedStarted && this.staged) {
      await this.staged.transitionWorldCell(transition);
      return;
    }
    await this.fallback.transitionWorldCell(transition);
  }

  private async startStagedEditor(): Promise<void> {
    try {
      this.report('Existing staged UI import started...');
      const module = await import('./MapEditorBootMinimal');
      this.report('Existing staged UI import resolved. Creating instance...');
      const staged = new module.MapEditorBootMinimal(this.options);
      this.staged = staged;
      await staged.start();
      this.stagedStarted = true;
      this.report('Existing staged UI mounted beside fallback panel.');
    } catch (error) {
      this.report(`Existing staged UI failed: ${formatError(error)}`);
      console.warn('[EditorBoot] Existing staged UI failed. Fallback remains active.', error);
    }
  }

  private report(message: string): void {
    console.log('[EditorBoot]', message);
    const panel = document.getElementById('editor-stage-panel');
    if (panel) panel.textContent = message;
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
