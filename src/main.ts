import './style.css';
import { GameApp } from './game/GameApp';

const mount = document.querySelector<HTMLDivElement>('#app');
if (!mount) {
  throw new Error('Missing #app mount element');
}

const game = new GameApp();
await game.start(mount);
