import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { CHECK_TYPES, ATTRIBUTES, DIFFICULTIES } from '@/data/rules'
import type { Room } from '@/types/room'

interface JudgeRequestBody {
  playerText: string
  room: Room                                          // 판정 단계: 숨겨진 요소 전체 포함
  recentHistory: { role: 'player' | 'gm'; text: string }[]
  apiKey?: string
}

const SYSTEM_PROMPT = `You are the JUDGE phase of a TRPG game master AI.
Your only job: analyze the player's action and output a JSON judgment object.
Do NOT narrate or describe outcomes. Output JSON only.

Rules:
- 판정 must be one of: ${CHECK_TYPES.join(', ')}
- 능력치 must be one of: ${ATTRIBUTES.join(', ')}
- 난이도 must be one of: ${DIFFICULTIES.join(', ')}
- If no check is needed, set 판정 to "판정_불필요"
- If the action is impossible, set 판정 to "불가능한_행동"
- If player directly states the exact correct action (바로_통과 condition), set 판정 to "판정_불필요"

Output format (JSON only, no markdown):
{
  "해석": "brief interpretation of player action in Korean",
  "판정": "<CheckType>",
  "능력치": "<Attribute>",
  "난이도": "<Difficulty>",
  "보정": [{ "값": <number>, "이유": "<reason in Korean>" }],
  "서술_메모": "hints for narration phase in Korean"
}`

export async function POST(req: NextRequest) {
  try {
    const body: JudgeRequestBody = await req.json()
    const apiKey = body.apiKey ?? process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 })
    }

    const client = new Anthropic({ apiKey })

    const userContent = `Current room: ${JSON.stringify(body.room, null, 2)}

Recent history:
${body.recentHistory.map(h => `[${h.role}]: ${h.text}`).join('\n')}

Player action: ${body.playerText}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''

    // 마크다운 코드블록 제거 후 파싱
    const cleaned = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

    try {
      const judgment = JSON.parse(cleaned)
      return NextResponse.json({ judgment })
    } catch {
      return NextResponse.json({ error: 'Failed to parse judgment', raw }, { status: 500 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
