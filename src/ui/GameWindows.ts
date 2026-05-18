type WindowId = 'inventory' | 'crafting' | 'building';

type FloatingButtonConfig = {
  id: WindowId;
  label: string;
  icon: string;
  title: string;
  defaultButtonX: number;
  defaultButtonY: number;
  defaultWindowX: number;
  defaultWindowY: number;
};

const WINDOW_ROOT_ID = 'dalworld-windows';
const INVENTORY_CATEGORIES = ['일반', '사용', '장비', '제작', '건설', '펫'] as const;
const INVENTORY_SLOT_COUNT = 36;

const BUTTONS: FloatingButtonConfig[] = [
  {
    id: 'inventory',
    label: '가방',
    icon: '🎒',
    title: '가방',
    defaultButtonX: 18,
    defaultButtonY: 180,
    defaultWindowX: 96,
    defaultWindowY: 120,
  },
  {
    id: 'crafting',
    label: '제작',
    icon: '⚒️',
    title: '제작',
    defaultButtonX: 18,
    defaultButtonY: 252,
    defaultWindowX: 160,
    defaultWindowY: 150,
  },
  {
    id: 'building',
    label: '건설',
    icon: '🏠',
    title: '건설',
    defaultButtonX: 18,
    defaultButtonY: 324,
    defaultWindowX: 220,
    defaultWindowY: 180,
  },
];

export class GameWindows {
  private readonly root: HTMLDivElement;
  private zIndex = 30;

  constructor() {
    this.root = createOrGetRoot();
    this.root.innerHTML = getWindowsMarkup();
    this.installFloatingButtons();
    this.installWindows();
    this.installInventoryInteractions();
  }

  private installFloatingButtons(): void {
    for (const config of BUTTONS) {
      const button = query<HTMLButtonElement>(this.root, `[data-floating="${config.id}"]`);
      setDefaultPosition(button, config.defaultButtonX, config.defaultButtonY);
      makeDraggable(button, button, () => undefined);

      button.addEventListener('click', (event) => {
        if (wasDragClickSuppressed(event)) return;
        this.toggleWindow(config.id);
      });
    }
  }

  private installWindows(): void {
    for (const config of BUTTONS) {
      const win = query<HTMLDivElement>(this.root, `[data-window="${config.id}"]`);
      const header = query<HTMLDivElement>(win, '[data-window-header]');
      const close = query<HTMLButtonElement>(win, '[data-window-close]');

      setDefaultPosition(win, config.defaultWindowX, config.defaultWindowY);
      makeDraggable(win, header, () => this.bringToFront(win));

      header.addEventListener('pointerdown', () => this.bringToFront(win));
      close.addEventListener('click', () => this.closeWindow(config.id));
    }
  }

  private installInventoryInteractions(): void {
    const inventory = query<HTMLDivElement>(this.root, '[data-window="inventory"]');
    const tabs = [...inventory.querySelectorAll<HTMLButtonElement>('[data-inventory-tab]')];
    const slots = [...inventory.querySelectorAll<HTMLButtonElement>('[data-inventory-slot]')];
    const detailTitle = query<HTMLHeadingElement>(inventory, '[data-inventory-detail-title]');
    const detailBody = query<HTMLParagraphElement>(inventory, '[data-inventory-detail-body]');

    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        for (const other of tabs) other.classList.toggle('is-active', other === tab);
        detailTitle.textContent = `${tab.dataset.inventoryTab ?? '일반'} 가방`;
        detailBody.textContent = '아이템을 선택하면 이 영역에 상세 설명, 사용 조건, 스탯, 제작/건설 재료 정보를 표시합니다.';
      });
    }

    for (const slot of slots) {
      slot.addEventListener('click', () => {
        for (const other of slots) other.classList.toggle('is-selected', other === slot);
        const index = Number(slot.dataset.inventorySlot ?? '0') + 1;
        detailTitle.textContent = `빈 슬롯 ${index}`;
        detailBody.textContent = '아직 아이템 데이터가 연결되지 않은 빈 슬롯입니다. 이후 서버 인벤토리 데이터와 연결됩니다.';
      });
    }
  }

  private toggleWindow(id: WindowId): void {
    const win = query<HTMLDivElement>(this.root, `[data-window="${id}"]`);
    const nextOpen = win.hidden;
    win.hidden = !nextOpen;
    if (nextOpen) this.bringToFront(win);
  }

  private closeWindow(id: WindowId): void {
    query<HTMLDivElement>(this.root, `[data-window="${id}"]`).hidden = true;
  }

  private bringToFront(win: HTMLElement): void {
    win.style.zIndex = String(++this.zIndex);
  }
}

