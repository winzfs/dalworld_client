# Map Editor Original Structure and Restore Plan

이 문서는 맵 에디터 기능을 임시로 재조립하지 않고, 원래 있던 기능과 구조를 기준으로 복구하기 위한 기준 문서다.

## 원칙

- 기존 기능을 임의로 삭제하거나 단순화하지 않는다.
- UI만 보이게 만드는 임시 복구를 완료로 간주하지 않는다.
- 저장, 불러오기, 월드맵 셀 전환은 하나의 source of truth를 사용해야 한다.
- `ClassicTilesPanelLite`에 기능을 계속 누적하지 않는다. 이 파일은 단계적 안전 부팅용이어야 하며, 최종 구조의 중심이 되어서는 안 된다.
- 월드맵, 타일 배치, 저장, 불러오기, 몬스터, 아이템은 각 전용 모듈이 책임을 가진다.
- 복구 전에는 기존 파일의 책임과 데이터 흐름을 확인하고 문서 기준에 맞는지 점검한다.

## 원래 있어야 하는 에디터 기능

### 패널 / UI

- 기존 UI 패널 열기
- Tiles 탭
- Monsters 탭
- 타일셋 카테고리 목록
- 선택한 카테고리의 타일/오브젝트 에셋 목록
- 타일셋 이미지 미리보기
- 큰 타일셋의 부분 선택 창
- 선택 영역을 브러시로 사용
- 선택된 레이어, 도구, 에셋의 active 표시
- 불필요한 임시 안내문 제거
- 기존 UI 배치와 버튼 그룹 유지

### 타일 편집

- Ground 레이어 배치
- Object 레이어 배치
- Collision/Block 레이어 배치
- Paint 도구
- Picker 도구
- Erase 도구
- Grid 표시 토글
- Grid 크기 변경
- Brush scale 변경
- Black 브러시
- 검정투명 옵션
- 전체 Fill
- 확률 기반 랜덤 Fill
- 전체삭제

### 타일셋 부분 선택

- 큰 이미지 에셋 클릭 시 `TilePickerWindow` 열기
- 이미지 크기와 그리드 기준으로 sourceRect 선택
- `EditorState.setSourceRect(asset, sourceRect)`로 선택 영역 저장
- 이후 배치 시 전체 이미지가 아니라 sourceRect만 배치
- 작은 단일 에셋과 단색 에셋은 직접 선택

### 월드맵

- `WorldMapGrid`가 셀 목록과 현재 셀을 관리
- `WorldMapPanel`이 셀 선택 UI를 담당
- 셀 추가/선택 시 현재 셀 draft를 저장하고 대상 셀 draft를 불러옴
- 0,0 외의 셀도 동일하게 편집 가능
- 셀 삭제 시 셀 목록과 draft 저장소가 함께 갱신
- 월드맵 패널의 셀 목록과 저장 대상 셀 목록이 항상 일치해야 함

### 저장 / 불러오기 / JSON

- 저장은 현재 화면의 단일 `mapDraft`만 저장하면 안 된다.
- 월드맵을 사용하는 경우 모든 셀 draft를 포함한 `EditorWorldSave`를 저장해야 한다.
- JSON export도 모든 셀 draft를 포함해야 한다.
- 불러오기는 서버의 `/maps/default` 또는 manifest/cell 조합에서 모든 셀을 복원해야 한다.
- 불러온 후 월드맵 셀 전환 시 각 셀의 placements가 복원되어야 한다.
- 저장 직전에는 현재 셀의 최신 draft를 반드시 반영해야 한다.
- 저장 직후 검증은 cells 좌표와 각 셀 placements 수를 비교해야 한다.

### 서버 저장 구조

현재 저장 경로는 다음 구조를 기준으로 한다.

- `PUT /maps/default/cell?gridX={x}&gridY={y}`
  - 셀 단위 compact payload 저장
- `PUT /maps/default/manifest`
  - 전체 셀 좌표 목록, tileSize, cellSize, map name 저장
- `GET /maps/default`
  - manifest와 cell payload를 조합한 `GameWorldMap` 반환
- `PUT /maps/default/monsters`
  - 몬스터 스폰 규칙 저장
- `PUT /maps/default/items`
  - 아이템 override 저장

## 핵심 데이터 타입

### EditorMapDraft

단일 셀 또는 단일 맵 화면의 편집 draft다.

- version
- name
- tileSize
- placements
- worldMap optional metadata

### EditorWorldSave

여러 월드맵 셀을 포함하는 저장 단위다.

- version
- name
- tileSize
- worldMap
- cells[]
  - gridX
  - gridY
  - draft

### GameWorldMap

서버 런타임에서 사용하는 월드맵 구조다.

- version
- name
- tileSize
- cellSize
- cells[]
  - gridX
  - gridY
  - placements
- monsterSpawnRules
- itemOverrides

## 원래 구조의 책임 분리

### EditorState

- 현재 선택 레이어
- 현재 도구 모드
- 현재 선택 에셋
- 현재 sourceRect
- brushScale
- gridSize
- gridVisible
- transparentBlack

### TilePlacementSystem

- 현재 화면의 placements 렌더링
- place/erase/pick/fill/random fill
- `mapDraft` 제공
- `replaceDraft()`로 현재 화면 draft 교체

### TilePickerWindow

- 큰 타일셋 이미지 표시
- sourceRect 선택
- 선택 결과를 `EditorState`에 반영

### WorldMapGrid

- 월드맵 셀 좌표 목록 관리
- 현재 셀 관리
- 셀 생성/삭제

### WorldMapPanel

- 월드맵 UI 표시
- 셀 선택/삭제 UI 이벤트 발생
- 직접 placement 저장 로직을 가져서는 안 됨

### World Cell Draft Store

