import './style.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
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

  if (editorMode) {
    await bootEditor(mount, probe);
    return;
  }

  await bootGame(mount);
}

async function bootEditor(mount: HTMLElement, probe: EditorBootProbe | null): Promise<void> {
  probe?.log('loading GameApp for editor mode');
  const [{ GameApp }, { installItemEditorFeature }] = await Promise.all([
    import('./game/GameApp'),
    import('./editor/ItemEditorFeature'),
  ]);

  bootOverlay.setMessage('Starting map editor...');
  probe?.log('creating GameApp');
  const game = new GameApp();
  probe?.log('GameApp created');

  probe?.log('starting GameApp');
  await game.start(mount);
  probe?.log('GameApp.start resolved');

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
  await Promise.all([
    import('./timeOfDay.css'),
    import('./combat.css'),
    import('./runtimeMinimap.css'),
    import('./questTracker.css'),
    import('./questStory.css'),
  ]);

  const [
    { GameApp },
    { installCombatClientFeature },
    { installStationClientFeature },
    { installTimeOfDayClientFeature },
    { installSystemLogHud },
    { showStartScreen },
  ] = await Promise.all([
    import('./game/GameApp'),
    import('./game/installCombatClientFeature'),
    import('./game/installStationClientFeature'),
    import('./systems/timeOfDay/TimeOfDayClientFeature'),
    import('./ui/SystemLogHud'),
    import('./ui/StartScreen'),
  ]);

  bootOverlay.remove();
  const profile = await showStartScreen(document.body);

  bootOverlay.setMessage('Starting Pixi.js application...');
  installTimeOfDayClientFeature(document.body);
  installSystemLogHud(document.body);

  const game = new GameApp(profile);
  await game.start(mount);
  installCombatClientFeature(game);
  installStationClientFeature(game);

  bootOverlay.remove();
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
