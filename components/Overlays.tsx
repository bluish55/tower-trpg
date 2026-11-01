'use client'

import { Fragment, useState } from 'react'
import { D } from '@/lib/game/engine'
import type { Archive, Choice, Game, RunSummary } from '@/lib/game/types'
import type { Settings } from '@/lib/game/storage'

export function Overlay({ children, onBackdrop }: { children: React.ReactNode; onBackdrop?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onBackdrop?.() }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-200 shadow-2xl">
        {children}
      </div>
    </div>
  )
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => <p className="text-xs tracking-[0.25em] text-cyan-400">{children}</p>
const H2 = ({ children }: { children: React.ReactNode }) => <h2 className="mt-1 font-serif text-2xl text-zinc-50">{children}</h2>
const H4 = ({ children }: { children: React.ReactNode }) => <h4 className="mb-2 mt-5 text-xs tracking-widest text-zinc-500">{children}</h4>
const Ghost = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
  <button {...p} className={`rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-500 ${p.className ?? ''}`} />
const Primary = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
  <button {...p} className={`rounded-md bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-40 ${p.className ?? ''}`} />

/* ---------------- 보상 ---------------- */
export function RewardOverlay({ game, disabled, onPick }: { game: Game; disabled: boolean; onPick: (id: string) => void }) {
  const offer = game.run.offer ?? []
  return (
    <Overlay>
      <Eyebrow>시험 통과</Eyebrow>
      <H2>탑이 보상을 내민다</H2>
      <p className="mt-2 text-sm text-zinc-400">하나만 고를 수 있다. 피의 대가는 지금 바로 HP를 가져가고, HP는 돌아오지 않는다.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {offer.map(c => (
          <button
            key={c.id}
            disabled={disabled || c.disabled}
            onClick={() => onPick(c.id)}
            className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left transition hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40 ${c.cost ? 'border-red-800 bg-red-950/20 hover:border-red-500' : 'border-zinc-700 bg-zinc-900 hover:border-cyan-500'}`}
          >
            <span className="text-[11px] tracking-widest text-zinc-500">{c.kind}</span>
            <span className="font-serif text-lg text-zinc-50">{c.name}</span>
            <span className="text-xs leading-relaxed text-zinc-400">{c.desc}</span>
            {c.cost ? <span className="mt-auto text-xs font-bold text-red-400">HP −{c.cost}{c.disabled ? ' · 감당할 수 없다' : ''}</span> : null}
          </button>
        ))}
      </div>
    </Overlay>
  )
}

/* ---------------- 다이브 요약 ---------------- */
function Recap({ sum }: { sum: RunSummary }) {
  const rows: [string, string][] = [
    ['도달한 곳', `${sum.maxFloor}층 ${D.floors[String(sum.maxFloor)]?.name ?? ''}`],
    ['쓰러뜨린 적', String(sum.kills)],
    ['받은 피해', String(sum.damage)],
    ['마지막 무기', sum.weapon],
    ['함께한 동료', sum.met.length ? sum.met.join(', ') : '없음'],
  ]
  return (
    <>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.map(([k, v]) => <Fragment key={k}><dt className="text-zinc-500">{k}</dt><dd>{v}</dd></Fragment>)}
      </dl>
      <H4>이번 다이브에서 읽은 쪽지</H4>
      <ul className="space-y-1.5">
        {sum.notes.length ? sum.notes.map(n => <li key={n} className="border-l-2 border-cyan-700 pl-2 font-serif text-sm">{D.notes[n].text}</li>)
          : <li className="text-sm text-zinc-600">없음</li>}
      </ul>
    </>
  )
}

export function RunOverOverlay({ game, disabled, onChoice, onClose }: {
  game: Game; disabled: boolean; onChoice: (c: Choice) => void; onClose: () => void
}) {
  const sum = game.dives[game.dives.length - 1]
  if (!sum) return null
  return (
    <Overlay>
      <Eyebrow>{sum.dive}번째 다이브 — 추방</Eyebrow>
      <H2>진우는 아무것도 기억하지 못한다.</H2>
      <p className="mt-2 text-sm text-zinc-400">기억하는 건 당신뿐이다.</p>
      <Recap sum={sum} />
      <H4>다음 다이브</H4>
      <div className="flex flex-col gap-2">
        {game.choices.map(c => (
          <button key={c.n} disabled={disabled} onClick={() => onChoice(c)}
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm hover:border-cyan-600 disabled:opacity-40">
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end"><Ghost onClick={onClose}>방금 장면 다시 읽기</Ghost></div>
    </Overlay>
  )
}

/* ---------------- 결말 ---------------- */
export function EndingOverlay({ game, onNew, onClose }: { game: Game; onNew: () => void; onClose: () => void }) {
  if (!game.ending) return null
  return (
    <Overlay onBackdrop={onClose}>
      <Eyebrow>{game.playthrough}회차 — 결말</Eyebrow>
      <H2>「{D.endings[game.ending].name}」</H2>
      <H4>이번 회차의 다이브</H4>
      <ul className="space-y-1 text-sm">
        {game.dives.map(d => (
          <li key={d.dive} className="grid grid-cols-3 text-zinc-400">
            <span>{d.dive}번째</span><span>{d.maxFloor}층까지</span><span>{d.cause.startsWith('ending') ? '결말' : '추방'}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end gap-2">
        <Ghost onClick={onClose}>결말 다시 읽기</Ghost>
        <Primary onClick={onNew}>새 회차 — 처음부터</Primary>
      </div>
    </Overlay>
  )
}

/* ---------------- 탐사 기록 (회차를 넘어 남는 것: 사용자만 기억한다) ---------------- */
export function ArchiveOverlay({ archive, onClose, onWipe }: { archive: Archive; onClose: () => void; onWipe: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const weak = Object.values(D.enemies).filter(e => e.weak)
  const notes = Object.entries(D.notes).filter(([, n]) => !n.placeholder)
  return (
    <Overlay onBackdrop={onClose}>
      <Eyebrow>탐사 기록</Eyebrow>
      <H2>당신이 기억하는 것</H2>
      <p className="mt-2 text-sm text-zinc-400">진우는 매번 잊는다. 이 기록은 당신의 것이다. 지금까지 {archive.dives}번 들어갔다.</p>
      <H4>약점</H4>
      <ul className="space-y-1 text-sm">
        {weak.map(e => (
          <li key={e.name} className={archive.weak[e.weak!.id] ? '' : 'text-zinc-600'}>
            <b>{e.name}</b> — {archive.weak[e.weak!.id] ? e.weak!.label : '???'}
          </li>
        ))}
      </ul>
      <H4>하은의 쪽지</H4>
      <ul className="space-y-1.5 text-sm">
        {notes.map(([k, n]) => (
          <li key={k} className={archive.notes[k] ? 'border-l-2 border-cyan-700 pl-2 font-serif' : 'pl-2 text-zinc-600'}>
            {archive.notes[k] ? n.text : '???'}
          </li>
        ))}
      </ul>
      <H4>결말</H4>
      <div className="flex flex-wrap gap-2">
        {Object.entries(D.endings).map(([k, n]) => (
          <span key={k} className={`rounded-full border px-2.5 py-0.5 text-xs ${archive.endings[k] ? 'border-cyan-600 text-cyan-200' : 'border-zinc-800 text-zinc-600'}`}>
            {archive.endings[k] ? n.name : '???'}
          </span>
        ))}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        {confirming
          ? <Ghost className="border-red-700 text-red-300" onClick={() => { onWipe(); setConfirming(false) }}>정말 지운다</Ghost>
          : <Ghost onClick={() => setConfirming(true)}>기록 지우기</Ghost>}
        <Primary onClick={onClose}>닫기</Primary>
      </div>
    </Overlay>
  )
}

/* ---------------- 설정 (BYOK) ---------------- */
const MODEL_SUGGESTIONS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5']

export function SettingsOverlay({ initial, onSave, onCancel }: {
  initial: Settings; onSave: (s: Settings) => void; onCancel: () => void
}) {
  const [s, setS] = useState(initial)
  return (
    <Overlay onBackdrop={onCancel}>
      <Eyebrow>설정</Eyebrow>
      <H2>AI 연결</H2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        본인의 Anthropic API 키로 플레이합니다. 키는 이 브라우저에만 저장되고, 매 요청마다 이 앱의 서버를 거쳐 Anthropic으로만 전달됩니다 (서버에 저장하지 않음).
        키는 <span className="text-zinc-200">console.anthropic.com</span> → API Keys 에서 만들 수 있습니다.
      </p>
      <label className="mt-5 block text-xs text-zinc-500">Anthropic API 키</label>
      <input
        type="password" autoComplete="off" value={s.apiKey} placeholder="sk-ant-..."
        onChange={e => setS({ ...s, apiKey: e.target.value.trim() })}
        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm focus:border-cyan-700 focus:outline-none"
      />
      <label className="mt-4 block text-xs text-zinc-500">모델 (비우면 서버 기본값)</label>
      <input
        list="model-suggestions" value={s.model} placeholder="claude-sonnet-5-5"
        onChange={e => setS({ ...s, model: e.target.value.trim() })}
        className="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm focus:border-cyan-700 focus:outline-none"
      />
      <datalist id="model-suggestions">{MODEL_SUGGESTIONS.map(m => <option key={m} value={m} />)}</datalist>
      <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={s.remember} onChange={e => setS({ ...s, remember: e.target.checked })} />
        이 브라우저에 키 기억하기 (끄면 탭을 닫을 때 지워짐)
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={s.debug} onChange={e => setS({ ...s, debug: e.target.checked })} />
        디버그 패널 보기 (상태 · 보낸 프롬프트 · AI 원문)
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <Ghost onClick={onCancel}>취소</Ghost>
        <Primary onClick={() => onSave(s)}>저장</Primary>
      </div>
    </Overlay>
  )
}
