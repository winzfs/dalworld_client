# Feature Template: Building Part

새 건설 부품을 추가할 때 사용하는 체크리스트다.
클라이언트는 표시, 입력, 고스트, 요청 전송만 담당하고 최종 배치 판정은 서버가 담당한다.

## 1. 목적

- 부품명:
- 용도:
- 사용 가능한 상황:
- 플레이어가 기대하는 조작:

## 2. Client 작업

- [ ] 클라이언트 건설 부품 정의 추가
- [ ] asset/tileset/manifest 경로 확인
- [ ] 2:1 isometric 기준 정렬 확인
- [ ] 고스트 미리보기 표시 확인
- [ ] 회전값 표시 확인
- [ ] 층 변경 표시 확인
- [ ] zIndex / occlusion 영향 확인
- [ ] 모바일 건설 UI 조작성 확인
- [ ] 서버 거절 시 실제 월드에 반영하지 않음

## 3. Server 연동 확인

- [ ] server building part definition에도 같은 `partId` 추가
- [ ] 서버 allowedOn 검증 존재
- [ ] 서버 rotation 검증 존재
- [ ] 서버 점유/충돌 검증 존재
- [ ] 서버 비용/재료 검증 존재
- [ ] 서버 지지대 조건 검증 필요 여부 확인
- [ ] 서버 성공 이벤트 수신 후에만 실제 렌더링 반영

## 4. Protocol / Shared Data

- [ ] 새 메시지 타입이 필요한지 확인
- [ ] 기존 메시지 optional 필드로 확장 가능한지 확인
- [ ] client/server `src/protocol/messages.ts` 호환 확인
- [ ] `npm run check:protocol` 통과

## 5. Asset 기준

- [ ] 64x32 기본 타일 기준에 맞는지 확인
- [ ] 한 층 높이 56px 기준과 어긋나지 않는지 확인
- [ ] 방향별 r0/r1/r2/r3 필요 여부 확인
- [ ] 투명 배경 확인
- [ ] 불필요한 글자/라벨 없음

## 6. 검증

- [ ] `npm run check`
- [ ] 데스크톱 배치/회전/취소 확인
- [ ] 모바일 배치/회전/취소 확인
- [ ] 서버 거절 케이스 확인
- [ ] 기존 건설 부품 회귀 확인
- [ ] 관련 문서 갱신
