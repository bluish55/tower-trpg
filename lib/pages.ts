// 프롬프트 페이지 로더 (서버 전용). data/pages/ 의 .md 파일을 읽는다.
import fs from 'fs'
import path from 'path'

const PAGES_DIR = path.join(process.cwd(), 'data', 'pages')

// 항상 보내는 페이지 (캐싱 대상). 순서 = GM이 읽는 순서
const PERSISTENT = [
  'persistent/gm-identity',
  'persistent/consequences',
  'persistent/npc-engine',
  'persistent/game-mechanics',
  'persistent/world-overview',
  'persistent/story-engine',
  'persistent/pc-jinu',
]

// 조건부로 보낼 수 있는 페이지 (클라이언트가 요청할 수 있는 것만 허용)
const DYNAMIC_ALLOWED = /^(floors\/floor-[1-5]|npcs\/(garret|lira|pio|knight-masked|knight-revealed|witch-mom|endings|run-frame)|stairs\/stairs-[1-4]-[2-5])$/

function loadPage(id: string): string {
  const file = path.join(PAGES_DIR, `${id}.md`)
  if (!fs.existsSync(file)) return ''
  // 맨 위 frontmatter(--- ... ---)는 AI에게 보내지 않는다
  return fs.readFileSync(file, 'utf-8').replace(/^---[\s\S]*?---\s*/, '').trim()
}

const PREAMBLE =
  "You are the narrative Gamemaster of a Korean interactive dark-fantasy game played on a website. " +
  "The pages below are your complete instructions. The website's code holds all game state and has already resolved this turn before calling you. " +
  'Pages not included do not exist for you yet. All player-facing text is Korean.'

export function persistentContext(): string {
  return [PREAMBLE, ...PERSISTENT.map(loadPage).filter(Boolean)].join('\n\n---\n\n')
}

export function dynamicContext(ids: string[]): { text: string; loaded: string[] } {
  const loaded = [...new Set(ids)].filter(id => DYNAMIC_ALLOWED.test(id))
  const bodies = loaded.map(loadPage).filter(Boolean)
  return { text: bodies.length ? '[Pages loaded this turn]\n\n' + bodies.join('\n\n---\n\n') : '', loaded }
}
