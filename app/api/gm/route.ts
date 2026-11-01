// 메인 GM 호출. 클라이언트(lib/game)가 이미 판정을 끝낸 턴 메시지를 보내면,
// 서버는 프롬프트 페이지를 붙여 Claude에게 서술만 받아 돌려준다.
import { NextRequest, NextResponse } from 'next/server'
import { persistentContext, dynamicContext } from '@/lib/pages'
import { callClaude, errorResponse, resolveKey } from '@/lib/anthropic'

interface GMRequestBody {
  apiKey?: string
  model?: string
  pages: string[]                                             // 조건부 페이지 id (lib/game/prompt.ts dynamicPages)
  messages: { role: 'user' | 'assistant'; content: string }[] // 최근 기록 + 이번 턴 메시지
}

const MAX_MESSAGES = 22
const MAX_CHARS = 60_000

export async function POST(req: NextRequest) {
  try {
    const body: GMRequestBody = await req.json()
    const apiKey = resolveKey(body.apiKey)
    if (!apiKey) return NextResponse.json({ error: 'API 키가 없습니다. 설정에서 Anthropic API 키를 입력해 주세요.' }, { status: 401 })

    const messages = (body.messages ?? []).slice(-MAX_MESSAGES)
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'bad request' }, { status: 400 })
    }
    if (JSON.stringify(messages).length > MAX_CHARS) {
      return NextResponse.json({ error: 'request too large' }, { status: 413 })
    }

    const dyn = dynamicContext(body.pages ?? [])
    const { text, usage } = await callClaude({
      apiKey,
      model: body.model,
      system: [
        // persistent 블록에 캐시 마킹 — 내용이 같으면 두 번째 호출부터 캐시 히트
        { type: 'text', text: persistentContext(), cache_control: { type: 'ephemeral' } },
        ...(dyn.text ? [{ type: 'text' as const, text: dyn.text }] : []),
      ],
      messages,
    })
    return NextResponse.json({ output: text, usage, pages: dyn.loaded })
  } catch (e) {
    return errorResponse(e)
  }
}
