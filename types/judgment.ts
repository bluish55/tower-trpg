export const CHECK_TYPES = [
  '설득', '위협', '지각', '은신', '전투', '지식', '운동',
  '판정_불필요', '불가능한_행동',
] as const

export const ATTRIBUTES = ['매력', '지력', '지각', '민첩', '근력'] as const

export const DIFFICULTIES = ['쉬움', '보통', '어려움', '매우_어려움'] as const

export type CheckType = typeof CHECK_TYPES[number]
export type Attribute = typeof ATTRIBUTES[number]
export type Difficulty = typeof DIFFICULTIES[number]

export interface Bonus {
  값: number
  이유: string
}

// AI 판정 호출의 출력 형식
export interface JudgmentRequest {
  해석: string
  판정: CheckType
  능력치: Attribute
  난이도: Difficulty
  보정: Bonus[]
  서술_메모: string
}

// 코드가 계산한 주사위 결과
export interface DiceResult {
  기본: number       // d20 결과
  능력치보정: number
  기타보정합: number
  합계: number
  DC: number
  성공: boolean
}
