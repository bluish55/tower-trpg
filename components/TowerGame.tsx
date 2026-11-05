'use client'

/* =========================================================
   한 턴의 흐름 (AI는 이야기하고, 코드는 결정한다)
   1. 플레이어가 선택지를 누르거나 직접 적는다
      (직접 적으면 /api/interpret 가 태그만 붙인다)
   2. Engine.resolve() 가 주사위·적 행동·시험·보상·결말을 전부 판정한다
      → 판정 결과(strip)와 시스템 알림이 서술보다 먼저 화면에 뜬다
   3. /api/gm 이 판정 결과를 받아 서술 + 선택지만 쓴다 (한 번 호출)
   4. AI가 붙인 태그(<trust>, <loud>, <intents>)는 코드가 검증한 뒤 반영한다
   ========================================================= */

import { useCallback, useEffect, useRef, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { D, Engine, emptyArchive, newGame, newRun, newTurn } from '@/lib/game/engine'
import { applyFirstEntry, applyOpening, classifierPrompt, dynamicPages, historyText, turnMessage } from '@/lib/game/prompt'
import { liveProse, parseResponse } from '@/lib/game/parse'
import { ACTION_TAGS, INTENTS } from '@/lib/game/types'
import type { Archive, Choice, Game, Intent, PlayerAction, Turn } from '@/lib/game/types'
import {
  clearGame, loadArchive, loadGame, loadSettings, saveArchive, saveGame, saveSettings, type Settings,
} from '@/lib/game/storage'
import ChatWindow from './ChatWindow'
import InputBox from './InputBox'
import StatusPanel from './StatusPanel'
import DebugPanel, { type DebugInfo } from './DebugPanel'
import { ArchiveOverlay, EndingOverlay, HelpOverlay, RewardOverlay, RunOverOverlay, SettingsOverlay } from './Overlays'

// AI에게 보내는 대화 기록 (메시지 수). 앞부분이 매 턴 바뀌면 캐시가 깨지므로 넘을 때 한 번에 자른다
const HISTORY_LIMIT = 40
const HISTORY_KEEP = 20
const FEED_LIMIT = 400   // 화면/저장에 남기는 피드 항목 수

/** AI가 선택지를 안 붙였을 때 쓰는 기본 선택지 */
function fallbackChoices(eng: Engine): Choice[] {
  const r = eng.r
  const rm = r.room ? D.rooms[r.room] : null
  const list: { text: string; tag: Choice['tag']; arg?: string }[] = []
  if (eng.engaged().length) list.push({ text: '앞의 적을 벤다', tag: '공격' }, { text: '몸을 비튼다', tag: '회피' })
  list.push({ text: '주위를 자세히 살핀다', tag: '살핌' })
  rm?.exits.forEach(x => list.push({ text: `${D.rooms[x].name}(으)로 간다`, tag: '이동', arg: x }))
  return list.slice(0, 5).map((c, i) => ({
    n: String(i + 1), text: `${c.text} [${c.tag}${c.arg ? ': ' + c.arg : ''}]`, label: c.text, tag: c.tag, arg: c.arg ?? null,
  }))
}

const choiceLine = (c: Choice) => `${c.n}. ${c.text}`

export default function TowerGame() {
  // 마운트 이후에만 렌더되므로 (app/page.tsx) localStorage를 초기값으로 바로 읽어도 된다
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [archive, setArchive] = useState<Archive>(loadArchive)
  const [game, setGame] = useState<Game | null>(loadGame)
  const [screen, setScreen] = useState<'title' | 'game'>('title')
  const [panel, setPanel] = useState<null | 'settings' | 'archive' | 'help'>(null)
  const [live, setLive] = useState('') // 스트리밍 중인 서술
  const [startAfterSettings, setStartAfterSettings] = useState(false)
  const [phaseOverlayHidden, setPhaseOverlayHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ msg: string; base: Game; fn: (g: Game) => Promise<void> } | null>(null)
  const [debug, setDebug] = useState<DebugInfo | null>(null)
  const [hit, setHit] = useState<'' | 'small' | 'big'>('')
  const [mobileStatus, setMobileStatus] = useState(false)
  const busyRef = useRef(false)
  // API 호출은 항상 최신 설정을 쓴다 (설정 저장 직후 바로 시작하는 경우 포함)
  const settingsRef = useRef(settings)
  const errorRef = useRef<HTMLDivElement>(null)

  // 오류 안내는 피드 아래에 생기므로 보이도록 스크롤한다
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'center' })
  }, [error])

  /* ---------------- 상태 저장 ---------------- */
  const commit = useCallback((g: Game) => {
    if (g.feed.length > FEED_LIMIT) g.feed.splice(0, g.feed.length - FEED_LIMIT)
    const snap = structuredClone(g)
    setGame(snap)
    setArchive(snap.archive)
    saveGame(snap)
  }, [])

  /** 작업용 사본에서 한 턴을 돌린다. 실패하면 턴 시작 전 상태로 되돌린다.
   *  retryFn을 넘기면 실패 시 재시도는 fn 대신 retryFn을 쓴다 (주사위 재굴림 방지용). */
  const run = useCallback(async (
    base: Game,
    fn: (g: Game) => Promise<void>,
    retryFn?: (g: Game) => Promise<void>,
  ) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    const g = structuredClone(base)
    try {
      await fn(g)
    } catch (e) {
      setGame(base)
      setArchive(base.archive)
      saveGame(base)
      setError({ msg: e instanceof Error ? e.message : String(e), base, fn: retryFn ?? fn })
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  /* ---------------- API ---------------- */
  const post = useCallback(async (url: string, body: object) => {
    const { apiKey, model } = settingsRef.current
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey, model: model || undefined, ...body }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`)
    return j
  }, [])

  /** GM 서술을 스트리밍으로 받는다. 글자가 올 때마다 onText를 부르고, 끝나면 전체 결과를 돌려준다 */
  const postStream = useCallback(async (url: string, body: object, onText: (delta: string) => void) => {
    const { apiKey, model } = settingsRef.current
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey, model: model || undefined, ...body }),
    })
    if (!res.ok || !res.body) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error ?? `HTTP ${res.status}`)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = done ? '' : lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        const ev = JSON.parse(line)
        if (ev.type === 'text') onText(ev.text)
        else if (ev.type === 'error') throw new Error(ev.error)
        else if (ev.type === 'done') return ev
      }
      if (done) throw new Error('응답이 중간에 끊겼습니다. 다시 시도해 주세요.')
    }
  }, [])

  /** 자유 입력 → 태그. 실패해도 게임은 멈추지 않는다 (위험 없는 [선택]으로 처리). */
  const classify = useCallback(async (g: Game, text: string): Promise<PlayerAction> => {
    try {
      const j = await post('/api/interpret', { system: classifierPrompt(new Engine(g)), text })
      return {
        tag: ACTION_TAGS.includes(j.tag) ? j.tag : '선택',
        arg: typeof j.arg === 'string' && j.arg ? j.arg : null,
        intent: INTENTS.includes(j.intent) ? (j.intent as Intent) : 'other',
        outOfGame: j.out_of_game === true,
        missingItem: typeof j.missing_item === 'string' && j.missing_item.trim() ? j.missing_item.trim() : null,
        improvised: j.improvised === 'melee' || j.improvised === 'ranged' ? j.improvised : null,
        text,
      }
    } catch {
      return { tag: '선택', arg: null, intent: 'other', text }
    }
  }, [post])

  /* ---------------- 턴 처리 ---------------- */
  const showResolution = useCallback((g: Game, t: Turn) => {
    if (t.lines.length) g.feed.push({ type: 'strip', lines: t.lines })
    t.sys.forEach(n => g.feed.push({ type: 'sys', notice: n }))
    commit(g) // 판정은 서술을 기다리지 않고 바로 보인다
    if (t.dmgTaken > 0) {
      setHit(t.dmgTaken >= 6 ? 'big' : 'small')
      setTimeout(() => setHit(''), 600)
    }
  }, [commit])

  const narrate = useCallback(async (g: Game, t: Turn, playerText: string) => {
    const eng = new Engine(g)
    const msg = turnMessage(eng, t, playerText)
    let raw = '', frame = 0
    const j = await postStream('/api/gm', {
      pages: dynamicPages(eng, t),
      messages: [...g.history, { role: 'user', content: msg }],
    }, delta => {
      raw += delta
      // 화면은 프레임당 한 번만 갱신한다
      frame ||= requestAnimationFrame(() => { frame = 0; setLive(liveProse(raw)) })
    }).finally(() => {
      cancelAnimationFrame(frame)
      frame = 0
      setLive('')
    })
    const p = parseResponse(String(j.output ?? ''))
    setDebug({ pages: j.pages ?? [], user: msg, raw: j.output ?? '', usage: j.usage })
    const notices = eng.applyAITags(p)

    g.history.push(
      { role: 'user', content: historyText(t, playerText) },
      { role: 'assistant', content: p.prose + (p.choices.length ? '\n\n' + p.choices.map(choiceLine).join('\n') : '') },
    )
    if (g.history.length > HISTORY_LIMIT) g.history.splice(0, g.history.length - HISTORY_KEEP)
    g.feed.push({ type: 'gm', text: p.prose, notices })

    const ending = t.events.find(e => e.type === 'ending')
    if (ending && ending.type === 'ending') {
      g.phase = 'ending'
      g.ending = ending.id
      g.choices = []
      g.archive.endings[ending.id] = true
      g.archive.dives++
      g.dives.push(eng.runSummary('ending:' + ending.id))
    } else if (t.events.some(e => e.type === 'expelled')) {
      g.phase = 'run_over'
      g.choices = p.choices.length ? p.choices : [{ n: '1', text: '다시 눕는다 [선택]', label: '다시 눕는다', tag: '선택', arg: null }]
      g.archive.dives++
      g.dives.push(eng.runSummary('expelled'))
    } else if (t.events.some(e => e.type === 'reward_offer')) {
      g.phase = 'reward'
      g.choices = []
    } else {
      g.choices = p.choices.length ? p.choices
        : g.phase === 'mind' ? fallbackChoices(eng)
          : [{ n: '1', text: '들어간다 [선택]', label: '들어간다', tag: '선택', arg: null }]
    }
    setPhaseOverlayHidden(false)
    commit(g)
  }, [postStream, commit])

  const playerAct = useCallback((text: string, choice: Choice | null) => {
    if (!game) return
    let gMid: Game | null = null
    let resolvedTurn: Turn | null = null
    void run(
      game,
      async g => {
        if (g.phase === 'run_over') {
          // 추방 후 선택지를 고르면 탑 밖 장면을 먼저 거친다
          g.dive += 1
          g.run = newRun(g.archive)
          g.history = [] // 진우는 기억하지 못한다. 기억은 탐사 기록(사용자)에만 남는다.
          g.phase = 'outside'
          g.feed.push({ type: 'divider', text: `${g.dive}번째 다이브` }, { type: 'player', text })
          const t = newTurn()
          t.events.push({ type: 'dive_outside' })
          showResolution(g, t)
          gMid = structuredClone(g); resolvedTurn = t
          return narrate(g, t, text)
        }
        if (g.phase === 'outside') {
          g.feed.push({ type: 'player', text })
          g.phase = 'mind'
          const t = new Engine(g).enterTower()
          showResolution(g, t)
          // 첫 다이브에 버튼을 누르면 고정 장면으로 바로 시작한다 (직접 입력은 AI가 서술)
          if (g.dive === 1 && choice) {
            applyFirstEntry(g, t, choice.n, text)
            setDebug(null)
            commit(g)
            return
          }
          gMid = structuredClone(g); resolvedTurn = t
          return narrate(g, t, text)
        }
        if (g.phase !== 'mind') return
        g.feed.push({ type: 'player', text })
        commit(g)
        const action: PlayerAction = choice?.tag
          ? {
              tag: choice.tag, arg: choice.arg, text: choice.label, intent: null,
              // GM이 붙인 [공격: 지형] / [공격: 지형 원거리]
              improvised: choice.arg?.includes('지형') ? (choice.arg.includes('원거리') ? 'ranged' : 'melee') : null,
            }
          : await classify(g, text)
        // 게임 밖 입력: 판정도 GM 호출도 없다. 턴이 흐르지 않고 선택지도 그대로 남는다
        if (action.outOfGame) {
          g.feed.push({ type: 'sys', notice: { kind: 'info', title: '게임 밖 입력', text: '게임 밖 질문에는 답하지 않아요. 턴은 쓰지 않았어요.' } })
          commit(g)
          return
        }
        if (g.run.floor === 5) {
          // 5층: 선택지에 붙은 의도(<intents>)가 우선, 없으면 분류기에게 묻는다
          const fromChoice = choice ? g.run.intents[choice.n] : undefined
          action.intent = fromChoice ?? (choice ? (await classify(g, text)).intent : action.intent)
        }
        const t = new Engine(g).resolve(action)
        // reward_offer는 narrate 전에 phase를 설정해야 새로고침 시 고착되지 않는다
        if (t.events.some(e => e.type === 'reward_offer')) g.phase = 'reward'
        showResolution(g, t)
        gMid = structuredClone(g); resolvedTurn = t
        await narrate(g, t, text)
      },
      // narrate만 재시도 — 주사위를 다시 굴리지 않는다
      async () => {
        if (!gMid || !resolvedTurn) throw new Error('판정 결과가 없습니다.')
        await narrate(structuredClone(gMid), resolvedTurn, text)
      },
    )
  }, [game, run, showResolution, narrate, commit, classify])

  const pickReward = useCallback((ids: string[]) => {
    if (!game || !ids.length) return
    let gMid: Game | null = null
    let resolvedTurn: Turn | null = null
    let names = ''
    void run(
      game,
      async g => {
        const cards = ids.map(id => (g.run.offer ?? []).find(c => c.id === id)).filter(c => !!c)
        const t = new Engine(g).takeReward(ids[0], ids[1])
        if (!cards.length || !t) return
        names = t.events.flatMap(e => (e.type === 'reward_taken' ? [e.card.name] : [])).join(', ')
        g.phase = 'mind'
        g.feed.push({ type: 'player', text: `보상: ${names}` })
        showResolution(g, t)
        gMid = structuredClone(g); resolvedTurn = t
        await narrate(g, t, `(보상 선택: ${names})`)
      },
      async () => {
        if (!gMid || !resolvedTurn) throw new Error('판정 결과가 없습니다.')
        await narrate(structuredClone(gMid), resolvedTurn, `(보상 선택: ${names})`)
      },
    )
  }, [game, run, showResolution, narrate])

  const beginOpening = useCallback((g0: Game) => {
    const g = structuredClone(g0)
    applyOpening(g)
    setError(null)
    commit(g)
  }, [commit])

  const startGame = useCallback((fresh: boolean) => {
    let g = game
    if (fresh || !g) {
      g = newGame(g && g.phase === 'ending' ? g : null, archive)
      commit(g)
    }
    setScreen('game')
    setPhaseOverlayHidden(false)
    if (g.phase === 'title') beginOpening(g)
  }, [game, archive, commit, beginOpening])

  const requestStart = (fresh: boolean) => {
    if (!settings.apiKey) { setStartAfterSettings(true); setPanel('settings'); return }
    if (fresh) clearGame()
    startGame(fresh)
  }

  /* ---------------- 키보드 1–9 ---------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== 'game' || busy || panel || !game || !['mind', 'outside'].includes(game.phase)) return
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT') return
      if (!/^[1-9]$/.test(e.key)) return
      const c = game.choices.find(x => x.n === e.key)
      if (c) playerAct(c.label, c)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, busy, panel, game, playerAct])

  /* ---------------- 화면 ---------------- */
  const hasSave = !!game && game.phase !== 'title'
  const shownArchive = game?.archive ?? archive

  const settingsPanel = panel === 'settings' && (
    <SettingsOverlay
      initial={settings}
      onCancel={() => { setPanel(null); setStartAfterSettings(false) }}
      onSave={s => {
        settingsRef.current = s
        setSettings(s)
        saveSettings(s)
        setPanel(null)
        if (startAfterSettings && s.apiKey) {
          setStartAfterSettings(false)
          if (!hasSave) clearGame()
          startGame(!hasSave)
        }
      }}
    />
  )
  const archivePanel = panel === 'archive' && (
    <ArchiveOverlay
      archive={shownArchive}
      onClose={() => setPanel(null)}
      onWipe={() => {
        const a = emptyArchive()
        setArchive(a)
        saveArchive(a)
        if (game) commit({ ...game, archive: a })
      }}
    />
  )

  const helpPanel = panel === 'help' && <HelpOverlay onClose={() => setPanel(null)} />
  const helpButton = (className: string) => (
    <button onClick={() => setPanel('help')} aria-label="게임 규칙 보기" title="게임 규칙" className={className}>
      <CircleHelp className="size-5" aria-hidden />
    </button>
  )

  if (screen === 'title' || !game) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-[radial-gradient(ellipse_at_top,#0e2a33,#050607_70%)] px-6 text-zinc-200">
        {helpButton('absolute right-4 top-4 rounded p-1.5 text-zinc-400 hover:text-zinc-100')}
        <div className="text-center">
          <p className="text-xs tracking-[0.4em] text-cyan-400/80">AI TRPG</p>
          <h1 className="mt-3 font-serif text-4xl text-zinc-50 sm:text-5xl">꼭대기까지 데려다줄게</h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-400">
            3년째 깨어나지 않는 여동생의 머릿속, 그 애가 좋아하던 판타지 소설 속 탑.
            오빠는 그 탑을 오른다. 몇 번이고.
          </p>
        </div>
        <div className="flex w-full max-w-xs flex-col gap-2">
          {hasSave && (
            <button onClick={() => requestStart(false)} className="rounded-md bg-cyan-700 py-2.5 text-sm font-medium text-white hover:bg-cyan-600">
              이어하기
            </button>
          )}
          <button
            onClick={() => requestStart(true)}
            className={`rounded-md py-2.5 text-sm font-medium ${hasSave ? 'border border-zinc-700 text-zinc-300 hover:border-zinc-500' : 'bg-cyan-700 text-white hover:bg-cyan-600'}`}
          >
            {hasSave ? '처음부터 (탐사 기록은 남음)' : '시작하기'}
          </button>
          <div className="mt-2 flex gap-2">
            <button onClick={() => setPanel('archive')} className="flex-1 rounded-md border border-zinc-800 py-2 text-xs text-zinc-400 hover:border-zinc-600">탐사 기록</button>
            <button onClick={() => setPanel('settings')} className="flex-1 rounded-md border border-zinc-800 py-2 text-xs text-zinc-400 hover:border-zinc-600">설정</button>
          </div>
        </div>
        {settingsPanel}
        {archivePanel}
        {helpPanel}
      </main>
    )
  }

  const r = game.run
  const inputPhase = ['mind', 'outside', 'run_over'].includes(game.phase)
  const warns = r.floor ? new Engine(game).engaged().filter(e => e.warn).length : 0

  return (
    <main data-floor={r.floor} className="min-h-screen bg-[#07090a] text-zinc-200">
      {/* 피격 효과: 화면 가장자리 붉은 빛 (transform을 main에 걸면 fixed 오버레이 위치가 깨진다) */}
      <div
        aria-hidden
        className={`pointer-events-none fixed inset-0 z-40 transition-opacity duration-500 ${hit ? 'opacity-100' : 'opacity-0'} ${hit === 'big' ? 'shadow-[inset_0_0_140px_rgba(220,38,38,.7)]' : 'shadow-[inset_0_0_90px_rgba(220,38,38,.45)]'}`}
      />
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b sm:gap-3 border-zinc-900 bg-[#07090a]/90 px-4 py-2 backdrop-blur">
        <button onClick={() => setScreen('title')} className="shrink-0 font-serif text-sm whitespace-nowrap text-zinc-300 hover:text-white"><span className="sm:hidden">꼭대기</span><span className="hidden sm:inline">꼭대기까지 데려다줄게</span></button>
        <span className="hidden text-xs whitespace-nowrap text-zinc-600 sm:inline">{game.playthrough}회차 · {game.dive}번째 다이브</span>
        {r.floor > 0 && (
          <span className="flex gap-2 text-xs whitespace-nowrap lg:hidden">
            <span className={r.hp <= 6 ? 'text-red-400' : 'text-zinc-400'}>HP {Math.max(0, r.hp)}/{r.maxHp}</span>
            {r.trial && r.trial.limit > 0 && <span className={r.trial.left <= 2 ? 'text-red-400' : 'text-zinc-400'}>{r.trial.failed ? '기사!' : `턴 ${r.trial.left}`}</span>}
            {warns > 0 && <span className="text-orange-300">⚠{warns}</span>}
          </span>
        )}
        <span className="ml-auto flex shrink-0 gap-1 whitespace-nowrap">
          <button onClick={() => setMobileStatus(v => !v)} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200 lg:hidden">{mobileStatus ? '상태 닫기' : '상태'}</button>
          <button onClick={() => setPanel('archive')} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200">
            <span className="sm:hidden">기록</span><span className="hidden sm:inline">탐사 기록</span>
          </button>
          <button onClick={() => setPanel('settings')} className="rounded px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200">설정</button>
          {helpButton('rounded px-1.5 py-1 text-zinc-500 hover:text-zinc-200')}
        </span>
      </header>

      <div className={`mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_280px] ${hit === 'big' ? 'animate-[shake_.4s]' : ''}`}>
        <section className="flex min-w-0 flex-col gap-5">
          {mobileStatus && <div className="lg:hidden"><StatusPanel game={game} /></div>}
          <ChatWindow feed={game.feed} loading={busy} live={live} />

          {error && (
            <div ref={errorRef} className="rounded-md border border-red-800 bg-red-950/40 p-3 text-sm">
              <p className="text-red-200">{error.msg}</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => { const { base, fn } = error; setError(null); void run(base, fn) }} className="rounded bg-red-800 px-3 py-1 text-xs text-white">다시 시도</button>
                <button onClick={() => setError(null)} className="rounded border border-red-900 px-3 py-1 text-xs text-red-300">닫기</button>
                {/401|키/.test(error.msg) && <button onClick={() => setPanel('settings')} className="rounded border border-red-900 px-3 py-1 text-xs text-red-300">설정 열기</button>}
              </div>
            </div>
          )}

          {inputPhase && !busy && (
            <InputBox
              choices={game.choices}
              disabled={busy}
              onChoice={c => playerAct(c.label, c)}
              onFree={text => playerAct(text, null)}
            />
          )}
          {game.phase === 'ending' && phaseOverlayHidden && (
            <button onClick={() => setPhaseOverlayHidden(false)} className="self-start rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300">결말 화면 열기</button>
          )}

          {settings.debug && <DebugPanel game={game} info={debug} />}
        </section>

        <div className="hidden lg:block">
          <div className="sticky top-16"><StatusPanel game={game} /></div>
        </div>
      </div>

      {game.phase === 'reward' && <RewardOverlay game={game} disabled={busy} onPick={pickReward} />}
      {game.phase === 'run_over' && !phaseOverlayHidden && !busy && (
        <RunOverOverlay game={game} disabled={busy} onChoice={c => playerAct(c.label, c)} onClose={() => setPhaseOverlayHidden(true)} />
      )}
      {game.phase === 'ending' && !phaseOverlayHidden && (
        <EndingOverlay
          game={game}
          onClose={() => setPhaseOverlayHidden(true)}
          onNew={() => { clearGame(); startGame(true) }}
        />
      )}
      {settingsPanel}
      {archivePanel}
      {helpPanel}
    </main>
  )
}
