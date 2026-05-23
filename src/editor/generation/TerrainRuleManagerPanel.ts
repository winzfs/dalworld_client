import type {
  EditorSourceRect,
  EditorTerrainMaterial,
  EditorTerrainMovementMode,
  EditorTerrainRuleSet,
  EditorTerrainTileRole,
  EditorTerrainTileRule,
  EditorTilesetAsset,
} from '../types';

export type TerrainRuleManagerPanelOptions = {
  getTilesets: () => EditorTilesetAsset[];
  getRuleSet: () => EditorTerrainRuleSet;
  onSaveRule: (rule: EditorTerrainTileRule) => void;
  onRemoveRule: (ruleId: string) => void;
  onSaveTilesetMaterial: (
    asset: EditorTilesetAsset,
    material: EditorTerrainMaterial,
    movementMode: EditorTerrainMovementMode,
  ) => void;
};

type Point = { x: number; y: number };

type TilesetTerrainSettings = {
  material: EditorTerrainMaterial;
  movementMode: EditorTerrainMovementMode;
  blocksMovement: boolean;
};

const TILE_SIZE_OPTIONS = [16, 32, 64];
const DEFAULT_ROLE: EditorTerrainTileRole = 'center';
const DEFAULT_SCALE = 1;
const DEFAULT_WEIGHT = 1;

export class TerrainRuleManagerPanel {
  readonly element: HTMLDivElement;

  private readonly header = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private readonly body = document.createElement('div');
  private readonly tilesetList = document.createElement('div');
  private readonly previewWrap = document.createElement('div');
  private readonly previewImage = document.createElement('img');
  private readonly overlay = document.createElement('div');
  private readonly selection = document.createElement('div');
  private readonly ruleBoxes = document.createElement('div');
  private readonly roleSelect = document.createElement('select');
  private readonly tileSizeSelect = document.createElement('select');
  private readonly scaleInput = document.createElement('input');
  private readonly weightInput = document.createElement('input');
  private readonly status = document.createElement('div');

