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
