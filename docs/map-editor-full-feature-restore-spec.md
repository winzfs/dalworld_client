# Map Editor Full Feature Restore Specification

이 문서는 이전에 존재하던 맵 에디터 기능을 완벽하게 복구하기 위한 기능 명세와 완료 기준이다.

관련 문서:

- `docs/map-editor-original-structure.md`
- `docs/map-editor-restore-audit.md`
- `docs/map-editor-restore-progress.md`

## 목표

맵 에디터는 단순히 패널이 뜨는 상태가 아니라, 기존 기능이 실제로 동작하고 저장/불러오기/JSON/서버 반영까지 일관되게 작동해야 한다.

완벽 복구의 의미:

- 기존 UI 형태 유지
- 기존 기능 누락 없음
- 버튼 active 상태 정상
- 타일셋 미리보기와 부분 선택 정상
- 월드맵 다중 셀 저장/불러오기 정상
- Monsters/Items/Resources/Spawn 관련 기능 정상
- 빌드 통과
- 회귀 테스트 통과

## 구조 원칙

### 1. Server-Authoritative 구조 유지

게임 런타임의 권위는 서버/Durable Object에 있어야 한다.

- 클라이언트 에디터는 편집 draft를 만든다.
- 서버 저장 시 `EditorWorldSave`를 `GameWorldMap`으로 컴파일한다.
- 서버는 `/maps/default/cell`, `/maps/default/manifest`, `/maps/default/monsters`, `/maps/default/items`를 기준으로 데이터를 관리한다.
- 게임 런타임에서 이동 검증, AI, 충돌/상호작용 권위는 서버가 가진다.

### 2. Pixi.js v8 기준 유지

- Pixi.js v8 API를 기준으로 작성한다.
- deprecated API에 의존하지 않는다.
- 렌더링 계층과 editor state를 분리한다.

### 3. Cloudflare Workers/Web 표준 API 호환

- Node 전용 API를 클라이언트/Workers 코드에 섞지 않는다.
- `fetch`, `Blob`, `URL`, `crypto.randomUUID()` 등 Web 표준 API 기반으로 작성한다.
- Durable Object 라우트와 Pages 빌드 환경을 고려한다.

### 4. 책임 분리

최종 구조는 다음 책임 분리를 따른다.

```txt
EditorApp
→ Pixi boot, camera, pointer event, safe boot entry

MapEditorSession
→ editor state와 world cell persistence의 source of truth

EditorState
→ 선택된 도구/레이어/에셋/sourceRect/brush/grid 상태

TilePlacementSystem
→ 현재 셀의 placement 렌더링과 편집

WorldCellDraftStore
→ 셀별 EditorMapDraft 관리

WorldMapGrid
→ 월드맵 셀 view model

WorldMapPanel
→ 월드맵 UI

TilePickerWindow
→ 큰 타일셋 부분 선택 UI

EditorWorldSaveActions / Persistence Service
→ 저장/불러오기/JSON export

uploadWorldMap / compileRuntimeWorldMap
→ 서버 저장용 GameWorldMap 컴파일과 업로드
```

`ClassicTilesPanelLite`는 최종적으로 안전 fallback 또는 UI shell 역할만 해야 한다. 저장/월드맵/불러오기 source of truth를 직접 소유하면 안 된다.

## 기능별 복구 명세

## A. 기본 에디터 부팅

### 요구사항

- `/map-editor` 또는 해당 진입점에서 에디터가 멈추지 않고 열린다.
- Pixi stage가 정상 초기화된다.
- safe boot panel 또는 기존 UI panel이 정상 표시된다.
- 패널이 여러 번 중복 생성되지 않는다.
- 기존 UI 열기 버튼을 눌러도 앱이 멈추지 않는다.

### 완료 기준

- 새로고침 후 에디터 진입 성공.
- 콘솔에 치명적 오류 없음.
- 패널 열기/닫기 또는 다시 열기 시 중복 패널이 남지 않음.

## B. 기존 UI 레이아웃

### 요구사항

- 원래 맵 에디터 패널 레이아웃과 최대한 동일해야 한다.
- 버튼만 계속 추가하는 식으로 UI를 바꾸지 않는다.
- Tiles 탭과 Monsters 탭이 원래 위치와 역할을 가져야 한다.
- 기능별 버튼은 원래 그룹에 배치되어야 한다.
- 임시 안내문은 최종 복구 시 제거한다.

