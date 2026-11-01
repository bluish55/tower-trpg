/* =========================================================
   GM 응답 파싱: 서술 / 선택지 / 태그(<trust>, <loud>, <intents>)
   태그 형식은 data/pages/persistent/game-mechanics.md 와 맞물려 있다.
   ========================================================= */
import type { ActionTag, Choice, CompanionId, Intent } from './types'
import { ACTION_TAGS, INTENTS } from './types'

export interface ParsedResponse {
  prose: string
  choices: Choice[]
  trust: { npc: CompanionId; delta: number; reason: string }[]
  loud: boolean
  intents: Record<string, Intent>
}

/** "텍스트 [태그]" 또는 "텍스트 [태그: 대상]" */
export function parseTag(text: string): { tag: ActionTag; arg: string | null; label: string } | null {
  const m = text.match(/\[([^[\]]+)\]\s*$/)
  if (!m) return null
  const [head, ...rest] = m[1].trim().split(/[:：]/)
  const tag = head.trim() as ActionTag
  if (!ACTION_TAGS.includes(tag)) return null
  return { tag, arg: rest.join(':').trim() || null, label: text.replace(/\s*\[[^[\]]+\]\s*$/, '').trim() }
}

export function parseResponse(raw: string): ParsedResponse {
  const out: ParsedResponse = { prose: '', choices: [], trust: [], loud: false, intents: {} }

  for (const m of raw.matchAll(/<trust\s+npc="(garret|lira|pio)"\s+delta="([+-]?\d)"(?:\s+reason="([^"]*)")?[^>]*\/?>/g)) {
    out.trust.push({ npc: m[1] as CompanionId, delta: Number(m[2]), reason: m[3] ?? '' })
  }
  if (/<loud[^>]*\/?>/.test(raw)) out.loud = true
  const it = raw.match(/<intents>([\s\S]*?)<\/intents>/)
  if (it) {
    for (const part of it[1].split(',')) {
      const [n, id] = part.split(':').map(s => s?.trim())
      if (n && INTENTS.includes(id as Intent)) out.intents[n] = id as Intent
    }
  }

  const text = raw
    .replace(/<trust[^>]*\/?>/g, '')
    .replace(/<loud[^>]*\/?>/g, '')
    .replace(/<intents>[\s\S]*?<\/intents>/g, '')
    .replace(/<\/?(state|pc_knowledge|resolution|reveal|event|player_input|code_notes)[^>]*>/g, '')
    .replace(/`/g, '')
    .trim()

  // 끝에 모여 있는 번호 줄을 선택지로 본다
  const lines = text.split('\n')
  let i = lines.length - 1
  while (i >= 0 && lines[i].trim() === '') i--
  const choiceLines: string[] = []
  while (i >= 0) {
    const L = lines[i].trim()
    if (/^\d{1,2}[.)]\s+/.test(L)) { choiceLines.unshift(L); i--; continue }
    if (L === '' && choiceLines.length) { i--; continue }
    break
  }
  out.choices = choiceLines.map(L => {
    const mm = L.match(/^(\d{1,2})[.)]\s+(.*)$/) as RegExpMatchArray
    const tag = parseTag(mm[2])
    return { n: mm[1], text: mm[2], tag: tag?.tag ?? null, arg: tag?.arg ?? null, label: tag?.label ?? mm[2] }
  })
  out.prose = lines.slice(0, i + 1).join('\n').replace(/\n?-{3,}\s*$/, '').trim()
  return out
}
