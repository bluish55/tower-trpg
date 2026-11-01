# CLAUDE.md — Tower TRPG 인수인계

## 핵심 설계 결정

**AI는 이야기하고, 코드는 결정한다.**

- 플레이어가 선택지를 누르거나 직접 적으면, 코드(`lib/game/engine.ts`)가 주사위·적 행동·시험 시계·보상·결말까지 전부 판정한다.
- Claude는 판정이 끝난 결과(`<resolution>`)를 받아 **서술과 선택지만** 쓴다. 한 턴에 한 번 호출.
- Claude가 붙이는 태그(`<trust>`, `<loud>`, `<intents>`)는 "제안"이다. 코드가 검증한 뒤 반영한다 (`Engine.applyAITags`).
- 모든 수치와 방·적·보상·쪽지 데이터는 `data/game-data.json` 한 파일에 있다. **밸런스 조정은 여기만.**

## 턴 흐름

```
플레이어 입력
 ├─ 선택지 클릭 → 선택지에 붙은 태그 사용        예: "투구를 노린다 [공격]"
 └─ 직접 입력   → POST /api/interpret → {tag, arg, intent}
        ↓
Engine.resolve(action)          ← 2d6 판정, 적 행동, 시험 턴, 보상 제시, 결말
        ↓  판정 결과(strip)·시스템 알림을 즉시 화면에 표시
POST /api/gm  { pages, messages }   ← 서버가 프롬프트 페이지를 붙여 Claude 호출
        ↓
parseResponse(output)           ← 서술 / 선택지 / 태그 분리
Engine.applyAITags(...)         ← 신뢰도·기척·의도 검증 후 반영
        ↓
phase 전환: mind → reward(보상 카드) / run_over(추방) / ending(결말)
localStorage 저장 (진행, 탐사 기록, 설정)
```

phase: `title → outside(다이브실) → mind(탑 안) ⇄ reward → run_over → (다음 다이브) … → ending`

## 판정 (2d6)

`2d6 + 보정 vs 목표(DC)`. 보정·DC는 `data/game-data.json`의 `pc.mods`, `dc`, 적의 `def`.

| 결과 | 조건 |
|------|------|
| 대성공 | 합계 ≥ DC+5, 또는 6·6 |
| 성공 | 합계 > DC |
| 부분 성공 | 합계 = DC |
| 실패 | DC−1 ~ DC−3 |
| 대실패 | DC−4 이하, 또는 1·1 |

`lib/game/engine.ts`의 `tierOf()`.

## 프롬프트 구조 (캐싱)

- `data/pages/persistent/` 7개 — 매 턴 똑같이 보내는 블록. `cache_control: ephemeral`로 캐시된다.
  내용을 수정하면 **배포 후 첫 호출에서 한 번** 캐시가 새로 만들어질 뿐, 매 턴 미스가 나지 않는다.
- `data/pages/floors/`, `data/pages/npcs/` — 조건부 페이지. 어떤 페이지를 붙일지는 클라이언트가
  `dynamicPages()`(`lib/game/prompt.ts`)로 정하고, 서버(`lib/pages.ts`)는 허용 목록에 있는 것만 읽는다.
- **반전 보호:** `npcs/knight-revealed`(기사의 정체)는 투구에 금이 가기 전(`knight.helm < 1`)에는 절대 보내지 않는다.
  하은의 쪽지 원문도 프롬프트 페이지가 아니라 게임 데이터에 있고, 공개될 때 `<reveal>`로만 전달된다.
- 매 턴 user 메시지: `<state>` `<pc_knowledge>` `<resolution>` `<code_notes>` `<reveal>` `<event>` `<player_input>`.
  대화 기록에는 상태 블록을 뺀 짧은 버전(`historyText`)만 남긴다 (최근 20개 메시지).

## 파일 역할

| 경로 | 역할 |
|------|------|
| `data/game-data.json` | 수치, 방, 적(행동 주기·약점), 동료, 보상 카드, 쪽지, 결말 |
| `data/pages/**.md` | GM 지침 (프롬프트). frontmatter는 AI에게 보내지 않는다 |
| `lib/game/types.ts` | 게임 상태·데이터 타입 |
| `lib/game/engine.ts` | 판정 엔진 (`Engine` 클래스). 순수 TS, 브라우저에서 돈다 |
| `lib/game/prompt.ts` | 턴 메시지, 조건부 페이지 선택, 자유 입력 분류 프롬프트 |
| `lib/game/parse.ts` | GM 응답 파싱 (서술/선택지/태그) |
| `lib/game/storage.ts` | localStorage 저장/불러오기 |
| `lib/pages.ts` | (서버) 프롬프트 페이지 로더 + 허용 목록 |
| `lib/anthropic.ts` | (서버) Claude 호출, BYOK 키 처리, 잘린 응답 이어쓰기, 오류 메시지 |
| `app/api/gm/route.ts` | 메인 GM 호출 |
| `app/api/interpret/route.ts` | 자유 입력 → 행동 태그 분류 |
| `app/page.tsx` | 마운트 후 `TowerGame` 렌더 (저장 데이터가 브라우저에 있으므로) |
| `components/TowerGame.tsx` | 턴 흐름 전체, 화면 구성 |
| `components/ChatWindow.tsx` | 피드 (서술, 판정 결과, 시스템 알림) |
| `components/InputBox.tsx` | 선택지 버튼 + 자유 입력 |
| `components/StatusPanel.tsx` | 시험·HP·적·기척·장비·동료·쪽지 |
| `components/Overlays.tsx` | 보상, 추방, 결말, 탐사 기록, 설정 |
| `components/DebugPanel.tsx` | 설정에서 켜면: 상태 JSON, 보낸 메시지, AI 원문, 토큰·캐시 |

## GM 출력 포맷

```
서술 텍스트...

<trust npc="garret" delta="+1" reason="약속을 지킴" />
<loud reason="칼 소리" />
<intents>1:promise,2:speak</intents>     ← 5층에서만

1. 문을 열고 들어간다 [이동: 2A]
2. 가렛에게 말을 건다 [말]
3. 주변을 살핀다 [살핌]
```

태그: `공격 회피 방어 살핌 숨기 몸쓰기 말` (판정 있음), `사용 동료 이동 선택` (판정 없음 또는 자동).
형식을 바꾸려면 `lib/game/parse.ts`와 `data/pages/persistent/game-mechanics.md`를 같이 고칠 것.

## 남은 일

- N9 (마녀의 소원) 쪽지 문구 — 지금은 자리표시자
- 5층 엄마 장면, 결말 문구 다듬기
- 난이도 조정 (`data/game-data.json`)

## 검증

```bash
npx tsc --noEmit && npm run lint && npm run build
```
