# dalworld_client

Pixi.js v8 + TypeScript + Vite 기반 dalworld 클라이언트입니다.
2.5D 탑뷰 멀티플레이 생존 게임의 렌더링/입력 클라이언트로,
모든 게임 로직 검증은 `dalworld_server` (Cloudflare Workers + Durable Objects)에서 합니다.

## 기술 스택

- Pixi.js v8
- TypeScript
- Vite
- Cloudflare Pages 배포 대상

## 폴더 구조

```txt
src/
├─ main.ts                 # 엔트리. GameApp 시작
├─ env.d.ts                # Vite env 타입
├─ protocol/messages.ts    # 서버와 동일한 메시지 타입
├─ net/
│  ├─ messages.ts          # protocol re-export (구버전 호환)
│  └─ network.ts           # WebSocket 클라이언트
├─ game/
│  ├─ GameApp.ts           # 게임 메인 루프
│  ├─ InputController.ts   # 키보드 + 가상 조이스틱
│  ├─ Camera.ts            # 카메라
│  └─ interpolation.ts     # 원격 엔티티 보간
└─ render/
   ├─ PlayerRenderer.ts
   ├─ ResourceRenderer.ts
   ├─ MonsterRenderer.ts
   ├─ DebugHud.ts
   └─ MobileControls.ts    # 조이스틱 + 채집 + 전체화면 버튼
```

## 로컬 실행

```bash
npm install
npm run dev
```

서버 (`dalworld_server`)를 먼저 띄워두면 Vite proxy가 `/ws` 요청을
`http://localhost:8787`로 전달합니다.

```bash
# 다른 터미널에서
cd ../dalworld_server
npm install
npm run dev
```

브라우저: <http://localhost:5173>

## 조작

- 이동: `W/A/S/D` 또는 방향키 (모바일은 좌측 가상 조이스틱)
- 채집: `E` 또는 `Space` (모바일은 우측 노란색 버튼)
- 전체화면 토글: 우상단 ⛶ 버튼 (모바일/태블릿용)

## 환경 변수

- `VITE_DALWORLD_WS_URL` — 서버 WebSocket 절대 URL.
  - 비어있으면 현재 호스트 기준 `/ws`로 접속 (로컬에서는 Vite proxy가 처리).
  - 배포 환경 예시: `wss://dalworld-server.<subdomain>.workers.dev/ws`

`.env.local` 예시:

```bash
VITE_DALWORLD_WS_URL=wss://dalworld-server.<subdomain>.workers.dev/ws
```

## Cloudflare 배포 (Workers Static Assets)

이 저장소는 정적 자산을 Cloudflare Workers Static Assets로 배포합니다
(`wrangler.jsonc` 의 `assets.directory = "./dist"`).

### Dashboard → Connect to Git

1. Cloudflare Dashboard → Workers & Pages → Create application → Workers → Connect to Git
2. `winzfs/dalworld_client` 선택
3. 프로젝트 이름: `dalworld-client`
4. 빌드 명령: `npm install --legacy-peer-deps && npm run build`
5. 배포 명령: `npx wrangler deploy`
6. 고급 설정 → 빌드 환경변수
   - `VITE_DALWORLD_WS_URL=wss://dalworld-server.<subdomain>.workers.dev/ws`

### CLI

```bash
npm install --legacy-peer-deps
VITE_DALWORLD_WS_URL=wss://dalworld-server.<subdomain>.workers.dev/ws npm run build
npx wrangler deploy
```

## 현재 구현된 기능

- Pixi.js v8 2.5D 탑뷰 렌더링
- 3000 x 3000 월드 + 카메라 추적
- 서버 권위 이동 (입력만 전송, 좌표는 서버 snapshot 기준)
- 자원 노드 (`tree`, `stone`) 렌더링, 채집 시 거리 검증된 서버 요청 전송
- 몬스터 (`wild_slime`) 렌더링 + idle/chase 상태 색상 변화
- HP/스태미나/wood/stone HUD
- 데스크탑 키보드 + 모바일/태블릿 조이스틱/버튼

## TODO

- 자원 채집 시 시각/사운드 피드백
- 다른 플레이어 이름 / 닉네임
- 인벤토리 UI
- 전투 입력
- 미니맵
- 자산(아트) 추가
