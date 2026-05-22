# Map Editor Restore Progress

이 문서는 맵 에디터 복구 과정에서 지금까지 실제로 수행한 작업, 발생한 문제, 수정 커밋, 현재 상태를 기록한다.

기준 문서:

- `docs/map-editor-original-structure.md`
- `docs/map-editor-restore-audit.md`

## 복구 원칙

- 기존에 있던 기능을 임의로 삭제하지 않는다.
- UI만 표시되는 상태를 완료로 보지 않는다.
- 저장/불러오기/월드맵 셀 전환은 하나의 source of truth를 사용해야 한다.
- `ClassicTilesPanelLite`에 기능을 계속 누적하지 않는다.
- 문서 기준으로 현재 구조를 비교하고, 기존 기능 단위로 복구한다.
- 빌드 오류와 회귀를 문서에 남긴다.

## 지금까지 진행된 주요 작업

### 1. 기존 UI 안전 부팅 복구

목표:

- 기존 에디터 UI를 열 때 앱이 멈추지 않게 한다.
- 무거운 기존 패널을 한 번에 로드하지 않고, 최소 안전 부팅 패널에서 단계적으로 기능을 복구한다.

진행 내용:

- `EditorApp`에서 Pixi Application 초기화 후 safe boot panel 표시.
- `EditorState`, `TilePlacementSystem`을 timeout 보호와 함께 동적 import.
- 기존 UI 패널은 `ClassicTilesPanelLite`로 분리해 단계적 로딩.
- 카테고리, 에셋, 타일셋 선택, 월드맵 패널을 lazy import 방식으로 연결.

관련 파일:

- `src/editor/EditorApp.ts`
- `src/editor/ClassicTilesPanelLite.ts`
- `src/editor/EditorFallbackPanel.ts`

### 2. 기존 UI 버튼/상태 표시 복구

복구한 기능:

- Tiles 탭 표시
- Monsters 탭 버튼 표시
- 스케일 조절 UI
- Grid 표시/크기 변경 UI
- Ground/Object/Collision 레이어 버튼
- Paint/Picker/Erase 도구 버튼
- 버튼 active 표시
- Black 브러시
- 검정투명 옵션
- Fill / Random Fill
- 저장 / 불러오기 / JSON / 전체삭제 버튼

남은 문제:

- 임시 안내문이 일부 남아 있다.
- 최종 UI는 원래 UI와 동일해야 하므로, 버튼만 늘리는 방식은 중단해야 한다.

### 3. 타일셋 카테고리/에셋/부분 선택 복구

복구한 기능:

- `tilesetManifest` 카테고리 lazy load.
- 카테고리 클릭 시 에셋 목록 표시.
- 선택된 카테고리/에셋 active 표시.
- 큰 타일셋 이미지의 경우 `TilePickerWindow`를 열어 sourceRect 선택.
- 선택한 sourceRect를 `EditorState.setSourceRect()`로 반영.
- 작은 단일 에셋과 단색 에셋은 직접 선택.

관련 파일:

- `src/editor/ClassicTilesPanelLite.ts`
- `src/editor/TilePickerWindow.ts`
- `src/editor/tilesetManifest.ts`

남은 확인:

- 기존 타일셋 미리보기 UI와 완전히 같은지 비교 필요.
- 부분 선택 후 실제 저장/불러오기까지 sourceRect가 유지되는지 확인 필요.

### 4. Black 브러시/기본 브러시 저장 문제 수정

문제:

- fallback 또는 단색 브러시가 화면에는 찍히지만 서버 저장 후 불러오면 사라졌다.
- 원인은 `assetUrl`이 빈 문자열인 placement가 `compileRuntimeWorldMap()`에서 invalid placement로 스킵되었기 때문이다.

수정:

- 단색 placement에서 `assetUrl`이 비어 있고 `solidColor`가 있으면 `solid://<assetId>` 형태로 보정.
- fallback asset URL을 `solid://fallback-*` 형태로 변경.

관련 파일:

- `src/worldMap/compileRuntimeWorldMap.ts`
- `src/editor/EditorApp.ts`
- `src/editor/ClassicTilesPanelLite.ts`

관련 커밋:

- `731d399c0abbd06b5c1d68db6f3ff1ba212ba2ce`

### 5. 월드맵 셀별 draft 저장소 추가

목표:

- 0,0 셀만 저장되는 구조에서 벗어나, 월드맵 전체 셀 draft를 관리한다.

추가/수정:

- `WorldCellDraftStore` 추가/확장.
- 셀별 `EditorMapDraft` 저장.
- 셀 전환 시 현재 draft 저장 후 대상 셀 draft 로드.
- 서버 `GameWorldMap`을 셀별 draft로 복원.
- 전체 `EditorWorldSave` snapshot 생성.
- `knownCellKeys`로 한 번이라도 생성/이동/로드된 셀 좌표 추적.
- 서버에서 불러온 `monsterSpawnRules`와 `itemOverrides`를 world snapshot에 보존하도록 메타데이터 복제 경로 추가.

관련 파일:

- `src/editor/WorldCellDraftStore.ts`

