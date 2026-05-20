# dalworld-client

> AI 작업자와 개발자는 코드 수정 전에 반드시 [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md)를 먼저 읽는다.

Pixi.js v8 + TypeScript + Vite + Cloudflare Pages 기반 2D 멀티플레이 생존/건설 게임 클라이언트.

클라이언트는 렌더링, 입력, UI, 미리보기, 서버 이벤트 반영을 담당한다. 실제 게임 판정과 월드 상태 확정은 `dalworld_server`의 Durable Object가 담당한다.

## 작업 전 필수 문서

1. 먼저 [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md)를 읽는다.
2. 작업 범위에 따라 아래 문서를 추가로 확인한다.

| 문서 | 목적 |
|------|------|
| [`docs/AI_WORKFLOW.md`](docs/AI_WORKFLOW.md) | AI 작업 규칙, 금지 사항, 작업 전/후 체크리스트 |
| [`docs/CURRENT_SYSTEM_STATUS.md`](docs/CURRENT_SYSTEM_STATUS.md) | 현재 구현/부분 구현/미구현 상태 |
| [`docs/ARCHITECTURE_GUIDE.md`](docs/ARCHITECTURE_GUIDE.md) | 클라이언트 구조, 계층, GameApp 분리 기준 |
| [`docs/isometric-building-system.md`](docs/isometric-building-system.md) | 아이소메트릭 건설 시스템 클라이언트 설계 |

문서와 실제 코드가 다르면 현재 코드를 확인하고, 필요한 경우 문서를 함께 갱신한다.

## 핵심 원칙

- Pixi.js v8 기준으로 작성한다.
- 클라이언트는 게임 판정을 최종 확정하지 않는다.
- 서버가 확정한 snapshot/event만 실제 월드 상태로 반영한다.
- 건설 고스트와 로컬 예측 이동은 편의 기능이며 최종 판정이 아니다.
- 프로토콜 변경 시 `dalworld_server`의 `src/protocol/messages.ts`도 함께 맞춘다.
- 새 기능을 `GameApp.ts`에 계속 몰아넣지 말고 도메인별 시스템으로 분리한다.

## 기술 스택

- **Pixi.js v8** — WebGL 2D 렌더링
- **TypeScript**
- **Vite** — 개발 서버 + 빌드
- **Cloudflare Pages** — 정적 호스팅

## 환경 변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `VITE_DALWORLD_WS_URL` | 서버 WebSocket URL | `wss://dalworld-server.xxx.workers.dev/ws` |

> Cloudflare Pages 설정 → Environment variables 에 설정해야 한다. 설정 후 **다시 배포** 필요.

## 로컬 실행

```bash
npm install
npm run dev
```

서버와 함께 로컬 실행:

```bash
# 1. dalworld_server 폴더에서 서버 실행 (포트 8787)
npm run dev

# 2. dalworld_client 폴더에서 클라이언트 실행 (포트 5173)
npm run dev
# vite.config.ts 의 proxy 설정이 /ws 를 localhost:8787 로 전달한다
```

## 빌드 / 배포

```bash
npm run typecheck   # TypeScript 검사
npm run build       # dist/ 생성
npm run deploy      # Cloudflare Pages 배포 (wrangler)
```

## 현재 구현 상태

현재 구현 상태는 README에 중복 관리하지 않는다.
아래 문서를 기준으로 확인한다.

- [`docs/CURRENT_SYSTEM_STATUS.md`](docs/CURRENT_SYSTEM_STATUS.md)

## 주요 구조

```txt
src/
├─ main.ts
├─ protocol/messages.ts
├─ net/network.ts
├─ game/
│  ├─ GameApp.ts
│  ├─ InputController.ts
│  ├─ Camera.ts
│  └─ systems/
├─ render/
├─ ui/
├─ systems/
│  └─ building/
├─ editor/
└─ worldMap/
```

상세 구조는 [`docs/ARCHITECTURE_GUIDE.md`](docs/ARCHITECTURE_GUIDE.md)를 기준으로 확인한다.

## 조작법

| 입력 | 동작 |
|------|------|
| WASD / 방향키 | 이동 |
| E / Space | 채집 |
| 모바일 조이스틱 | 이동 |
| 모바일 E 버튼 | 채집 |
| R | 건설 부품 회전 |
| PageUp / PageDown | 건설 층 변경 |
| G | 건설 그리드 토글 |
| Enter | 건설 드래프트 확정 요청 |
| Escape | 건설 드래프트 취소 |
| Delete / Backspace | 철거 모드 |
| `?editor=1` | 맵 에디터 모드 |

## 문제 해결

**WebSocket 연결 안 됨:**

1. `VITE_DALWORLD_WS_URL` 환경 변수 확인
2. Cloudflare Pages 환경 변수 변경 후 재배포
3. URL 형식 확인: `wss://dalworld-server.<계정>.workers.dev/ws`
4. 서버 `GET /health` 응답 확인

**HUD에 좌표가 안 보임:**

- HUD의 WS 항목이 `open`인지 확인한다.
- 서버가 실행 중인지 확인한다.

## 기능 추가 시 체크리스트

- [ ] `docs/AI_WORKFLOW.md`를 확인했는가?
- [ ] `docs/CURRENT_SYSTEM_STATUS.md`를 확인했는가?
- [ ] `docs/ARCHITECTURE_GUIDE.md`를 확인했는가?
- [ ] 서버 권위 구조를 깨지 않았는가?
- [ ] 프로토콜 변경 시 서버 저장소도 수정했는가?
- [ ] 기존 기능을 임의로 삭제하지 않았는가?
- [ ] 관련 문서를 갱신했는가?
