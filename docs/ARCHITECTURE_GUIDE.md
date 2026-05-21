# DalWorld Client Architecture Guide

Last updated: 2026-05-21

이 문서는 DalWorld 클라이언트의 전체 구조를 설명한다.
AI 작업자는 새 기능을 추가하기 전에 이 문서를 기준으로 어느 계층을 수정해야 하는지 판단한다.

## 1. 클라이언트 역할

클라이언트는 게임의 화면, 입력, UI, 미리보기, 서버 이벤트 반영을 담당한다.

클라이언트가 담당하는 것:

- Pixi.js v8 렌더링
- 키보드/마우스/터치 입력
- 모바일 조이스틱
- HUD와 게임 창 UI
- 카메라
- 로컬 예측 이동
- 서버 WebSocket 연결
- 서버 snapshot/event 반영
- 월드맵 렌더링
- 맵 에디터
- 맵 에디터 탭별 저장 요청
- 건설 미리보기
- 건설 드래프트 편집

클라이언트가 담당하지 않는 것:

- 실제 이동 가능 여부 최종 판정
- 자원 채집 성공 확정
- 아이템 획득 확정
- 제작 성공 확정
- 건설 배치 확정
- 몬스터 AI 확정
- 전투 피해 확정
- 사망/리스폰 확정

## 2. 전체 데이터 흐름

```txt
User Input
  -> InputController
  -> Client prediction / UI preview
  -> GameNetwork WebSocket
  -> Server Durable Object
  -> Server validation
  -> snapshot/event
  -> ServerMessageRouter
  -> SnapshotSystem / Renderers / UI
```

맵 에디터 저장 흐름:

```txt
Tiles tab 저장
  -> compileRuntimeWorldMap(world)
  -> uploadWorldMap(world)
  -> /maps/default/cell
  -> /maps/default/manifest

Monsters tab 저장
  -> EditorTabServerSaves.saveMonsterTabToServer()
  -> /maps/default/monsters

Items tab 저장
  -> ItemEditorStorage.loadEditorItemOverrides()
  -> EditorTabServerSaves.saveItemTabToServer()
  -> /maps/default/items
```

## 3. 주요 계층

### 3.1 Entry

- `src/main.ts`

브라우저 진입점이다. GameApp을 생성하고 DOM에 mount한다.
`?editor=1`에서는 맵 에디터와 Items 탭 보조 기능을 활성화한다.

### 3.2 Game assembly

- `src/game/GameApp.ts`

전체 시스템을 조립한다.
현재 많은 책임이 있으므로 새 도메인 로직을 직접 추가하지 않는 것을 우선한다.

### 3.3 Network

- `src/net/network.ts`

WebSocket 연결, 상태 관리, 메시지 송수신, ping 처리를 담당한다.

### 3.4 Protocol

- `src/protocol/messages.ts`

서버와 공유해야 하는 메시지 타입을 정의한다.
서버 저장소의 프로토콜과 호환되어야 한다.

### 3.5 Runtime systems

- `src/game/systems/*`

게임 루프에서 실행되는 독립 시스템이다.
입력 송신, snapshot 처리, 카메라, HUD, 셀 전환 같은 책임을 나눈다.

### 3.6 Renderers

- `src/render/*`

Pixi DisplayObject를 생성하고 업데이트한다.
게임 판정을 직접 하면 안 된다.

### 3.7 UI

- `src/ui/*`

HUD, 창, 버튼 등 DOM 또는 UI 레이어를 담당한다.
게임 판정을 확정하지 않는다.
인벤토리/제작 UI는 `ItemRuntimeOverrides`를 통해 서버 월드맵에서 내려온 아이템 표시 override를 반영한다.

### 3.8 Building

- `src/systems/building/*`

건설 모드, 그리드, 고스트, 드래프트, 확정 건설물 렌더링을 담당한다.
실제 배치 확정은 서버 이벤트 이후에만 한다.

### 3.9 Map editor

- `src/editor/*`

`?editor=1`에서만 활성화되는 월드맵 편집 기능이다.
일반 게임 모드와 입력/UI를 섞지 않는다.

관련 주요 파일:

- `src/editor/MapEditor.ts`: 에디터 조립, 셀 드래프트, Tiles 저장 흐름
- `src/editor/TilesetPanel.ts`: Tiles/Monsters 탭 UI
- `src/editor/EditorTabServerSaves.ts`: Monsters/Items 탭 서버 저장 보조
- `src/editor/ItemEditorFeature.ts`: Items 탭 UI 설치와 편집 UI
- `src/editor/ItemEditorStorage.ts`: Items 탭 로컬 override 저장소
- `src/worldMap/uploadWorldMap.ts`: 셀/manifest/monsters/items 업로드 함수

## 4. GameApp 분리 기준

새 기능을 추가할 때 다음 기준에 해당하면 별도 파일로 분리한다.

