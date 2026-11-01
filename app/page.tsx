'use client'

import { useSyncExternalStore } from 'react'
import TowerGame from '@/components/TowerGame'

const noop = () => () => {}

// 게임 상태는 브라우저(localStorage)에 있으므로, 마운트된 뒤에만 그린다 (hydration 불일치 방지)
export default function Page() {
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  if (!mounted) return <main className="min-h-screen bg-[#050607]" />
  return <TowerGame />
}
