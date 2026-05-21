import './style.css';
import './editor/monsterEditor.css';
import './ui/gameWindowsGlobalHelpers';
import { EditorApp } from './editor/EditorApp';
import { installItemEditorFeature } from './editor/ItemEditorFeature';
import { BootOverlay, installGlobalErrorOverlay } from './utils/bootOverlay';

const bootOverlay = new BootOverlay();
installGlobalErrorOverlay(bootOverlay);

async function bootEditor(): Promise<void> {
  bootOverlay.setMessage('Starting map editor...');

  const mount = document.querySelector<HTMLDivElement>('#app');
  if (!mount) {
    throw new Error('Missing #app mount element');
  }

  const editor = new EditorApp();
  await editor.start(mount, (message) => bootOverlay.setMessage(message));
  bootOverlay.remove();

  try {
    installItemEditorFeature(document.body);
  } catch (error) {
    console.warn('[Editor] Optional item editor feature failed to install.', error);
  }
}

bootEditor().catch((error: unknown) => {
  bootOverlay.showError(error);
});
