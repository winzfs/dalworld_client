## 변경 내용

-

## 관련 문서 확인

- [ ] `README.md`
- [ ] `docs/AI_WORKFLOW.md`
- [ ] `docs/CURRENT_SYSTEM_STATUS.md`
- [ ] `docs/ARCHITECTURE_GUIDE.md`
- [ ] 관련 도메인 문서

## 서버 권위 구조 확인

- [ ] 클라이언트가 아이템/채집/건설/전투/사망/리스폰을 최종 확정하지 않는다.
- [ ] 서버 snapshot/event 이후에만 실제 월드 상태를 반영한다.
- [ ] 서버 거절 이벤트 또는 실패 케이스 UX를 고려했다.

## 프로토콜 변경

- [ ] 프로토콜 변경 없음
- [ ] 프로토콜 변경 있음: `dalworld_server/src/protocol/messages.ts`도 함께 수정했다.
- [ ] 새 필드는 가능한 optional로 추가했다.

## 검증

- [ ] `npm run check` 통과
- [ ] 모바일 입력 영향을 확인했다.
- [ ] 기존 기능을 임의로 삭제하거나 약화하지 않았다.
- [ ] 관련 문서를 갱신했다.
