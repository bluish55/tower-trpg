import type { RunState } from '@/types/state'

// RunState → <state> XML 블록
// Game Mechanics 문서 기준: code가 매 턴 GM에게 보내는 현재 상황
export function buildState(state: RunState): string {
  const lines: string[] = []

  // 층 / 방 / 시험 클락
  const trialLine = state.시험_남은_턴 !== null
    ? `floor: ${state.현재층} | room: ${state.현재방} | trial_turns_left: ${state.시험_남은_턴}`
    : `floor: ${state.현재층} | room: ${state.현재방} | trial: none`
  lines.push(trialLine)

  // 플레이어 상태
  lines.push(
    `HP: ${state.플레이어.HP}/${state.플레이어.maxHP} | weapon: ${state.플레이어.현재_무기} | noise: ${state.소음}`
  )

  // 소지품
  if (state.플레이어.소지품.length > 0) {
    lines.push(`items: ${state.플레이어.소지품.join(', ')}`)
  }

  // 동료
  if (state.동료.length > 0) {
    const companions = state.동료.map(c => {
      const ability = c.능력_사용함 ? 'used' : 'ready'
      return `${c.id} trust:${c.단계} ability:${ability}`
    }).join(', ')
    lines.push(`companions: [${companions}]`)
  }

  // 적
  if (state.현재_적.length > 0) {
    const enemies = state.현재_적.map(e => {
      const weakness = e.weakness ? `weakness:${e.weakness}` : 'weakness:HIDDEN'
      return `${e.name} HP:${e.HP} next:${e.nextAction} ${weakness}`
    }).join(' | ')
    lines.push(`enemies: [${enemies}]`)
  }

  // 발견한 요소
  if (state.발견한_요소.length > 0) {
    lines.push(`discovered: ${state.발견한_요소.join(', ')}`)
  }

  return `<state>\n${lines.join('\n')}\n</state>`
}