function createOrGetRoot(): HTMLDivElement {
  let root = document.getElementById(WINDOW_ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = WINDOW_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

function getWindowsMarkup(): string {
  return `
    <div class="floating-toolbar" aria-label="Game menu shortcuts">
      ${BUTTONS.map(getFloatingButtonMarkup).join('')}
    </div>
    ${getInventoryWindowMarkup()}
    ${getSimpleWindowMarkup('crafting', '제작', '제작 시스템', '제작 레시피 목록, 필요 재료, 제작 버튼이 들어갈 공간입니다. 지금은 UI 골격만 구성되어 있습니다.')}
    ${getSimpleWindowMarkup('building', '건설', '건설 시스템', '건설 카테고리, 배치 프리뷰, 필요 재료, 회전/취소 버튼이 들어갈 공간입니다. 지금은 UI 골격만 구성되어 있습니다.')}
  `;
}

function getFloatingButtonMarkup(config: FloatingButtonConfig): string {
  return `
    <button class="floating-icon" type="button" data-floating="${config.id}" aria-label="${config.label}">
      <span class="floating-icon-symbol">${config.icon}</span>
      <span class="floating-icon-label">${config.label}</span>
    </button>
  `;
}

function getWindowHeaderMarkup(title: string): string {
  return `
    <div class="game-window-header" data-window-header>
      <strong>${title}</strong>
      <button class="game-window-close" type="button" data-window-close aria-label="닫기">×</button>
    </div>
  `;
}

function getInventoryWindowMarkup(): string {
  return `
    <section class="game-window inventory-window" data-window="inventory" hidden>
      ${getWindowHeaderMarkup('가방')}
      <div class="inventory-tabs">
        ${INVENTORY_CATEGORIES.map((category, index) => `
          <button class="inventory-tab ${index === 0 ? 'is-active' : ''}" type="button" data-inventory-tab="${category}">${category}</button>
        `).join('')}
      </div>
      <div class="inventory-body">
        <div class="inventory-grid" aria-label="Inventory slots">
          ${Array.from({ length: INVENTORY_SLOT_COUNT }, (_, index) => `
            <button class="inventory-slot" type="button" data-inventory-slot="${index}" aria-label="슬롯 ${index + 1}"></button>
          `).join('')}
        </div>
        <aside class="inventory-detail">
          <h3 data-inventory-detail-title>일반 가방</h3>
          <p data-inventory-detail-body>아이템을 선택하면 이 영역에 상세 설명, 사용 조건, 스탯, 제작/건설 재료 정보를 표시합니다.</p>
        </aside>
      </div>
    </section>
  `;
}

function getSimpleWindowMarkup(id: WindowId, title: string, heading: string, body: string): string {
  return `
    <section class="game-window simple-system-window ${id}-window" data-window="${id}" hidden>
      ${getWindowHeaderMarkup(title)}
      <div class="system-window-body">
        <h3>${heading}</h3>
        <p>${body}</p>
        <div class="placeholder-grid">
          ${Array.from({ length: 8 }, (_, index) => `<button class="placeholder-card" type="button">${index + 1}</button>`).join('')}
        </div>
      </div>
    </section>
  `;
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing UI element: ${selector}`);
  return el;
}

function setDefaultPosition(el: HTMLElement, x: number, y: number): void {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function makeDraggable(target: HTMLElement, handle: HTMLElement, onStart: () => void): void {
  let drag: { startX: number; startY: number; originX: number; originY: number; moved: boolean } | null = null;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    onStart();
    handle.setPointerCapture(event.pointerId);

    drag = {
      startX: event.clientX,
      startY: event.clientY,
      originX: target.offsetLeft,
      originY: target.offsetTop,
      moved: false,
    };

    target.dataset.dragging = 'true';
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;

    const maxX = Math.max(0, window.innerWidth - target.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - target.offsetHeight);
    target.style.left = `${clamp(drag.originX + dx, 0, maxX)}px`;
    target.style.top = `${clamp(drag.originY + dy, 0, maxY)}px`;
  });

  handle.addEventListener('pointerup', (event) => {
    if (!drag) return;
    target.dataset.suppressClick = drag.moved ? 'true' : 'false';
    target.dataset.dragging = 'false';
    drag = null;
    handle.releasePointerCapture(event.pointerId);
    window.setTimeout(() => {
      target.dataset.suppressClick = 'false';
    }, 0);
  });

  handle.addEventListener('pointercancel', () => {
    drag = null;
    target.dataset.dragging = 'false';
  });
}

function wasDragClickSuppressed(event: Event): boolean {
  const target = event.currentTarget as HTMLElement | null;
  return target?.dataset.suppressClick === 'true';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
