# 게임 메커니즘 명세 (Game Mechanics Spec)

> **이 문서의 목적**: 엔진 동작의 ground truth.
> 코드가 이 문서를 위반하면 버그, 이 문서가 현실과 맞지 않으면 문서를 고친다.
> 각 규칙에 번호가 있어서 버그 리포트에 "R3.2 위반"처럼 참조할 수 있다.

---

## R1. 판정 (2d6 Check)

### R1.1 기본 구조
- `2d6 + 보정 vs DC`. 주사위 2개를 각각 굴린다 (합산 전 개별 값이 중요).
- 보정 = `D.pc.mods[tag]` + 무기 보정(공격만) + 맹세 보정(공격만) + 망토 보정(숨기만) + 넘어짐 패널티 + 리라 보조.

### R1.2 판정 4단계
| 단계 | 조건 |
|------|------|
| 대성공 | 주사위 합 12(더블 6), 또는 합계 ≥ DC+5 |
| 성공 | 합계 > DC, 또는 합계 = DC이고 `rules.tie_success = true` |
| 실패 | 합계 ≥ DC−3 (위 조건 미충족) |
| 대실패 | 주사위 합 2(더블 1), 또는 합계 < DC−3 |

> **설계 결정**: `tie_success`는 `data/game-data.json`에서 조정. 현재 `true`.
> **OK 판정** (`res.ok`): 대성공 또는 성공만. 부분 성공(partial) 단계는 없다.

### R1.3 넘어짐 (Prone)
- 대실패 시 `r.prone = true`, 이번 턴 적 명중 +`rules.opening_bonus`.
- 다음 판정에서 −`rules.prone_penalty`가 적용되고 즉시 `prone = false`.
- 넘어짐은 교전 중일 때만 발생한다 (`exposure()` 내부에서 `engaged().length` 확인).

### R1.4 빈틈 (Exposure)
- 공격·살핌 `실패` 시 이번 턴 한정으로 적 명중 +`rules.opening_bonus`.
- 회피·방어·숨기·몸쓰기는 실패해도 빈틈 없음.

### R1.5 리라 보조 (`r.aid`)
- 리라가 있고 신뢰 ≥ 1일 때, 턴 시작에 `rules.lira_aid_chance[trust]` 확률로 `r.aid` 세팅.
- 첫 판정에 `+r.aid`가 붙고 즉시 `r.aid = 0`. 판정 없이 턴이 끝나거나 보상 화면으로 넘어가도 사라진다.

---

## R2. 전투 흐름 (Combat Flow)

### R2.1 한 턴의 순서
1. 보류 중인 증원·쪽지 처리
2. 협공 대상 결정 (공격 태그이고 동료 이름 있을 때)
3. **동료 행동** (`companionsAct`)
4. **플레이어 행동** (switch/case)
5. `r.offer` 있으면 여기서 멈춤
6. **적 행동** (`enemiesAct`) — 단, 이동했으면 건너뜀
7. 사후 효과 (방 정리 신뢰 +1, 쪽지 공개, 쉬던 동료 부상 해제, 시험 시계)

### R2.2 협공 (Joint Attack)
- 조건: `공격` 태그 + 파티에 해당 동료가 있고, `down = false`, `injured = false`.
- 판정 보정 +`rules.joint_bonus`.
- 반격은 PC가 아니라 **협공 동료**에게 간다 (첫 반격만; 이후는 일반 확률).
- 대상: `action.arg`의 동료 이름으로만 정한다. 문장 속 이름으로는 발동하지 않는다.
- 기사와 거울상에는 협공할 수 없다. 혼자 공격하고, 동료는 평소대로 행동한다.
- 협공 대상을 동료가 먼저 쓰러뜨리면 협공은 끝나고 남은 적을 혼자 공격한다. 남은 적이 없으면 판정하지 않는다.
- 동료가 받는 `companionAttack`의 반격도 "첫 반격"으로 친다.
- 동료 반격 판정은 그 동료의 방어값(`companions.*.def`)을 쓴다.

