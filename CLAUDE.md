# CLAUDE.md — Tower TRPG 인수인계

## 핵심 설계 결정

**"코드가 판정, AI는 서술만"**

- 플레이어가 선택지를 고르면 코드가 태그를 보고 직접 주사위를 굴리고 결과를 계산한다.
- AI(Claude)는 그 결과를 받아 서술만 한다. 판정을 AI에게 맡기지 않는다.
- 이유: AI가 판정까지 하면 일관성이 무너지고 결과를 조작하기 쉬워짐.

**프롬프트 아키텍처: persistent 캐시 + dynamic 조건부 로드**

- `data/pages/persistent/` — 매 턴 동일하게 들어가는 문서 (캐싱 대상)
- `data/pages/floors/`, `npcs/` — 현재 층/동료 상태에 따라 조건부 로드
- `app/api/gm/route.ts`에서 persistent 블록에 `cache_control: ephemeral` 마킹

---

## 턴 흐름 (4단계 Phase)

```
[idle] 선택지 버튼 표시, 입력 대기
  ↓ 플레이어가 선택지 클릭
  → resolveAction(tag, target, state)  ← 코드가 주사위 계산
  → 주사위 있으면 [rolled] + SystemAlert 팝업
  → 팝업 닫으면 (또는 판정 없으면 즉시)
[calling_gm] POST /api/gm 호출
  body: { state, resolution, recentHistory(최근 6개), playerInput, event? }
  ↓
[awaiting_apply] GM 응답 완료, 선택지 파싱됨
  → "상태 반영 + 출력 →" 버튼 클릭
  → applyStateChanges() + extractNarration()
[idle] 서술 출력, 새 선택지 표시
```

선택지 없는 응답(결말 등)은 `awaiting_apply` 없이 바로 출력.

---

## 파일 역할

### types/
| 파일 | 역할 |
|------|------|
| `judgment.ts` | CheckType, Attribute, Difficulty, DiceResult |
| `state.ts` | RunState, Player, CompanionState, EnemyState, StateChangeProposal |
| `room.ts` | 방 시트 JSON 구조 (아직 실제 데이터 없음) |

### data/
| 파일/폴더 | 역할 |
|-----------|------|
| `rules.ts` | DC표, ACTION_TAG_RULES(태그→판정종류/능력치/난이도), 승인 점수 상수. 밸런스 조정은 여기만 |
| `pages/persistent/` | 항상 시스템 프롬프트에 포함되는 문서 7개 (캐싱 대상) |
| `pages/floors/` | floor-1.md ~ floor-5.md, 현재 층일 때만 로드 |
| `pages/npcs/` | garret/lira/pio/knight-masked/knight-revealed/witch-mom/endings/run-frame.md, 조건부 로드 |
| `rooms/` | 방 시트 JSON (room_example.json만 있고 실제 데이터 미작성) |

### lib/
| 파일 | 역할 |
|------|------|
| `resolveAction.ts` | 선택지 태그 → ResolutionData. 코드가 판정 결정하는 핵심 |
| `buildContext.ts` | buildPersistentContext() / buildDynamicContext() |
| `buildState.ts` | RunState → `<state>` XML |
| `buildResolution.ts` | ResolutionData → `<resolution>` XML, calcTier() |
| `parseChanges.ts` | GM 출력에서 XML 태그/선택지/서술 파싱 |
| `engine.ts` | applyStateChanges() — 신뢰도/HP/소음/발견 반영 |
| `dice.ts` | rollD20(), resolveCheck() |

### app/
| 파일 | 역할 |
|------|------|
| `page.tsx` | 메인 게임 페이지. Phase 상태 관리, 전체 턴 흐름 |
| `api/gm/route.ts` | 메인 GM 호출. persistent 캐싱 적용 |
| `api/judge/route.ts` | 구버전 (현재 미사용) |
| `api/narrate/route.ts` | 구버전 (현재 미사용) |

### components/
| 파일 | 역할 |
|------|------|
| `ChatWindow.tsx` | GM/플레이어 메시지 출력, 자동 스크롤 |
| `SystemAlert.tsx` | 판정 결과 팝업 (태그 + 주사위 결과 표시) |
| `DebugPanel.tsx` | 판정/주사위/raw서술/파싱결과/토큰/캐시히트 표시 |
| `InputBox.tsx` | 자유 입력창 (현재 미사용) |

---

## GM 출력 포맷

GM은 서술 텍스트 + 아래 태그들을 함께 출력한다.

```
서술 텍스트...

<trust npc="garret" delta="+1" reason="약속을 지킴" />
<loud reason="칼 소리" />
<intents>1:promise,2:speak</intents>

1. 문을 열고 들어간다 [이동: 2A]
2. 가렛에게 말을 건다 [말]
3. 주변을 살핀다 [살핌]
```

**선택지 태그 종류** (`data/rules.ts`의 ACTION_TAG_RULES):
- 판정 있음: `[공격]` `[회피]` `[방어]` `[살핌]` `[숨기]` `[몸쓰기]` `[말]`
- 판정 없음: `[이동: 방ID]` `[선택]` `[사용: 아이템ID]` `[동료]`

**결과 등급** (DC와의 차이):
- 대성공 +10이상 / 성공 0이상 / 부분_성공 -4이상 / 실패 -9이상 / 대실패

---

## RunState 초기값 (app/page.tsx INITIAL_STATE)

```ts
회차: 1, 현재층: 1, 현재방: '1A', 시험_남은_턴: 3, 소음: 'low', 기사_투구: null
플레이어: { HP: 20, maxHP: 20, 소지품: [], 능력치: { 매력:1, 지력:0, 지각:1, 민첩:0, 근력:0 }, 현재_무기: '나무검' }
동료: [], 현재_적: [], 열린_문: [], 발견한_통로: [], 발견한_요소: [], 쓰러진_몬스터: [], 로그: []
```

---

## 미완성 항목 (우선순위순)

1. **실제 방 시트 JSON** — `data/rooms/`에 floor-1 기준 방 데이터 작성 필요. `data/rooms/room_example.json`과 `types/room.ts` 참고.
2. **`/api/interpret`** — 자유 입력 처리. 플레이어 자유 입력 → 태그 변환 → 이하 동일 흐름. `InputBox.tsx`는 이미 있음.
3. **적 행동 로직 정교화** — 현재 `resolveAction.ts`의 `resolveEnemyActions()`가 랜덤 50% hit. 적 시트 기반으로 교체 필요.
4. **회차 저장/불러오기** — `RunState`를 localStorage에 직렬화. 회차 시작 시 선택해서 로드.
5. **API 키 입력 UI** — `app/api/gm/route.ts`에 `body.apiKey` 처리 이미 있음. UI만 추가하면 됨.

---

## 건드리지 말아야 할 것

- `data/pages/persistent/` 파일들 — 캐시 대상. 내용 바꾸면 매 턴 캐시 미스 발생.
- `parseChanges.ts`의 정규식 — GM 프롬프트 포맷과 맞물려 있음. 포맷 바꾸려면 프롬프트도 같이 수정.
- `calcTier()` 기준값 — 스토리 설계와 연동됨.

---

## 환경변수

```
ANTHROPIC_API_KEY=sk-ant-...
```

Vercel에도 동일하게 등록되어 있음 (https://tower-trpg.vercel.app).
