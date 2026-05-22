# Map Editor Boot Stability Guide

Last updated: 2026-05-22

이 문서는 `/editor`, `/editor.html`, `?editor=1` 맵 에디터가 모바일 브라우저에서 빈 화면 또는 로딩 멈춤 상태로 재발하지 않도록 하기 위한 기준 문서다.

## 1. 배경

2026-05-22 모바일 Chrome/Android 환경에서 맵 에디터가 다음 지점들에서 순차적으로 멈추는 문제가 있었다.

```txt
MapEditor import started...
EditorMinimap import started...
LightweightEditorRuntime import started...
createLightweightEditorRuntime import started...
EditorGridOverlay import started...
TilesetPanel import started...
```

Pixi/WebGL 자체는 정상 초기화되었고, 배경 그리드도 렌더링되었다. 실제 원인은 렌더러가 아니라 에디터 부팅 경로에서 여러 UI/런타임 모듈을 큰 단위로 동적 import하고 평가하던 구조였다.

## 2. 결론

맵 에디터 부팅 경로는 항상 작고 안정적인 최소 경로를 유지해야 한다.

현재 안정화된 기본 부팅 경로는 다음을 원칙으로 한다.

```txt
EditorApp
  -> Pixi Application init
  -> 기본 배경/그리드 표시
  -> EditorState import
  -> TilePlacementSystem import
  -> EditorApp 내부 최소 DOM 패널 생성
  -> 기본 fallback tile 선택
  -> 터치/드래그 배치 가능 상태 진입
```

부팅 직후 필수 경로에 넣지 않는 것:

```txt
MapEditor
EditorMinimap
EditorGridOverlay
TilesetPanel
LightweightEditorRuntime
createLightweightEditorRuntime
WorldMapPanel
TilePickerWindow
EditorTabServerSaves
```

이 모듈들은 기능별 지연 로드 또는 더 작은 모듈로 분해한 뒤 단계적으로 복구해야 한다.

## 3. 현재 최소 에디터 기능

현재 `/editor`는 모바일 안정화를 위해 `EditorApp.ts` 내부 최소 패널로 부팅한다.

지원 기능:

- 기본 잔디/흙 fallback tile 선택
- 터치/드래그 타일 배치
- 전체 채우기
- 지우기
- JSON Export
- `실제 타일셋 불러오기` 버튼으로 `tilesetManifest` 지연 로드
- 카테고리별 실제 에셋 선택 및 배치

아직 정식 복구가 필요한 기능:

- 서버 저장/불러오기
- 정식 Tiles/Monsters/Items 탭 UI
- 월드맵 패널
- 미니맵
- 고급 타일 피커
- 전체 `MapEditor.ts` 기반 조립 구조

## 4. 재발 방지 규칙

### 4.1 부팅 경로에 무거운 모듈을 추가하지 않는다

`EditorApp.start()`부터 `Minimal editor ready`까지의 경로에는 다음을 추가하지 않는다.

- 대형 UI 패널 import
- 여러 editor 모듈을 다시 export/import하는 wrapper/factory 모듈
- 미니맵, 월드맵, 서버 저장 UI
- tileset 전체 UI
- 게임 모드 전용 시스템

특히 다음처럼 여러 의존성을 한 파일에 정적 import한 뒤 그 파일 하나를 동적 import하는 구조를 피한다.

```txt
EditorApp
  -> import('./SomeEditorRuntime')
       -> import TilesetPanel
       -> import EditorGridOverlay
       -> import EditorMinimap
       -> import WorldMapPanel
```

문제가 재발하면 어느 하위 모듈에서 멈추는지 다시 보이지 않게 된다.

### 4.2 기능은 버튼/사용자 액션 이후 지연 로드한다

부팅에 필요 없는 기능은 사용자가 버튼을 눌렀을 때만 import한다.

예시:

```txt
실제 타일셋 불러오기 클릭
  -> import('./tilesetManifest')
  -> 단순 버튼 목록 렌더링
```

