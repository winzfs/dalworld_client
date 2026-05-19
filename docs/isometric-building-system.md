# DalWorld Isometric Building System - Client Design

## 목적

DalWorld의 건설 시스템은 완성된 건물 이미지를 단순 배치하는 방식이 아니라, 작은 isometric 부품을 선택하고 쌓아서 건물을 만드는 구조를 목표로 한다.

클라이언트는 건설 결과를 확정하지 않는다. 클라이언트는 입력, 미리보기, 렌더링, 사용자 피드백만 담당한다. 최종 배치 가능 여부와 월드 상태 확정은 서버가 담당한다.

## 기본 원칙

1. Pixi.js v8 기준으로 구현한다.
2. 클라이언트는 서버가 내려준 확정 이벤트만 실제 월드에 반영한다.
3. 클라이언트의 건설 미리보기는 편의 기능이며, 최종 판정 근거가 아니다.
4. 건설 좌표는 2D 화면 좌표가 아니라 `x, y, z` 그리드 좌표를 기준으로 관리한다.
5. 렌더링은 isometric 변환과 zIndex 정렬을 통해 처리한다.
6. 부품 데이터는 확장 가능한 정의 기반 구조로 관리한다.
7. 기존 기능을 침범하지 않도록 건설 관련 모듈을 독립 영역으로 분리한다.

## 클라이언트 책임 범위

클라이언트가 담당하는 것:

- 건설 부품 선택 UI
- 마우스 또는 터치 위치를 그리드 좌표로 변환
- 현재 선택 부품의 미리보기 표시
- 배치 가능 예상 표시
- 서버에 건설 요청 전송
- 서버 이벤트 수신 후 실제 렌더링 반영
- 철거, 회전, 층 선택 입력 처리

클라이언트가 담당하지 않는 것:

- 실제 배치 가능 여부 최종 판정
- 재료 소모 최종 처리
- 충돌/길막 최종 검증
- 소유권 검증
- 다른 플레이어 월드 상태 확정
- AI 이동 가능 영역 최종 계산

## 권장 폴더 구조

```txt
src/
  building/
    client/
      BuildingInputController.ts
      BuildingPreviewRenderer.ts
      BuildingRenderer.ts
      BuildingToolbar.ts
      BuildingSelectionState.ts
    shared/
      buildingTypes.ts
      buildingParts.ts
      isoMath.ts
      buildingProtocol.ts
    assets/
      buildingAssetManifest.ts
```

서버와 공통으로 맞춰야 하는 타입은 가능하면 `shared` 계층에 둔다. 클라이언트와 서버가 별도 저장소이므로, 완전한 패키지 공유가 준비되기 전까지는 프로토콜 문서와 타입 이름을 엄격히 맞춘다.

## 좌표 기준

내부 건설 좌표는 다음 기준을 사용한다.

```txt
x: isometric grid x
y: isometric grid y
z: 층 또는 높이 레벨
rotation: 0, 1, 2, 3
```

화면 렌더링은 다음 기준으로 계산한다.

```txt
screenX = (x - y) * tileWidth / 2
screenY = (x + y) * tileHeight / 2 - z * layerHeight
```

초기 권장값:

```txt
tileWidth: 64
tileHeight: 32
layerHeight: 32
```

이 값은 에셋 제작, 마우스 피킹, zIndex 정렬의 기준이므로 중간에 쉽게 바꾸지 않는다.

## 최소 건설 부품 세트

초기 버전에서는 다음 부품만 지원한다.

```txt
floor_1x1
wall_ne
wall_nw
corner
column
stair
roof
door
```

초기 목표는 부품 수를 늘리는 것이 아니라, 다음 흐름이 안정적으로 작동하는지 검증하는 것이다.

```txt
선택 -> 미리보기 -> 서버 요청 -> 서버 검증 -> 확정 이벤트 수신 -> 렌더링
```

## 부품 정의에 필요한 정보

각 부품은 최소한 다음 정보를 가진다.

