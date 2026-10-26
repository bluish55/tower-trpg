export interface Player {
  HP: number
  maxHP: number
  소지품: string[]
  능력치: Record<string, number>
  현재_무기: string
}

export interface CompanionState {
  id: string            // 'garret' | 'lira' | 'pio'
  승인점수: number
  단계: number          // 0~4
  능력_사용함: boolean  // 이번 층에서 사용 여부
}

export interface EnemyState {
  id: string
  name: string
  HP: number
  maxHP: number
  nextAction: string    // 이번 턴 예정 행동 (서술에 사용)
  weakness: string | null  // null이면 미발견
}

export interface RunState {
  회차: number
  현재층: number
  현재방: string        // 방 id (예: '1A', '2B')
  시험_남은_턴: number | null
  소음: 'low' | 'medium' | 'high'
  기사_투구: 'masked' | 'revealed' | null
  플레이어: Player
  동료: CompanionState[]
  현재_적: EnemyState[]
  열린_문: string[]     // 'roomA-roomB' 형식
  발견한_통로: string[]
  발견한_요소: string[]
  쓰러진_몬스터: string[]
  로그: StateLog[]
}

export interface StateLog {
  턴: number
  변경: string
  타임스탬프: string
}

// GM 출력에서 파싱하는 상태 변경
export interface StateChangeProposal {
  trust?: { npc: string; delta: number; reason: string }[]
  loud?: { reason: string }
  HP_변화?: number
  발견_요소?: string[]
  intents?: Record<number, string>  // { 1: 'promise', 2: 'speak' }
}
