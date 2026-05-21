import './style.css';
import './timeOfDay.css';
import './combat.css';
import './runtimeMinimap.css';
import './questTracker.css';
import './questStory.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { GameApp } from './game/GameApp';
import { installCombatClientFeature } from './game/installCombatClientFeature';
import { installStationClientFeature } from './game/installStationClientFeature';
import { installItemEditorFeature } from './editor/ItemEditorFeature';
import { installTimeOfDayClientFeature } from './systems/timeOfDay/TimeOfDayClientFeature';
import { installSystemLogHud } from './ui/SystemLogHud';
import { showStartScreen } from './ui/StartScreen';
import { BootOverlay, installGlobalErrorOverlay } from './utils/bootOverlay';
import { isEditorEnabled } from './utils/editorMode';

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function boot(): Promise<void> {
  bootOverlay.setMessage('Finding #app mount element...');
  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }

  const editorMode = isEditorEnabled();
  const profile = editorMode
    ? undefined
    : await showStartScreen(document.body);

  bootOverlay.setMessage(editorMode ? 'Starting map editor...' : 'Starting Pixi.js application...');

  if (!editorMode) {
    installTimeOfDayClientFeature(document.body);
    installSystemLogHud(document.body);
  }

  const game = new GameApp(profile);
  await game.start(mount);

  bootOverlay.remove();

  if (editorMode) {
    try {
      installItemEditorFeature(document.body);
    } catch (error) {
      console.warn('[Editor] Optional item editor feature failed to install.', error);
    }
    return;
  }

  installCombatClientFeature(game);
  installStationClientFeature(game);
}

boot().catch((error: unknown) => {
  bootOverlay.showError(error);
});
