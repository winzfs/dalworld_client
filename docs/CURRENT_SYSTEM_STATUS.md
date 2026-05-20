# DalWorld Client Current System Status

Last updated: 2026-05-20

이 문서는 현재 클라이언트 구현 상태를 빠르게 파악하기 위한 기준 문서다.
AI 작업자는 기능 추가나 수정 전에 이 문서를 확인하고, 실제 코드와 차이가 있으면 문서를 함께 갱신한다.

## 1. 프로젝트 개요

DalWorld 클라이언트는 Pixi.js v8 + TypeScript + Vite 기반의 2D 멀티플레이 생존/건설 게임 클라이언트다.

클라이언트는 다음을 담당한다.

- 화면 렌더링
- 입력 처리
- UI 표시
- 서버 요청 전송
- 서버 snapshot/event 반영
- 건설 미리보기
- 맵 에디터

실제 게임 판정은 서버가 담당한다.

## 2. 구현 완료 또는 연결됨

현재 코드에 연결된 주요 기능은 다음과 같다.

- Pixi.js v8 Application 초기화
- 월드 Container 기반 렌더링
- WebSocket 네트워크 연결
- 서버 welcome 처리
- 서버 snapshot 처리
- 플레이어 렌더링
- 자원 렌더링
- 몬스터 렌더링
- 카메라 follow
- HUD 업데이트
- 모바일 조이스틱
- 모바일 채집 버튼
- 클라이언트 로컬 예측 이동
- 입력 송신 시스템
- 자원 채집 요청
- 월드맵 로드와 렌더링
- 런타임 셀 전환 구조
- `?editor=1` 맵 에디터 모드
- 에디터 카메라
- 에디터 미니맵
- 건설 모드 상태
- 건설 그리드 오버레이
- 건설 고스트 미리보기
- 건설 드래프트 편집
- 건설 배치 요청
- 건설 수정 요청
- 건설 철거 요청
- 문 열림/닫힘 이벤트 반영
- 건설 snapshot 반영
- 제작 요청 UI 연동
- 인벤토리 snapshot 반영
- 낮/밤 상태 수신 구조

## 3. 부분 구현 또는 검증 필요

다음 기능은 연결되어 있으나 추가 검증이 필요하다.

- 건설물과 플레이어 충돌의 클라이언트 예측 정확도
- 건설 배치 실패 UX
- 건설 수정/드래그 UX
- 문 열림/닫힘 UI 피드백
- 제작 UI 완성도
- 인벤토리 UI 확장성
- 셀 전환 시 월드맵/플레이어 위치 동기화
- 모바일에서 건설 UI 조작성
- 대형 맵 렌더링 성능
- occlusion 처리와 zIndex 정렬

## 4. 미구현 또는 향후 구현

- 본격 전투 입력 UI
- 공격 이펙트
- 플레이어 피격 UI
- 사망/리스폰 UI
- 장비 UI
- 퀵슬롯
- 채팅
- 사운드
- 스프라이트 애니메이션 고도화
- 건물 프리셋
- 청사진 저장
- 권한 기반 건설 편집 UI

## 5. 주요 진입 파일

- `src/main.ts`
- `src/game/GameApp.ts`
- `src/net/network.ts`
- `src/protocol/messages.ts`

## 6. 주요 시스템 위치

- 게임 루프: `src/game/GameApp.ts`
- 입력: `src/game/InputController.ts`
- 네트워크: `src/net/network.ts`
- 플레이어 렌더링: `src/render/PlayerRenderer.ts`
- 자원 렌더링: `src/render/ResourceRenderer.ts`
- 몬스터 렌더링: `src/render/MonsterRenderer.ts`
- HUD/UI: `src/ui/*`
- 맵 렌더링: `src/render/GameWorldMapRenderer.ts`
- 맵 에디터: `src/editor/*`
- 건설 시스템: `src/systems/building/*`
- 런타임 월드 시스템: `src/game/systems/*`

## 7. 현재 구조상 주의점

### GameApp 책임 증가

`GameApp.ts`는 현재 많은 시스템을 조립하고, 건설 입력과 에디터 분기까지 포함한다.
새 기능을 추가할 때는 `GameApp.ts`에 직접 로직을 늘리기보다 별도 시스템으로 분리하는 것을 우선한다.

### 서버 권위 유지

클라이언트는 미리보기와 예측을 할 수 있지만, 실제 상태 확정은 서버 이벤트 이후에만 한다.

### 프로토콜 동기화

`src/protocol/messages.ts`는 서버 저장소와 맞아야 한다.
프로토콜 변경 시 양쪽 저장소를 같이 수정한다.

## 8. 다음 우선순위 제안

1. README와 현재 코드 상태 동기화
2. 건설 실패 UX 정리
3. GameApp 책임 분리
4. 제작/인벤토리 UI 정리
5. 전투 입력과 서버 이벤트 반영 구조 추가
6. 모바일 건설 조작성 개선

## 9. 작업 체크리스트

- [ ] 현재 기능 상태를 확인했는가?
- [ ] 기존 기능을 덮어쓰지 않았는가?
- [ ] 서버 권위 구조를 지켰는가?
- [ ] 프로토콜 변경 시 서버 저장소도 수정했는가?
- [ ] 새 기능을 적절한 모듈에 배치했는가?
- [ ] 문서를 최신화했는가?
