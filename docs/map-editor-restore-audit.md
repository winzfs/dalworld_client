# Map Editor Restore Audit

기준 문서: `docs/map-editor-original-structure.md`

## 현재 결론

현재 맵 에디터는 기능을 단계적으로 살리는 과정에서 `ClassicTilesPanelLite`에 너무 많은 책임이 누적되어 있다.

문서 기준 원칙은 다음과 같다.

- 저장, 불러오기, 월드맵 셀 전환은 하나의 source of truth를 사용해야 한다.
- `ClassicTilesPanelLite`는 단계적 안전 부팅용이어야 하며 최종 구조의 중심이 되면 안 된다.
- 월드맵, 타일 배치, 저장, 불러오기, 몬스터, 아이템은 전용 모듈이 책임져야 한다.

현재 코드는 이 원칙을 일부 위반한다.

## 현재 코드 상태 요약

### EditorApp

현재 역할:

- Pixi Application 초기화
- 안전 부팅용 minimal editor runtime 생성
- `EditorState`와 `TilePlacementSystem` 생성
- fallback safe boot panel 표시
- Classic UI 패널 열기
- pointer event를 통한 paint 처리
- 단일 셀 저장/불러오기 fallback 제공

문제점:

- `saveMinimalEditorToServer()`는 `createSingleCellWorldSave()`를 사용한다.
- `createSingleCellWorldSave()`는 현재 `mapDraft` 하나만 `EditorWorldSave.cells`에 넣는다.
- `loadMinimalEditorFromServer()`는 서버 `GameWorldMap`에서 0,0 또는 첫 셀 하나만 `EditorMapDraft`로 변환한다.
- 따라서 safe boot 기본 저장/불러오기 경로는 여전히 단일 셀 중심이다.

정리 방향:

- safe boot 저장/불러오기는 단일 셀 fallback임을 명확히 하거나, 공용 world save service를 사용하게 바꾼다.
- 최종 복구 경로에서는 `createSingleCellWorldSave()`를 중심 저장 경로로 사용하면 안 된다.

### ClassicTilesPanelLite

현재 역할:

- Classic UI 형태 패널 표시
- 탭, 스케일, 그리드, 레이어, 도구 버튼 표시
- Fill, Actions, Categories, Assets 표시
- 큰 타일셋 클릭 시 `TilePickerWindow` 연결
- 월드맵 패널을 lazy import로 연결
- `WorldCellDraftStore`를 직접 생성/보관
- 저장/불러오기/JSON에서 직접 `EditorWorldSaveActions`를 import해 실행

문제점:

- UI 패널이 월드맵 상태와 저장 상태를 직접 보관한다.
- 전역 변수 `worldMapGrid`, `worldMapPanel`, `worldCellStore`가 UI 파일 안에 있다.
- 저장/불러오기/JSON 정책이 UI 컴포넌트 내부에 있다.
- 임시 안내문이 남아 있다.
- `DEFAULT_FALLBACK_ASSET.url`이 빈 문자열이다.
- `as never` 캐스팅이 존재한다.
- Monsters 탭은 아직 실제 기능과 연결되지 않았다.

정리 방향:

- 월드맵과 저장 로직은 별도 controller/session으로 분리한다.
- Classic UI는 session의 메서드만 호출한다.
- 전역 상태는 `MapEditorSession` 같은 명시적 세션 객체로 이동한다.
- `ClassicTilesPanelLite`는 버튼/DOM 표시만 담당하게 축소한다.

### WorldCellDraftStore

현재 역할:

- 셀별 `EditorMapDraft` 저장
- 셀 전환 시 현재 draft 저장 후 대상 draft 로드
- 서버 `GameWorldMap`을 store에 복원
- `EditorWorldSave` snapshot 생성
- knownCellKeys로 셀 좌표 추적

문제점:

- 새로 추가된 임시 store다.
- 기존 구조의 공식 source of truth인지 아직 확정되지 않았다.
- `WorldMapGrid`와 별도 셀 목록을 가지고 있어 중복 상태가 존재한다.
- 중복 상태는 0,0만 저장되는 문제의 직접 원인이 될 수 있다.

정리 방향:

- `MapEditorSession`이 셀 draft source of truth가 되고, `WorldMapGrid`는 표시/선택용 view model로 사용한다.
- 저장 전 검증 메서드를 추가한다.

### EditorWorldSaveActions

현재 역할:

- `EditorWorldSave` 서버 저장
- 서버 `GameWorldMap` 불러오기
- 전체 월드 JSON export

