import type { Room } from '@/types/room'

// 판정 단계용: 숨겨진 요소 전체 포함
export function getRoomForJudgment(room: Room): Room {
  return room
}

// 서술 단계용: 이번 턴에 발견된 요소만 포함
export function getRoomForNarration(
  room: Room,
  discoveredThisTurn: string[]
): Room {
  return {
    ...room,
    숨겨진_요소: room.숨겨진_요소?.filter(e =>
      discoveredThisTurn.includes(e.id)
    ),
  }
}

// 미발견 숨겨진 통로는 이동 가능 여부에서 제외
export function getPassageState(
  room: Room,
  direction: '북쪽' | '남쪽' | '동쪽' | '서쪽',
  discoveredPassages: string[]
) {
  const passage = room.통로[direction]
  if (!passage) return '없음'

  const state = typeof passage === 'string' ? passage : passage.상태

  if (state === '숨겨짐') {
    const secretId = typeof passage === 'object' ? passage.발견 : undefined
    if (!secretId || !discoveredPassages.includes(secretId)) return '없음'
    return '열림'
  }

  return state
}
