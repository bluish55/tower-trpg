'use client'

import { useEffect, useState } from 'react'
import type { DiceResult } from '@/types/judgment'

interface SystemAlertProps {
  tag: string | null       // '[공격]', '[말]' 등
  diceResult: DiceResult | null
  visible: boolean
  onClose: () => void
}

export default function SystemAlert({ tag, diceResult, visible, onClose }: SystemAlertProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (visible) setShow(true)
  }, [visible])

  if (!show || !diceResult) return null

  const success = diceResult.성공

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/60"
      onClick={() => { setShow(false); onClose() }}
    >
      <div
        className={`border-2 rounded-lg p-6 w-72 font-mono text-sm ${
          success ? 'border-cyan-500 bg-zinc-900 text-cyan-300' : 'border-red-700 bg-zinc-900 text-red-400'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-xs text-zinc-500 mb-3">[ 판 정 ]</div>

        {tag && (
          <div className="text-base font-bold mb-4 text-zinc-200">{tag}</div>
        )}

        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400">주사위</span>
          <span className="text-2xl font-bold">{diceResult.기본}</span>
        </div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400">보정</span>
          <span>{diceResult.능력치보정 + diceResult.기타보정합 >= 0 ? '+' : ''}{diceResult.능력치보정 + diceResult.기타보정합}</span>
        </div>
        <div className="border-t border-zinc-700 my-2" />
        <div className="flex items-center justify-between mb-2">
          <span className="text-zinc-400">합계</span>
          <span className="text-lg font-bold">{diceResult.합계}</span>
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-zinc-400">DC</span>
          <span>{diceResult.DC}</span>
        </div>

        <div className={`text-center text-xl font-bold tracking-widest ${success ? 'text-cyan-300' : 'text-red-500'}`}>
          {success ? '성 공' : '실 패'}
        </div>

        <div className="text-center text-zinc-600 text-xs mt-4">클릭하여 닫기</div>
      </div>
    </div>
  )
}