관련 커밋:

- `0af57648c5d9c065268fcd6c7e34d3b364406c6c`
- `bb230ae1db1856830e01ac1b14e3c74cebac81d5`
- `823baa6e9a29ac18ec9779bc819b2ada826ef8ce`
- `2a7b1030d345a2b06236e949357ae92f0f7bfb5a`
- `058ef3d2e57a5fb8067fcacbbc5d54194b4594c5`
- `33fa913799972de094a550a55e4b37a1e5fab269`

### 6. 전체 월드 저장/JSON export 추가

목표:

- 현재 셀 하나가 아니라 전체 월드맵 셀을 저장/JSON export한다.

추가:

- `EditorWorldSaveActions.ts`
- `saveEditorWorldSaveToServer(world, status)`
- `loadServerWorldMap(status)`
- `exportEditorWorldSaveJson(world)`

저장 흐름:

```txt
EditorWorldSave
→ compileRuntimeWorldMap()
→ PUT /maps/default/cell?gridX=x&gridY=y
→ PUT /maps/default/manifest
```

관련 파일:

- `src/editor/EditorWorldSaveActions.ts`
- `src/worldMap/uploadWorldMap.ts`
- `src/worldMap/compileRuntimeWorldMap.ts`

관련 커밋:

- `4956b7def55a312685a982ca718d545cfb8d8cb4`
- `c70a64ff624fa950070c62cb7a9d75c7b28e6d5f`

### 7. MapEditorSession 도입

문제:

- `ClassicTilesPanelLite` 안에 월드맵 grid, draft store, 저장/불러오기 로직이 누적되었다.
- UI 파일이 source of truth처럼 동작하면서 기존 구조와 멀어졌다.

수정 방향:

- `MapEditorSession`을 추가해 월드맵/저장/불러오기 source of truth를 분리.

추가된 책임:

- `EditorState` 참조
- `TilePlacementSystem` 참조
- `WorldCellDraftStore` 관리
- `WorldMapGrid` 연결
- 셀 전환
- 셀 삭제
- 전체 월드 snapshot 생성
- 저장 전 검증
- 서버 저장
- 서버 불러오기
- JSON export

관련 파일:

- `src/editor/MapEditorSession.ts`
- `src/editor/EditorApp.ts`
- `src/editor/ClassicTilesPanelLite.ts`

관련 커밋:

- `92c9ff0778b23ffb78e2656c6449958e7871c9ca`
- `dc47b8d4d216608a63739cf7522383d4abb490dc`
- `df7775613ccae2d28192ffc7f7b6d2897880cb3e`
- `9c6bbbf03dc874891beae1a3f73234df86a5b9a9`

### 8. 저장 전 검증 추가

문제:

- 0,0 외 셀이 UI에는 있는데 저장 snapshot에서 누락될 수 있었다.
- snapshot과 compile 결과가 다른 경우에도 저장이 진행될 수 있었다.

추가된 검증:

- WorldMapGrid cells와 `EditorWorldSave.cells` 비교.
- UI cell이 snapshot에 없으면 저장 중단.
- `compileRuntimeWorldMap(world)` 실행 후 compiled cells 수 비교.
- snapshot/compiled 각 셀 placements 수를 상태 메시지로 출력.

기대 상태 메시지:

```txt
월드 snapshot 생성. cells=2, coords=0,0 | 1,0
저장 검증 완료. snapshot=[0,0:1 | 1,0:1] compiled=[0,0:1 | 1,0:1]
서버 저장 중... cells=2, placements=2
```

관련 파일:

- `src/editor/MapEditorSession.ts`

### 9. 불러오기 두 번 눌러야 전체 셀이 보이는 문제 수정

문제:

- 불러오기를 한 번 누르면 store에는 전체 셀이 들어오지만, 월드맵 grid가 아직 없으면 grid에는 반영되지 않았다.
- 이후 월드맵 패널을 열면 새 grid는 기본 0,0만 가지고 있어, 다시 불러오기를 눌러야 전체 셀이 표시되었다.

수정:

- `MapEditorSession`에 `loadedWorldMapDraft` 추가.
- `loadWorld()`에서 서버 map으로 만든 `worldMapDraft`를 저장.
- `attachWorldMapGrid(grid)` 호출 시 `loadedWorldMapDraft`가 있으면 즉시 `grid.load(loadedWorldMapDraft)` 실행.
- grid current도 `loadedWorldMapDraft.current`로 맞춤.

관련 파일:

- `src/editor/MapEditorSession.ts`

관련 커밋:

- `ebf30df5b2f317ad3c6c70f42f74b06c25f3ea7f`
- `ad5606e6ed7e27319f856d1a7ff4b4327a08949c`
- `b2364a6d3207a9c2c47d7b7925bfdf6578aa9315`

### 10. Monsters 탭 경량 복구

목표:

- Monsters 탭이 단순 상태 메시지만 표시하던 상태를 실제 편집/저장 UI로 복구한다.
- 모바일 안전 부팅 경로에는 무거운 모듈을 추가하지 않고, 기존 UI 패널을 연 뒤 기능을 지연 로드한다.