- 셀 좌표별 `EditorMapDraft` 저장
- 셀 전환 시 현재 draft 저장 후 대상 draft 로드
- 저장 시 전체 셀 snapshot 생성
- `WorldMapGrid`와 셀 목록이 불일치하지 않도록 동기화

### uploadWorldMap / compileRuntimeWorldMap

- `EditorWorldSave`를 `GameWorldMap`으로 컴파일
- 셀별 compact payload 업로드
- manifest 업로드
- 저장 후 검증

## 복구 순서

1. 기존 기능 목록 문서화
2. 현재 임시 복구 코드와 기존 구조 차이 비교
3. 월드맵/저장 source of truth 정리
4. `ClassicTilesPanelLite`에서 누적된 임시 월드맵 저장 로직 분리
5. 원래 UI 패널 구성 복구
6. 타일셋 미리보기와 부분 선택 복구
7. 월드맵 셀 전환 복구
8. 전체 셀 저장/불러오기 복구
9. Monsters 탭 복구
10. Items/Resource/Monster spawn 저장 구조 확인
11. 안내문, 임시 버튼, 임시 fallback 제거
12. 빌드와 회귀 테스트 통과 후 완료 처리

## 금지할 임시 복구 방식

- 버튼만 보이게 만들고 실제 동작을 나중으로 미루는 방식
- `ClassicTilesPanelLite`에 저장/월드맵/타일셋/몬스터 로직을 계속 누적하는 방식
- 현재 셀 하나만 저장하면서 월드맵 저장이 된 것처럼 처리하는 방식
- `assetUrl: ''` 같은 저장 불가능한 placement를 생성하는 방식
- TypeScript 타입을 `as never`, `as unknown`으로 억지 통과시키는 방식
- 빌드 확인 없이 다음 기능을 추가하는 방식

## 회귀 테스트 체크리스트

### 빌드

- `npm run build` 통과
- TypeScript 오류 없음
- Vite build 오류 없음

### 기본 타일 편집

- 기존 UI 패널이 멈추지 않고 열린다.
- Ground/Object/Collision 레이어 active 표시가 정상이다.
- Paint/Pick/Erase 도구 active 표시가 정상이다.
- 에셋 선택 후 맵에 배치된다.
- Picker로 기존 타일을 찍으면 해당 에셋/레이어가 선택된다.
- Erase로 배치가 삭제된다.

### 타일셋

- 카테고리 목록이 표시된다.
- 카테고리 클릭 시 에셋 목록이 표시된다.
- 큰 타일셋 클릭 시 선택 창이 열린다.
- sourceRect 선택 후 일부 타일만 배치된다.

### Fill

- 전체 Fill이 현재 선택 에셋으로 채운다.
- 랜덤 Fill이 확률값을 반영한다.
- Fill 결과가 저장/불러오기 후 유지된다.

### 월드맵

- 월드맵 패널이 열린다.
- 0,0에 타일을 배치한다.
- 1,0으로 이동하면 독립 draft가 표시된다.
- 1,0에 다른 타일을 배치한다.
- 0,0으로 돌아오면 기존 0,0 타일이 복원된다.
- 1,0으로 돌아오면 기존 1,0 타일이 복원된다.

### 저장/불러오기

- 0,0과 1,0에 각각 다른 타일을 배치한다.
- 저장 시 상태 메시지에 `cells=2` 이상과 좌표 목록이 표시된다.
- JSON export에서 `cells`가 2개 이상이다.
- 각 cell draft의 placements가 비어 있지 않다.
- 새로고침 후 불러오기하면 0,0과 1,0이 각각 복원된다.
- 서버 GET `/maps/default` 결과의 cells에도 0,0과 1,0이 존재한다.

### Monsters

- Monsters 탭이 열린다.
- 몬스터 목록이 표시된다.
- 스폰 규칙 편집이 가능하다.
- 저장 후 `/maps/default/monsters`에 반영된다.
- 불러오기 후 스폰 규칙이 복원된다.

## 현재 문제 기록

### 문제: 0,0 셀만 저장됨

증상:

- 0,0 외 다른 셀에 타일을 배치해도 저장 후 복원되지 않음
- 저장 snapshot 또는 서버 manifest가 0,0만 포함하는 것으로 보임

확인해야 할 지점:

- 셀 전환 시 `WorldCellDraftStore.switchTo()`가 반드시 호출되는지
- 저장 직전 `snapshotWorldSave()`의 cells 좌표가 2개 이상인지
- `compileRuntimeWorldMap()` 결과의 cells 좌표가 2개 이상인지
- `uploadWorldMap()`이 PUT하는 cell 좌표가 2개 이상인지
- 서버 manifest가 여러 셀을 유지하는지
- GET `/maps/default`가 manifest 전체 셀을 조합해서 반환하는지

해결 방향:

- 월드맵 셀 목록의 source of truth를 하나로 정한다.
- `WorldMapGrid`, `WorldCellDraftStore`, 저장 snapshot 간 중복 상태를 제거하거나 명확히 동기화한다.
- 저장 직전 검증에서 cells 수와 각 cell placements 수가 기대와 다르면 저장을 중단하고 상태 메시지로 원인을 표시한다.

## 완료 기준

다음 조건을 모두 만족해야 복구 완료로 본다.

- 빌드 통과
- 기존 UI가 멈추지 않음
- 기존 기능 목록의 모든 항목 동작
- 0,0 외 다른 월드맵 셀 저장/불러오기 성공
- JSON export와 서버 저장 결과가 동일한 셀 목록을 가짐
- Monsters 탭까지 기존 기능 복구
- 임시 안내문과 임시 버튼 제거
- `ClassicTilesPanelLite`가 최종 복구의 중심이 아니라 안전 fallback 역할로만 남음
