'use client'

import { D, Engine } from '@/lib/game/engine'
import type { Game } from '@/lib/game/types'

function Card({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2.5 ${className}`}>
      <p className="mb-1.5 text-[11px] tracking-widest text-zinc-500">{label}</p>
      {children}
    </div>
  )
}

export default function StatusPanel({ game }: { game: Game }) {
  const eng = new Engine(game)
  const r = game.run
  const enemies = r.floor ? eng.here() : []
  const tr = r.trial
  const urgent = tr && tr.limit > 0 && tr.left <= 2 && !tr.failed

  return (
    <aside className="flex flex-col gap-2 text-sm">
      <Card label="지금 있는 곳">
        <p className="text-zinc-200">
          {r.floor && r.room ? `${r.floor}층 ${D.floors[String(r.floor)].name} · ${D.rooms[r.room].name}` : '바깥 — 다이브실'}
        </p>
      </Card>

      {tr && (
        <Card label={tr.title} className={tr.failed || urgent ? 'border-red-700' : ''}>
          <p className="mb-2 text-xs leading-relaxed text-zinc-300">{tr.goal}</p>
          {tr.limit > 0 ? (
            <>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: tr.limit }).map((_, i) => (
                  <i key={i} className={`h-1.5 w-4 rounded ${i < tr.left ? (urgent ? 'bg-red-500' : 'bg-cyan-400') : 'bg-zinc-700'}`} />
                ))}
              </div>
              <p className={`mt-1 text-xs ${tr.failed ? 'text-red-400' : 'text-zinc-500'}`}>
                {tr.failed ? '실패 — 기사가 내려왔다' : `남은 턴 ${tr.left}`}
              </p>
            </>
          ) : <p className="text-xs text-zinc-500">제한 없음</p>}
        </Card>
      )}

      <Card label="몸" className={r.hp <= 6 ? 'border-red-700' : ''}>
        <div className="h-2 overflow-hidden rounded bg-zinc-800">
          <div className={`h-full transition-all duration-500 ${r.hp <= 6 ? 'bg-red-500' : 'bg-cyan-500'}`} style={{ width: `${(Math.max(0, r.hp) / r.maxHp) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-zinc-400">{Math.max(0, r.hp)} / {r.maxHp} · 회복 불가</p>
      </Card>

      {r.floor > 0 && r.floor < 5 && (
        <Card label="적">
          {enemies.length === 0 ? <p className="text-xs text-zinc-600">없음</p> : (
            <ul className="space-y-2">
              {enemies.map(e => (
                <li key={e.uid}>
                  <div className="flex justify-between text-xs"><span className="text-zinc-200">{eng.displayName(e)}</span><span className="text-zinc-500">{e.hp}/{e.max}</span></div>
                  <div className="mt-1 h-1 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-red-500/80" style={{ width: `${(e.hp / e.max) * 100}%` }} /></div>
                  {e.state !== 'engaged' ? <p className="mt-0.5 text-[11px] text-zinc-500">따돌림</p>
                    : e.warn ? <p className="mt-0.5 text-[11px] font-bold text-orange-300">⚠ {e.warn}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {r.floor > 0 && r.floor < 5 && (
        <Card label="기척">
          <div className="flex gap-1.5">
            {Array.from({ length: D.loud_threshold }).map((_, i) => (
              <i key={i} className={`h-3 w-3 rounded-full border ${i < r.loud ? 'border-red-500 bg-red-500' : 'border-zinc-700'}`} />
            ))}
          </div>
        </Card>
      )}

      <Card label="장비 · 능력">
        <ul className="space-y-0.5 text-xs">
          <li><b className="text-zinc-200">{r.weapon.name}</b> <span className="text-zinc-500">{r.weapon.dice}</span></li>
          {r.relics.map(x => <li key={x} className="text-zinc-300">{x}</li>)}
          {Object.values(r.powers).map(p => <li key={p.name} className="text-cyan-300">{p.name} ×{p.uses}</li>)}
        </ul>
      </Card>

      <Card label="동료">
        {r.party.length === 0 ? <p className="text-xs text-zinc-600">혼자다</p> : (
          <ul className="space-y-1.5">
            {r.party.map(m => {
              const c = D.companions[m.id]
              return (
                <li key={m.id}>
                  <div className="flex justify-between text-xs"><span className="text-zinc-200">{c.name}</span><span className="tracking-widest text-cyan-300">{'●'.repeat(m.trust)}{'○'.repeat(3 - m.trust)}</span></div>
                  <p className={`text-[11px] ${m.uses < 2 ? 'text-cyan-400' : 'text-zinc-600'}`}>{c.ability} · {m.uses >= 2 ? '이 층에서 소진' : m.onCooldown ? `${m.uses}/2 · 쿨다운` : `${m.uses}/2`}</p>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {r.notes.length > 0 && (
        <Card label="하은의 쪽지">
          <ul className="space-y-1.5">
            {r.notes.map(n => <li key={n} className="border-l-2 border-cyan-600 pl-2 font-serif text-xs leading-relaxed text-zinc-300">{D.notes[n].text}</li>)}
          </ul>
        </Card>
      )}
    </aside>
  )
}
