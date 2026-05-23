import type { EditorResourceType, EditorSourceRect, EditorTilesetAsset } from '../types';
import { inferResourceTypeFromAsset, type EditorResourceGenerationRule } from './ResourceGenerator';

export type ResourceGeneratorPanelOptions = {
  getCurrentAsset: () => { asset: EditorTilesetAsset; sourceRect?: EditorSourceRect } | null;
  getRules: () => EditorResourceGenerationRule[];
  onSaveRules: (rules: EditorResourceGenerationRule[]) => void;
  onGenerate: () => void;
  mapName?: string;
};

export class ResourceGeneratorPanel {
  readonly element: HTMLDivElement;
  private readonly header = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly list = document.createElement('div');
  private readonly closeButton = document.createElement('button');
  private isOpen = false;
  private dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(private readonly options: ResourceGeneratorPanelOptions) {
    this.element = document.createElement('div');
    this.element.className = 'resource-generator-panel';
    this.element.hidden = true;
    this.element.style.cssText = [
      'position:fixed', 'left:780px', 'top:72px', 'z-index:10002', 'width:340px',
      'max-height:calc(100vh - 96px)', 'display:none', 'flex-direction:column', 'overflow:hidden',
      'border:1px solid rgba(74,222,128,.42)', 'border-radius:14px', 'background:rgba(15,23,42,.97)',
      'color:#f8fafc', 'box-shadow:0 18px 60px rgba(0,0,0,.45)',
      'font:12px system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
    ].join(';');

    this.header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;background:rgba(74,222,128,.14);border-bottom:1px solid rgba(255,255,255,.1);font-weight:900;cursor:move;user-select:none;';
    const title = document.createElement('strong');
    title.textContent = '자원 생성기';
    this.closeButton.type = 'button';
    this.closeButton.textContent = '×';
    this.closeButton.style.cssText = buttonStyle();
    this.closeButton.onclick = (event) => { stopEvent(event); this.close(); };
    this.header.append(title, this.closeButton);

    this.body.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:12px;overflow:auto;';
    const help = document.createElement('div');
    help.style.cssText = 'line-height:1.45;color:rgba(248,250,252,.72);';
    help.textContent = '선택한 rock/tree 자원을 일반 통행 가능 땅에 자연스럽게 배치합니다. 물, 바위 지형, 막힌 지형, 길 위는 제외됩니다.';

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = '현재 선택 자원 등록';
    addButton.style.cssText = primaryButtonStyle();
    addButton.onclick = () => this.addCurrentResource();

    const generateButton = document.createElement('button');
    generateButton.type = 'button';
    generateButton.textContent = '선택 자원 자동 배치';
    generateButton.style.cssText = primaryButtonStyle();
    generateButton.onclick = () => this.options.onGenerate();

    this.list.style.cssText = 'display:flex;flex-direction:column;gap:7px;min-height:32px;';
    this.body.append(help, addButton, this.list, generateButton);
    this.element.append(this.header, this.body);
    this.attachDragHandlers();
    this.render();
  }

  mount(parent: HTMLElement): void { parent.appendChild(this.element); }
  open(): void { this.isOpen = true; this.element.hidden = false; this.element.style.display = 'flex'; this.render(); }
  close(): void { this.isOpen = false; this.dragging = false; this.element.hidden = true; this.element.style.display = 'none'; }
  toggle(): void { if (this.isOpen) this.close(); else this.open(); }
  render(): void {
    this.list.innerHTML = '';
    const rules = this.options.getRules();
    const summary = document.createElement('div');
    summary.style.cssText = 'font-weight:900;color:#bbf7d0;';
    summary.textContent = `등록 자원: ${rules.length}개`;
    this.list.appendChild(summary);
    if (rules.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = emptyBoxStyle();
      empty.textContent = '등록된 자원이 없습니다. 좌측 타일 패널에서 rock/tree asset을 선택한 뒤 등록하세요.';
      this.list.appendChild(empty);
      return;
    }
    for (const rule of rules) this.list.appendChild(this.createRuleRow(rule));
  }

  private addCurrentResource(): void {
    const current = this.options.getCurrentAsset();
    if (!current) return;
    const rules = [...this.options.getRules()];
    const exists = rules.some((rule) => rule.asset.id === current.asset.id && rule.asset.url === current.asset.url && rectKey(rule.sourceRect) === rectKey(current.sourceRect));
    if (exists) return;
    rules.push({
      id: crypto.randomUUID(),
      enabled: true,
      asset: current.asset,
      sourceRect: current.sourceRect ? { ...current.sourceRect } : undefined,
      resourceType: inferResourceTypeFromAsset(current.asset),
      amount: 80,
      scale: 1,
    });
    this.options.onSaveRules(rules);
    this.render();
  }

