import type { EditorTerrainRuleSet, EditorTerrainTileRule, EditorTilesetAsset } from '../types';
import type { TerrainGenerationShape } from './TerrainGenerator';

export type TerrainGeneratorPanelOptions = {
  getTilesets: () => EditorTilesetAsset[];
  onAddCurrentTileset: () => void;
  onRemoveTileset: (asset: EditorTilesetAsset) => void;
  onGenerate: () => void;
  mapName?: string;
};

export class TerrainGeneratorPanel {
  readonly element: HTMLDivElement;

  private readonly header = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private readonly shapeSelect = document.createElement('select');
  private readonly seedInput = document.createElement('input');
  private isOpen = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private ruleManagerPanel: any = null;
  private ruleStorage: any = null;
  private ruleSet: EditorTerrainRuleSet | null = null;

  constructor(private readonly options: TerrainGeneratorPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'terrain-generator-panel';
    this.element.hidden = true;
    this.element.style.cssText = [
      'position:fixed',
      'left:420px',
      'top:72px',
      'z-index:10002',
      'width:320px',
      'max-height:calc(100vh - 96px)',
      'display:none',
      'flex-direction:column',
      'overflow:hidden',
      'border:1px solid rgba(125,211,252,.42)',
      'border-radius:14px',
      'background:rgba(15,23,42,.97)',
      'color:#f8fafc',
      'box-shadow:0 18px 60px rgba(0,0,0,.45)',
      'font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    ].join(';');

    this.header.className = 'terrain-generator-header';
    this.header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:8px',
      'padding:10px 12px',
      'background:rgba(125,211,252,.16)',
      'border-bottom:1px solid rgba(255,255,255,.1)',
      'font-weight:800',
      'cursor:move',
      'user-select:none',
    ].join(';');

    const title = document.createElement('strong');
    title.textContent = '지형 생성기';

    this.closeButton.type = 'button';
    this.closeButton.textContent = '×';
    this.closeButton.style.cssText = buttonStyle();
    this.closeButton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.dragging = false;
    });
    this.closeButton.addEventListener('pointerup', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.dragging = false;
    });
    this.closeButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });

    this.header.append(title, this.closeButton);

    this.body.className = 'terrain-generator-body';
    this.body.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px;overflow:auto;';

    const help = document.createElement('div');
    help.style.cssText = 'line-height:1.45;color:rgba(248,250,252,.72);';
    help.textContent = '등록한 이미지 타일셋과 규칙을 사용해 ground 레이어를 생성합니다. Object/Block은 유지됩니다.';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = '현재 타일셋 등록';
    addButton.style.cssText = buttonStyle();
    addButton.onclick = () => {
      this.options.onAddCurrentTileset();
      this.render();
    };

    const shapeRow = document.createElement('div');
    shapeRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const shapeLabel = document.createElement('span');
    shapeLabel.textContent = '생성 형태';
    shapeLabel.style.cssText = labelStyle();
    this.configureShapeSelect();
    shapeRow.append(shapeLabel, this.shapeSelect);

    const seedRow = document.createElement('div');
    seedRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const seedLabel = document.createElement('span');
    seedLabel.textContent = '시드';
    seedLabel.style.cssText = labelStyle();
    this.configureSeedInput();
    const randomSeedButton = document.createElement('button');
    randomSeedButton.type = 'button';
    randomSeedButton.textContent = '랜덤';
    randomSeedButton.style.cssText = compactButtonStyle();
    randomSeedButton.onclick = () => {
      const nextSeed = Math.floor(Math.random() * 1_000_000_000);
      this.seedInput.value = String(nextSeed);
      writeStoredSeed(this.mapName, nextSeed);
    };
    seedRow.append(seedLabel, this.seedInput, randomSeedButton);

    const ruleButton = document.createElement('button');
    ruleButton.type = 'button';
    ruleButton.textContent = '규칙관리';
    ruleButton.style.cssText = secondaryButtonStyle();
    ruleButton.onclick = () => { void this.openRuleManager(); };

    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.textContent = '등록 타일셋으로 지형 생성';
    generateButton.style.cssText = primaryButtonStyle();
    generateButton.onclick = this.options.onGenerate;

    this.list.className = 'terrain-generator-list';
    this.list.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-height:32px;';

    this.body.append(help, addButton, shapeRow, seedRow, ruleButton, this.list, generateButton);
    this.element.append(this.header, this.body);
    this.attachDragHandlers();
    this.render();
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.element);
  }

  open(): void {
    this.isOpen = true;
    this.element.hidden = false;
    this.element.style.display = 'flex';
    this.render();
  }

  close(): void {
    this.isOpen = false;
    this.dragging = false;
    this.element.hidden = true;
    this.element.style.display = 'none';
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  render(): void {
    this.list.innerHTML = '';
    const tilesets = this.options.getTilesets();

    const summary = document.createElement('div');
    summary.style.cssText = 'font-weight:800;color:#bae6fd;';
    summary.textContent = `등록된 타일셋: ${tilesets.length}개`;
    this.list.appendChild(summary);

    if (tilesets.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:8px;border:1px dashed rgba(255,255,255,.16);border-radius:10px;color:rgba(248,250,252,.58);';
      empty.textContent = '아직 등록된 타일셋이 없습니다.';
      this.list.appendChild(empty);
      return;
    }

    for (const asset of tilesets) {
      const item = document.createElement('div');
      item.style.cssText = [
        'display:flex',
        'align-items:center',
        'gap:8px',
        'padding:7px',
        'border:1px solid rgba(255,255,255,.12)',
        'border-radius:10px',
        'background:rgba(255,255,255,.05)',
      ].join(';');

      const preview = document.createElement('span');
      preview.style.cssText = [
        'display:inline-block',
        'width:28px',
        'height:28px',
        'flex:0 0 28px',
        'border-radius:6px',
        'background-color:rgba(255,255,255,.08)',
        `background-image:url(${asset.url})`,
        'background-position:center',
        'background-repeat:no-repeat',
        'background-size:contain',
        'image-rendering:pixelated',
      ].join(';');

      const label = document.createElement('span');
      label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto;min-width:0;';
      label.textContent = asset.name;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = '×';
      removeButton.title = '등록 해제';
      removeButton.style.cssText = smallDangerButtonStyle();
      removeButton.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      removeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.options.onRemoveTileset(asset);
        this.render();
        this.ruleManagerPanel?.render?.();
      });

      item.append(preview, label, removeButton);
      this.list.appendChild(item);
    }
  }

  private configureShapeSelect(): void {
    this.shapeSelect.style.cssText = selectStyle();
    this.shapeSelect.innerHTML = '';
    this.shapeSelect.append(
      createShapeOption('rect', '사각형'),
      createShapeOption('island', '섬/덩어리'),
    );
    this.shapeSelect.value = readStoredShape(this.mapName);
    this.shapeSelect.onchange = () => {
      writeStoredShape(this.mapName, this.shapeSelect.value as TerrainGenerationShape);
    };
  }

  private configureSeedInput(): void {
    this.seedInput.type = 'number';
    this.seedInput.min = '0';
    this.seedInput.max = '999999999';
    this.seedInput.step = '1';
    this.seedInput.value = String(readStoredSeed(this.mapName));
    this.seedInput.style.cssText = seedInputStyle();
    this.seedInput.onchange = () => {
      const seed = normalizeSeed(Number(this.seedInput.value));
      this.seedInput.value = String(seed);
      writeStoredSeed(this.mapName, seed);
    };
  }

  private get mapName(): string {
    return this.options.mapName ?? 'dalworld-map';
  }

  private async openRuleManager(): Promise<void> {
    const panel = await this.ensureRuleManagerPanel();
    panel.open();
  }

  private async ensureRuleManagerPanel(): Promise<any> {
    if (this.ruleManagerPanel?.open) return this.ruleManagerPanel;

    const [panelModule, storageModule] = await Promise.all([
      import('./TerrainRuleManagerPanel'),
      import('./TerrainRuleStorage'),
    ]);

    this.ruleStorage = new storageModule.TerrainRuleStorage(this.mapName);
    this.ruleSet = this.ruleStorage.load();
    this.ruleManagerPanel = new panelModule.TerrainRuleManagerPanel({
      getTilesets: () => this.options.getTilesets(),
      getRuleSet: () => this.ruleSet ?? this.ruleStorage.load(),
      onSaveRule: (rule: EditorTerrainTileRule) => this.saveTerrainRule(rule),
      onRemoveRule: (ruleId: string) => this.removeTerrainRule(ruleId),
    });
    this.ruleManagerPanel.mount(this.element.ownerDocument.body);
    return this.ruleManagerPanel;
  }

  private saveTerrainRule(rule: EditorTerrainTileRule): void {
    if (!this.ruleStorage) return;
    this.ruleSet = this.ruleStorage.upsert(rule);
    this.ruleManagerPanel?.render?.();
  }

  private removeTerrainRule(ruleId: string): void {
    if (!this.ruleStorage) return;
    this.ruleSet = this.ruleStorage.remove(ruleId);
    this.ruleManagerPanel?.render?.();
  }

  private attachDragHandlers(): void {
    this.header.addEventListener('pointerdown', (event) => {
      if (event.target === this.closeButton) return;
      this.dragging = true;
      this.dragOffsetX = event.clientX - this.element.offsetLeft;
      this.dragOffsetY = event.clientY - this.element.offsetTop;
      this.header.setPointerCapture(event.pointerId);
    });

    this.header.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.element.style.left = `${Math.max(8, event.clientX - this.dragOffsetX)}px`;
      this.element.style.top = `${Math.max(8, event.clientY - this.dragOffsetY)}px`;
    });

    const stopDrag = (event: PointerEvent) => {
      this.dragging = false;
      if (this.header.hasPointerCapture(event.pointerId)) this.header.releasePointerCapture(event.pointerId);
    };

    this.header.addEventListener('pointerup', stopDrag);
    this.header.addEventListener('pointercancel', stopDrag);
  }
}