### R2.2.1 지형지물 공격과 없는 물건
- 지형지물 공격(`improvised`): 판정 −`improvised_penalty`, 피해 `improvised_dice`, 협공 불가. 무기의 공격 보너스와 물 속성 보너스는 붙지 않는다.
- 원거리(`ranged`): 대상이 그 턴에 행동하지 않는다. 같은 대상에게 연속으로 던지면 두 번째부터 행동한다. 기사와 거울상에게는 효과가 없다.
- 없는 물건(`missingItem`): 판정 없이 턴만 흐르고, 적은 평소대로 행동한다.
- 게임 밖 입력(`outOfGame`): `Engine.resolve`와 GM 호출을 건너뛴다. 턴이 흐르지 않고, 대화 기록에도 남지 않는다.
- 한 문장에 행동이 둘이면 분류기가 고른 주된 행동만 판정한다. GM은 나머지를 일어나지 않은 것으로 서술한다.

### R2.3 적 행동 순서
- 교전(`engaged`) 상태이고 `hp > 0`인 적만 행동.
- 기절(`stunned > 0`) 중이면 스킵, 카운터 1 감소.
- `tell`이 있는 사이클 스텝은 예고만 하고 행동 없음.
- **예고된 큰 공격(`mv.label` 있음)과 기사는 항상 PC를 노린다.**
- **평타는 `rules.companion_target_chance` 확률로 파티 중 쓰러지지 않은 동료를 대신 노린다.**

### R2.4 공격 판정 흐름 (R2 conflict prevention)
```
협공 대상이 이미 쓰러졌으면 대상 변경 (남은 적이 없으면 끝)
→ check() → exposure() → !ok: break
→ weakMatch: applyWeak() → break
→ 일반 피해
```
> **설계 결정**: 대상은 판정 전에 살아 있는 적으로 정한다. 협공으로 처치된 적에게 판정이나 약점 효과가 적용되지 않는다.

---

## R3. 동료 시스템 (Companion System)

### R3.1 합류 조건
- **말 태그**: `말` 판정 성공 시 `join()` 호출.
- **가렛 자동 합류**: `1A`에 적 없고 아직 미영입이면 자동 합류.
- `canRecruit(id)`: 파티, `r.left`, `r.abandoned` 어디에도 없을 때만 영입할 수 있다.
- 남겨진 동료의 원래 방에서는 소개 이벤트와 설득 판정이 나오지 않는다. 쓰러진 방으로 돌아가 일으켜야 한다.
- 설득과 기사에게 말하기의 대실패에도 넘어짐이 적용된다.

### R3.2 신뢰 (Trust)
- 범위: **0 ~ 3**. 초기값은 `D.companions[id].trust`.
- 변화: `Math.sign(delta)` 단위로 조정, 0 미만 또는 3 초과로 가지 않는다.
- AI의 `<trust>` 태그는 0 아래로 내리지 못한다. 신뢰 0에서 받아도 0을 유지한다.
- 코드가 낸 하락(버림 목격)을 신뢰 0에서 받으면 그 동료는 떠난다 (`abandon('trust')`).
- 그 밖의 이탈은 `떠남` 태그(플레이어 명시 버림) 또는 `leaveBehind` + 계단 오르기로만 발생.
- 방 정리(이번 턴 처치 + 교전 종료)마다 함께 있던 동료 신뢰 +1. 층당 동료당 1회 한도(`trustCleared`).

### R3.3 부상 → 쓰러짐 (Injured → Down)
| 상태 | 의미 | 행동 가능 여부 |
|------|------|-------------|
| 정상 | — | 가능 |
| `injured = true` | 맞았음, 다음 턴 쉼 | 이번 턴만 쉬고 다음 턴 회복 |
| `down = true` | 쓰러짐 | 불가. 일으켜야 움직임 |

- 부상 중(`injured`)에 또 맞으면 `down = true`.
- 쓰러진 동료를 일으키려면 `동료` 태그 사용. 일어서면 `injured = true`(다음 턴 쉼).
- `동료` 태그: `action.arg` 먼저 탐색, 없으면 `text`. arg 우선.

