// 자유 입력 → 행동 태그 분류. 짧은 호출 한 번.
import { NextRequest, NextResponse } from 'next/server'
import { callClaude, errorResponse, resolveKey } from '@/lib/anthropic'

export async function POST(req: NextRequest) {
  try {
    const body: { apiKey?: string; model?: string; system: string; text: string } = await req.json()
    const apiKey = resolveKey(body.apiKey)
    if (!apiKey) return NextResponse.json({ error: 'API 키가 없습니다.' }, { status: 401 })
    if (!body.text || body.text.length > 2000 || !body.system || body.system.length > 6000) {
      return NextResponse.json({ error: 'bad request' }, { status: 400 })
    }
    const { text } = await callClaude({
      apiKey,
      model: body.model,
      system: [{ type: 'text', text: body.system }],
      messages: [{ role: 'user', content: body.text }],
      maxTokens: 2000, // 사고도 여기에 포함된다. 작으면 글자 없이 끝나 모든 입력이 [선택]으로 처리될 수 있다
      allowContinue: false,
    })
    const json = text.match(/\{[\s\S]*\}/)
    return NextResponse.json(json ? JSON.parse(json[0]) : {})
  } catch (e) {
    return errorResponse(e)
  }
}
