import './style.css';
import './timeOfDay.css';
import './combat.css';
import './runtimeMinimap.css';
import './questTracker.css';
import './questStory.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { EditorApp } from './editor/EditorApp';
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
  if (!mount) throw new Error('Missing #app mount element');
  probe?.log('#app mount found');

  if (editorMode) {
    await bootEditor(mount, probe);
    return;
  }

  await bootGame(mount);
}

async function bootEditor(mount: HTMLElement, probe: EditorBootProbe | null): Promise<void> {
  bootOverlay.setMessage('Starting map editor...');
  probe?.log('creating EditorApp');
  const editor = new EditorApp();
  probe?.log('EditorApp created');

  probe?.log('starting EditorApp');
  await editor.start(mount, (message) => {
    bootOverlay.setMessage(message);
    probe?.log(message);
  });
  probe?.log('EditorApp.start resolved');

  bootOverlay.remove();
  probe?.log('BootOverlay removed');

  try {
    probe?.log('installing optional ItemEditorFeature');
    installItemEditorFeature(document.body);
    probe?.log('ItemEditorFeature installed');
  } catch (error) {
    probe?.error(error);
    console.warn('[Editor] Optional item editor feature failed to install.', error);
  }
}

async function bootGame(mount: HTMLElement): Promise<void> {
  bootOverlay.remove();
  const profile = await showStartScreen(document.body);

  bootOverlay.setMessage('Starting Pixi.js application...');
  installTimeOfDayClientFeature(document.body);
  installSystemLogHud(document.body);

  const game = new GameApp(profile);
  await game.start(mount);
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