### R3.4 남겨짐 → 버림 (Left Behind → Abandoned)
```
쓰러짐(down)
  └─ 같은 층 다른 방으로 이동 → leaveBehind(): party에서 제거, r.left에 추가
       └─ 그 방으로 돌아오면 → companion_found: 다시 party에 (down=true)
       └─ 계단을 오르면 → confirmAtStairs():
            - r.left의 같은 층 동료 → abandon('left'): r.abandoned에, 약속 결말 잠김
```
- `abandoned` 등록 시: **그 장면을 본 다른 동료 신뢰 −1** (자의로 떠난 경우 제외). 쓰러진 동료는 목격자로 치지 않는다.
- `r.left`와 `r.party`에 같은 id가 동시에 존재할 수 없다.
- `r.left`와 `r.abandoned`에 같은 id가 동시에 존재할 수 없다.

### R3.5 동료별 행동 확률
| 동료 | 발동 조건 | 신뢰별 확률 (0/1/2/3) |
|------|-----------|----------------------|
| 가렛 | 교전 중 + 플레이어가 공격 또는 방어 | 50/65/80/95% |
| 피오 | 교전 중 + 공격 | 50/65/80/95% |
| 피오 | 교전 중 + 방어 | 40/55/70/85% |
| 피오 | 교전 중 + 회피 | 25/33/40/50% |
| 협공 지정 시 | 항상 발동 | 100% |

- 발동 후 반격은 가렛 `rules.garret_counter_chance` 확률, 피오 대실패시만.
- **가렛의 방패**는 턴 시작에 나가지 않는다. 진우에게 공격이 명중하고 피해가 1 이상일 때 `tryShield()`가 판단한다.
  - 위기 조건: 예고된 큰 공격(`mv.label`, 거울상 제외), 또는 이번 피해로 HP ≤ `rules.garret_shield_hp`.
  - 확률: `rules.garret_shield_chance[신뢰]`. 부상 중이면 `rules.garret_shield_injured_chance`.
  - 층당 `rules.companion_skill_uses`회, 직전 턴에 썼으면 `rules.skill_repeat_chance` 확률로만 다시 나간다. 쓰러졌거나 협공 중이면 나가지 않는다.
  - 신뢰 3이면 그 턴의 남은 공격도 모두 막는다. 그 턴에 가렛이 쓰러지면 효과도 끝난다.
- **처치된 적(`hp > 0` 아닌 적)은 반격하지 않는다.**
- 쓰러진(`down`) 동료는 행동 불가. 부상(`injured`) 동료는 이번 턴 쉰다.
- 5층에서는 동료들이 행동하지 않는다.

---

## R4. 이동 (Movement)

### R4.1 이탈 판정
- 교전 중 이동 시 이탈 판정 (`회피` 계열, DC = `rules.disengage_dc + 교전적수 - 1`).
- 피오 신뢰 3이면 +2 (피오가 미끼면 제외).
- 미끼: `[이동: 방ID, 버림: 이름]`이면 +`rules.bait_bonus`. 멀쩡한 동료만 미끼가 된다. 이탈에 성공해야 버림(`abandon('bait')`)이 확정되고, 실패하면 파티에 남는다. 막는 적이 없으면 판정 없이 그냥 두고 떠난 것(`abandon('chosen')`)으로 친다.
- 쓰러진 동료를 두고 이동: +`rules.down_left_bonus`. 고른 미끼가 있으면 미끼 보정만 받는다. 기존처럼 남겨짐(`leaveBehind`)이 되어, 계단을 오르기 전이면 구할 수 있다.
- 쓰러진 동료를 데리고 이동: `[이동: 방ID, 데리고: 이름]`이면 −`rules.carry_penalty`. 쓰러진 채로 파티에 남고, 계단도 함께 오른다. 막는 적이 없으면 판정 없이 데려간다.
- **예외 (판정 없이 이동)**: 은신 중(`r.hidden`), 판정 성공 불필요.
- 기사 상태 `hunting`은 이탈을 막지 않는다 (뒤따라올 뿐).
- 거울상은 이탈 판정 대상에서 제외.