  private selectedAsset: EditorTilesetAsset | null = null;
  private selectedRect: EditorSourceRect | null = null;
  private naturalWidth = 0;
  private naturalHeight = 0;
  private tileSize = 32;
  private isOpen = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(private readonly options: TerrainRuleManagerPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'terrain-rule-manager-panel';
    this.element.hidden = true;
    this.element.style.cssText = [
      'position:fixed',
      'left:760px',
      'top:72px',
      'z-index:10004',
      'width:min(940px,calc(100vw - 48px))',
      'height:min(720px,calc(100vh - 96px))',
      'display:none',
      'flex-direction:column',
      'overflow:hidden',
      'border:1px solid rgba(167,139,250,.5)',
      'border-radius:14px',
      'background:rgba(17,24,39,.98)',
      'color:#f8fafc',
      'box-shadow:0 18px 60px rgba(0,0,0,.48)',
      'font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    ].join(';');

    this.header.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'gap:8px',
      'padding:10px 12px',
      'background:rgba(167,139,250,.17)',
      'border-bottom:1px solid rgba(255,255,255,.1)',
      'font-weight:900',
      'cursor:move',
      'user-select:none',
    ].join(';');

    const title = document.createElement('strong');
    title.textContent = '지형 규칙 관리';

    this.closeButton.type = 'button';
    this.closeButton.textContent = '×';
    this.closeButton.style.cssText = buttonStyle();
    this.closeButton.addEventListener('pointerdown', stopEvent);
    this.closeButton.addEventListener('pointerup', stopEvent);
    this.closeButton.addEventListener('click', (event) => {
      stopEvent(event);
      this.close();
    });

    this.header.append(title, this.closeButton);
    this.body.style.cssText = 'display:grid;grid-template-columns:260px 1fr;gap:10px;min-height:0;flex:1 1 auto;padding:10px;';

    const left = document.createElement('div');
    left.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-height:0;';

    const leftTitle = document.createElement('div');
    leftTitle.textContent = '등록 타일셋 / 속성';
    leftTitle.style.cssText = 'font-weight:900;color:#ddd6fe;';

    this.tilesetList.style.cssText = 'display:flex;flex-direction:column;gap:6px;overflow:auto;min-height:0;';
    left.append(leftTitle, this.tilesetList);

    const right = document.createElement('div');
    right.style.cssText = 'display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;';

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

    this.tileSizeSelect.style.cssText = selectStyle();
    for (const size of TILE_SIZE_OPTIONS) {
      const option = document.createElement('option');
      option.value = String(size);
      option.textContent = `${size}px`;
      this.tileSizeSelect.appendChild(option);
    }
    this.tileSizeSelect.value = String(this.tileSize);
    this.tileSizeSelect.onchange = () => {
      this.tileSize = Number(this.tileSizeSelect.value) || 32;
      this.selectedRect = null;
      this.renderPreview();
    };

    this.roleSelect.style.cssText = selectStyle();
    for (const role of getRoleOptions()) {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      this.roleSelect.appendChild(option);
    }
    this.roleSelect.value = DEFAULT_ROLE;

    this.scaleInput.type = 'number';
    this.scaleInput.min = '0.1';
    this.scaleInput.max = '10';
    this.scaleInput.step = '0.1';
    this.scaleInput.value = String(DEFAULT_SCALE);
    this.scaleInput.style.cssText = inputStyle();
    this.scaleInput.onchange = () => {
      this.scaleInput.value = String(normalizeScale(Number(this.scaleInput.value)));
    };

    this.weightInput.type = 'number';
    this.weightInput.min = '0';
    this.weightInput.max = '100';
    this.weightInput.step = '1';
    this.weightInput.value = String(DEFAULT_WEIGHT);
    this.weightInput.style.cssText = inputStyle();
    this.weightInput.title = '가중치. 같은 role 안에서 선택 비중이 커집니다.';
    this.weightInput.onchange = () => {
      this.weightInput.value = String(normalizeWeight(Number(this.weightInput.value)));
    };

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.textContent = '선택 타일 규칙 등록';
    saveButton.style.cssText = primaryButtonStyle();
    saveButton.onclick = () => this.saveSelectedRule();

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '선택 타일 규칙 제거';
    removeButton.style.cssText = dangerButtonStyle();
    removeButton.onclick = () => this.removeSelectedRule();

    controls.append(
      label('타일크기'),
      this.tileSizeSelect,
      label('역할'),
      this.roleSelect,
      label('스케일'),
      this.scaleInput,
      label('가중치'),
      this.weightInput,
      saveButton,
      removeButton,
    );

    this.previewWrap.style.cssText = [
      'position:relative',
      'flex:1 1 auto',
      'min-height:0',
      'overflow:auto',
      'border:1px solid rgba(255,255,255,.12)',
      'border-radius:12px',
      'background:rgba(255,255,255,.04)',
    ].join(';');

    const imageLayer = document.createElement('div');
    imageLayer.style.cssText = 'position:relative;display:inline-block;min-width:32px;min-height:32px;';

    this.previewImage.draggable = false;
    this.previewImage.style.cssText = 'display:block;max-width:none;image-rendering:pixelated;user-select:none;';

    this.overlay.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;';
    this.ruleBoxes.style.cssText = 'position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;';
    this.selection.style.cssText = 'position:absolute;display:none;border:2px solid #facc15;background:rgba(250,204,21,.18);box-sizing:border-box;pointer-events:none;';

    imageLayer.append(this.previewImage, this.ruleBoxes, this.selection, this.overlay);
    this.previewWrap.appendChild(imageLayer);
    this.overlay.addEventListener('pointerdown', (event) => this.pickTile(event));

    this.status.style.cssText = 'color:rgba(248,250,252,.68);min-height:18px;';
    this.status.textContent = '타일셋을 선택하세요.';

    right.append(controls, this.previewWrap, this.status);
    this.body.append(left, right);
    this.element.append(this.header, this.body);

    this.attachDragHandlers();
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
    this.renderTilesets();
    this.renderPreview();
  }

