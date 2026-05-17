# dalworld_client

Pixi.js v8 + TypeScript + Vite 기반 dalworld 클라이언트입니다.

## 목표

- Cloudflare Pages 배포
- Pixi.js v8 렌더링
- WebSocket으로 Cloudflare Workers/Durable Objects 서버와 통신
- 클라이언트는 입력만 전송하고, 이동 검증과 최종 좌표 확정은 서버가 담당하는 Server-Authoritative 구조

## 실행

```bash
npm install
npm run dev
```

로컬 서버가 `http://localhost:8787`에서 실행 중이면 Vite proxy가 `/ws` WebSocket 요청을 서버로 전달합니다.

## 조작

- 이동: `W/A/S/D` 또는 방향키

## 주요 파일

```txt
src/
├─ main.ts              # Pixi 앱 초기화, 임시 캐릭터 렌더링, 입력 전송
├─ game/input.ts        # 키보드 입력 상태 관리
└─ net/
   ├─ messages.ts       # 서버/클라이언트 메시지 타입
   └─ network.ts        # WebSocket 연결 뼈대
```