추가/수정:

- `MonsterTabLiteFeature` 추가.
- `EditorApp.openClassicEditorUi()`에서 기존 UI 패널 생성 후 `import('./MonsterTabLiteFeature')`로 지연 로드.
- Monsters 탭 클릭 시 Tiles 영역을 숨기고 경량 몬스터 규칙 편집 UI 표시.
- `wild_slime`, `sheep` world spawn rule 추가/수정/삭제 지원.
- `enabled`, `monsterType`, `scope`, `maxAlive`, `spawnsPerMinute`, 일부 spec override 편집 지원.
- 불러오기는 `GET /maps/default`의 `monsterSpawnRules`를 사용한다.
- 저장은 `saveMonsterTabToServer()`를 통해 `/maps/default/monsters`로 분리 저장한다.

관련 파일:

- `src/editor/MonsterTabLiteFeature.ts`
- `src/editor/EditorApp.ts`
- `src/editor/EditorTabServerSaves.ts`

관련 커밋:

- `c671c481afc65fa844206e90bc714f84950c4c7c`
- `2d02207b4e881995a8f8dea8b7e24a22fe861ffb`

남은 확인:

- Monsters 탭 UI가 기존 UI와 100% 동일한지는 아직 검증 필요.
- 서버 저장 후 `GET /maps/default`에서 규칙이 유지되는지 실기기/서버 연결 상태에서 확인 필요.

### 11. 빌드 오류 대응 기록

#### TypeScript 오류: WorldMapGridInstance에 load 누락

빌드 로그:

```txt
src/editor/ClassicTilesPanelLite.ts(126,43): error TS2345:
Argument of type 'WorldMapGridInstance' is not assignable to parameter of type 'WorldMapGridLike'.
Property 'load' is missing in type 'WorldMapGridInstance' but required in type 'WorldMapGridLike'.
```

원인:

- `MapEditorSession`의 `WorldMapGridLike`에는 `load()`가 필요해졌지만, `ClassicTilesPanelLite.ts`의 로컬 타입에는 `load()` 선언이 없었다.

수정:

- `ClassicTilesPanelLite.ts`에서 `EditorWorldMapDraft` 타입 import.
- `WorldMapGridInstance`에 `load(draft: EditorWorldMapDraft | undefined): void` 추가.

관련 커밋:

- `db74983d6f6b4ff932da8440ac2d43a1a7fe5a41`

## 현재 상태

현재 저장/불러오기 흐름은 다음 구조를 목표로 정리 중이다.

```txt
EditorApp
→ MapEditorSession
→ WorldCellDraftStore
→ EditorWorldSaveActions
→ uploadWorldMap
→ Durable Object / maps storage
```

현재 복구된 것:

- 기본 safe boot 진입
- 기존 UI 패널 열기
- 카테고리/에셋 로딩
- 에셋 active 표시
- 타일셋 부분 선택
- 기본 배치/삭제/피커 계열
- 월드맵 패널 표시
- 셀별 draft 저장소
- 전체 월드 저장/JSON/export 시도
- 전체 월드 불러오기 시도
- 저장 전 검증
- 불러오기 후 grid 연결 지연 문제 보강
- Monsters 탭 경량 편집/불러오기/분리 저장 UI

아직 완료로 보지 않는 것:

- 기존 UI와 100% 동일한 레이아웃 복구
- Monsters 탭의 기존 UI 수준 완전 복구
- Items/Resource/Spawn 전체 연결 확인
- `ClassicTilesPanelLite`에서 임시 fallback 제거
- 불필요한 safe boot 전용 임시 안내문 제거
- 0,0 외 셀 저장/새로고침/불러오기 완전 검증
- 빌드 통과 최종 확인

## 다음 작업 순서

1. 최신 커밋 빌드 확인.
2. 0,0 / 1,0 셀 저장, 새로고침, 불러오기 단일 클릭 검증.
3. 불러오기 전에 월드맵 패널이 없어도 이후 패널 열 때 전체 셀이 즉시 표시되는지 검증.
4. Monsters 탭 저장 후 `GET /maps/default`에서 규칙 유지 확인.
5. `ClassicTilesPanelLite`에 남은 fallbackWorldCellStore 경로를 정리.
6. 원래 UI 레이아웃/패널 구조를 기존 문서 기준으로 복구.
7. Items/Resource/Spawn 저장 구조 확인.
8. 회귀 테스트 문서 기준으로 전체 검증.

## 완료 기준

다음 모두가 만족되어야 한다.

- 빌드 통과.
- 기존 UI가 멈추지 않음.
- 0,0 외 셀 저장/불러오기 성공.
- JSON export에 전체 셀이 포함됨.
- GET `/maps/default` 결과에 전체 셀이 포함됨.
- 월드맵 패널을 언제 열어도 불러온 전체 셀이 표시됨.
- 타일셋 미리보기/부분 선택이 기존처럼 작동.
- Fill/Random Fill 저장/불러오기 유지.
- Monsters 탭 실제 동작.
- 임시 안내문/임시 fallback 제거.
