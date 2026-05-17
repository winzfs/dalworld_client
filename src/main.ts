import { Application, Graphics } from 'pixi.js';
import './style.css';
import { KeyboardInput } from './game/input';
import { GameNetwork, getDefaultWebSocketUrl } from './net/network';

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 540;
const PLAYER_SIZE = 36;
const LOCAL_PREVIEW_SPEED = 220;

const app = new Application();
await app.init({
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
  background: '#1d2b34',
  antialias: false,
  resizeTo: window,
});

document.querySelector<HTMLDivElement>('#app')?.appendChild(app.canvas);

const input = new KeyboardInput();
input.attach();

const network = new GameNetwork(getDefaultWebSocketUrl());
network.connect();

const localPlayer = new Graphics().rect(0, 0, PLAYER_SIZE, PLAYER_SIZE).fill({ color: 0x55d6be });
localPlayer.position.set(WORLD_WIDTH / 2 - PLAYER_SIZE / 2, WORLD_HEIGHT / 2 - PLAYER_SIZE / 2);
app.stage.addChild(localPlayer);

const remotePlayers = new Map<string, Graphics>();
let myPlayerId: string | null = null;
let inputSeq = 0;
let inputSendAccumulator = 0;

network.onMessage((message) => {
  if (message.type === 'welcome') {
    myPlayerId = message.playerId;
    return;
  }

  if (message.type === 'snapshot') {
    const activeIds = new Set<string>();

    for (const player of message.players) {
      activeIds.add(player.id);

      if (player.id === myPlayerId) {
        // 추후에는 서버 권위 좌표로 보정한다.
        localPlayer.position.set(player.x, player.y);
        continue;
      }

      let sprite = remotePlayers.get(player.id);
      if (!sprite) {
        sprite = new Graphics().rect(0, 0, PLAYER_SIZE, PLAYER_SIZE).fill({ color: 0xffd166 });
        remotePlayers.set(player.id, sprite);
        app.stage.addChild(sprite);
      }

      sprite.position.set(player.x, player.y);
    }

    for (const [id, sprite] of remotePlayers) {
      if (!activeIds.has(id)) {
        app.stage.removeChild(sprite);
        sprite.destroy();
        remotePlayers.delete(id);
      }
    }
  }
});

app.ticker.add((ticker) => {
  const dt = ticker.deltaMS / 1000;

  // 임시 로컬 프리뷰 이동이다. 최종 게임 로직은 서버 Durable Object가 검증/확정한다.
  let dx = 0;
  let dy = 0;

  if (input.keys.left) dx -= 1;
  if (input.keys.right) dx += 1;
  if (input.keys.up) dy -= 1;
  if (input.keys.down) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    const nextX = localPlayer.x + dx * LOCAL_PREVIEW_SPEED * dt;
    const nextY = localPlayer.y + dy * LOCAL_PREVIEW_SPEED * dt;

    localPlayer.x = clamp(nextX, 0, app.renderer.width - PLAYER_SIZE);
    localPlayer.y = clamp(nextY, 0, app.renderer.height - PLAYER_SIZE);
  }

  inputSendAccumulator += dt;
  if (inputSendAccumulator >= 1 / 20) {
    inputSendAccumulator = 0;
    network.send({
      type: 'input',
      seq: ++inputSeq,
      keys: { ...input.keys },
    });
  }
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
