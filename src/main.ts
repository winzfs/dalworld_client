import './style.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { BootOverlay, installGlobalErrorOverlay } from './utils/bootOverlay';

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function boot(): Promise<void> {
  bootOverlay.setMessage('Finding #app mount element...');
  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }

  if (isEditorEnabled()) {
    await bootEditor(mount);
    return;
  }

  await bootGame(mount);
}

async function bootEditor(mount: HTMLElement): Promise<void> {
  bootOverlay.setMessage('Starting map editor...');
  const [{ EditorApp }, { installItemEditorFeature }] = await Promise.all([
    import('./editor/EditorApp'),
    import('./editor/ItemEditorFeature'),
  ]);

  const editor = new EditorApp();
  await editor.start(mount);
  bootOverlay.remove();

  try {
    installItemEditorFeature(document.body);
  } catch (error) {
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

function isEditorEnabled(): boolean {
  return new URLSearchParams(window.location.search).get('editor') === '1';
}

boot().catch((error: unknown) => {
  bootOverlay.showError(error);
});
