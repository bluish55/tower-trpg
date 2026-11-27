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

function ProseParas({ paras }: { paras: string[] }) {
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

function Item({ item, gmSize }: { item: FeedItem; gmSize: string }) {
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
    case 'image':
      return item.imageKind === 'character'
        ? <img src={item.src} alt="" className="ml-auto block w-1/2 rounded-lg opacity-90" />
        : <img src={item.src} alt="" className="w-full rounded-lg object-contain opacity-90" />
    case 'gm':
      return (
        <div className={`font-serif leading-[1.85] text-zinc-200 ${gmSize}`}>
          <ProseParas paras={item.text.split(/\n+/).map(p => p.trim()).filter(Boolean)} />
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

const FONT_SIZE = { sm: 'text-[13.5px]', md: 'text-[15.5px]', lg: 'text-[18px]' }

export default function ChatWindow({ feed, loading, live, fontSize = 'md' }: { feed: FeedItem[]; loading: boolean; live: string; fontSize?: 'sm' | 'md' | 'lg' }) {
  const gmSize = FONT_SIZE[fontSize]
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (live) return  // 스트리밍 중엔 live 효과가 처리
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [feed.length, loading, live])

  return (
    <div className="flex flex-col gap-4">
      {feed.map((it, i) => <Item key={i} item={it} gmSize={gmSize} />)}
      {live && <div className={`font-serif leading-[1.85] text-zinc-200 ${gmSize}`}><ProseParas paras={[live]} /></div>}
      {loading && !live && <p className="animate-pulse text-sm text-zinc-500">탑이 이야기를 잇는 중…</p>}
      <div ref={endRef} />
    </div>
  )
}
