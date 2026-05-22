import { Container as PixiContainer, Graphics } from 'pixi.js';
import type { Application, Container } from 'pixi.js';
import type { EditorMapDraft, EditorTilePlacement } from './types';

type Layer = 'ground' | 'object' | 'collision';
type Mode = 'paint' | 'erase';
type Brush = { id: string; name: string; color: number; categoryId: string };

export type WorldCellTransition = { dx: -1 | 0 | 1; dy: -1 | 0 | 1; targetX: number; targetY: number };
export type MapEditorBootStandaloneLiteOptions = {
  app: Application;
  world: Container;
  uiRoot?: HTMLElement;
  tileSize?: number;
  mapName?: string;
  worldWidth?: number;
  worldHeight?: number;
};

const BRUSHES: Brush[] = [
  { id: 'grass', name: 'Grass', color: 0x47b881, categoryId: 'nature' },
  { id: 'dirt', name: 'Dirt', color: 0x9b6a3c, categoryId: 'nature' },
  { id: 'stone', name: 'Stone', color: 0x8a94a6, categoryId: 'nature' },
  { id: 'water', name: 'Water', color: 0x3b82f6, categoryId: 'nature' },
  { id: 'wood', name: 'Wood', color: 0xc69054, categoryId: 'buildings' },
  { id: 'monster', name: 'Monster', color: 0x7bdff2, categoryId: 'monsters' },
];

export class MapEditorBootStandaloneLite {
  readonly placement: ReturnType<typeof createPlacementStore>;
  private panel: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private brush = BRUSHES[0];
  private layer: Layer = 'ground';
  private mode: Mode = 'paint';
  private pointerId: number | null = null;
  private lastKey = '';
  private readonly tileSize: number;
  private readonly uiRoot: HTMLElement;

  constructor(private readonly options: MapEditorBootStandaloneLiteOptions) {
    this.tileSize = options.tileSize ?? 32;
    this.uiRoot = options.uiRoot ?? document.body;
    this.placement = createPlacementStore(options.mapName ?? 'dalworld-map', this.tileSize);
  }

  async start(): Promise<void> {
    this.options.world.addChild(this.placement.layer);
    this.panel = this.buildPanel();
    this.uiRoot.appendChild(this.panel);
    this.attach();
    this.load();
    this.setStatus('Standalone lite editor booted. 기존 패널 의존성은 분리 복구 중입니다.');
  }

  stop(): void {
    this.detach();
    this.panel?.remove();
    if (this.placement.layer.parent) this.placement.layer.parent.removeChild(this.placement.layer);
  }

