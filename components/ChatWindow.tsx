'use client'

import { useEffect, useRef } from 'react'

export interface Message {
  id: string
  role: 'player' | 'gm'
  text: string
}

interface ChatWindowProps {
  messages: Message[]
}

export default function ChatWindow({ messages }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.map(msg => (
        <div
          key={msg.id}
          className={`max-w-2xl ${msg.role === 'player' ? 'ml-auto text-right' : 'mr-auto'}`}
        >
          <div
            className={`inline-block px-4 py-3 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === 'player'
                ? 'bg-zinc-700 text-zinc-100'
                : 'bg-zinc-900 text-zinc-200 border border-zinc-700'
            }`}
          >
            {msg.text}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
