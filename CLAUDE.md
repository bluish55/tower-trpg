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

| 결과 | 조건 | 대가 (교전 중) |
|------|------|------|
| 대성공 | 합계 ≥ DC+5, 또는 6·6 | — |
| 성공 | 합계 ≥ DC (동점 처리는 `rules.tie_success`) | — |
| 실패 | DC−1 ~ DC−3 | 공격·살핌이면 **빈틈**: 이번 턴 적 명중 +2 |
| 대실패 | DC−4 이하, 또는 1·1 | **넘어짐**: 빈틈 + 다음 판정 −2 |

부분 성공은 없다 (11-04). `lib/game/engine.ts`의 `tierOf()`, `exposure()`.
AI는 코드가 피해를 준 턴에만 몸이 다치는 서술을 쓴다 (`game-mechanics.md` `<results>`).

## 이동·전투·동료 (11-04 피드백 반영)

- **이탈 판정:** 교전 중 [이동] = 회피 판정, 목표 `rules.disengage_dc` + (막는 적 수 − 1). 실패하면 그 방에 남고 적이 친다. 숨은 상태·피오 샛길·시험 실패로 내려온 기사는 막지 않음.
- **가렛의 방패:** 턴 시작이 아니라 공격이 진우에게 명중한 순간에 나간다. 위기(예고된 큰 공격, 또는 이번 피해로 HP ≤ `rules.garret_shield_hp`)일 때 `rules.garret_shield_chance[신뢰]` 확률, 층당 2회. 평소에는 연계 공격만 한다.
- **미끼와 부축:** `[이동: 방ID, 버림: 이름]` = 이탈 판정 +`rules.bait_bonus`, 이탈에 성공하는 순간 버림 확정. 쓰러진 동료를 두고 이동 = +`rules.down_left_bonus`, 기존 남겨짐 규칙. `[이동: 방ID, 데리고: 이름]` = 쓰러진 동료를 데려감, −`rules.carry_penalty`.
- **쪽지:** 교전 중인 방에서는 못 읽는다. 들어갈 때 공개되는 방(4A)도 정리해야 공개.
- **찢긴 책장:** 적 처치 시 `enemies.*.pages`. 보상 화면에서 `rules.pages_per_extra_card`장으로 한 장 더.
- **시험 종류:** `floors.*.trial.kind` = reach / slay(2층, 사냥꾼) / escort(3층, 피오).
- **동료 (선배 자동 행동 위에 확장):** 능력 자동 발동·연계 공격·반격 부상은 선배 구현 그대로. 추가:
  리라 조언(+1, `rules.lira_aid_chance`), 협공 `[공격: 이름]`(판정 +2, 반격은 그 동료에게, 기사·거울상에는 불가), 평타가 동료를 노림(`rules.companion_target_chance`),
  부상 중 또 맞으면 **쓰러짐** → `[동료: 이름]`으로 일으킴, 함께 방을 정리하면 신뢰 +1(층당 1번).
- **버림:** `[떠남: 이름]` / 쓰러진 동료를 두고 방을 떠남(남겨짐, 계단 전엔 구출 가능) / 신뢰 0에서 코드가 낸 하락(버림을 목격)을 받음 — 셋 다 `run.abandoned`. AI의 `<trust>` 태그는 0 아래로 내리지 못한다.
  계단을 오를 때 곁에 없는 동료는 버림으로 확정. 본 동료 신뢰 −1.
- **결말:** 버린 동료가 있으면 약속 결말 잠김(마녀가 이유를 말함). 약속 + 셋 다 함께 = `promise_together`. 동료는 5A(빈 페이지)에서 멈춘다.

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

태그: `공격 회피 방어 살핌 숨기 몸쓰기 말` (판정 있음), `사용 이동 선택` (판정 없음, 이동은 교전 중이면 이탈 판정),
`[공격: 이름]` 협공, `[동료: 이름]` 쓰러진 동료 일으키기, `[떠남: 이름]` 동료를 버림.
형식을 바꾸려면 `lib/game/parse.ts`와 `data/pages/persistent/game-mechanics.md`를 같이 고칠 것.

자유 입력 분류기는 `missing_item`과 `improvised`도 돌려준다. 없는 물건이면 판정 없이 턴만 흐르고, 지형지물 공격은 판정에 `improvised_penalty`만큼 불리하고, 피해는 `improvised_dice`이며, 무기의 공격 보너스가 붙지 않는다. 원거리면 대상이 그 턴에 행동하지 않지만, 같은 대상에게 연속으로 던지면 두 번째부터는 행동한다. 기사와 거울상에게는 효과가 없다. 선택지 버튼은 `[공격: 지형]`, `[공격: 지형 원거리]`로 같은 규칙을 탄다.

## 남은 일

- N9 (마녀의 소원) 쪽지 문구 — 지금은 자리표시자
- 5층 엄마 장면, 결말 문구 다듬기
- `draft — 경택 to revise` 표시된 대사 (witch-mom.md 두고 온 동료, endings.md 약속 — 함께)
- 난이도: 실제 플레이로 확인 (`scripts/balance.ts`로 수치 비교)

## 밸런스·규칙 검사 스크립트

```bash
npx tsx --tsconfig tsconfig.json scripts/rules-check.ts       # 규칙 시나리오 (이탈, 쪽지, 책장, 처치 시험, 남겨짐/버림, 결말)
npx tsx --tsconfig tsconfig.json scripts/balance.ts 2000      # 숙련·초보 봇 각 2000판: 층별 도착 HP, 추방 층
npx tsx --tsconfig tsconfig.json scripts/balance.ts 2000 '{"def":8,"rules":{"disengage_dc":8}}'  # 수치를 바꿔 비교
```

11-04 기준 결과 (3000판): 숙련 봇 4층 도착 HP 평균 13.0, 75%가 4층 끝까지 / 초보 봇 1–3층 추방 96%.
봇은 약점을 다 알고 예고 공격을 다 피하므로 실제 사람보다 HP가 높게 나온다.

## 검증

```bash
npx tsc --noEmit && npm run lint && npm run build
```

## 되돌리기 태그

큰 변경 전에 git 태그를 남긴다: `v-before-companion-rework`, `v-before-hp-rollback`, `v-before-feedback-1104`.
되돌리려면 `git checkout <태그>`로 확인하고 필요한 커밋만 `git revert`.
