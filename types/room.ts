export type PassageState = '열림' | '잠김' | '숨겨짐' | '없음'

export interface Passage {
  상태: PassageState
  필요?: string   // 잠김일 때 필요한 아이템 ID
  발견?: string   // 숨겨짐일 때 연결된 숨겨진 요소 ID
}

export type PassageValue = PassageState | Passage

export interface Coordinate {
  x: number
  y: number
  z: number
}

export interface SpecialConnection {
  대상: string    // room id
  설명: string
}

export interface HiddenElement {
  id: string
  내용: string
  발견_조건?: {
    판정: string
    난이도: string
  }
  바로_통과?: string   // 플레이어가 이 행동을 직접 말하면 판정 없이 통과
  발견_시: string      // 발견 시 발생하는 일
}

export interface Room {
  id: string
  이름: string
  별칭: string[]
  좌표: Coordinate
  통로: {
    북쪽?: PassageValue
    남쪽?: PassageValue
    동쪽?: PassageValue
    서쪽?: PassageValue
  }
  특수_연결?: SpecialConnection[]
  설명: string
  숨겨진_요소?: HiddenElement[]
}