문제점:

- 이름은 actions지만 실제로는 저장 service에 가깝다.
- Classic UI에서 직접 import해서 사용한다.
- 저장 전/후 검증 로직이 부족하다.

정리 방향:

- 저장/불러오기/JSON은 `MapEditorSession` 또는 persistence service에서 호출한다.
- 저장 전 `EditorWorldSave`의 cells 수와 placements 수를 검증한다.
- 저장 후 서버 GET 결과와 비교하는 검증 함수를 추가한다.

## 원래 구조와 현재 구조의 차이

### 차이 1: source of truth 분리

현재:

- `WorldMapGrid`가 셀 목록을 가진다.
- `WorldCellDraftStore`도 셀 목록을 가진다.
- `TilePlacementSystem.mapDraft`가 현재 화면의 placements를 가진다.
- `EditorApp`의 fallback 저장은 단일 셀만 저장한다.
- `ClassicTilesPanelLite`의 저장은 별도 전역 `worldCellStore`를 쓴다.

결과:

- 0,0 외 셀이 UI에 존재해도 저장 snapshot에 누락될 수 있다.

### 차이 2: UI 파일에 persistence 로직 누적

현재:

- `ClassicTilesPanelLite`가 저장/불러오기/월드맵 세션을 직접 관리한다.

결과:

- 기능이 붙을수록 UI 파일이 불안정해지고 기존 구조 복구와 멀어진다.

### 차이 3: safe boot fallback과 기존 기능 복구가 섞임

현재:

- safe boot에서 파생된 `ClassicTilesPanelLite`가 사실상 메인 복구 대상처럼 커졌다.

결과:

- 원래 UI와 구조 복원 대신 임시 UI 확장이 계속됐다.

### 차이 4: Monsters 탭 미복구

현재:

- Monsters 탭 버튼은 상태 메시지만 표시한다.

결과:

- 기존 기능 일부가 UI만 있고 실제 기능이 없다.

## 즉시 중단할 패치 방향

- `ClassicTilesPanelLite`에 더 많은 기능을 직접 추가하지 않는다.
- `WorldCellDraftStore`에 계속 임시 보정만 추가하지 않는다.
- 저장이 실패하는 원인을 상태 메시지만 보고 추측하지 않는다.
- 셀 저장 문제를 fallback 단일 셀 저장 경로로 우회하지 않는다.

## 다음 복구 방향

### 1단계: MapEditorSession 추가

새 모듈을 만든다.

예상 파일:

- `src/editor/MapEditorSession.ts`

책임:

- `EditorState`
- `TilePlacementSystem`
- `WorldMapGrid`
- 셀별 draft store
- 현재 셀 전환
- 전체 월드 snapshot
- 서버 저장/불러오기
- JSON export

`ClassicTilesPanelLite`는 이 session 객체의 메서드만 호출한다.

### 2단계: ClassicTilesPanelLite 책임 축소

- 전역 `worldMapGrid`, `worldMapPanel`, `worldCellStore` 제거
- 저장/불러오기/JSON 직접 import 제거
- `options.session.saveWorld()` 같은 메서드 호출로 변경
- 임시 안내문 제거

### 3단계: 저장 전 검증 강제

저장 전 다음 값을 비교한다.

- session known cell count
- worldMap grid cell count
- snapshot `EditorWorldSave.cells.length`
- compiled `GameWorldMap.cells.length`
- 각 cell placements count

불일치하면 저장을 중단하고 상태 메시지로 표시한다.

### 4단계: 0,0 외 셀 저장 회귀 테스트

필수 테스트:

1. 0,0에 grass 배치
2. 1,0으로 이동
3. 1,0에 dirt 배치
4. JSON export
5. JSON에 cells 2개 이상 존재 확인
6. 각 cell placements가 1개 이상인지 확인
7. 서버 저장
8. 새로고침
9. 불러오기
10. 0,0과 1,0 복원 확인

## 완료 전 판단 금지

다음 메시지가 나와도 완료로 보지 않는다.

- 패널 뜬다
- 버튼 작동한다
- 현재 셀은 저장된다
- JSON 파일이 다운로드된다

다음 조건이 만족되어야 완료다.

- 0,0 외 셀이 저장된다.
- 새로고침 후 불러오기로 0,0 외 셀이 복원된다.
- Monsters 탭이 실제로 동작한다.
- 임시 안내문/임시 누적 로직이 제거된다.
- 빌드가 통과한다.
