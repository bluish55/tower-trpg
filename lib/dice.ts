import type { JudgmentRequest, DiceResult } from '@/types/judgment'
import { DIFFICULTY_DC, NO_ROLL_CHECKS } from '@/data/rules'

export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}

// 판정 요청 + 플레이어 능력치 보정값을 받아 주사위 결과 반환
export function resolveCheck(
  judgment: JudgmentRequest,
  attributeBonus: number
): DiceResult | null {
  if (NO_ROLL_CHECKS.includes(judgment.판정)) return null

  const roll = rollD20()
  const 기타보정합 = judgment.보정.reduce((sum, b) => sum + b.값, 0)
  const 합계 = roll + attributeBonus + 기타보정합
  const DC = DIFFICULTY_DC[judgment.난이도]

  return {
    기본: roll,
    능력치보정: attributeBonus,
    기타보정합,
    합계,
    DC,
    성공: 합계 >= DC,
  }
}
