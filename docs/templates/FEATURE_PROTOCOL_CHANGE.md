# Feature Template: Protocol Change

프로토콜을 변경할 때 사용하는 체크리스트다.
클라이언트와 서버 메시지는 반드시 호환되어야 하며, 가능한 optional 필드로 확장한다.

## 1. 변경 목적

- 변경 이유:
- 관련 기능:
- 기존 메시지로 처리할 수 없는 이유:

## 2. 변경 범위

- [ ] client `src/protocol/messages.ts`
- [ ] server `src/protocol/messages.ts`
- [ ] client 메시지 송신 코드
- [ ] server 메시지 처리 코드
- [ ] server snapshot/event broadcast 코드
- [ ] client event/snapshot 처리 코드
- [ ] 관련 문서

## 3. 호환성 원칙

- [ ] 기존 메시지 의미를 바꾸지 않는다
- [ ] 새 필드는 가능한 optional로 추가한다
- [ ] 기존 클라이언트가 받을 수 없는 필드 추가를 피한다
- [ ] requestId가 필요한 요청인지 확인한다
- [ ] 실패 응답/event가 필요한지 확인한다

## 4. Client 확인

- [ ] 알 수 없는 event/message를 안전하게 무시하거나 로그 처리
- [ ] 서버 거절 이벤트 처리
- [ ] snapshot 누락 필드에 대한 fallback 확인
- [ ] UI가 서버 응답 전에 상태를 확정하지 않음

## 5. Server 확인

- [ ] 메시지 구조 검증
- [ ] 클라이언트 입력값 신뢰 금지
- [ ] 실패 케이스 응답
- [ ] broadcast 순서 확인
- [ ] storage 영향 확인

## 6. 검증

- [ ] `npm run check:protocol`
- [ ] client `npm run check`
- [ ] server `npm run check`
- [ ] 구버전/누락 필드 fallback 확인
- [ ] 관련 문서 갱신
