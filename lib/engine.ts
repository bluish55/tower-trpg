import type { RunState, StateChangeProposal } from '@/types/state'
import type { JudgmentRequest, DiceResult } from '@/types/judgment'
import { resolveCheck } from './dice'
import { APPROVAL_CHANGE_LIMIT, APPROVAL_THRESHOLDS } from '@/data/rules'

// 플레이어 능력치 보정값 조회
function getAttributeBonus(state: RunState, attribute: string): number {
  return state.플레이어.능력치[attribute] ?? 0
}

// 주사위 굴리기 (judge API 경로에서 계속 사용)
export function runDice(
  judgment: JudgmentRequest,
  state: RunState
): DiceResult | null {
  const bonus = getAttributeBonus(state, judgment.능력치)
  return resolveCheck(judgment, bonus)
}

// GM 출력에서 파싱한 상태 변경을 검증하고 반영
export function applyStateChanges(
  state: RunState,
  proposal: StateChangeProposal,
  turn: number
): RunState {
  const next = structuredClone(state)
  const timestamp = new Date().toISOString()

  // 동료 신뢰도 변경 (턴당 ±APPROVAL_CHANGE_LIMIT 제한)
  if (proposal.trust) {
    for (const change of proposal.trust) {
      const companion = next.동료.find(c => c.id === change.npc)
      if (!companion) continue

      const clamped = Math.max(
        -APPROVAL_CHANGE_LIMIT,
        Math.min(APPROVAL_CHANGE_LIMIT, change.delta)
      )
      companion.승인점수 += clamped

      for (let i = APPROVAL_THRESHOLDS.length - 1; i >= 0; i--) {
        if (companion.승인점수 >= APPROVAL_THRESHOLDS[i]) {
          companion.단계 = i
          break
        }
      }

      next.로그.push({
        턴: turn,
        변경: `${change.npc} trust ${clamped > 0 ? '+' : ''}${clamped} (${change.reason})`,
        타임스탬프: timestamp,
      })
    }
  }

  // HP 변화
  if (proposal.HP_변화 !== undefined) {
    next.플레이어.HP = Math.max(
      0,
      Math.min(next.플레이어.maxHP, next.플레이어.HP + proposal.HP_변화)
    )
    next.로그.push({ 턴: turn, 변경: `HP ${proposal.HP_변화 > 0 ? '+' : ''}${proposal.HP_변화}`, 타임스탬프: timestamp })
  }

  // 소음 증가
  if (proposal.loud) {
    next.소음 = next.소음 === 'low' ? 'medium' : 'high'
    next.로그.push({ 턴: turn, 변경: `소음 증가: ${proposal.loud.reason}`, 타임스탬프: timestamp })
  }

  // 숨겨진 요소 발견
  if (proposal.발견_요소) {
    for (const id of proposal.발견_요소) {
      if (!next.발견한_요소.includes(id)) {
        next.발견한_요소.push(id)
        next.로그.push({ 턴: turn, 변경: `발견: ${id}`, 타임스탬프: timestamp })
      }
    }
  }

  return next
}
