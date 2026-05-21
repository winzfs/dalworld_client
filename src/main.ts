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
import { EditorBootProbe } from './utils/editorBootProbe';
import { isEditorEnabled } from './utils/editorMode';

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function boot(): Promise<void> {
  bootOverlay.setMessage('Finding #app mount element...');
  const editorMode = isEditorEnabled();
  const probe = editorMode ? new EditorBootProbe() : null;
  probe?.log('main boot entered');

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }
  probe?.log('#app mount found');

  const profile = editorMode
    ? undefined
    : await showStartScreen(document.body);
  probe?.log(editorMode ? 'start screen skipped for editor mode' : 'start screen completed');

  bootOverlay.setMessage(editorMode ? 'Starting map editor...' : 'Starting Pixi.js application...');

  if (!editorMode) {
    installTimeOfDayClientFeature(document.body);
    installSystemLogHud(document.body);
  } else {
    probe?.log('game-only global HUD installers skipped');
  }

  probe?.log('creating GameApp');
  const game = new GameApp(profile);
  probe?.log('GameApp created');

  probe?.log('starting GameApp');
  await game.start(mount);
  probe?.log('GameApp.start resolved');

  bootOverlay.remove();
  probe?.log('BootOverlay removed');

  if (editorMode) {
    try {
      probe?.log('installing optional ItemEditorFeature');
      installItemEditorFeature(document.body);
      probe?.log('ItemEditorFeature installed');
    } catch (error) {
      probe?.error(error);
      console.warn('[Editor] Optional item editor feature failed to install.', error);
    }
    return;
  }

  installCombatClientFeature(game);
  installStationClientFeature(game);
}

boot().catch((error: unknown) => {
  bootOverlay.showError(error);
  if (isEditorEnabled()) {
    try {
      const probe = new EditorBootProbe();
      probe.error(error);
    } catch {
      // Last-resort diagnostics should never mask the original boot error.
    }
  }
});
