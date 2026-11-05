'use client'

import { useState } from 'react'
import { Engine } from '@/lib/game/engine'
import type { Game } from '@/lib/game/types'

export interface DebugInfo {
  pages: string[]            // 서버가 실제로 붙인 조건부 페이지
  user: string               // 이번 턴에 보낸 user 메시지 (state/resolution/event 포함)
  raw: string                // AI 원문 응답 (태그 포함)
  usage?: { input: number; output: number; thinking?: number; cache_created: number; cache_read: number }
}

/** 개발용. 설정에서 '디버그 보기'를 켜면 보인다. */
export default function DebugPanel({ game, info }: { game: Game; info: DebugInfo | null }) {
  const [tab, setTab] = useState<'state' | 'sent' | 'raw'>('state')
  const eng = new Engine(game)
  const r = game.run
  const state = {
    phase: game.phase, dive: game.dive, floor: r.floor, room: r.room, hp: r.hp, trial: r.trial, loud: r.loud,
    hidden: r.hidden, knight: r.knight, party: r.party, weapon: r.weapon, flags: r.flags, notes: r.notes,
    known: r.known, intents: r.intents, enemies: eng.here(),
  }

  return (
    <div className="rounded-lg border border-amber-800/60 bg-zinc-950 text-xs">
      <div className="flex items-center gap-1 border-b border-zinc-800 p-1.5">
        <span className="px-1 font-bold text-amber-400">DEBUG</span>
        {(['state', 'sent', 'raw'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)} className={`rounded px-2 py-0.5 ${tab === k ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500'}`}>{k}</button>
        ))}
        {info?.usage && (
          <span className="ml-auto text-zinc-500">
            in {info.usage.input} · out {info.usage.output} (think {info.usage.thinking ?? 0}) · cache read {info.usage.cache_read} · write {info.usage.cache_created}
          </span>
        )}
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-2 font-mono text-[11px] leading-snug text-zinc-400">
        {tab === 'state' && JSON.stringify(state, null, 2)}
        {tab === 'sent' && (info ? `pages: ${info.pages.join(', ')}\n\n${info.user}` : '—')}
        {tab === 'raw' && (info?.raw ?? '—')}
      </pre>
    </div>
  )
}
