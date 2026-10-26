# 프로젝트 파일 구조

## types/

| 파일 | 역할 |
|------|------|
| `room.ts` | 방 시트 관련 타입. `Room`, `Passage`, `HiddenElement`, `Coordinate` 등 정의. 스토리 팀이 작성한 JSON의 구조와 일치해야 함. |
| `judgment.ts` | 판정 관련 타입. `CheckType`(판정 종류), `Attribute`(능력치), `Difficulty`(난이도), `JudgmentRequest`(AI 판정 출력), `DiceResult`(코드 계산 결과) 정의. |
| `state.ts` | 회차 상태 타입. `RunState`(게임 진행 상태), `Player`, `CompanionState`, `StateChangeProposal`(AI가 서술 끝에 제안하는 변경사항) 정의. |

## data/

| 파일/폴더 | 역할 |
|-----------|------|
| `rules.ts` | 게임 규칙 상수. 난이도별 DC표, 승인 점수 단계 문턱값, 한 턴 승인 변동 최대치, 서술 최대 글자 수 등. 밸런스 조정 시 이 파일만 수정. |
| `rooms/` | 방 시트 JSON 파일 보관 폴더. 구글 시트 → JSON 변환 결과물이 여기 들어옴. `room_example.json`은 구조 참고용 더미. |

## lib/

| 파일 | 역할 |
|------|------|
| `dice.ts` | 주사위 계산. `rollD20()`으로 1~20 난수 생성, `resolveCheck()`로 판정 요청 + 능력치 보정을 받아 `DiceResult` 반환. |
| `secrets.ts` | 비밀 정보 필터링. 판정 단계용(`getRoomForJudgment`)은 숨겨진 요소 전체 포함, 서술 단계용(`getRoomForNarration`)은 이번 턴 발견된 것만 포함. 미발견 숨겨진 통로 처리(`getPassageState`)도 담당. |
| `engine.ts` | 턴 흐름 조율. `runDice()`로 주사위 굴리기, `applyStateChanges()`로 AI 제안 검증 후 `RunState`에 반영. 승인 점수 단계 계산, 로그 기록 포함. |

## app/api/

| 파일 | 역할 |
|------|------|
| `judge/route.ts` | AI 판정 호출 엔드포인트. 플레이어 행동 + 방 시트(숨겨진 요소 전체)를 Claude에게 전달 → `JudgmentRequest` JSON 반환. |
| `narrate/route.ts` | AI 서술 호출 엔드포인트. 판정 결과 + 주사위 결과 + 방 시트(발견된 것만)를 Claude에게 전달 → 서술 텍스트 + 상태변경 태그 반환. |

## components/

| 파일 | 역할 |
|------|------|
| `ChatWindow.tsx` | 대화 내역 출력. `Message[]`를 받아 GM/플레이어 메시지를 구분해서 표시. 새 메시지 추가 시 자동 스크롤. |
| `InputBox.tsx` | 플레이어 입력창. Enter 전송 / Shift+Enter 줄바꿈. 처리 중(`disabled`)에는 입력 차단. |
| `SystemAlert.tsx` | 웹툰식 시스템 창 팝업. 판정 종류/주사위 결과/DC/성공 여부를 게임 UI처럼 보여줌. 성공은 청록, 실패는 붉은 색상. 클릭으로 닫기. |

## 턴 흐름 요약

```
플레이어 입력
  → POST /api/judge   (방 전체 시트 포함)
  → lib/dice.ts 주사위 계산
  → SystemAlert 팝업 표시
  → POST /api/narrate (발견된 요소만 포함)
  → lib/engine.ts 상태 반영
  → ChatWindow 서술 출력
```

## 아직 없는 것 (추후 추가)

- `app/page.tsx` — 메인 게임 페이지 (위 컴포넌트 조합)
- `data/rooms/*.json` — 실제 스토리 방 시트
- API 키 입력 UI (사용자가 직접 입력)
- 회차 상태 저장/불러오기 (localStorage or Supabase)
- 동료 시트, 아이템 시트
