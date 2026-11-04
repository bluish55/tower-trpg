// 엔진만 돌리는 시뮬레이션 — AI 서술 없이 자동 플레이
// GET /api/simulate?runs=1&verbose=1
import { NextRequest, NextResponse } from 'next/server'
import { D, Engine, emptyArchive, newGame } from '@/lib/game/engine'
import type { Game, PlayerAction } from '@/lib/game/types'

function pickAction(g: Game): PlayerAction {
  const r = g.run
  const rm = r.room ? D.rooms[r.room] : null

  // 위층 출구 → 무조건 올라감 (기사 차단 제외는 엔진이 처리)
  const up = rm?.exits.find(x => D.rooms[x].floor > r.floor)
  if (up) return { tag: '이동', arg: up, text: '위로 이동', intent: null }

  // 미방문 방 → 이동
  const unvisited = rm?.exits.find(x => !r.visited[x])
  if (unvisited) return { tag: '이동', arg: unvisited, text: '이동', intent: null }

  // 아무 출구로 이동
  const anyExit = rm?.exits[0]
  if (anyExit) return { tag: '이동', arg: anyExit, text: '이동', intent: null }

  return { tag: '선택', arg: null, text: '계속', intent: null }
}

interface RunResult {
  ending: string
  turns: number
  finalHp: number
  maxFloor: number
  log?: string[]
}

function runOnce(verbose: boolean): RunResult {
  const archive = emptyArchive()
  let g: Game = newGame(null, archive)

  // outside → mind: enterTower() 호출
  g.phase = 'mind'
  const initEng = new Engine(g)
  initEng.enterTower()
  g = initEng.g

  const log: string[] = []
  let turns = 0
  const MAX_TURNS = 400

  while (turns < MAX_TURNS) {
    if (g.phase === 'ending' || g.phase === 'run_over') break

    // 보상 선택
    if (g.phase === 'reward') {
      const offer = g.run.offer
      if (!offer?.length) { g.phase = 'mind'; continue }
      const eng = new Engine(g)
      const t = eng.takeReward(offer[0].id)
      if (!t) { g.phase = 'mind'; continue }
      g = eng.g
      g.phase = 'mind'
      if (verbose) log.push(`  [보상] ${offer[0].name} HP:${g.run.hp}`)
      continue
    }

    if (g.phase !== 'mind') break

    turns++
    const action = pickAction(g)
    if (g.run.floor === 5) action.intent = 'promise'

    const eng = new Engine(g)
    const t = eng.resolve(action)
    g = eng.g

    if (verbose) {
      const evts = t.events.map(e => e.type).filter(Boolean).join(',')
      const dmg = t.dmgTaken > 0 ? ` 피해-${t.dmgTaken}` : ''
      const engEng = new Engine(g)
      const enemies = engEng.here().map(e => `${e.type}(${e.hp}hp,${e.state})`).join(' ')
      const trial = g.run.trial ? `시험:${g.run.trial.left}턴` : ''
      const knight = g.run.knight.state !== 'unseen' ? `기사:${g.run.knight.state}(${g.run.knight.hp}hp)` : ''
      const party = g.run.party.map(p => `${p.id}(t${p.trust}${p.injured ? ',부상' : ''})`).join(' ')
      const extra = [enemies, trial, knight, party].filter(Boolean).join(' | ')
      log.push(
        `T${String(turns).padStart(3)} [${g.run.floor}F ${String(g.run.room).padEnd(3)}] ` +
        `${action.tag}${action.arg ? ':' + action.arg : ''}${dmg}` +
        (evts ? ` → ${evts}` : '') +
        ` HP:${g.run.hp}/${g.run.maxHp}` +
        (extra ? `  [${extra}]` : '')
      )
    }

    if (t.events.some(e => e.type === 'reward_offer')) g.phase = 'reward'
    if (t.events.some(e => e.type === 'expelled')) g.phase = 'run_over'
    if (t.events.some(e => e.type === 'ending')) g.phase = 'ending'
    if (t.ended) break
  }

  return {
    ending: g.ending ?? (g.phase === 'run_over' ? 'expelled' : turns >= MAX_TURNS ? 'timeout' : 'unknown'),
    turns,
    finalHp: g.run.hp,
    maxFloor: g.run.maxFloor,
    ...(verbose ? { log } : {}),
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const runs = Math.min(Math.max(Number(url.searchParams.get('runs') ?? '1'), 1), 100)
  const verbose = url.searchParams.get('verbose') === '1'

  const results: RunResult[] = []
  for (let i = 0; i < runs; i++) results.push(runOnce(verbose))

  const endings = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.ending] = (acc[r.ending] ?? 0) + 1
    return acc
  }, {})

  const avg = (fn: (r: RunResult) => number) =>
    Math.round((results.reduce((s, r) => s + fn(r), 0) / runs) * 10) / 10

  return NextResponse.json({
    runs,
    stats: {
      endings,
      avgTurns: avg(r => r.turns),
      avgFinalHp: avg(r => r.finalHp),
      avgMaxFloor: avg(r => r.maxFloor),
    },
    results: verbose || runs === 1 ? results : undefined,
  })
}
