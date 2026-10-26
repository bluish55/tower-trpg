import fs from 'fs'
import path from 'path'
import type { RunState } from '@/types/state'

const PAGES_DIR = path.join(process.cwd(), 'data', 'pages')

// frontmatter 제거 후 내용만 반환
function loadPage(filePath: string): string {
  if (!fs.existsSync(filePath)) return ''
  const raw = fs.readFileSync(filePath, 'utf-8')
  return raw.replace(/^---[\s\S]*?---\n\n?/, '').trim()
}

function p(sub: string): string {
  return path.join(PAGES_DIR, sub)
}

// persistent 페이지 로드 순서 (GM이 읽는 순서대로)
const PERSISTENT_ORDER = [
  'gm-identity.md',
  'consequences.md',
  'npc-engine.md',
  'game-mechanics.md',
  'world-overview.md',
  'story-engine.md',
  'pc-jinu.md',
]

// persistent 부분 (캐싱 대상 — 내용이 거의 안 바뀜)
export function buildPersistentContext(): string {
  return PERSISTENT_ORDER
    .map(file => loadPage(p(`persistent/${file}`)))
    .filter(Boolean)
    .join('\n\n')
}

// dynamic 부분 (턴마다 바뀔 수 있음 — 층/NPC/이벤트)
export function buildDynamicContext(
  state: RunState,
  event?: 'dive_start' | 'expulsion' | null
): string {
  const sections: string[] = []

  // 현재 층
  const floorContent = loadPage(p(`floors/floor-${state.현재층}.md`))
  if (floorContent) sections.push(floorContent)

  // 파티 NPC
  for (const companion of state.동료) {
    const content = loadPage(p(`npcs/${companion.id}.md`))
    if (content) sections.push(content)
  }

  // 회색 기사 (투구 상태에 따라)
  if (state.기사_투구) {
    const content = loadPage(p(`npcs/knight-${state.기사_투구}.md`))
    if (content) sections.push(content)
  }

  // 5층 전용
  if (state.현재층 === 5) {
    for (const extra of ['witch-mom', 'endings']) {
      const content = loadPage(p(`npcs/${extra}.md`))
      if (content) sections.push(content)
    }
  }

  // 이벤트
  if (event === 'dive_start' || event === 'expulsion') {
    const content = loadPage(p('npcs/run-frame.md'))
    if (content) sections.push(content)
  }

  return sections.join('\n\n')
}

// 하위 호환용 (단일 문자열이 필요한 곳에서 사용)
export function buildContext(
  state: RunState,
  event?: 'dive_start' | 'expulsion' | null
): string {
  return [buildPersistentContext(), buildDynamicContext(state, event)]
    .filter(Boolean)
    .join('\n\n')
}
