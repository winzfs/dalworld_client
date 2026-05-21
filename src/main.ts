import './style.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { BootOverlay, installGlobalErrorOverlay } from './utils/bootOverlay';

const EDITOR_BOOT_TIMEOUT_MS = 8_000;

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function boot(): Promise<void> {
  bootOverlay.setMessage('Finding #app mount element...');
  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }

  if (isEditorEnabled()) {
    await withTimeout(bootEditor(mount), EDITOR_BOOT_TIMEOUT_MS, '맵에디터 부팅이 시간 초과되었습니다. Pixi 초기화 또는 에디터 모듈 로딩이 멈췄습니다.');
    return;
  }

  await bootGame(mount);
}

async function bootEditor(mount: HTMLElement): Promise<void> {
  bootOverlay.setMessage('Loading editor modules...');
  const [{ EditorApp }, { installItemEditorFeature }] = await Promise.all([
    import('./editor/EditorApp'),
    import('./editor/ItemEditorFeature'),
  ]);

  bootOverlay.setMessage('Creating editor app...');
  const editor = new EditorApp();

  bootOverlay.setMessage('Starting map editor Pixi app...');
  await editor.start(mount);

  bootOverlay.setMessage('Map editor ready. Installing optional item editor...');
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

boot().catch((error: unknown) => {
  bootOverlay.showError(error);
});