  private renderTilesets(): void {
    this.tilesetList.innerHTML = '';
    const tilesets = this.options.getTilesets();
    if (tilesets.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '지형 생성기에서 타일셋을 먼저 등록하세요.';
      empty.style.cssText = emptyBoxStyle();
      this.tilesetList.appendChild(empty);
      return;
    }

    for (const asset of tilesets) {
      const settings = this.getTilesetSettings(asset);
      const item = document.createElement('div');
      item.style.cssText = tilesetCardStyle(this.selectedAsset?.id === asset.id && this.selectedAsset?.url === asset.url);

      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.textContent = asset.name;
      selectButton.style.cssText = tilesetButtonStyle(false);
      selectButton.onclick = () => this.selectTileset(asset);

      const materialSelect = createMaterialSelect(settings.material);
      materialSelect.onchange = () => {
        const nextMaterial = materialSelect.value as EditorTerrainMaterial;
        const nextMovement = getDefaultMovementMode(nextMaterial);
        this.saveTilesetSettings(asset, nextMaterial, nextMovement);
      };

      const movementSelect = createMovementSelect(settings.movementMode);
      movementSelect.onchange = () => {
        this.saveTilesetSettings(
          asset,
          materialSelect.value as EditorTerrainMaterial,
          movementSelect.value as EditorTerrainMovementMode,
        );
      };

      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:54px 1fr;gap:5px 6px;align-items:center;';
      grid.append(smallLabel('속성'), materialSelect, smallLabel('이동'), movementSelect);
      item.append(selectButton, grid);
      this.tilesetList.appendChild(item);
    }
  }

  private selectTileset(asset: EditorTilesetAsset): void {
    this.selectedAsset = asset;
    this.selectedRect = null;
    this.naturalWidth = 0;
    this.naturalHeight = 0;
    this.previewImage.onload = () => {
      this.naturalWidth = this.previewImage.naturalWidth;
      this.naturalHeight = this.previewImage.naturalHeight;
      this.renderPreview();
    };
    this.previewImage.onerror = () => {
      this.status.textContent = '이미지 로드 실패';
    };
    this.previewImage.src = asset.url;
    this.renderTilesets();
    this.status.textContent = `${asset.name} 로드 중...`;
  }

  private renderPreview(): void {
    this.ruleBoxes.innerHTML = '';
    this.renderSelection();
    if (!this.selectedAsset) {
      this.previewImage.removeAttribute('src');
      this.status.textContent = '타일셋을 선택하세요.';
      return;
    }

    this.overlay.style.width = `${this.naturalWidth}px`;
    this.overlay.style.height = `${this.naturalHeight}px`;
    this.ruleBoxes.style.width = `${this.naturalWidth}px`;
    this.ruleBoxes.style.height = `${this.naturalHeight}px`;

    const rules = this.getRulesForSelectedAsset();
    for (const rule of rules) {
      const box = document.createElement('div');
      box.title = `${rule.role} · ${rule.material ?? 'grass'} · ${rule.movementMode ?? 'passable'} · scale ${rule.scale ?? 1} · weight ${rule.weight ?? 1}`;
      box.style.cssText = [
        'position:absolute',
        `left:${rule.sourceRect.x}px`,
        `top:${rule.sourceRect.y}px`,
        `width:${rule.sourceRect.width}px`,
        `height:${rule.sourceRect.height}px`,
        `border:2px solid ${roleColor(rule.role)}`,
        `background:${roleBackground(rule.role)}`,
        'box-sizing:border-box',
      ].join(';');
      this.ruleBoxes.appendChild(box);
    }

    const settings = this.getTilesetSettings(this.selectedAsset);
    this.status.textContent = `${this.selectedAsset.name} · ${settings.material}/${settings.movementMode} · ${this.tileSize}px · 규칙 ${rules.length}개`;
  }

