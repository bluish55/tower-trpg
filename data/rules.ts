import { CHECK_TYPES, ATTRIBUTES, DIFFICULTIES } from '@/types/judgment'
import type { CheckType, Attribute, Difficulty } from '@/types/judgment'

export { CHECK_TYPES, ATTRIBUTES, DIFFICULTIES }

// 선택지 태그 → 판정 타입 / 기본 능력치 / 기본 난이도
// 적 tier나 상황에 따라 난이도는 코드에서 조정 가능
export interface ActionRule {
  checkType: CheckType
  attribute: Attribute
  baseDifficulty: Difficulty
}

export const ACTION_TAG_RULES: Record<string, ActionRule> = {
  '공격':  { checkType: '전투',    attribute: '근력',  baseDifficulty: '보통' },
  '회피':  { checkType: '운동',    attribute: '민첩',  baseDifficulty: '보통' },
  '방어':  { checkType: '운동',    attribute: '근력',  baseDifficulty: '보통' },
  '살핌':  { checkType: '지각',    attribute: '지각',  baseDifficulty: '보통' },
  '숨기':  { checkType: '은신',    attribute: '민첩',  baseDifficulty: '어려움' },
  '몸쓰기':{ checkType: '운동',    attribute: '근력',  baseDifficulty: '보통' },
  '말':    { checkType: '설득',    attribute: '매력',  baseDifficulty: '보통' },
  '이동':  { checkType: '판정_불필요', attribute: '민첩', baseDifficulty: '쉬움' },
  '선택':  { checkType: '판정_불필요', attribute: '지력', baseDifficulty: '쉬움' },
  '사용':  { checkType: '판정_불필요', attribute: '지력', baseDifficulty: '쉬움' },
  '동료':  { checkType: '판정_불필요', attribute: '매력', baseDifficulty: '쉬움' },
}

// 난이도별 DC (Difficulty Class)
export const DIFFICULTY_DC: Record<Difficulty, number> = {
  '쉬움': 8,
  '보통': 12,
  '어려움': 16,
  '매우_어려움': 20,
}

// 판정 불필요 / 불가능한 행동은 주사위 안 굴림
export const NO_ROLL_CHECKS: CheckType[] = ['판정_불필요', '불가능한_행동']

// 승인 점수 단계 (문턱값)
export const APPROVAL_THRESHOLDS = [0, 10, 25, 45, 70] as const

// 한 턴 승인 변동 최대치
export const APPROVAL_CHANGE_LIMIT = 2

// AI 응답 글자 수 상한 (서술 프롬프트에 삽입)
export const NARRATION_MAX_CHARS = 700
