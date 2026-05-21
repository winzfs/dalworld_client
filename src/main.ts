import './style.css';
import './timeOfDay.css';
import './combat.css';
import './runtimeMinimap.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { GameApp } from './game/GameApp';
import { installCombatClientFeature } from './game/installCombatClientFeature';
import { installStationClientFeature } from './game/installStationClientFeature';
import { installItemEditorFeature } from './editor/ItemEditorFeature';
import { installTimeOfDayClientFeature } from './systems/timeOfDay/TimeOfDayClientFeature';
import { installSystemLogHud } from './ui/SystemLogHud';
import { BootOverlay, installGlobalErrorOverlay } from './utils/bootOverlay';

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function boot(): Promise<void> {
  bootOverlay.setMessage('Finding #app mount element...');
  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }

  installTimeOfDayClientFeature(document.body);
  installSystemLogHud(document.body);

  bootOverlay.setMessage('Starting Pixi.js application...');
  const game = new GameApp();
  await game.start(mount);
  if (isEditorEnabled()) installItemEditorFeature(document.body);
  installCombatClientFeature(game);
  installStationClientFeature(game);

  bootOverlay.remove();
}

function isEditorEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('editor') === '1';
}

boot().catch((error: unknown) => {
  bootOverlay.showError(error);
});