### 필수 UI 요소

- Header: `Map Editor`
- Tabs: `Tiles`, `Monsters`
- Scale controls
- Grid controls
- Layer controls
- Tool controls
- Fill controls
- Action controls
- Category list
- Asset list / preview
- Tile picker popup
- World map panel

### 완료 기준

- 기존 UI 스크린샷/기억 기준과 레이아웃이 일치한다.
- 불필요한 임시 텍스트가 없다.
- 버튼 active 표시가 기존처럼 보인다.

## C. EditorState

### 요구사항

EditorState는 다음 상태를 정확히 가진다.

- activeLayer: `ground | object | collision`
- mode: `paint | picker | erase`
- selectedAsset
- selectedBrush
- sourceRect
- gridSize
- gridVisible
- brushScale
- transparentBlack
- activeCategoryId

### 완료 기준

- 레이어 버튼을 누르면 active 표시가 바뀐다.
- 도구 버튼을 누르면 active 표시가 바뀐다.
- 에셋 버튼을 누르면 selected asset이 바뀐다.
- 큰 타일셋 부분 선택 후 sourceRect가 유지된다.
- state 변경이 UI에 즉시 반영된다.

## D. 타일 배치

### 요구사항

- Ground 레이어에 배치 가능.
- Object 레이어에 배치 가능.
- Collision/Block 레이어에 배치 가능.
- 선택한 grid size 기준으로 좌표 snap.
- brush scale 반영.
- sourceRect가 있으면 전체 이미지가 아니라 선택 영역만 배치.
- solidColor 에셋도 저장 가능한 placement로 생성.

### 완료 기준

- 각 레이어에 타일 배치 가능.
- 같은 좌표에 같은 레이어 배치 시 의도한 overwrite/replace 동작 유지.
- 배치 후 JSON에 placement가 들어간다.
- 저장/불러오기 후 placement가 유지된다.

## E. Picker 도구

### 요구사항

- 맵에 배치된 타일을 클릭하면 해당 asset/layer/sourceRect를 선택한다.
- Picker가 동작한 뒤 브러시가 즉시 paint 가능한 상태가 된다.
- Picker 후 다른 배치가 가능해야 한다.

### 완료 기준

- 배치된 타일 클릭 시 에셋 선택 상태가 바뀐다.
- sourceRect가 있는 타일을 찍으면 sourceRect도 복원된다.
- Picker 상태가 다른 도구 사용을 막지 않는다.

## F. Erase 도구

### 요구사항

- 선택한 좌표/레이어의 placement 삭제.
- 필요 시 모든 레이어 삭제 옵션이 기존 기능에 있었는지 확인 후 복구.
- 삭제 후 저장/불러오기 시 삭제 상태 유지.

### 완료 기준

- 삭제한 placement가 화면에서 사라진다.
- JSON/export에서 삭제된 placement가 빠진다.
- 서버 저장/불러오기 후 삭제 상태 유지.

## G. Grid / Scale

### 요구사항

- Grid 표시 토글.
- Grid 크기 16/32/64 변경.
- Brush scale 증가/감소/직접 입력.
- Grid size 변경이 배치 snap에 즉시 반영.

### 완료 기준

- Grid 버튼 active 상태 정상.
- 16/32/64 각각 배치 좌표 snap 정상.
- scale 변경 후 배치 크기 정상.

## H. Black 브러시 / 검정투명

### 요구사항

- Black 브러시 선택 가능.
- Black 브러시 다시 누르면 해제 또는 기본 브러시 복귀.
- 검정투명 옵션 토글 가능.
- 저장 가능한 assetUrl을 사용해야 한다.

### 완료 기준

- Black 브러시가 다른 배치를 막지 않는다.
- 다른 에셋 선택 시 Black 브러시 상태가 정상 해제된다.
- 저장/불러오기 후 Black/검정투명 placement가 유지된다.

## I. Fill / Random Fill

### 요구사항

- 전체 Fill: 현재 선택 에셋으로 현재 셀 전체를 채운다.
- Random Fill: 확률값을 기준으로 현재 셀에 랜덤 배치한다.
- Fill은 월드 전체가 아니라 현재 셀 기준이어야 한다. 기존 기능이 월드 전체였다면 별도 옵션으로 분리한다.
- Fill 결과는 저장/불러오기 가능해야 한다.

