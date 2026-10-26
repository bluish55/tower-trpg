import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import type { RunState } from '@/types/state'
import type { ResolutionData } from '@/lib/buildResolution'
import { buildPersistentContext, buildDynamicContext } from '@/lib/buildContext'
import { buildState } from '@/lib/buildState'
import { buildResolution } from '@/lib/buildResolution'

interface GMRequestBody {
  state: RunState
  resolution: ResolutionData
  recentHistory: { role: 'player' | 'gm'; text: string }[]
  playerInput: string            // 선택지 텍스트 또는 자유 입력 원문
  event?: 'dive_start' | 'expulsion' | null
  apiKey?: string
}

export async function POST(req: NextRequest) {
  try {
    const body: GMRequestBody = await req.json()
    const apiKey = body.apiKey ?? process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 })
    }

    const client = new Anthropic({ apiKey })

    // 시스템 프롬프트: persistent(캐싱) + dynamic(비캐싱)
    const persistentText = buildPersistentContext()
    const dynamicText = buildDynamicContext(body.state, body.event)

    // 유저 메시지: <state> + <resolution> + 대화 기록 + 플레이어 입력
    const stateXml = buildState(body.state)
    const resolutionXml = buildResolution(body.resolution)

    const historyText = body.recentHistory.length > 0
      ? `Recent history:\n${body.recentHistory.map(h => `[${h.role}]: ${h.text}`).join('\n')}`
      : ''

    const userContent = [stateXml, resolutionXml, historyText, `Player: ${body.playerInput}`]
      .filter(Boolean)
      .join('\n\n')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      // persistent 블록에 캐시 마킹 — 내용이 같으면 API가 자동으로 캐시 히트
      system: [
        {
          type: 'text',
          text: persistentText,
          cache_control: { type: 'ephemeral' },
        },
        ...(dynamicText ? [{
          type: 'text' as const,
          text: dynamicText,
        }] : []),
      ],
      messages: [{ role: 'user', content: userContent }],
    })

    const output = message.content[0].type === 'text' ? message.content[0].text : ''

    // 캐시 사용 현황 (디버그용)
    const usage = {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
      cache_created: (message.usage as unknown as Record<string, number>).cache_creation_input_tokens ?? 0,
      cache_read: (message.usage as unknown as Record<string, number>).cache_read_input_tokens ?? 0,
    }

    return NextResponse.json({ output, usage })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