- 입력 처리 코드가 30줄 이상 늘어난다.
- 상태를 별도로 들고 있어야 한다.
- 서버 메시지를 별도로 처리해야 한다.
- 렌더링 객체를 관리한다.
- UI 이벤트와 게임 로직이 섞인다.
- 테스트 가능한 순수 로직이 있다.

권장 분리 예시:

- `CombatInputSystem`
- `CombatEventRenderer`
- `InventoryWindowController`
- `BuildingDraftController`
- `WorldPointerService`

## 5. 렌더링 원칙

- Pixi.js v8 기준을 사용한다.
- World container는 `sortableChildren`를 사용한다.
- zIndex 규칙은 도메인별로 일관되게 유지한다.
- 매 프레임 DisplayObject를 대량 생성하지 않는다.
- 기존 렌더러 구조를 우선 재사용한다.
- 화면 표시와 게임 판정을 분리한다.

## 6. 건설 렌더링 원칙

건설은 다음 흐름을 따른다.

```txt
부품 선택
  -> 고스트 미리보기
  -> 드래프트 편집
  -> 서버 요청
  -> 서버 확정 이벤트
  -> 실제 건설물 렌더링
```

주의:

- 고스트는 실제 월드 상태가 아니다.
- 서버가 거절하면 실제 렌더링에 반영하지 않는다.
- `ClientBuildingOccupancy`는 예측과 편의 기능을 위한 것이다.
- 최종 충돌/점유 판정은 서버가 한다.

## 7. 맵 에디터 원칙

- `?editor=1`에서만 활성화한다.
- 일반 게임 모드와 에디터 모드의 입력을 섞지 않는다.
- 저장 API는 서버의 `/maps/default` 계열 엔드포인트와 맞춰야 한다.
- 대형 맵을 고려해 셀 기반 구조를 유지한다.
- payload 실패 범위를 줄이기 위해 탭별 저장을 사용한다.

### 탭별 저장 정책

```txt
Tiles 저장
  -> 맵 배치/cell/manifest만 서버 저장
  -> /maps/default/cell
  -> /maps/default/manifest

Monsters 저장
  -> monsterSpawnRules만 서버 저장
  -> /maps/default/monsters

Items 저장
  -> itemOverrides만 서버 저장
  -> /maps/default/items
```

`uploadWorldMap()`은 더 이상 monster rules와 item overrides를 manifest에 함께 묶지 않는다.
몬스터와 아이템은 `EditorTabServerSaves.ts`를 통해 각각 작은 payload로 저장한다.

### Items 탭 원칙

Items 탭은 에디터 패널에 보조 탭으로 설치된다.
편집값은 `ItemEditorStorage`에 로컬 백업되고, `서버 저장` 버튼을 누를 때 `/maps/default/items`로 업로드한다.
서버에서 다시 받은 월드맵의 `itemOverrides`는 `runtimeMapStore`를 통해 `ItemRuntimeOverrides`에 적용된다.

## 8. 프로토콜 변경 원칙

프로토콜을 바꾸면 다음을 같이 수정한다.

- client `src/protocol/messages.ts`
- server `src/protocol/messages.ts`
- client 송신 코드
- server 처리 코드
- client 이벤트 처리 코드
- 관련 문서

가능하면 optional 필드로 확장한다.
기존 메시지 의미를 바꿀 때는 이유를 문서화한다.

## 9. 기능 추가 위치 예시

### 전투 입력 추가

권장 위치:

- `src/game/systems/CombatInputSystem.ts`
- `src/protocol/messages.ts`
- `src/render` 또는 `src/effects`

피해야 할 것:

- `GameApp.ts`에 공격 판정을 직접 작성
- 클라이언트에서 피해량 확정

### 인벤토리 UI 확장

권장 위치:

- `src/ui/*`
- `src/systems/inventory/*`가 필요하면 신설

피해야 할 것:

- 서버 응답 없이 아이템 수량 확정

### 새 건설 부품 추가

권장 위치:

- client building part definition
- asset manifest
- server building part definition
- protocol/doc update

피해야 할 것:

- 클라이언트에만 partId 추가
- 서버 검증 없이 렌더링만 추가

### 에디터 탭 저장 추가

권장 위치:

- 탭 UI: `src/editor/*`
- 서버 저장 helper: `src/editor/EditorTabServerSaves.ts`
- HTTP 업로드 함수: `src/worldMap/uploadWorldMap.ts`
- 서버 endpoint: `dalworld_server/src/rooms/GameRoom.ts` 또는 향후 `WorldMapStorageService`

피해야 할 것:

- 대형 맵 payload에 모든 설정을 계속 묶기
- 클라이언트 로컬 저장만 하고 서버 런타임 반영을 누락하기

## 10. 작업 체크리스트

- [ ] 수정 위치가 올바른 계층인가?
- [ ] GameApp에 불필요한 책임을 추가하지 않았는가?
- [ ] 렌더링과 판정을 분리했는가?
- [ ] 서버 권위 구조를 유지했는가?
- [ ] 프로토콜 변경 시 서버도 수정했는가?
- [ ] 모바일 입력을 고려했는가?
- [ ] 문서를 갱신했는가?
