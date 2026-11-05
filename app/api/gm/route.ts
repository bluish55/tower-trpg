// 메인 GM 호출. 클라이언트(lib/game)가 이미 판정을 끝낸 턴 메시지를 보내면,
// 서버는 프롬프트 페이지를 붙여 Claude에게 서술만 받아 스트리밍으로 돌려준다.
// 응답은 줄 단위 JSON: {type:'text',text} 여러 개 뒤에 {type:'done',...} 또는 {type:'error',error}
import { NextRequest, NextResponse } from 'next/server'
import { persistentContext, dynamicContext } from '@/lib/pages'
import { callClaude, errorInfo, errorResponse, markHistoryCache, resolveKey } from '@/lib/anthropic'

interface GMRequestBody {
  apiKey?: string
  model?: string
  pages: string[]                                             // 조건부 페이지 id (lib/game/prompt.ts dynamicPages)
  messages: { role: 'user' | 'assistant'; content: string }[] // 최근 기록 + 이번 턴 메시지
}

const MAX_MESSAGES = 42 // 기록 40개(components/TowerGame.tsx HISTORY_LIMIT) + 이번 턴 + 여유
const MAX_CHARS = 120_000

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
    const encoder = new TextEncoder()
    let open = true
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: object) => { if (open) controller.enqueue(encoder.encode(JSON.stringify(o) + '\n')) }
        try {
          const { text, usage } = await callClaude({
            apiKey,
            model: body.model,
            system: [
              // 바뀌는 주기별로 캐시 지점을 찍는다: 항상 같은 지침 / 층과 동료 페이지 / 대화 기록(markHistoryCache)
              { type: 'text', text: persistentContext(), cache_control: { type: 'ephemeral' } },
              ...(dyn.text ? [{ type: 'text' as const, text: dyn.text, cache_control: { type: 'ephemeral' as const } }] : []),
            ],
            messages: markHistoryCache(messages),
            onText: text => send({ type: 'text', text }),
            signal: req.signal,
          })
          send({ type: 'done', output: text, usage, pages: dyn.loaded })
        } catch (e) {
          send({ type: 'error', error: errorInfo(e).msg })
        } finally {
          if (open) controller.close()
          open = false
        }
      },
      cancel() { open = false },
    })
    return new Response(stream, {
      headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