```txt
id
category
size
spriteKey
anchor
blocksMovement
requiresSupport
allowedOn
allowStackSameCell
```

클라이언트는 `spriteKey`, `anchor`, `category`를 주로 사용한다. 서버는 `blocksMovement`, `requiresSupport`, `allowedOn`, `size`를 주로 사용한다.

## 렌더링 규칙

모든 건설 부품은 별도의 `BuildingRenderer`에서 관리한다.

렌더링 정렬 기준:

```txt
zIndex = (x + y) * majorSortUnit + z * layerSortUnit + localOffset
```

권장값:

```txt
majorSortUnit: 10000
layerSortUnit: 1000
```

캐릭터, 몬스터, 건설물, 장식물이 같은 월드 컨테이너에서 정렬될 경우 동일한 zIndex 규칙을 공유해야 한다.

## 미리보기 규칙

미리보기는 다음 상태를 표현한다.

```txt
초록색: 클라이언트 예측상 배치 가능
빨간색: 클라이언트 예측상 배치 불가
반투명: 아직 서버에서 확정되지 않음
```

중요: 초록색 미리보기라도 서버가 거절할 수 있다. 서버 거절 이벤트가 오면 클라이언트는 실제 월드에 반영하지 않고 실패 피드백만 표시한다.

## 서버 이벤트 반영 규칙

클라이언트는 다음 이벤트를 기준으로 실제 렌더링을 갱신한다.

```txt
BUILD_PLACED
BUILD_REMOVED
BUILD_REJECTED
BUILD_SNAPSHOT
```

초기 접속 시 서버에서 전체 건설 상태 스냅샷을 받아 로컬 렌더링을 복구해야 한다.

## UI 흐름

초기 UI는 복잡하게 만들지 않는다.

필수 기능:

```txt
1번: 바닥 선택
2번: 벽 NE 선택
3번: 벽 NW 선택
4번: 기둥 선택
5번: 계단 선택
6번: 지붕 선택
R: 회전
PageUp: 층 올리기
PageDown: 층 내리기
좌클릭: 배치 요청
우클릭 또는 철거 모드: 철거 요청
```

나중에 툴바 UI로 교체하더라도 입력 상태 구조는 유지한다.

## 구현 단계

### 1단계

- isometric grid hover 표시
- `floor_1x1` 미리보기
- 서버 요청 전송
- 서버 확정 이벤트 수신 후 렌더링

### 2단계

- 벽, 기둥, 계단, 지붕 추가
- 층 선택 추가
- 회전 상태 추가
- 클라이언트 예측 검증 추가

### 3단계

- 철거 모드 추가
- 서버 거절 사유 UI 표시
- 접속 시 건설 상태 스냅샷 동기화

### 4단계

- 2x2, 1x2 등 다중 셀 부품 지원
- 지붕 자동 연결
- 벽 자동 변형
- 경로 탐색과 충돌 정보 연동

## 주의할 버그 가능성

- screenToGrid 변환 오차로 마우스 위치가 한 칸 어긋나는 문제
- zIndex 정렬 오류로 벽과 캐릭터가 앞뒤로 뒤집히는 문제
- 서버 거절 후 클라이언트 미리보기와 실제 상태가 불일치하는 문제
- 동일 좌표에 중복 배치되는 문제
- 층이 다른 부품이 같은 화면 위치에 겹쳐 보이는 문제
- 큰 부품 추가 시 기존 1x1 전제 로직이 깨지는 문제

## 확장 방향

초기 구조가 안정화되면 다음 기능을 추가한다.

```txt
건물 프리셋
청사진 저장
길/도로 시스템
실내 가구 배치
방어 시설
농장/생산 건물
플레이어 소유권 기반 편집 권한
몬스터 이동 경로와 건설물 충돌 연동
```

## 최종 기준

클라이언트는 건설 시스템의 조작감과 시각 피드백을 담당한다. 서버가 확정하지 않은 건설물은 실제 월드 상태로 취급하지 않는다. 모든 구현은 이 기준을 우선한다.