향후 저장/불러오기, 미니맵, 월드맵 패널도 같은 방식으로 단계적으로 붙인다.

### 4.3 지연 로드 단위는 작게 유지한다

기능을 되살릴 때는 한 번에 `MapEditor.ts` 전체를 되살리지 않는다.

권장 순서:

1. 최소 에디터 부팅 유지
2. `tilesetManifest`처럼 데이터성 모듈만 지연 로드
3. 서버 저장/불러오기를 독립 helper로 지연 로드
4. 모바일용 단순 에셋 선택 UI 추가
5. 월드맵/미니맵은 별도 기능 버튼 뒤에서 로드
6. 기존 `MapEditor.ts`는 작은 조립 단위로 분해한 뒤 교체

### 4.4 Boot/status overlay는 에러 확인 전 제거하지 않는다

부팅 중 오류가 화면에 보이지 않는 상태를 만들면 안 된다.

원칙:

- 부팅 단계별 상태 문구를 유지한다.
- `window.onerror`, `unhandledrejection`이 사용자 화면에 표시될 수 있어야 한다.
- Pixi init 전/후, 각 import 전/후의 상태 문구를 남긴다.
- 에디터가 준비되기 전에는 root/overlay를 완전히 제거하지 않는다.

### 4.5 모바일 실기기 검증을 필수로 본다

데스크톱에서 import가 성공해도 모바일 Chrome/Android에서 멈출 수 있다.

에디터 관련 변경 후 확인할 것:

- `/editor`
- `/editor.html`
- `?editor=1`
- 일반 게임 모드 진입
- 모바일 Chrome 일반 탭
- 가능하면 시크릿 탭

최소 확인 문구:

```txt
Minimal editor ready. Panel count: 1
```

그리고 실제 타일이 찍히는지 확인한다.

## 5. 에디터 복구 우선순위

정식 맵 에디터 기능은 다음 순서로 복구한다.

1. 최소 에디터 유지 상태에서 저장/불러오기 복구
2. 실제 tilesetManifest 선택 UI 개선
3. 에셋 목록 접기/펼치기, 검색, 카테고리 필터 추가
4. 삭제 모드, 브러시 크기, 드래그 이동 개선
5. Monsters/Items 탭을 별도 지연 로드 UI로 복구
6. 월드맵/미니맵을 별도 지연 로드로 복구
7. `MapEditor.ts`의 책임을 작은 모듈로 분해
8. 최소 부팅 경로와 정식 에디터 기능을 명확히 분리

## 6. 금지 패턴

다음 변경은 재발 위험이 크므로 피한다.

```txt
- EditorApp.start()에서 MapEditor 전체 import
- EditorApp.start()에서 TilesetPanel 전체 import
- EditorApp.start()에서 EditorMinimap import
- EditorApp.start()에서 EditorGridOverlay import
- 여러 editor 모듈을 한 wrapper 파일로 묶고 wrapper만 동적 import
- 부팅 상태 패널 제거 후 실제 에디터 준비
- 모바일 검증 없이 데스크톱 빌드 성공만 보고 완료 처리
```

## 7. 권장 체크리스트

맵 에디터 코드를 수정할 때는 완료 전 반드시 확인한다.

- [ ] `/editor`가 모바일에서 `Minimal editor ready`까지 도달하는가?
- [ ] fallback 잔디/흙 타일이 찍히는가?
- [ ] 실제 타일셋 불러오기 버튼이 부팅을 막지 않는가?
- [ ] 새로 추가한 기능이 부팅 경로가 아니라 사용자 액션 뒤에서 로드되는가?
- [ ] import 실패/timeout 시 화면에 문구가 보이는가?
- [ ] 일반 게임 모드에 에디터 UI가 노출되지 않는가?
- [ ] 기존 서버 권위 구조를 깨지 않는가?
- [ ] 관련 문서를 갱신했는가?
