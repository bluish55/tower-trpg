'use client'

import { useState } from 'react'
import type { Choice } from '@/lib/game/types'

/** 선택지 버튼 + 자유 입력. 자유 입력은 /api/interpret로 태그를 붙인 뒤 엔진이 판정한다. */
export default function InputBox({ choices, disabled, onChoice, onFree }: {
  choices: Choice[]
  disabled: boolean
  onChoice: (c: Choice) => void
  onFree: (text: string) => void
}) {
  const [text, setText] = useState('')

  const submit = () => {
    const v = text.trim()
    if (!v || disabled) return
    setText('')
    onFree(v)
  }

  return (
    <div className="flex flex-col gap-2">
      {choices.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {choices.map(c => (
            <button
              key={c.n}
              disabled={disabled}
              onClick={() => onChoice(c)}
              className="group flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-left text-sm text-zinc-200 transition hover:border-cyan-600 hover:bg-zinc-900 disabled:opacity-40"
            >
              <span className="w-5 shrink-0 text-xs text-zinc-500">{c.n}</span>
              <span className="flex-1">{c.label}</span>
              {c.tag && (
                <span className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400 group-hover:border-cyan-700 group-hover:text-cyan-300">
                  {c.arg ? `${c.tag}: ${c.arg}` : c.tag}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={e => { e.preventDefault(); submit() }}
      >
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
          }}
          disabled={disabled}
          rows={1}
          maxLength={500}
          placeholder="직접 행동을 적어도 된다 (Enter)"
          className="flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-700 focus:outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="rounded-md bg-cyan-700 px-4 text-sm font-medium text-white hover:bg-cyan-600 disabled:opacity-40"
        >
          행동
        </button>
      </form>
    </div>
  )
}