### 완료 기준

- Fill 후 화면에 즉시 반영.
- JSON에 Fill 결과 placements 포함.
- 새로고침/불러오기 후 유지.

## J. 타일셋 카테고리 / 에셋 목록

### 요구사항

- `tilesetManifest`에서 카테고리 로드.
- Monsters 카테고리는 Tiles 탭에서 제외하거나 기존 UI 기준에 맞게 분리.
- 카테고리 active 표시.
- 에셋 active 표시.
- 에셋 이름/미리보기 표시.

### 완료 기준

- 모든 기존 카테고리가 표시된다.
- 카테고리 클릭 시 에셋 목록 변경.
- 선택한 에셋으로 배치 가능.

## K. 타일셋 미리보기 / 부분 선택

### 요구사항

- 큰 타일셋 클릭 시 `TilePickerWindow` 표시.
- 이미지 미리보기 표시.
- grid 기준 선택 가능.
- 선택 영역이 sourceRect로 저장.
- 선택 후 해당 부분만 배치.
- 선택 창이 UI를 멈추게 하지 않는다.

### 완료 기준

- 큰 타일셋에서 일부만 선택 가능.
- 부분 선택 배치가 화면에 정확히 표시된다.
- 저장/불러오기 후 sourceRect 유지.

## L. 월드맵 패널

### 요구사항

- 월드맵 패널 열기.
- 현재 셀 표시.
- 주변 셀 생성/선택.
- 셀 삭제.
- 0,0 셀은 기본 셀로 유지.
- 셀 선택 시 현재 셀 draft 저장 후 대상 셀 draft 로드.
- 월드맵 패널을 불러오기 전/후 언제 열어도 전체 셀 목록이 표시되어야 한다.

### 완료 기준

- 0,0에서 1,0으로 이동 가능.
- 1,0에 배치 후 0,0으로 돌아가도 0,0 내용 유지.
- 다시 1,0으로 가면 1,0 내용 유지.
- 불러오기 한 번만으로 전체 셀이 표시된다.
- 월드맵 패널을 나중에 열어도 loaded cells가 즉시 표시된다.

## M. 전체 월드 저장

### 요구사항

저장은 현재 셀 하나가 아니라 전체 월드 셀을 저장해야 한다.

저장 데이터 흐름:

```txt
MapEditorSession.createWorldSnapshot()
→ EditorWorldSave
→ validateWorldBeforePersistence()
→ compileRuntimeWorldMap()
→ uploadWorldMap()
→ PUT /maps/default/cell
→ PUT /maps/default/manifest
```

### 저장 전 검증

- snapshot cells 수
- grid cells 수
- compiled cells 수
- 각 셀 placements 수
- 누락 셀 존재 여부

### 완료 기준

- 0,0과 1,0에 각각 배치.
- 저장 시 cells=2 이상.
- compiled도 cells=2 이상.
- 서버 저장 로그/report에 cells=2 이상.
- GET `/maps/default` 결과에도 cells=2 이상.

## N. 불러오기

### 요구사항

- `GET /maps/default`에서 전체 `GameWorldMap`을 로드.
- 모든 cells를 `WorldCellDraftStore`에 복원.
- 모든 cells를 `WorldMapGrid`에 반영.
- 현재 셀 draft를 `TilePlacementSystem.replaceDraft()`로 표시.
- 월드맵 패널이 없을 때 불러와도, 이후 패널을 열면 전체 셀이 표시되어야 한다.

### 완료 기준

- 불러오기 버튼 1회로 전체 셀 복원.
- 두 번 눌러야 하는 증상 없어야 함.
- 새로고침 후 불러오기 1회로 복원.
- 월드맵 패널을 나중에 열어도 전체 셀 표시.

## O. JSON Export

### 요구사항

- 현재 셀 draft 하나가 아니라 전체 `EditorWorldSave`를 export.
- 파일명은 map name 기반.
- cells 배열에 모든 셀이 포함.
- 각 cell draft placements 포함.
- sourceRect, solidColor, transparentBlack, gameplay 유지.

### 완료 기준

- JSON 파일의 cells가 2개 이상일 수 있다.
- 0,0 / 1,0 각각 placements가 유지된다.
- JSON을 기준으로 서버 저장과 동일한 구조를 검증할 수 있다.

## P. Monsters 탭

### 요구사항

