import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { NARRATION_MAX_CHARS } from '@/data/rules'
import type { Room } from '@/types/room'
import type { JudgmentRequest, DiceResult } from '@/types/judgment'

interface NarrateRequestBody {
  playerText: string
  room: Room                    // 서술 단계: 이번 턴 발견된 요소만 포함
  judgment: JudgmentRequest | null
  diceResult: DiceResult | null
  recentHistory: { role: 'player' | 'gm'; text: string }[]
  apiKey?: string
}

const SYSTEM_PROMPT = `You are the NARRATION phase of a TRPG game master AI.
Narrate the outcome of the player's action in Korean, in a dark fantasy webtoon style.

Rules:
- Write in Korean. Max ${NARRATION_MAX_CHARS} characters.
- Do NOT invent hidden information not present in the room sheet.
- If player somehow knows information they shouldn't, accept it naturally without comment.
- At the end, output state change tags in this exact format (omit if no change):
  [승인: <companion_id> <+/-N>, <사유>]
  [아이템획득: <item_id>]
  [아이템소모: <item_id>]
  [HP: <+/-N>]
  [발견: <hidden_element_id>]

Tone: dark, atmospheric, immersive. Avoid game-like language in narration.`

export async function POST(req: NextRequest) {
  try {
    const body: NarrateRequestBody = await req.json()
    const apiKey = body.apiKey ?? process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 401 })
    }

    const client = new Anthropic({ apiKey })

    const diceInfo = body.diceResult
      ? `Dice result: ${body.diceResult.기본} + ${body.diceResult.능력치보정 + body.diceResult.기타보정합} = ${body.diceResult.합계} vs DC ${body.diceResult.DC} → ${body.diceResult.성공 ? 'SUCCESS' : 'FAILURE'}`
      : 'No dice roll (판정_불필요 or 불가능한_행동)'

    const userContent = `Room: ${JSON.stringify(body.room, null, 2)}

${diceInfo}
Judgment memo: ${body.judgment?.서술_메모 ?? 'none'}

Recent history:
${body.recentHistory.map(h => `[${h.role}]: ${h.text}`).join('\n')}

Player action: ${body.playerText}`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const narration = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({ narration })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
