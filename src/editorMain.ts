import './style.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { EditorApp } from './editor/EditorApp';
import { installItemEditorFeature } from './editor/ItemEditorFeature';
import { BootOverlay, installGlobalErrorOverlay } from './utils/bootOverlay';

const EDITOR_START_TIMEOUT_MS = 6_000;

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function bootEditor(): Promise<void> {
  console.log('[EditorBoot] Starting map editor.');
  bootOverlay.setMessage('Starting map editor...');

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }

  document.getElementById('editor-html-build-marker')?.remove();

  const editor = new EditorApp();
  await editor.start(mount);
  bootOverlay.remove();

  try {
    installItemEditorFeature(document.body);
  } catch (error) {
    console.warn('[Editor] Optional item editor feature failed to install.', error);
  }
}

async function withEditorBootTimeout(task: Promise<void>): Promise<void> {
  let timeoutId: number | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      showEditorBootFailure('MapEditor UI did not finish mounting. Check console logs after Pixi init.');
      reject(new Error('MapEditor UI did not finish mounting.'));
    }, EDITOR_START_TIMEOUT_MS);
  });

  try {
    await Promise.race([task, timeout]);
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

function showEditorBootFailure(message: string): void {
  document.getElementById('editor-boot-failure')?.remove();
  const panel = document.createElement('div');
  panel.id = 'editor-boot-failure';
  panel.textContent = message;
  panel.style.cssText = [
    'position:fixed',
    'left:12px',
    'top:12px',
    'z-index:2147483647',
    'max-width:min(520px,calc(100vw - 24px))',
    'padding:10px 12px',
    'border:1px solid rgba(255,107,138,.85)',
    'border-radius:12px',
    'background:rgba(24,10,16,.94)',
    'color:#ffe8ef',
    'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    'white-space:pre-wrap',
  ].join(';');
  document.body.appendChild(panel);
}

bootEditor().catch((error: unknown) => {
  console.error('[EditorBoot] Failed to boot editor.', error);
  bootOverlay.showError(error);
  showEditorBootFailure(formatError(error));
});

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack || `${error.name}: ${error.message}`;
  return String(error);
}