  setWorldSize(): void {}
  async transitionWorldCell(): Promise<void> { this.setStatus('월드맵 전환은 임시 비활성화되어 있습니다.'); }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'map-editor-panel map-editor-standalone-lite';
    panel.style.cssText = 'position:fixed;left:16px;top:16px;z-index:9999;width:330px;max-height:calc(100vh - 32px);overflow:auto;background:rgba(23,18,15,.96);color:#f7f1df;border:1px solid rgba(255,209,102,.35);border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.35);font:13px system-ui,sans-serif;';
    const header = div('Map Editor', 'padding:12px 14px;font-weight:800;color:#ffe39a;background:rgba(255,209,102,.16);border-radius:16px 16px 0 0;');
    const body = div('', 'padding:12px;display:grid;gap:12px;');
    body.append(section('Brush', this.buttonGrid(BRUSHES.map((brush) => [brush.name, () => { this.brush = brush; this.setStatus(`Brush: ${brush.name}`); }]))));
    body.append(section('Layer', this.buttonGrid((['ground', 'object', 'collision'] as Layer[]).map((layer) => [layer, () => { this.layer = layer; this.setStatus(`Layer: ${layer}`); }]))));
    body.append(section('Mode', this.buttonGrid((['paint', 'erase'] as Mode[]).map((mode) => [mode, () => { this.mode = mode; this.setStatus(`Mode: ${mode}`); }]))));
    body.append(section('Actions', this.buttonGrid([
      ['Save', () => this.save()],
      ['Load', () => this.load()],
      ['Export', () => this.exportJson()],
      ['Clear', () => this.clear()],
    ])));
    this.status = div('', 'padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(0,0,0,.25);white-space:pre-wrap;line-height:1.4;');
    body.append(this.status);
    panel.append(header, body);
    return panel;
  }

  private buttonGrid(items: Array<[string, () => void]>): HTMLElement {
    const wrap = div('', 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;');
    for (const [text, handler] of items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.style.cssText = 'border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.08);color:#f7f1df;padding:8px;cursor:pointer;font-weight:700;';
      button.onclick = handler;
      wrap.append(button);
    }
    return wrap;
  }

  private attach(): void {
    this.options.app.canvas.addEventListener('pointerdown', this.onDown);
    this.options.app.canvas.addEventListener('pointermove', this.onMove);
    this.options.app.canvas.addEventListener('pointerup', this.onEnd);
    this.options.app.canvas.addEventListener('pointercancel', this.onEnd);
  }

  private detach(): void {
    this.options.app.canvas.removeEventListener('pointerdown', this.onDown);
    this.options.app.canvas.removeEventListener('pointermove', this.onMove);
    this.options.app.canvas.removeEventListener('pointerup', this.onEnd);
    this.options.app.canvas.removeEventListener('pointercancel', this.onEnd);
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (event.button !== 0 || isUi(event.target)) return;
    this.pointerId = event.pointerId;
    this.lastKey = '';
    this.options.app.canvas.setPointerCapture(event.pointerId);
    this.paint(event);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || isUi(event.target)) return;
    this.paint(event);
  };

  private readonly onEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.lastKey = '';
    if (this.options.app.canvas.hasPointerCapture(event.pointerId)) this.options.app.canvas.releasePointerCapture(event.pointerId);
  };

  private paint(event: PointerEvent): void {
    const point = this.toWorld(event.clientX, event.clientY);
    const x = Math.floor(point.x / this.tileSize) * this.tileSize;
    const y = Math.floor(point.y / this.tileSize) * this.tileSize;
    const key = `${this.layer}:${x}:${y}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (this.mode === 'erase') this.placement.erase(x, y, this.layer);
    else this.placement.place(x, y, this.layer, this.brush);
  }

  private toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.options.app.canvas.getBoundingClientRect();
    const transform = this.options.world.worldTransform;
    return { x: (clientX - rect.left - transform.tx) / transform.a, y: (clientY - rect.top - transform.ty) / transform.d };
  }

  private save(): void { localStorage.setItem(this.key(), JSON.stringify(this.placement.mapDraft)); this.setStatus(`Saved ${this.placement.mapDraft.placements.length} placements.`); }
  private load(): void { const raw = localStorage.getItem(this.key()); if (!raw) return; try { this.placement.loadDraft(JSON.parse(raw) as EditorMapDraft); this.setStatus(`Loaded ${this.placement.mapDraft.placements.length} placements.`); } catch { this.setStatus('Load failed.'); } }
  private clear(): void { if (confirm('현재 배치된 타일을 전부 삭제할까요?')) { this.placement.clear(); this.setStatus('Cleared.'); } }
  private exportJson(): void { download(`${this.options.mapName ?? 'dalworld-map'}.json`, this.placement.mapDraft); }
  private key(): string { return `dalworld:standalone-lite:${this.options.mapName ?? 'dalworld-map'}`; }
  private setStatus(message: string): void { if (this.status) this.status.textContent = message; }
}

function createPlacementStore(name: string, tileSize: number) {
  const layer = new PixiContainer();
  const draft: EditorMapDraft = { version: 1, name, tileSize, placements: [] };
  const views = new Map<string, Graphics>();
  const draw = (p: EditorTilePlacement) => { const g = new Graphics(); g.x = p.x; g.y = p.y; g.zIndex = p.layer === 'collision' ? 100 : p.layer === 'object' ? 10 + p.y / 1000 : 1; g.rect(0, 0, p.displayWidth ?? tileSize, p.displayHeight ?? tileSize).fill({ color: p.solidColor ?? 0x55d6be, alpha: p.layer === 'collision' ? 0.38 : 1 }); return g; };
  const redraw = () => { layer.removeChildren(); views.clear(); for (const p of draft.placements) { const g = draw(p); views.set(p.id, g); layer.addChild(g); } };
  return {
    layer,
    get mapDraft() { return { ...draft, placements: draft.placements.map((p) => ({ ...p })) }; },
    place(x: number, y: number, targetLayer: Layer, brush: Brush) { this.erase(x, y, targetLayer); const p: EditorTilePlacement = { id: crypto.randomUUID(), assetId: brush.id, assetUrl: `standalone://${brush.id}`, categoryId: brush.categoryId, x, y, layer: targetLayer, scale: 1, displayWidth: tileSize, displayHeight: tileSize, solidColor: targetLayer === 'collision' ? 0xef476f : brush.color }; draft.placements.push(p); const g = draw(p); views.set(p.id, g); layer.addChild(g); },
    erase(x: number, y: number, targetLayer: Layer) { const index = draft.placements.findIndex((p) => p.x === x && p.y === y && p.layer === targetLayer); if (index < 0) return; const [p] = draft.placements.splice(index, 1); views.get(p.id)?.destroy(); views.delete(p.id); },
    loadDraft(next: EditorMapDraft) { draft.name = next.name; draft.tileSize = next.tileSize; draft.worldMap = next.worldMap; draft.placements = next.placements.map((p) => ({ ...p })); redraw(); },
    clear() { draft.placements.length = 0; redraw(); },
  };
}

function section(title: string, child: HTMLElement): HTMLElement { const wrap = div('', 'display:grid;gap:6px;'); wrap.append(div(title, 'font-weight:800;color:#ffe39a;'), child); return wrap; }
function div(text: string, style: string): HTMLDivElement { const el = document.createElement('div'); el.textContent = text; el.style.cssText = style; return el; }
function isUi(target: EventTarget | null): boolean { return target instanceof Element && Boolean(target.closest('.map-editor-panel')); }
function download(filename: string, value: unknown): void { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
