'use client'

import { useEffect, useRef } from 'react'
import type { FeedItem, SysNotice } from '@/lib/game/types'

const KIND_STYLE: Record<SysNotice['kind'], string> = {
  trial: 'border-cyan-500/60 bg-cyan-950/30',
  clear: 'border-emerald-500/60 bg-emerald-950/30',
  fail: 'border-red-500/70 bg-red-950/40',
  reward: 'border-amber-400/60 bg-amber-950/30',
  join: 'border-sky-400/60 bg-sky-950/30',
  weak: 'border-violet-400/60 bg-violet-950/30',
  note: 'border-zinc-300/50 bg-zinc-800/40',
  trust: 'border-sky-400/40 bg-sky-950/20',
  info: 'border-zinc-600 bg-zinc-900/60',
}

/** **굵게** 정도만 허용하는 아주 작은 렌더러 (HTML은 넣지 않는다) */
function Prose({ text }: { text: string }) {
  const paras = text.split(/\n+/).map(p => p.trim()).filter(Boolean)
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} className="mb-3 last:mb-0">
          {p.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
            seg.startsWith('**') && seg.endsWith('**')
              ? <strong key={j} className="font-semibold text-zinc-50">{seg.slice(2, -2)}</strong>
              : <span key={j}>{seg}</span>,
          )}
        </p>
      ))}
    </>
  )
}

function Notice({ n }: { n: SysNotice }) {
  return (
    <div className={`rounded-md border-l-4 px-3 py-2 text-sm ${KIND_STYLE[n.kind]}`}>
      <p className="text-xs font-bold tracking-wide text-zinc-100">{n.title}</p>
      <p className="mt-0.5 whitespace-pre-line text-zinc-300">{n.text}</p>
    </div>
  )
}

function Item({ item }: { item: FeedItem }) {
  switch (item.type) {
    case 'player':
      return <div className="ml-auto max-w-[85%] rounded-lg bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200">{item.text}</div>
    case 'divider':
      return (
        <div className="flex items-center gap-3 py-2 text-xs tracking-widest text-zinc-500">
          <span className="h-px flex-1 bg-zinc-800" />{item.text}<span className="h-px flex-1 bg-zinc-800" />
        </div>
      )
    case 'strip':
      // 판정 결과: 서술보다 먼저, 즉시 보인다
      return (
        <div className="rounded-md border border-zinc-800 bg-black/40 px-3 py-2 font-mono text-[12.5px] leading-relaxed">
          {item.lines.map((l, i) => (
            <div key={i} className={l.who === 'enemy' ? 'text-red-300' : l.who === 'ally' ? 'text-sky-300' : l.who === 'sys' ? 'text-zinc-500' : 'text-cyan-200'}>{l.text}</div>
          ))}
        </div>
      )
    case 'sys':
      return <Notice n={item.notice} />
    case 'gm':
      return (
        <div className="font-serif text-[15.5px] leading-[1.85] text-zinc-200">
          <Prose text={item.text} />
          {item.notices && item.notices.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {item.notices.map((n, i) => (
                <span key={i} className="rounded-full border border-sky-700/60 px-2 py-0.5 font-sans text-xs text-sky-200">{n.title} · {n.text}</span>
              ))}
            </div>
          )}
        </div>
      )
  }
}

export default function ChatWindow({ feed, loading }: { feed: FeedItem[]; loading: boolean }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [feed.length, loading])

  return (
    <div className="flex flex-col gap-4">
      {feed.map((it, i) => <Item key={i} item={it} />)}
      {loading && <p className="animate-pulse text-sm text-zinc-500">탑이 이야기를 잇는 중…</p>}
      <div ref={endRef} />
    </div>
  )
}