### R4.2 쓰러진 동료 처리
- **수평 이동(같은 층)**: 쓰러진 동료는 현재 방에 남겨짐 (`leaveBehind`).
- **계단 오르기**: `confirmAtStairs()` 호출.
  1. 파티 내 `down` 동료 → `leaveBehind`.
  2. `r.left` 중 현재 층 동료 → `abandon('left')`.

### R4.3 사냥하는 기사 (hunting)
- 시험 실패로 소환된 기사는 플레이어가 이동할 때마다 함께 이동한다 (현재 방에서 제거 → 목적지에 추가).

---

## R5. 기사 시스템 (Knight)

### R5.1 상태 전이
```
unseen → glimpsed (1회성 이벤트)
       → hunting  (시험 실패 시 1~3층에 소환)
       → guarding (4층 계단에 도착)
       → confront (교전 시작)
         ├─ defeated (전투로 처치)
         ├─ yielded  (말 판정으로 설득)
         └─ bypassed (가렛+피오 협력으로 우회)
```

### R5.2 4층 계단 차단
- `r.floor === 4`이고 `r.knight.state`가 `SAFE_KNIGHT`(`yielded`, `bypassed`, `defeated`) 가 아니면 위층 이동 불가.

### R5.3 협공으로 우회
- 가렛 + 피오 둘 다 기사 앞에서 1회씩 능력을 쓰면 (`f4used.garret`, `f4used.pio`) 자동 우회. 가렛은 위기에 기사의 공격을 막아야 발동한다.

### R5.4 투구 (helm)
- **1단계 균열** (`helm = 1`): 기사 HP ≤ 16일 때. PC 턱, 입 보임.
- **2단계 파괴** (`helm = 2`): 기사 HP ≤ 8일 때. 얼굴 전체 — PC 본인임 확인.
- `helm >= 1` 전까지는 `npcs/knight-revealed` 페이지를 절대 프롬프트에 포함하지 않는다.

### R5.5 처형의 일격
- 기사 사이클 4번째 행동 (`kill: true`).
- `r.knight.read = true`이면 빗나가고 플래그 해제.
- `read`는 `살핌` 성공 시 (4층에서만) 세팅.

---

## R6. 적별 특수 규칙 (Enemy Specials)

### R6.1 거울상 (mirror)
- PC가 `공격`하면 거울상이 똑같이 PC를 공격.
- PC가 비공격 행동을 하면 `calm++`. `calm >= 2`이면 소멸 → `onKill()`.
- 약점 `mirror`: 공격 안 함 = 약점 사용.

### R6.2 안개 사냥개 (hound)
- `ctx.quiet`이면 약점 `silence` 학습, 공격 안 함.
- `ctx.silent`이면 추가로 `state = 'lost'`.

### R6.3 사냥꾼 (hunter)
- 약점 `horn` (effect: 뿔피리): 사냥개들이 사냥꾼을 물고, 사냥꾼 1턴 기절.

### R6.4 종탑지기 (bellringer)
- `ring` 행동 시 `r.trial.left -= 1` (3층 시험 시계 감소).
- 은신(`hideSkip`)에도 계속 행동한다.

### R6.5 물귀신 (drowned)
- 약점 `height` (effect: 높은 곳으로): `몸쓰기` 성공으로 적용.

### R6.6 리빙아머 (armor)
- 약점 `helm` (effect: kill): 투구를 겨냥하면 즉사.

---

## R7. 시험 시스템 (Trial)

### R7.1 시험 종류
| kind | 통과 조건 |
|------|-----------|
| `reach` | 계단에 오르면 통과 |
| `slay` | 지정 적(`target`) 처치 후 계단 오르기 |
| `escort` | 지정 동료(`requires`)와 함께 계단 오르기 |

### R7.2 시험 시계
- 매 턴 종료 시 `r.trial.left -= 1` (이동한 턴 포함, `floorChanged` 제외).
- 종탑지기의 종 소리: 추가로 −1.
- `left = 0` → `trial.failed = true`, `trial_fail` 이벤트, 기사 소환 (1~3층만).