function createShapeOption(value: TerrainGenerationShape, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function shapeStorageKey(mapName: string): string {
  return `dalworld:editor-terrain-shape:${mapName}`;
}

function seedStorageKey(mapName: string): string {
  return `dalworld:editor-terrain-seed:${mapName}`;
}

function readStoredShape(mapName: string): TerrainGenerationShape {
  const raw = window.localStorage.getItem(shapeStorageKey(mapName));
  return raw === 'island' ? 'island' : 'rect';
}

function writeStoredShape(mapName: string, shape: TerrainGenerationShape): void {
  window.localStorage.setItem(shapeStorageKey(mapName), shape);
  window.localStorage.setItem('dalworld:editor-terrain-shape:dalworld-map', shape);
}

function readStoredSeed(mapName: string): number {
  const raw = window.localStorage.getItem(seedStorageKey(mapName));
  return normalizeSeed(raw ? Number(raw) : 1);
}

function writeStoredSeed(mapName: string, seed: number): void {
  const normalized = normalizeSeed(seed);
  window.localStorage.setItem(seedStorageKey(mapName), String(normalized));
  window.localStorage.setItem('dalworld:editor-terrain-seed:dalworld-map', String(normalized));
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  return Math.max(0, Math.min(999_999_999, Math.round(seed)));
}

function labelStyle(): string {
  return 'width:58px;flex:0 0 58px;color:rgba(248,250,252,.72);font-weight:800;';
}

function buttonStyle(): string {
  return 'border:1px solid rgba(255,255,255,.18);border-radius:9px;background:rgba(255,255,255,.08);color:#f8fafc;padding:7px 10px;cursor:pointer;font-weight:800;';
}

function compactButtonStyle(): string {
  return 'border:1px solid rgba(255,255,255,.18);border-radius:8px;background:rgba(255,255,255,.08);color:#f8fafc;padding:7px 8px;cursor:pointer;font-weight:800;';
}

function primaryButtonStyle(): string {
  return 'border:1px solid rgba(56,189,248,.42);border-radius:10px;background:rgba(14,165,233,.22);color:#f8fafc;padding:9px 10px;cursor:pointer;font-weight:900;';
}

function secondaryButtonStyle(): string {
  return 'border:1px solid rgba(167,139,250,.45);border-radius:10px;background:rgba(109,40,217,.28);color:#f8fafc;padding:8px 10px;cursor:pointer;font-weight:900;';
}

function selectStyle(): string {
  return 'flex:1 1 auto;min-width:0;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(0,0,0,.28);color:#f8fafc;padding:7px 8px;font-weight:800;';
}

function seedInputStyle(): string {
  return 'flex:1 1 auto;min-width:0;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(0,0,0,.28);color:#f8fafc;padding:7px 8px;font-weight:800;';
}

function smallDangerButtonStyle(): string {
  return 'width:26px;height:26px;flex:0 0 26px;border:1px solid rgba(248,113,113,.45);border-radius:8px;background:rgba(127,29,29,.45);color:#fecaca;cursor:pointer;font-weight:900;line-height:1;';
}
