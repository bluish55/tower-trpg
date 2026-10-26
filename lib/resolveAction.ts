import { ACTION_TAG_RULES, DIFFICULTY_DC, NO_ROLL_CHECKS } from '@/data/rules'
import { rollD20 } from './dice'
import type { RunState, EnemyState } from '@/types/state'
import type { ResolutionData, EnemyAction } from './buildResolution'
import { calcTier } from './buildResolution'
import type { DiceResult } from '@/types/judgment'

// 태그 + 현재 상태 → ResolutionData (코드가 결과를 완전히 결정)
export function resolveAction(
  tag: string,
  target: string | undefined,
  state: RunState
): ResolutionData {
  const rule = ACTION_TAG_RULES[tag]
  const displayTag = `[${tag}${target ? ': ' + target : ''}]`

  // 판정 불필요 태그 (이동, 선택, 동료 등)
  if (!rule || NO_ROLL_CHECKS.includes(rule.checkType)) {
    return {
      playerTag: displayTag,
      diceResult: null,
      tier: '성공',
      enemies: resolveEnemyActions(state.현재_적),
    }
  }

  const attributeBonus = state.플레이어.능력치[rule.attribute] ?? 0
  const roll = rollD20()
  const DC = DIFFICULTY_DC[rule.baseDifficulty]
  const total = roll + attributeBonus

  const diceResult: DiceResult = {
    기본: roll,
    능력치보정: attributeBonus,
    기타보정합: 0,
    합계: total,
    DC,
    성공: total >= DC,
  }

  return {
    playerTag: displayTag,
    diceResult,
    tier: calcTier(diceResult),
    enemies: resolveEnemyActions(state.현재_적),
  }
}

// 현재 적들의 행동 결과 계산 (단순화 — 이후 적 시트로 정교화)
function resolveEnemyActions(enemies: EnemyState[]): EnemyAction[] {
  return enemies.map(e => {
    const hit = rollD20() >= 10
    const damage = hit ? Math.floor(Math.random() * 4) + 2 : 0
    return { name: e.name, action: e.nextAction, hit, damage }
  })
}