  private createRuleRow(rule: EditorResourceGenerationRule): HTMLElement {
    const item = document.createElement('div');
    item.style.cssText = 'display:grid;grid-template-columns:32px 1fr auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.05);';
    const preview = document.createElement('span');
    preview.style.cssText = `display:inline-block;width:32px;height:32px;border-radius:7px;background:rgba(255,255,255,.08) center/contain no-repeat url(${rule.asset.url});image-rendering:pixelated;`;
    const middle = document.createElement('div');
    middle.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:0;';
    const title = document.createElement('div');
    title.textContent = rule.asset.name;
    title.style.cssText = 'font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    middle.append(title, this.createControlRows(rule));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.style.cssText = smallDangerButtonStyle();
    remove.onclick = (event) => { stopEvent(event); this.updateRules(this.options.getRules().filter((item) => item.id !== rule.id)); };
    item.append(preview, middle, remove);
    return item;
  }

  private createControlRows(rule: EditorResourceGenerationRule): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:5px;';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = rule.enabled;
    enabled.onchange = () => this.patchRule(rule.id, { enabled: enabled.checked });
    const typeSelect = document.createElement('select');
    typeSelect.style.cssText = inputStyle();
    typeSelect.append(option('tree', 'tree'), option('stone', 'stone'));
    typeSelect.value = rule.resourceType;
    typeSelect.onchange = () => this.patchRule(rule.id, { resourceType: typeSelect.value as EditorResourceType });
    const amount = numberInput(rule.amount, 0, 5000, 1, (value) => this.patchRule(rule.id, { amount: value }));
    const scale = numberInput(rule.scale, 0.1, 10, 0.1, (value) => this.patchRule(rule.id, { scale: value }));
    wrap.append(
      row(label('사용'), enabled, typeSelect),
      row(label('수량'), amount),
      row(label('스케일'), scale),
    );
    return wrap;
  }

  private patchRule(id: string, patch: Partial<EditorResourceGenerationRule>): void {
    this.updateRules(this.options.getRules().map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  }

  private updateRules(rules: EditorResourceGenerationRule[]): void {
    this.options.onSaveRules(rules);
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
    const stopDrag = (event: PointerEvent) => { this.dragging = false; if (this.header.hasPointerCapture(event.pointerId)) this.header.releasePointerCapture(event.pointerId); };
    this.header.addEventListener('pointerup', stopDrag);
    this.header.addEventListener('pointercancel', stopDrag);
  }
}

function row(...children: HTMLElement[]): HTMLDivElement { const element = document.createElement('div'); element.style.cssText = 'display:flex;align-items:center;gap:6px;'; element.append(...children); return element; }
function label(text: string): HTMLSpanElement { const element = document.createElement('span'); element.textContent = text; element.style.cssText = 'width:46px;flex:0 0 46px;color:rgba(248,250,252,.72);font-weight:800;'; return element; }
function option(value: string, text: string): HTMLOptionElement { const element = document.createElement('option'); element.value = value; element.textContent = text; return element; }
function numberInput(value: number, min: number, max: number, step: number, onChange: (value: number) => void): HTMLInputElement { const input = document.createElement('input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.style.cssText = inputStyle(); input.onchange = () => onChange(clampNumber(Number(input.value), min, max)); return input; }
function rectKey(rect: EditorSourceRect | undefined): string { return rect ? `${rect.x}:${rect.y}:${rect.width}:${rect.height}` : 'full'; }
function clampNumber(value: number, min: number, max: number): number { return !Number.isFinite(value) ? min : Math.max(min, Math.min(max, value)); }
function stopEvent(event: Event): void { event.preventDefault(); event.stopPropagation(); }
function buttonStyle(): string { return 'border:1px solid rgba(255,255,255,.18);border-radius:9px;background:rgba(255,255,255,.08);color:#f8fafc;padding:7px 10px;cursor:pointer;font-weight:800;'; }
function primaryButtonStyle(): string { return 'border:1px solid rgba(74,222,128,.42);border-radius:10px;background:rgba(22,163,74,.26);color:#f8fafc;padding:9px 10px;cursor:pointer;font-weight:900;'; }
function smallDangerButtonStyle(): string { return 'width:26px;height:26px;flex:0 0 26px;border:1px solid rgba(248,113,113,.45);border-radius:8px;background:rgba(127,29,29,.45);color:#fecaca;cursor:pointer;font-weight:900;line-height:1;'; }
function emptyBoxStyle(): string { return 'padding:8px;border:1px dashed rgba(255,255,255,.16);border-radius:10px;color:rgba(248,250,252,.58);line-height:1.45;'; }
function inputStyle(): string { return 'flex:1 1 auto;min-width:0;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(0,0,0,.28);color:#f8fafc;padding:6px 7px;font-weight:800;'; }