### R7.3 시험 실패 후
- 기사(`hunting`)가 PC를 추적하지만 계단을 막지는 않는다.
- 시험 실패 상태로 계단을 오를 수 있다 (보상 없음, `trial_unclear` 이벤트).

### R7.4 보상
- 시험 통과 시 `D.rewards[floor]`의 카드 3장 제시.
- `피의 대가` 카드: `hp <= cost`이면 `disabled = true` (선택 불가).
- **찢긴 책장** (`r.pages`): `rules.pages_per_extra_card`만큼 모으면 카드 1장 추가 선택 가능.
- 카드는 적 처치 시 `def.pages`만큼 적립. 피오 신뢰 3이면 +1 추가.

---

## R8. 소음 시스템 (Noise)

- 매 턴 소음 행동 시 `r.loud++`.
- `숨기` 판정 실패: +1, 대실패: +2.
- `r.loud >= 3`(`D.loud_threshold`)이면 증원 소환 (`pendingSpawn = true`).
- 소환 후 `r.loud = 0` 리셋.

---

## R9. 5층 (Floor 5) 특수 규칙

- 동료들이 행동하지 않는다 (`companionsAct` 조기 리턴).
- 적이 없다. 판정은 가능하지만 전투 없음.
- `intents` 태그 필수: `promise`, `speak`, `helm`, `leave`, `stay`, `other`.

### R9.1 결말 조건
| intent | 방 | 추가 조건 | 결말 |
|--------|-----|-----------|------|
| `leave` | 아무 곳 | — | `alone` |
| `stay` | `5B` | — | `stay` |
| `helm` | `5B` | — | `knight` |
| `promise` | `5B` | 기사 처치됨 | `forced` |
| `promise` | `5B` | 동료 버린 적 있음 | 결말 잠김 (대화 계속) |
| `promise` | `5B` | 3·4층 쪽지 모두 읽음 | `promise` |
| `promise` | `5B` | 3·4층 쪽지 모두 읽음 + 파티 3명 | `promise_together` |
| `speak` | `5B` | 조건 미충족 | 결말 없음 (대화 계속) |

---

## R10. 구조적 불변성 (Structural Invariants)

다음은 **런타임에 위반될 수 있으며 검사 가치가 있는 조건**들이다. 이를 위반하면 코드 버그다.

| # | 조건 |
|---|------|
| I1 | `r.hp` ∈ [0, `r.maxHp`] |
| I3 | `r.party`에 같은 id가 두 번 이상 없다 |
| I4 | `r.party`와 `r.left`에 같은 id가 동시에 없다 |
| I5 | `r.party`와 `r.abandoned`에 같은 id가 동시에 없다 |
| I6 | `r.left`와 `r.abandoned`에 같은 id가 동시에 없다 |
| I10 | `r.offer != null`이면 `r.pendingMove != null` |

> **제거된 불변성 (코드가 항상 보장함, 별도 검사 불필요)**
> - ~~I2 trust ∈ [0,3]~~: clamp 처리로 위반 불가
> - ~~I7 kills >= 0~~: 감소 코드 경로 없음
> - ~~I8 floor ∈ [0,5]~~: 범위 밖 세팅 경로 없음
> - ~~I9 trial.left >= 0~~: `Math.max(0, ...)` 보장
> - ~~I11 engaged → hp > 0~~: `here()`가 hp > 0 필터링, state 불일치가 동작에 영향 없음

---

## 설계 결정 메모

| # | 항목 | 결정 |
|---|------|------|
| D1 | 보상 카드 추가 선택 시 같은 카드 두 장 | **의도적으로 불가** (`extraId !== cardId`) |
| D2 | 말 판정 재시도 | **제한 없음** — 시험 시계가 간접 제한. 오히려 재시도 보정(+?) 추가 고민 중 |
| D3 | 쓰러진 동료 구출 범위 | **같은 층 내에서만** — 계단 오르면 어차피 돌아올 수 없으므로 코드와 일치 |
