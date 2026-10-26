'use client'

import { useState } from 'react'
import type { JudgmentRequest, DiceResult } from '@/types/judgment'
import type { RunState, StateChangeProposal } from '@/types/state'

export interface TokenUsage {
  input: number
  output: number
  cache_created: number
  cache_read: number
}

export interface DebugTurn {
  turn: number
  judgment: JudgmentRequest | null
  diceResult: DiceResult | null
  rawNarration: string
  parsedChanges: StateChangeProposal | null
  usage?: TokenUsage
}

interface DebugPanelProps {
  latest: DebugTurn | null
  state: RunState
}

export default function DebugPanel({ latest, state }: DebugPanelProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'turn' | 'state' | 'log'>('turn')

  return (
    <div className="fixed bottom-0 right-0 z-40 w-full max-w-md font-mono text-xs">
      {/* 토글 버튼 */}
      <button
        onClick={() => setOpen(o => !o)}
        className="ml-auto block bg-zinc-800 border border-zinc-600 text-zinc-400 px-3 py-1 rounded-tl hover:text-zinc-200"
      >
        {open ? '▼ DEBUG' : '▲ DEBUG'}
      </button>

      {open && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-tl max-h-80 flex flex-col">
          {/* 탭 */}
          <div className="flex border-b border-zinc-700">
            {(['turn', 'state', 'log'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1 ${tab === t ? 'text-cyan-400 border-b border-cyan-400' : 'text-zinc-500'}`}
              >
                {t === 'turn' ? '이번 턴' : t === 'state' ? '현재 상태' : '로그'}
              </button>
            ))}
          </div>

          <div className="overflow-auto p-3 flex-1">
            {tab === 'turn' && latest && (
              <div className="space-y-3">
                <Section title={`Turn ${latest.turn} — 판정`}>
                  {latest.judgment ? (
                    <pre className="text-zinc-300">{JSON.stringify(latest.judgment, null, 2)}</pre>
                  ) : <span className="text-zinc-600">없음</span>}
                </Section>

                <Section title="주사위">
                  {latest.diceResult ? (
                    <pre className="text-zinc-300">{JSON.stringify(latest.diceResult, null, 2)}</pre>
                  ) : <span className="text-zinc-600">없음 (판정_불필요 / 불가능)</span>}
                </Section>

                <Section title="raw 서술 (태그 포함)">
                  <pre className="text-zinc-300 whitespace-pre-wrap">{latest.rawNarration}</pre>
                </Section>

                <Section title="파싱된 상태 변경">
                  {latest.parsedChanges && Object.keys(latest.parsedChanges).length > 0 ? (
                    <pre className="text-yellow-300">{JSON.stringify(latest.parsedChanges, null, 2)}</pre>
                  ) : <span className="text-zinc-600">변경 없음</span>}
                </Section>

                {latest.usage && (
                  <Section title="토큰 사용">
                    <div className="space-y-0.5 text-zinc-400">
                      <div>입력 <span className="text-zinc-200">{latest.usage.input}</span></div>
                      <div>출력 <span className="text-zinc-200">{latest.usage.output}</span></div>
                      {latest.usage.cache_created > 0 && (
                        <div>캐시 생성 <span className="text-yellow-400">{latest.usage.cache_created}</span></div>
                      )}
                      {latest.usage.cache_read > 0 && (
                        <div>캐시 히트 <span className="text-cyan-400">{latest.usage.cache_read}</span></div>
                      )}
                    </div>
                  </Section>
                )}
              </div>
            )}

            {tab === 'state' && (
              <pre className="text-zinc-300">{JSON.stringify(state, null, 2)}</pre>
            )}

            {tab === 'log' && (
              <div className="space-y-1">
                {state.로그.length === 0
                  ? <span className="text-zinc-600">로그 없음</span>
                  : [...state.로그].reverse().map((l, i) => (
                    <div key={i} className="text-zinc-400">
                      <span className="text-zinc-600">T{l.턴}</span> {l.변경}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-zinc-500 mb-1">— {title} —</div>
      {children}
    </div>
  )
}
