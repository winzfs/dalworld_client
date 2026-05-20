import './style.css';
import './timeOfDay.css';
import './combat.css';
import { GameApp } from './game/GameApp';
import { installCombatClientFeature } from './game/installCombatClientFeature';
import { installTimeOfDayClientFeature } from './systems/timeOfDay/TimeOfDayClientFeature';
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

  bootOverlay.setMessage('Starting Pixi.js application...');
  const game = new GameApp();
  await game.start(mount);
  installCombatClientFeature(game);

  bootOverlay.remove();
}

boot().catch((error: unknown) => {
  bootOverlay.showError(error);
});
