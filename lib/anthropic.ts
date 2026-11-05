// Claude 호출 (서버 전용). 키는 사용자가 보낸 것을 쓴다 (BYOK).
import Anthropic from '@anthropic-ai/sdk'

import { NextResponse } from 'next/server'

export const DEFAULT_MODEL = process.env.GM_MODEL ?? 'claude-sonnet-5-5'

/** 클라이언트가 보낸 모델 이름은 claude-* 형식만 받는다. 아니면 기본값. */
export function pickModel(m?: string): string {
  return m && /^claude-[a-z0-9.-]{1,60}$/.test(m) ? m : DEFAULT_MODEL
}

/** SDK 오류를 한국어 메시지 + 원래 상태 코드로 */
export function errorResponse(e: unknown) {
  const status = typeof e === 'object' && e && 'status' in e && typeof (e as { status: unknown }).status === 'number'
    ? (e as { status: number }).status : 500
  const raw = e instanceof Error ? e.message : String(e)
  const msg =
    status === 401 ? 'API 키가 올바르지 않습니다. 설정에서 키를 확인해 주세요.' :
    status === 404 ? `모델을 찾을 수 없습니다. 설정에서 모델 이름을 확인해 주세요. (${raw})` :
    status === 429 ? '요청이 너무 많거나 크레딧이 부족합니다. 잠시 후 다시 시도해 주세요.' :
    status === 529 ? 'Anthropic 서버가 혼잡합니다. 잠시 후 다시 시도해 주세요.' : raw
  return NextResponse.json({ error: msg }, { status })
}

export function resolveKey(bodyKey?: string): string | null {
  if (bodyKey && bodyKey.trim()) return bodyKey.trim()
  // 서버 키는 개발용으로만: ALLOW_SERVER_KEY=true 일 때만 쓴다 (공개 배포에서 남의 돈으로 플레이되는 것 방지)
  if (process.env.ALLOW_SERVER_KEY === 'true' && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  return null
}

export interface Usage { input: number; output: number; thinking: number; cache_created: number; cache_read: number }

type SystemBlock = { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }

/** 직전 GM 응답에 캐시 지점을 찍는다. 이번 턴 user 메시지는 다음 턴에 짧은 버전으로 바뀌어 다시 읽히지 않으므로 지점을 찍지 않는다 */
export function markHistoryCache(messages: { role: 'user' | 'assistant'; content: string }[]): Anthropic.MessageParam[] {
  const at = messages.length - 2
  return messages.map((m, i) => (
    i === at && m.role === 'assistant' && m.content.trim()
      ? { role: m.role, content: [{ type: 'text' as const, text: m.content, cache_control: { type: 'ephemeral' as const } }] }
      : m
  ))
}

/** 응답이 max_tokens로 잘리면 잘린 지점부터 이어 쓰게 해서 붙인다 (최대 2번) */
export async function callClaude(opts: {
  apiKey: string
  model?: string
  system: SystemBlock[]
  messages: Anthropic.MessageParam[]
  maxTokens?: number
  allowContinue?: boolean
}): Promise<{ text: string; usage: Usage }> {
  const client = new Anthropic({ apiKey: opts.apiKey })
  const usage: Usage = { input: 0, output: 0, thinking: 0, cache_created: 0, cache_read: 0 }
  const once = async (messages: Anthropic.MessageParam[]) => {
    const res = await client.messages.create({
      model: pickModel(opts.model),
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages,
    })
    const u = res.usage as unknown as Record<string, number>
    usage.input += u.input_tokens ?? 0
    usage.output += u.output_tokens ?? 0
    // 사고 토큰은 output_tokens에 포함되어 출력 요금으로 청구된다. 응답에 없으면 0
    usage.thinking += (res.usage as unknown as { output_tokens_details?: { thinking_tokens?: number } }).output_tokens_details?.thinking_tokens ?? 0
    usage.cache_created += u.cache_creation_input_tokens ?? 0
    usage.cache_read += u.cache_read_input_tokens ?? 0
    const text = res.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
    return { text, truncated: res.stop_reason === 'max_tokens' }
  }
  let { text, truncated } = await once(opts.messages)
  for (let i = 0; opts.allowContinue !== false && truncated && i < 2; i++) {
    const more = await once([
      ...opts.messages,
      { role: 'assistant', content: text },
      { role: 'user', content: '(응답이 길이 제한으로 잘렸다. 잘린 바로 그 글자부터 이어서 끝까지 써라. 앞부분을 반복하지 말고, 선택지와 태그를 빠뜨리지 마라.)' },
    ])
    text = joinParts(text, more.text)
    truncated = more.truncated
  }
  return { text, usage }
}

function joinParts(a: string, b: string): string {
  const t = b.replace(/^\s+/, '')
  for (let n = Math.min(80, a.length, t.length); n >= 8; n--) if (a.endsWith(t.slice(0, n))) return a + t.slice(n)
  if (/\s$/.test(a)) return a + t
  if (/^\s/.test(b)) return a + ' ' + t
  if (/^(은|는|이|가|을|를|에|의|도|만|로|으로|와|과|다|고|며|서|게|지|요|죠|니|던|았|었|였|했|한|할|하|해|된|될|되)/.test(t) || /^[,.!?…」』)\]]/.test(t)) return a + t
  return a + ' ' + t
}
