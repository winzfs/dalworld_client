# Feature Template: Item / Recipe

아이템 또는 제작 레시피를 추가할 때 사용하는 체크리스트다.
클라이언트는 UI 표시와 제작 요청 전송만 담당하고, 재료 검증과 결과 지급은 서버가 담당한다.

## 1. 목적

- 아이템/레시피 ID:
- 용도:
- 획득 방법:
- 제작 가능 여부:
- 밸런스 의도:

## 2. Client 작업

- [ ] 아이템 표시명/아이콘/설명 추가
- [ ] 인벤토리 UI 표시 확인
- [ ] 제작 UI 표시 확인
- [ ] 제작 버튼은 서버 요청만 전송
- [ ] 클라이언트에서 재료 차감/결과 지급을 확정하지 않음
- [ ] 서버 inventory snapshot 수신 후 UI 반영
- [ ] 모바일 UI 표시 확인

## 3. Server 연동 확인

- [ ] server item definition 추가
- [ ] server recipe definition 추가
- [ ] 서버 재료 검증 확인
- [ ] 서버 인벤토리 변경 확인
- [ ] 실패 시 안전한 응답/event 확인
- [ ] 향후 D1 영속화 영향 확인

## 4. Protocol / Shared Data

- [ ] client/server item id 일치
- [ ] recipe id 일치
- [ ] 새 snapshot/event 필요 여부 확인
- [ ] `npm run check:protocol` 통과

## 5. 검증

- [ ] `npm run check`
- [ ] 재료 충분/부족 케이스 확인
- [ ] 제작 성공 후 서버 snapshot 반영 확인
- [ ] 제작 실패 시 클라이언트 UI가 잘못 확정하지 않는지 확인
- [ ] 기존 인벤토리/제작 UI 회귀 확인
- [ ] 관련 문서 갱신
