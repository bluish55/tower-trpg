import type { DiceResult } from '@/types/judgment'

export type ResultTier = '대성공' | '성공' | '부분_성공' | '실패' | '대실패'

export interface EnemyAction {
  name: string
  action: string   // 예정 행동 (state에 있던 nextAction)
  hit: boolean
  damage: number
}

export interface ResolutionData {
  playerTag: string         // '[공격]', '[말]' 등
  playerText?: string       // 자유 입력일 때 원문
  diceResult: DiceResult | null
  tier: ResultTier
  enemies: EnemyAction[]
}

// 주사위 결과 → 결과 등급
export function calcTier(dice: DiceResult): ResultTier {
  const margin = dice.합계 - dice.DC
  if (margin >= 10) return '대성공'
  if (margin >= 0)  return '성공'
  if (margin >= -4) return '부분_성공'
  if (margin >= -9) return '실패'
  return '대실패'
}

// ResolutionData → <resolution> XML 블록
export function buildResolution(data: ResolutionData): string {
  const lines: string[] = []

  // PC 행동 결과
  if (data.diceResult) {
    const d = data.diceResult
    const rollLine = `${d.기본} + ${d.능력치보정 + d.기타보정합} = ${d.합계} vs DC ${d.DC} → ${data.tier}`
    lines.push(`PC ${data.playerTag} → ${rollLine}`)
  } else {
    lines.push(`PC ${data.playerTag} → 판정 없음`)
  }

  // 적 행동 결과
  for (const enemy of data.enemies) {
    const result = enemy.hit ? `hit (${enemy.damage} damage)` : 'miss'
    lines.push(`${enemy.name} → ${enemy.action} → ${result}`)
  }

  return `<resolution>\n${lines.join('\n')}\n</resolution>`
}
