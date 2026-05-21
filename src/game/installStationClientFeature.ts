import type { Application, Container } from 'pixi.js';
import type { GameNetwork } from '../net/network';
import type { ServerToClientMessage } from '../protocol/messages';
import { StationPlacementRenderer } from '../systems/building/StationPlacementRenderer';
import type { BuildPartId } from '../systems/building/BuildingTypes';
import { getStationBuildPartIdFromItemId } from '../systems/building/StationItemPlacementCatalog';

type StationFeatureGameApp = {
  app: Application;
  world: Container;
  network: GameNetwork;
  beginStationBuildPlacement(partId: BuildPartId): void;
};

export function installStationClientFeature(game: unknown): void {
  const app = game as StationFeatureGameApp;
  const renderer = new StationPlacementRenderer(app.world);

  app.app.ticker.add((ticker) => {
    renderer.update(ticker.deltaMS / 1000);
  });

  app.network.onMessage((message) => {
    routeStationMessage(renderer, message);
  });

  installInventoryStationPlacementButton(app);
  installStationCraftingInteraction(app, renderer);
  installCraftingFilterVisualFallback();
}

function routeStationMessage(renderer: StationPlacementRenderer, message: ServerToClientMessage): void {
  switch (message.type) {
    case 'BUILD_SNAPSHOT':
      renderer.applySnapshot(message.snapshot);
      return;
    case 'BUILD_PLACED':
    case 'BUILD_UPDATED':
      renderer.addOrUpdate(message.part);
      return;
    case 'BUILD_REMOVED':
      renderer.remove(message.entityId);
      return;
    case 'CRAFT_STARTED':
      renderer.setCraftingWindow(message.startsAt, message.completesAt);
      return;
  }
}

function installInventoryStationPlacementButton(app: StationFeatureGameApp): void {
  document.addEventListener('click', (event) => {
    const slot = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-inventory-slot]');
    if (!slot) return;

    const itemId = slot.dataset.item ?? '';
    const partId = getStationBuildPartIdFromItemId(itemId);
    if (!partId) return;

    window.setTimeout(() => {
      renderPlacementButton(app, partId);
    }, 0);
  });
}

function installStationCraftingInteraction(app: StationFeatureGameApp, renderer: StationPlacementRenderer): void {
  const canvas = app.app.canvas;

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const station = renderer.getStationAtPointer(canvas, app.world, event);
    if (!station) return;

    event.preventDefault();
    event.stopPropagation();
    openCraftingWindowForStation(station.partId);
  }, { capture: true });
}

function openCraftingWindowForStation(partId: string): void {
  const crafting = document.querySelector<HTMLElement>('[data-window="crafting"]');
  if (!crafting) return;

  crafting.hidden = false;
  crafting.style.zIndex = '80';
  syncCraftingFilterDisplay();

  const title = crafting.querySelector<HTMLElement>('[data-station-crafting-title]');
  if (title) title.textContent = partId === 'station_workbench' ? '작업대 제작' : '제작';
}

function installCraftingFilterVisualFallback(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('[data-window="crafting"]')) return;
    if (!target.closest('[data-crafting-tier]') && !target.closest('[data-crafting-category]')) return;

    // GameWindows owns the actual filter state. This fallback only mirrors its DOM result
    // after the native handler runs, so it must not block propagation.
    window.setTimeout(syncCraftingFilterDisplay, 0);
    window.setTimeout(syncCraftingFilterDisplay, 80);
  });
}

function syncCraftingFilterDisplay(): void {
  const crafting = document.querySelector<HTMLElement>('[data-window="crafting"]');
  if (!crafting) return;

  const tier = getActiveFilterValue(crafting, '[data-crafting-tier]', 'craftingTier') ?? 'all';
  const category = getActiveFilterValue(crafting, '[data-crafting-category]', 'craftingCategory') ?? 'all';
  const cards = [...crafting.querySelectorAll<HTMLElement>('[data-craft-recipe]')];
  let visibleCount = 0;
  let craftableVisibleCount = 0;

  for (const card of cards) {
    const cardTier = card.dataset.craftTierValue ?? 'all';
    const cardCategory = card.dataset.craftCategoryValue ?? 'all';
    const visible = (tier === 'all' || cardTier === tier) && (category === 'all' || cardCategory === category);
    card.hidden = !visible;
    card.style.display = visible ? 'grid' : 'none';
    card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) visibleCount += 1;
    if (visible && !card.classList.contains('is-disabled-by-cost')) craftableVisibleCount += 1;
  }

  const summary = crafting.querySelector<HTMLElement>('[data-crafting-summary]');
  if (summary) {
    summary.textContent = `표시 ${visibleCount}개 · 제작 가능 ${craftableVisibleCount}개 · 전체 ${cards.length}개`;
  }
}

function getActiveFilterValue(root: HTMLElement, selector: string, datasetKey: 'craftingTier' | 'craftingCategory'): string | null {
  const active = root.querySelector<HTMLElement>(`${selector}.is-active`);
  return active?.dataset[datasetKey] ?? null;
}

function renderPlacementButton(app: StationFeatureGameApp, partId: BuildPartId): void {
  const inventory = document.querySelector<HTMLElement>('[data-window="inventory"]');
  if (!inventory) return;

  const detailBody = inventory.querySelector<HTMLElement>('[data-inventory-detail-body]');
  if (!detailBody) return;

  detailBody.querySelector('[data-station-place-button]')?.remove();

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.stationPlaceButton = partId;
  button.textContent = '배치';
  button.style.marginTop = '10px';
  button.style.width = '100%';
  button.style.border = '1px solid rgba(84, 220, 120, 0.75)';
  button.style.borderRadius = '12px';
  button.style.padding = '9px 10px';
  button.style.background = 'rgba(84, 220, 120, 0.16)';
  button.style.color = '#f5fff7';
  button.style.fontWeight = '900';
  button.style.cursor = 'pointer';

  button.addEventListener('click', () => {
    app.beginStationBuildPlacement(partId);
  });

  detailBody.appendChild(button);
}
