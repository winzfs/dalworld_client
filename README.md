# dalworld-client

Pixi.js v8 + TypeScript + Vite + Cloudflare Pages 기반 2D 멀티플레이 생존 게임 클라이언트.

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
# → vite.config.ts 의 proxy 설정이 /ws 를 localhost:8787 로 전달준다
```

## 빌드 / 배포

```bash
npm run typecheck   # TypeScript 검사
npm run build       # dist/ 생성
npm run deploy      # Cloudflare Pages 배포 (wrangler)
```

## 아키텍처

```
src/
├─ main.ts
├─ protocol/messages.ts       서버와 동일한 타입 (복사, 모노레포 불필요)
├─ net/network.ts             WebSocket + 자동 재연결 + ping
├─ game/
│  ├─ GameApp.ts              메인 게임 루프
│  ├─ InputController.ts      WASD + 터치 조이스틱
│  ├─ Camera.ts               카메라 follow + 월드 경계 클램프
│  └─ interpolation.ts        원격 엔티티 보간
└─ render/
   ├─ PlayerRenderer.ts       플레이어 (방향 표시 눈)
   ├─ ResourceRenderer.ts     자원 (HP바, 리스폰 반투명)
   ├─ MonsterRenderer.ts      몬스터 (chase 상태 표시)
   ├─ DebugHud.ts             HUD (HP·스태미나·인벤토리·ping)
   └─ MobileControls.ts       모바일 조이스틱 + 채집 버튼
```

## 조작법

| 입력 | 동작 |
|------|------|
| WASD / 방향키 | 이동 |
| E / Space | 채집 |
| 모바일 조이스틱 | 이동 |
| 모바일 E 버튼 | 채집 |
| ⛶ 버튼 | 전체화면 (모바일) |

## HUD 항목

| 항목 | 설명 |
|------|------|
| WS | 연결 상태 (open/connecting/closed/error) |
| ping | 서버 왕복 지연시간 |
| tick | 서버 틱 번호 |
| pos | 월드 좌표 |
| hp | 현재/최대 체력 |
| sta | 스태미나 |
| wood | 보유 나무 |
| stone | 보유 돌 |
| E: tree/stone | 채집 가능한 자원이 근처에 있을 때 표시 |

## 현재 구현 기능

- [x] Pixi.js v8 렌더링 엔진
- [x] 서버 권위 이동 + 보간 (원격 플레이어 부드러운 이동)
- [x] 자원 채집 (E/Space, 범위 80)
- [x] 자원 HP 바 표시
- [x] 자원 리스폰 반투명 처리
- [x] 몬스터 (chase 상태 색상 변화)
- [x] 카메라 follow + 월드 경계 클램프
- [x] HUD (연결·좌표·HP·스태미나·인벤토리·ping·tick)
- [x] WebSocket 자동 재연결 (지수 백오프)
- [x] 모바일 조이스틱 + 채집 버튼
- [x] 플레이어 방향 표시 (눈/점)
- [x] 채집 가능 자원 안내 (HUD E: tree/stone)

## 문제 해결

**WebSocket 연결 안 됨:**
1. `VITE_DALWORLD_WS_URL` 환경 변수 확인 (Cloudflare Pages → Settings → Environment variables)
2. Pages 재배포 (환경 변수 변경 후 반드시 재배포 필요)
3. URL 형식 확인: `wss://dalworld-server.<계정>.workers.dev/ws`

**HUD에 좌표가 안 보임:**
- HUD WS 항목이 `open`인지 확인
- 서버가 실행 중인지 확인

## TODO

- [ ] 전투 (몬스터 데미지)
- [ ] 아이템 사용 / 크래프팅
- [ ] 플레이어 사망 / 리스폰
- [ ] 사운드 효과
- [ ] 스프라이트 애니메이션
- [ ] 체팅
