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
  buildingModeState: {
    enter(partId: BuildPartId): void;
  };
  beginNewBuildingDraft(partId: BuildPartId): void;
  setBuildingGridVisible(visible: boolean): void;
};

let activeCraftingTier = 'all';
let activeCraftingCategory = 'all';

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
  installCraftingCategoryFallbackFilter();
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
  applyStationCategoryPreset(partId);

  const title = crafting.querySelector<HTMLElement>('[data-station-crafting-title]');
  if (title) title.textContent = '작업대 제작';
}

function applyStationCategoryPreset(partId: string): void {
  if (partId !== 'station_workbench') return;
  activeCraftingTier = 'all';
  activeCraftingCategory = 'all';
  applyCraftingFilter(activeCraftingTier, activeCraftingCategory);
}

function installCraftingCategoryFallbackFilter(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const tierButton = target?.closest<HTMLButtonElement>('[data-crafting-tier]');
    const categoryButton = target?.closest<HTMLButtonElement>('[data-crafting-category]');
    if (!tierButton && !categoryButton) return;

    const craftingWindow = target?.closest<HTMLElement>('[data-window="crafting"]');
    if (!craftingWindow) return;

    event.preventDefault();
    event.stopPropagation();
    if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();

    if (tierButton) activeCraftingTier = tierButton.dataset.craftingTier ?? 'all';
    if (categoryButton) activeCraftingCategory = categoryButton.dataset.craftingCategory ?? 'all';

    applyCraftingFilter(activeCraftingTier, activeCraftingCategory);
  }, true);
}

function applyCraftingFilter(tier: string, category: string): void {
  const crafting = document.querySelector<HTMLElement>('[data-window="crafting"]');
  if (!crafting) return;

  const cards = [...crafting.querySelectorAll<HTMLElement>('[data-craft-recipe]')];
  let visibleCount = 0;

  for (const card of cards) {
    const cardTier = card.dataset.craftTierValue ?? 'all';
    const cardCategory = card.dataset.craftCategoryValue ?? 'all';
    const visible = (tier === 'all' || cardTier === tier) && (category === 'all' || cardCategory === category);
    card.hidden = !visible;
    card.style.display = visible ? 'grid' : 'none';
    card.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) visibleCount += 1;
  }

  setActivePill(crafting, '[data-crafting-tier]', 'craftingTier', tier);
  setActivePill(crafting, '[data-crafting-category]', 'craftingCategory', category);

  const summary = crafting.querySelector<HTMLElement>('[data-crafting-summary]');
  if (summary) {
    const craftableVisibleCount = cards.filter((card) => !card.hidden && !card.classList.contains('is-disabled-by-cost')).length;
    summary.textContent = `표시 ${visibleCount}개 · 제작 가능 ${craftableVisibleCount}개 · 전체 ${cards.length}개`;
  }
}

function setActivePill(root: HTMLElement, selector: string, datasetKey: 'craftingTier' | 'craftingCategory', value: string): void {
  const buttons = [...root.querySelectorAll<HTMLElement>(selector)];
  for (const button of buttons) {
    const active = button.dataset[datasetKey] === value;
    button.classList.toggle('is-active', active);
    button.style.background = active ? 'rgba(84, 220, 120, 0.2)' : 'rgba(255, 255, 255, 0.08)';
    button.style.borderColor = active ? 'rgba(84, 220, 120, 0.95)' : 'rgba(255, 255, 255, 0.14)';
    button.style.color = active ? '#f5fff7' : 'rgba(245, 247, 251, 0.76)';
  }
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
    app.setBuildingGridVisible(true);
    app.buildingModeState.enter(partId);
    app.beginNewBuildingDraft(partId);
  });

  detailBody.appendChild(button);
}