  private pickTile(event: PointerEvent): void {
    if (!this.selectedAsset || this.naturalWidth <= 0 || this.naturalHeight <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.eventToImagePoint(event);
    const x = Math.floor(point.x / this.tileSize) * this.tileSize;
    const y = Math.floor(point.y / this.tileSize) * this.tileSize;
    if (x + this.tileSize > this.naturalWidth || y + this.tileSize > this.naturalHeight) return;
    this.selectedRect = { x, y, width: this.tileSize, height: this.tileSize };
    const existingRule = this.findSelectedRule();
    if (existingRule) {
      this.roleSelect.value = existingRule.role;
      this.scaleInput.value = String(normalizeScale(existingRule.scale));
      this.weightInput.value = String(normalizeWeight(existingRule.weight));
    } else {
      this.roleSelect.value = DEFAULT_ROLE;
      this.weightInput.value = String(DEFAULT_WEIGHT);
    }
    this.renderSelection();
    this.status.textContent = `선택 ${x},${y},${this.tileSize}x${this.tileSize}`;
  }

  private eventToImagePoint(event: PointerEvent): Point {
    const rect = this.previewImage.getBoundingClientRect();
    const scaleX = this.naturalWidth / Math.max(1, rect.width);
    const scaleY = this.naturalHeight / Math.max(1, rect.height);
    return {
      x: clamp((event.clientX - rect.left) * scaleX, 0, Math.max(0, this.naturalWidth - 1)),
      y: clamp((event.clientY - rect.top) * scaleY, 0, Math.max(0, this.naturalHeight - 1)),
    };
  }

  private renderSelection(): void {
    if (!this.selectedRect) {
      this.selection.style.display = 'none';
      return;
    }
    this.selection.style.display = 'block';
    this.selection.style.left = `${this.selectedRect.x}px`;
    this.selection.style.top = `${this.selectedRect.y}px`;
    this.selection.style.width = `${this.selectedRect.width}px`;
    this.selection.style.height = `${this.selectedRect.height}px`;
  }

  private saveSelectedRule(): void {
    if (!this.selectedAsset || !this.selectedRect) {
      this.status.textContent = '먼저 타일을 선택하세요.';
      return;
    }
    const role = this.roleSelect.value as EditorTerrainTileRole;
    const scale = normalizeScale(Number(this.scaleInput.value));
    const weight = normalizeWeight(Number(this.weightInput.value));
    const settings = this.getTilesetSettings(this.selectedAsset);
    this.scaleInput.value = String(scale);
    this.weightInput.value = String(weight);
    const rule: EditorTerrainTileRule = {
      id: createRuleId(this.selectedAsset, this.selectedRect, this.tileSize, role, scale),
      tilesetId: this.selectedAsset.id,
      tilesetName: this.selectedAsset.name,
      tilesetUrl: this.selectedAsset.url,
      tileSize: this.tileSize,
      role,
      scale,
      weight,
      material: settings.material,
      movementMode: settings.movementMode,
      blocksMovement: settings.blocksMovement,
      sourceRect: { ...this.selectedRect },
    };
    this.options.onSaveRule(rule);
    this.renderPreview();
    this.status.textContent = `규칙 등록: ${role} · ${settings.material}/${settings.movementMode} · scale ${scale} · weight ${weight}`;
  }

  private removeSelectedRule(): void {
    if (!this.selectedAsset || !this.selectedRect) {
      this.status.textContent = '먼저 제거할 타일을 선택하세요.';
      return;
    }
    const rules = this.findSelectedRectRules();
    if (rules.length === 0) {
      this.status.textContent = '선택한 타일에 등록된 규칙이 없습니다.';
      return;
    }
    for (const rule of rules) this.options.onRemoveRule(rule.id);
    this.renderPreview();
    this.status.textContent = `규칙 제거: ${this.selectedRect.x},${this.selectedRect.y} · ${rules.length}개`;
  }

  private getRulesForSelectedAsset(): EditorTerrainTileRule[] {
    if (!this.selectedAsset) return [];
    return this.options.getRuleSet().rules.filter((rule) => (
      rule.tilesetId === this.selectedAsset?.id
      && rule.tilesetUrl === this.selectedAsset?.url
      && rule.tileSize === this.tileSize
    ));
  }

  private findSelectedRule(): EditorTerrainTileRule | undefined {
    const rules = this.findSelectedRectRules();
    const selectedRole = this.roleSelect.value as EditorTerrainTileRole;
    const selectedScale = normalizeScale(Number(this.scaleInput.value));
    return rules.find((rule) => rule.role === selectedRole && normalizeScale(rule.scale) === selectedScale)
      ?? rules.find((rule) => rule.role === selectedRole)
      ?? rules[0];
  }

  private findSelectedRectRules(): EditorTerrainTileRule[] {
    if (!this.selectedAsset || !this.selectedRect) return [];
    const legacyRuleId = createLegacyRuleId(this.selectedAsset, this.selectedRect, this.tileSize);
    return this.options.getRuleSet().rules.filter((rule) => (
      rule.tilesetId === this.selectedAsset?.id
      && rule.tilesetUrl === this.selectedAsset?.url
      && rule.tileSize === this.tileSize
      && rule.sourceRect.x === this.selectedRect?.x
      && rule.sourceRect.y === this.selectedRect?.y
      && rule.sourceRect.width === this.selectedRect?.width
      && rule.sourceRect.height === this.selectedRect?.height
    ) || rule.id === legacyRuleId);
  }

  private getTilesetSettings(asset: EditorTilesetAsset): TilesetTerrainSettings {
    const saved = (this.options.getRuleSet().tilesets ?? []).find((item) => item.tilesetId === asset.id && item.tilesetUrl === asset.url);
    const material = saved?.material ?? 'grass';
    const movementMode = saved?.movementMode ?? getDefaultMovementMode(material);
    return { material, movementMode, blocksMovement: saved?.blocksMovement ?? movementMode === 'blocked' };
  }

  private saveTilesetSettings(
    asset: EditorTilesetAsset,
    material: EditorTerrainMaterial,
    movementMode: EditorTerrainMovementMode,
  ): void {
    this.options.onSaveTilesetMaterial(asset, material, movementMode);
    this.status.textContent = `타일셋 속성 저장: ${asset.name} · ${material}/${movementMode}`;
    this.render();
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

function createRuleId(asset: EditorTilesetAsset, rect: EditorSourceRect, tileSize: number, role: EditorTerrainTileRole, scale: number): string {
  return `${asset.id}:${asset.url}:${tileSize}:${rect.x}:${rect.y}:${rect.width}:${rect.height}:${role}:scale-${normalizeScale(scale)}`;
}

function createLegacyRuleId(asset: EditorTilesetAsset, rect: EditorSourceRect, tileSize: number): string {
  return `${asset.id}:${asset.url}:${tileSize}:${rect.x}:${rect.y}:${rect.width}:${rect.height}`;
}

function getRoleOptions(): EditorTerrainTileRole[] {
  return [
    'center',
    'edgeTop',
    'edgeBottom',
    'edgeLeft',
    'edgeRight',
    'outerTopLeft',
    'outerTopRight',
    'outerBottomLeft',
    'outerBottomRight',
    'innerTopLeft',
    'innerTopRight',
    'innerBottomLeft',
    'innerBottomRight',
    'decorative',
  ];
}

function roleColor(role: EditorTerrainTileRole): string {
  if (role === 'center') return '#38bdf8';
  if (role === 'decorative') return '#22c55e';
  if (role.startsWith('edge')) return '#facc15';
  if (role.startsWith('outer')) return '#fb923c';
  return '#c084fc';
}

function roleBackground(role: EditorTerrainTileRole): string {
  if (role === 'center') return 'rgba(56,189,248,.14)';
  if (role === 'decorative') return 'rgba(34,197,94,.14)';
  if (role.startsWith('edge')) return 'rgba(250,204,21,.14)';
  if (role.startsWith('outer')) return 'rgba(251,146,60,.14)';
  return 'rgba(192,132,252,.14)';
}

function getMaterialOptions(): EditorTerrainMaterial[] { return ['grass', 'water', 'road', 'sand', 'dirt', 'rock']; }
function getMovementOptions(): EditorTerrainMovementMode[] { return ['passable', 'blocked', 'shallow', 'swim', 'boatOnly']; }
function getDefaultMovementMode(material: EditorTerrainMaterial): EditorTerrainMovementMode { if (material === 'water') return 'boatOnly'; if (material === 'rock') return 'blocked'; return 'passable'; }
function createMaterialSelect(value: EditorTerrainMaterial): HTMLSelectElement { const select = document.createElement('select'); select.style.cssText = compactSelectStyle(); for (const material of getMaterialOptions()) { const option = document.createElement('option'); option.value = material; option.textContent = material; select.appendChild(option); } select.value = value; return select; }
function createMovementSelect(value: EditorTerrainMovementMode): HTMLSelectElement { const select = document.createElement('select'); select.style.cssText = compactSelectStyle(); for (const movement of getMovementOptions()) { const option = document.createElement('option'); option.value = movement; option.textContent = movement; select.appendChild(option); } select.value = value; return select; }
function stopEvent(event: Event): void { event.preventDefault(); event.stopPropagation(); }
function label(text: string): HTMLSpanElement { const element = document.createElement('span'); element.textContent = text; element.style.cssText = 'color:rgba(248,250,252,.68);font-weight:800;'; return element; }
function smallLabel(text: string): HTMLSpanElement { const element = document.createElement('span'); element.textContent = text; element.style.cssText = 'color:rgba(248,250,252,.62);font-weight:800;'; return element; }
function buttonStyle(): string { return 'border:1px solid rgba(255,255,255,.18);border-radius:9px;background:rgba(255,255,255,.08);color:#f8fafc;padding:7px 10px;cursor:pointer;font-weight:800;'; }
function primaryButtonStyle(): string { return 'border:1px solid rgba(34,197,94,.42);border-radius:10px;background:rgba(22,163,74,.24);color:#f8fafc;padding:8px 10px;cursor:pointer;font-weight:900;'; }
function dangerButtonStyle(): string { return 'border:1px solid rgba(248,113,113,.45);border-radius:10px;background:rgba(127,29,29,.45);color:#fecaca;padding:8px 10px;cursor:pointer;font-weight:900;'; }
function selectStyle(): string { return 'border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(0,0,0,.28);color:#f8fafc;padding:6px 8px;font-weight:800;'; }
function compactSelectStyle(): string { return 'width:100%;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(0,0,0,.28);color:#f8fafc;padding:6px 7px;font-weight:800;'; }
function inputStyle(): string { return 'width:64px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(0,0,0,.28);color:#f8fafc;padding:6px 8px;font-weight:800;'; }
function emptyBoxStyle(): string { return 'padding:8px;border:1px dashed rgba(255,255,255,.16);border-radius:10px;color:rgba(248,250,252,.58);line-height:1.45;'; }
function tilesetCardStyle(active: boolean): string { return ['display:flex','flex-direction:column','gap:6px','border-radius:10px','padding:8px',active ? 'border:1px solid rgba(167,139,250,.75)' : 'border:1px solid rgba(255,255,255,.12)',active ? 'background:rgba(167,139,250,.18)' : 'background:rgba(255,255,255,.05)'].join(';'); }
function tilesetButtonStyle(active: boolean): string { return ['text-align:left','border-radius:8px','padding:7px','cursor:pointer','font-weight:800',active ? 'border:1px solid rgba(167,139,250,.75)' : 'border:1px solid rgba(255,255,255,.12)',active ? 'background:rgba(167,139,250,.22)' : 'background:rgba(255,255,255,.05)','color:#f8fafc'].join(';'); }
function normalizeScale(value: number | undefined): number { if (!Number.isFinite(value) || (value as number) <= 0) return DEFAULT_SCALE; return Math.max(0.1, Math.min(10, Math.round((value as number) * 10) / 10)); }
function normalizeWeight(value: number | undefined): number { if (!Number.isFinite(value) || (value as number) < 0) return DEFAULT_WEIGHT; return Math.max(0, Math.min(100, Math.round(value as number))); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
