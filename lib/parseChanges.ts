import type { StateChangeProposal } from '@/types/state'

// GM 출력 XML 태그 파싱 → StateChangeProposal
// <trust npc="garret" delta="+1" reason="..." />
// <loud reason="..." />
// <intents>1:promise,2:speak</intents>
// HP는 <resolution>에서 코드가 직접 처리하므로 별도 태그 없음
export function parseStateChanges(gmOutput: string): StateChangeProposal {
  const proposal: StateChangeProposal = {}

  // trust 태그
  const trustMatches = gmOutput.matchAll(/<trust\s+npc="([^"]+)"\s+delta="([+-]?\d+)"\s+reason="([^"]+)"\s*\/?>/g)
  for (const m of trustMatches) {
    proposal.trust ??= []
    proposal.trust.push({ npc: m[1], delta: parseInt(m[2]), reason: m[3] })
  }

  // loud 태그
  const loudMatch = gmOutput.match(/<loud\s+reason="([^"]+)"\s*\/?>/);
  if (loudMatch) {
    proposal.loud = { reason: loudMatch[1] }
  }

  // intents 태그
  const intentsMatch = gmOutput.match(/<intents>([\s\S]*?)<\/intents>/)
  if (intentsMatch) {
    proposal.intents = {}
    for (const part of intentsMatch[1].split(',')) {
      const [num, intent] = part.trim().split(':')
      if (num && intent) proposal.intents[parseInt(num)] = intent.trim()
    }
  }

  // 발견 태그 (기존 호환)
  const foundMatches = gmOutput.matchAll(/\[발견:\s*(\S+)\]/g)
  for (const m of foundMatches) {
    proposal.발견_요소 ??= []
    proposal.발견_요소.push(m[1])
  }

  return proposal
}

// GM 출력에서 선택지 파싱
// 형식: "1. 텍스트 [태그]" 또는 "1. 텍스트 [태그: 대상]"
export interface ParsedChoice {
  number: number
  text: string
  tag: string
  target?: string  // [이동: 2A] → '2A', [사용: item_id] → 'item_id'
}

export function parseChoices(gmOutput: string): ParsedChoice[] {
  const choices: ParsedChoice[] = []
  const pattern = /(\d+)\.\s+(.+?)\s+\[([^\]:]+)(?::\s*([^\]]+))?\]/g

  for (const m of gmOutput.matchAll(pattern)) {
    choices.push({
      number: parseInt(m[1]),
      text: m[2].trim(),
      tag: m[3].trim(),
      target: m[4]?.trim(),
    })
  }

  return choices
}

// 채팅창에 표시할 서술만 추출 (태그 제거)
export function extractNarration(gmOutput: string): string {
  return gmOutput
    .replace(/<trust[^>]*\/?>/g, '')
    .replace(/<loud[^>]*\/?>/g, '')
    .replace(/<intents>[\s\S]*?<\/intents>/g, '')
    .replace(/\[발견:[^\]]*\]/g, '')
    .trim()
}
