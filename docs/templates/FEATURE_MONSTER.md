# Feature Template: Monster

새 몬스터를 추가할 때 사용하는 체크리스트다.
클라이언트는 렌더링, 애니메이션, UI 표시, 서버 이벤트 반영만 담당한다.
몬스터 AI, 공격, 피해, 사망, 보상은 서버가 최종 판정한다.

## 1. 목적

- 몬스터 ID:
- 역할:
- 등장 위치/조건:
- 기본 행동:
- 전투 여부:

## 2. Client 작업

- [ ] 몬스터 표시 asset 추가
- [ ] MonsterRenderer에서 표시 가능 여부 확인
- [ ] idle/walk/attack/hit/death 애니메이션 필요 여부 확인
- [ ] 서버 snapshot의 `MonsterType`과 일치
- [ ] HP bar / 상태 표시 필요 여부 확인
- [ ] 공격 이펙트는 서버 이벤트 수신 후 표시
- [ ] 클라이언트에서 타겟 선택/AI를 확정하지 않음
- [ ] 클라이언트에서 피해/사망/보상 확정하지 않음

## 3. Server 연동 확인

- [ ] server `MonsterType` 추가
- [ ] 서버 spawn 규칙 확인
- [ ] 서버 AI 규칙 확인
- [ ] 서버 공격/피해/사망/보상 규칙 확인
- [ ] snapshot 필드가 클라이언트 렌더링에 충분한지 확인

## 4. Protocol / Shared Data

- [ ] client/server `MonsterType` 일치
- [ ] 새 상태값이 필요한지 확인
- [ ] 새 event가 필요한지 확인
- [ ] 기존 메시지 optional 필드로 확장 가능한지 확인
- [ ] `npm run check:protocol` 통과

## 5. Asset 기준

- [ ] 방향별 스프라이트 필요 여부 확인
- [ ] 32x32 또는 프로젝트 기준 타일 크기 명시
- [ ] 프레임 수와 배치 규칙 명시
- [ ] 투명 배경 또는 지정 배경 확인
- [ ] 게임 스타일과 실루엣 가독성 확인

## 6. 검증

- [ ] `npm run check`
- [ ] 서버 snapshot 수신 후 렌더링 확인
- [ ] 몬스터 이동/상태 변경 표시 확인
- [ ] 기존 몬스터 렌더링 회귀 확인
- [ ] 관련 문서 갱신
