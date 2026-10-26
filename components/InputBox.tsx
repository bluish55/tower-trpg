'use client'

import { useState, KeyboardEvent } from 'react'

interface InputBoxProps {
  onSubmit: (text: string) => void
  disabled?: boolean
}

export default function InputBox({ onSubmit, disabled }: InputBoxProps) {
  const [value, setValue] = useState('')

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
  }

  return (
    <div className="border-t border-zinc-700 p-4 flex gap-2 items-end">
      <textarea
        className="flex-1 bg-zinc-800 text-zinc-100 rounded-lg px-4 py-3 text-sm resize-none outline-none border border-zinc-600 focus:border-zinc-400 placeholder:text-zinc-500"
        rows={2}
        placeholder="행동을 입력하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        className="px-4 py-3 bg-zinc-600 hover:bg-zinc-500 disabled:opacity-40 text-zinc-100 rounded-lg text-sm transition-colors"
        onClick={submit}
        disabled={disabled || !value.trim()}
      >
        전송
      </button>
    </div>
  )
}