- Monsters 탭이 실제 UI를 표시해야 한다.
- 몬스터 타입 목록 표시.
- 월드 스폰 규칙 표시/수정.
- 셀 또는 영역 기반 스폰 설정이 기존에 있었다면 복구.
- maxAlive, spawnsPerMinute, enabled, spec override 수정 가능.
- 저장 시 `/maps/default/monsters` 또는 worldMap monsterSpawnRules에 반영.
- 불러오기 후 복원.

### 완료 기준

- Monsters 탭 클릭 시 실제 편집 UI 표시.
- 최소 wild_slime/sheep 스폰 규칙 수정 가능.
- 저장/불러오기 후 값 유지.
- 서버 runtime map에 반영.

## Q. Items / Resource / Gameplay

### 요구사항

- placement gameplay metadata 유지.
- resource type tree/stone 유지.
- item overrides 유지.
- compile 단계에서 허용된 gameplay만 서버 map에 반영.
- 서버 권위 구조를 침해하지 않는다.

### 완료 기준

- resource placement 저장/불러오기 유지.
- item override 저장/불러오기 유지.
- runtime map에 gameplay 필드 정상 포함.

## R. 전체삭제

### 요구사항

- 현재 셀만 삭제인지, 전체 월드 삭제인지 UI에서 명확해야 한다.
- 기존 기능이 현재 맵 전체삭제였다면 현재 셀 전체삭제로 복구.
- 전체 월드 삭제 기능이 필요하면 별도 확인 후 추가.

### 완료 기준

- 현재 셀 삭제 후 다른 셀은 유지.
- 저장/불러오기 후 삭제 상태 유지.
- 실수로 전체 월드가 지워지지 않음.

## S. 빌드 / 타입 안정성

### 요구사항

- `npm run build` 통과.
- TypeScript 에러 없음.
- `as never` 임시 캐스팅 제거.
- 타입을 맞추기 위해 실제 기능과 다른 fake type을 만들지 않는다.

### 완료 기준

- Cloudflare Pages 빌드 통과.
- 로컬/CI build 통과.
- 새로 추가한 타입이 실제 구현과 일치.

## T. 회귀 테스트 시나리오

### 시나리오 1: 기본 배치 저장

1. 에디터 진입.
2. 기존 UI 열기.
3. Grass 선택.
4. 0,0에 배치.
5. 저장.
6. 새로고침.
7. 불러오기.
8. Grass가 복원되는지 확인.

### 시나리오 2: 다중 셀 저장

1. 0,0에 Grass 배치.
2. 월드맵에서 1,0 선택.
3. 1,0에 Dirt 배치.
4. 저장.
5. 상태 메시지에서 cells=2 확인.
6. 새로고침.
7. 불러오기 1회.
8. 0,0과 1,0 각각 복원 확인.

### 시나리오 3: 월드맵 패널 후불러오기/선불러오기

A:

1. 새로고침.
2. 월드맵 패널 열기.
3. 불러오기 1회.
4. 전체 셀이 표시되는지 확인.

B:

1. 새로고침.
2. 불러오기 1회.
3. 월드맵 패널 열기.
4. 전체 셀이 표시되는지 확인.

### 시나리오 4: 부분 타일셋

1. 큰 타일셋 에셋 클릭.
2. TilePickerWindow에서 일부 선택.
3. 맵에 배치.
4. JSON export.
5. sourceRect 포함 확인.
6. 저장/불러오기 후 같은 부분 표시 확인.

### 시나리오 5: Monsters

1. Monsters 탭 열기.
2. 스폰 규칙 수정.
3. 저장.
4. 새로고침.
5. 불러오기.
6. 수정 값 유지 확인.

## 최종 완료 기준

완벽 복구는 다음 조건을 모두 만족해야 한다.

- 기존 UI 레이아웃 복구.
- 기존 타일셋 미리보기/부분 선택 복구.
- Ground/Object/Collision 편집 복구.
- Paint/Picker/Erase 복구.
- Grid/Scale 복구.
- Fill/Random Fill 복구.
- 월드맵 다중 셀 편집 복구.
- 전체 셀 저장/불러오기/JSON 복구.
- Monsters 탭 실제 기능 복구.
- Items/Resource/Gameplay 저장 구조 유지.
- 빌드 통과.
- 회귀 테스트 통과.
- 임시 안내문과 fallback 중심 구조 제거.
