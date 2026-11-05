// 엔진만 돌리는 시뮬레이션 — AI 서술 없이 자동 플레이
// GET /api/simulate?runs=100&strategy=explorer&verbose=1
// GET /api/simulate?runs=1000&compare=1   ← 4가지 전략 비교
import { NextRequest, NextResponse } from 'next/server'
import { D, Engine, emptyArchive, newGame } from '@/lib/game/engine'
import type { EndingId, Game, PlayerAction } from '@/lib/game/types'

type Strategy = 'up' | 'random' | 'explorer' | 'fighter' | 'cautious'

/* ---- 약점 키워드 맵 (공격 텍스트에 포함) ---- */
function weakText(type: string): string {
  const keys = (D.enemies[type as keyof typeof D.enemies] as { weak?: { keys?: string[] } })?.weak?.keys
  return keys?.[0] ?? ''
}

function rndPick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

/* ============================================================
   전략별 행동 선택
   ============================================================ */

/** up: 무조건 위로만 (기존 동작) */
function pickUp(g: Game): PlayerAction {
  const r = g.run
  const rm = r.room ? D.rooms[r.room] : null
  const up = rm?.exits.find(x => D.rooms[x].floor > r.floor)
  if (up) return { tag: '이동', arg: up, text: '위로 이동', intent: null }
  const unvisited = rm?.exits.find(x => !r.visited[x])
  if (unvisited) return { tag: '이동', arg: unvisited, text: '이동', intent: null }
  return { tag: '이동', arg: rm?.exits[0] ?? null, text: '이동', intent: null }
}

/** random: 완전 무작위 */
function pickRandom(g: Game): PlayerAction {
  const r = g.run
  const rm = r.room ? D.rooms[r.room] : null
  const eng = new Engine(g)
  const enemies = eng.here()
  const hasNpc = rm?.npc && !r.party.some(p => p.id === rm.npc) && !r.abandoned.includes(rm.npc as never)

  if (enemies.length) {
    const combatActions: PlayerAction[] = [
      { tag: '공격', arg: null, text: '공격', intent: null },
      { tag: '회피', arg: null, text: '회피', intent: null },
      { tag: '방어', arg: null, text: '방어', intent: null },
      { tag: '살핌', arg: null, text: '살핌', intent: null },
      { tag: '숨기', arg: null, text: '숨기', intent: null },
    ]
    if (rm?.exits.length) combatActions.push({ tag: '이동', arg: rndPick(rm.exits), text: '이동', intent: null })
    return rndPick(combatActions)
  }

  const actions: PlayerAction[] = []
  if (rm?.exits.length) {
    for (const e of rm.exits) actions.push({ tag: '이동', arg: e, text: '이동', intent: null })
  }
  if (hasNpc) actions.push({ tag: '말', arg: null, text: '말을 건다', intent: null })
  actions.push({ tag: '살핌', arg: null, text: '살핌', intent: null })
  return actions.length ? rndPick(actions) : { tag: '선택', arg: null, text: '계속', intent: null }
}

/** explorer: 동료 영입 우선 → 약점 활용 → 위로 */
function pickExplorer(g: Game): PlayerAction {
  const r = g.run
  const rm = r.room ? D.rooms[r.room] : null
  const eng = new Engine(g)
  const enemies = eng.here()

  // 쓰러진 동료 일으키기
  const down = r.party.find(p => p.down)
  if (down) return { tag: '동료', arg: down.id, text: `${D.companions[down.id].name}을 일으킨다`, intent: null }

  // NPC 있으면 말 시도
  const hasNpc = rm?.npc && !r.party.some(p => p.id === rm.npc) && !r.abandoned.includes(rm.npc as never)
  if (hasNpc && !enemies.length) return { tag: '말', arg: null, text: '말을 건다', intent: null }

  // 교전 중
  if (enemies.length) {
    const target = enemies[0]
    // 약점 알고 있으면 공격
    const def = D.enemies[target.type as keyof typeof D.enemies] as { weak?: { id: string; keys?: string[] } } | undefined
    if (def?.weak && r.known[def.weak.id]) {
      const wt = weakText(target.type)
      return { tag: '공격', arg: null, text: `${wt} 공격`, intent: null }
    }
    // 모르면 살핌으로 약점 파악
    if (def?.weak && !r.known[def.weak.id]) return { tag: '살핌', arg: null, text: '살핌', intent: null }
    return { tag: '공격', arg: null, text: '공격', intent: null }
  }

  // 위층 출구
  const up = rm?.exits.find(x => D.rooms[x].floor > r.floor)
  if (up) return { tag: '이동', arg: up, text: '위로 이동', intent: null }

  // 미방문 방
  const unvisited = rm?.exits.find(x => !r.visited[x])
  if (unvisited) return { tag: '이동', arg: unvisited, text: '이동', intent: null }

  return { tag: '이동', arg: rm?.exits[0] ?? null, text: '이동', intent: null }
}

/** fighter: 항상 공격 → 위로 */
function pickFighter(g: Game): PlayerAction {
  const r = g.run
  const rm = r.room ? D.rooms[r.room] : null
  const eng = new Engine(g)
  const enemies = eng.here()

  const down = r.party.find(p => p.down)
  if (down) return { tag: '동료', arg: down.id, text: `${D.companions[down.id].name}을 일으킨다`, intent: null }

  if (enemies.length) {
    const target = enemies[0]
    const wt = weakText(target.type)
    return { tag: '공격', arg: null, text: wt ? `${wt} 공격` : '공격', intent: null }
  }

  const up = rm?.exits.find(x => D.rooms[x].floor > r.floor)
  if (up) return { tag: '이동', arg: up, text: '위로 이동', intent: null }

  const unvisited = rm?.exits.find(x => !r.visited[x])
  if (unvisited) return { tag: '이동', arg: unvisited, text: '이동', intent: null }

  return { tag: '이동', arg: rm?.exits[0] ?? null, text: '이동', intent: null }
}

/** cautious: 숨기 → 숨은 상태로 위로 이동. 위로 못 가면 싸운다 (왕복 방지) */
function pickCautious(g: Game): PlayerAction {
  const r = g.run
  const rm = r.room ? D.rooms[r.room] : null
  const eng = new Engine(g)
  const enemies = eng.here()

  const down = r.party.find(p => p.down)
  if (down) return { tag: '동료', arg: down.id, text: `${D.companions[down.id].name}을 일으킨다`, intent: null }

  if (enemies.length) {
    const up = rm?.exits.find(x => D.rooms[x].floor > r.floor)
    // 숨겨진 상태면 위로 이동, 없으면 싸운다
    if (r.hidden) {
      if (up) return { tag: '이동', arg: up, text: '위로 이동', intent: null }
      // 위로 못 가면 싸움 (왕복 방지)
      const target = enemies[0]
      const wt = weakText(target.type)
      return { tag: '공격', arg: null, text: wt ? `${wt} 공격` : '공격', intent: null }
    }
    // 숨기 시도
    return { tag: '숨기', arg: null, text: '숨기', intent: null }
  }

  const up = rm?.exits.find(x => D.rooms[x].floor > r.floor)
  if (up) return { tag: '이동', arg: up, text: '위로 이동', intent: null }

  const unvisited = rm?.exits.find(x => !r.visited[x])
  if (unvisited) return { tag: '이동', arg: unvisited, text: '이동', intent: null }

  return { tag: '이동', arg: rm?.exits[0] ?? null, text: '이동', intent: null }
}

function pickAction(g: Game, strategy: Strategy): PlayerAction {
  switch (strategy) {
    case 'random':   return pickRandom(g)
    case 'explorer': return pickExplorer(g)
    case 'fighter':  return pickFighter(g)
    case 'cautious': return pickCautious(g)
    default:         return pickUp(g)
  }
}

/* ============================================================
   불변성 + 규칙 검사 (docs/mechanics.md R10 기반)
   ============================================================ */
import type { Turn } from '@/lib/game/types'

function checkRules(g: Game, t: Turn, prevRoom: string | null, prevHp: number): string[] {
  const r = g.run
  const v: string[] = []

  // ── R10 구조적 불변성 ──────────────────────────────────────
  // I1: hp ≤ maxHp
  if (r.hp > r.maxHp) v.push(`I1: hp ${r.hp} > maxHp ${r.maxHp}`)
  // I2: trust ∈ [0, 3]
  for (const m of r.party) {
    if (m.trust < 0 || m.trust > 3) v.push(`I2: ${m.id} trust=${m.trust} out of range`)
  }
  // I3: party에 중복 id 없음
  const partyIds = r.party.map(m => m.id)
  if (new Set(partyIds).size !== partyIds.length) v.push(`I3: party에 중복 id — [${partyIds.join(',')}]`)
  // I4: party ∩ left = ∅
  for (const m of r.party) {
    if (r.left.some(l => l.id === m.id)) v.push(`I4: ${m.id}가 party와 left에 동시 존재`)
  }
  // I5: party ∩ abandoned = ∅
  for (const m of r.party) {
    if (r.abandoned.includes(m.id)) v.push(`I5: ${m.id}가 party와 abandoned에 동시 존재`)
  }
  // I6: left ∩ abandoned = ∅
  for (const l of r.left) {
    if (r.abandoned.includes(l.id)) v.push(`I6: ${l.id}가 left와 abandoned에 동시 존재`)
  }
  // I7: kills ≥ 0
  if (r.kills < 0) v.push(`I7: kills=${r.kills} < 0`)
  // I8: floor ∈ [0, 5]
  if (r.floor < 0 || r.floor > 5) v.push(`I8: floor=${r.floor} out of range`)
  // I9: trial.left ≥ 0
  if (r.trial && r.trial.left < 0) v.push(`I9: trial.left=${r.trial.left} < 0`)
  // I10: offer != null → pendingMove != null
  if (r.offer !== null && r.pendingMove === null) v.push(`I10: offer 있는데 pendingMove null`)
  // I11: engaged 적은 hp > 0
  for (const [roomId, enemies] of Object.entries(r.enemies)) {
    for (const e of enemies) {
      if (e.state === 'engaged' && e.hp <= 0) v.push(`I11: ${roomId}의 ${e.type}(uid${e.uid}) engaged인데 hp=${e.hp}`)
    }
  }

  // ── 이벤트 일관성 ──────────────────────────────────────────
  for (const ev of t.events) {
    if (ev.type === 'companion_join') {
      if (!r.party.some(m => m.id === ev.id)) v.push(`E: companion_join(${ev.id}) 이벤트인데 party에 없음`)
    }
    if (ev.type === 'companion_abandoned') {
      if (!r.abandoned.includes(ev.id)) v.push(`E: companion_abandoned(${ev.id}) 이벤트인데 abandoned에 없음`)
    }
    if (ev.type === 'companion_found') {
      if (!r.party.some(m => m.id === ev.id)) v.push(`E: companion_found(${ev.id}) 이벤트인데 party에 없음`)
    }
    if (ev.type === 'knight_defeated') {
      if (r.knight.state !== 'defeated') v.push(`E: knight_defeated 이벤트인데 state=${r.knight.state}`)
    }
    if (ev.type === 'reward_offer') {
      if (!r.offer) v.push(`E: reward_offer 이벤트인데 r.offer null`)
      if (!r.pendingMove) v.push(`E: reward_offer 이벤트인데 r.pendingMove null`)
    }
  }

  // ── 행동 사후 조건 ─────────────────────────────────────────
  // hp ≤ 0이면 expelled 이벤트 있어야 함 (godmode 제외 — 호출자가 판단)
  if (prevHp > 0 && r.hp <= 0 && !t.events.some(e => e.type === 'expelled')) {
    v.push(`P: hp ${prevHp}→${r.hp}인데 expelled 이벤트 없음`)
  }
  // trial.left = 0이고 실패 판정됐으면 trial.failed = true여야 함
  if (r.trial && r.trial.left <= 0 && r.trial.limit > 0 && !r.trial.failed) {
    v.push(`P: trial.left=0인데 trial.failed=false`)
  }
  // 이동 이벤트 없이 room이 바뀌면 버그
  const movedByLog = t.lines.some(l => l.text.startsWith('이동 →'))
  if (r.room && prevRoom && r.room !== prevRoom && !movedByLog) {
    v.push(`P: room ${prevRoom}→${r.room}인데 이동 로그 없음`)
  }

  return v
}

/* ============================================================
   단일 런
   ============================================================ */
interface RunResult {
  ending: string
  turns: number
  finalHp: number
  maxFloor: number
  violations: string[]
  log?: string[]
}

function runOnce(strategy: Strategy, verbose: boolean, godmode = false): RunResult {
  const archive = emptyArchive()
  let g: Game = newGame(null, archive)

  g.phase = 'mind'
  const initEng = new Engine(g)
  initEng.enterTower()
  g = initEng.g

  const log: string[] = []
  const violations: string[] = []
  let turns = 0
  const MAX_TURNS = godmode ? 2000 : 400

  while (turns < MAX_TURNS) {
    if (g.phase === 'ending') break
    if (!godmode && g.phase === 'run_over') break

    if (g.phase === 'reward') {
      const offer = g.run.offer
      if (!offer?.length) { g.phase = 'mind'; continue }
      // 비용 없는 카드 우선, 없으면 첫 번째
      const pick = offer.find(c => !c.disabled && !c.cost) ?? offer.find(c => !c.disabled) ?? offer[0]
      const eng = new Engine(g)
      const t = eng.takeReward(pick.id)
      if (!t) { g.phase = 'mind'; continue }
      g = eng.g
      g.phase = 'mind'
      if (verbose) log.push(`  [보상] ${pick.name} HP:${g.run.hp}`)
      continue
    }

    if (g.phase !== 'mind') break

    turns++
    const action = pickAction(g, strategy)
    if (g.run.floor === 5) action.intent = 'promise'

    const prevRoom = g.run.room
    const prevHp = g.run.hp
    const eng = new Engine(g)
    const t = eng.resolve(action)
    g = eng.g

    // 규칙 검사
    const vs = checkRules(g, t, prevRoom, prevHp)
    for (const v of vs) {
      const msg = `T${turns} [${g.run.floor}F ${g.run.room}] ${action.tag}: ${v}`
      violations.push(msg)
      if (verbose) log.push(`  [VIOLATION] ${v}`)
    }

    if (verbose) {
      const evts = t.events.map(e => e.type).filter(Boolean).join(',')
      const dmg = t.dmgTaken > 0 ? ` 피해-${t.dmgTaken}` : ''
      const engV = new Engine(g)
      const enemies = engV.here().map(e => `${e.type}(${e.hp}hp)`).join(' ')
      const trial = g.run.trial ? `시험:${g.run.trial.left}턴` : ''
      const knight = g.run.knight.state !== 'unseen' ? `기사:${g.run.knight.state}(${g.run.knight.hp}hp)` : ''
      const party = g.run.party.map(p => `${p.id}(t${p.trust}${p.injured ? ',부상' : ''}${p.down ? ',쓰러짐' : ''})`).join(' ')
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
    if (t.events.some(e => e.type === 'expelled')) {
      if (godmode) {
        // HP 복구하고 계속 진행
        g.run.hp = g.run.maxHp
        g.phase = 'mind'
        if (verbose) log.push(`  [GOD] HP 복구 → ${g.run.hp}`)
      } else {
        g.phase = 'run_over'
      }
    }
    const endingEvt = t.events.find(e => e.type === 'ending')
    if (endingEvt) { g.phase = 'ending'; g.ending = (endingEvt as { type: 'ending'; id: EndingId }).id }
    if (t.ended && g.phase === 'ending') break
  }

  return {
    ending: g.ending ?? (g.phase === 'run_over' ? 'expelled' : turns >= MAX_TURNS ? 'timeout' : 'unknown'),
    turns,
    finalHp: g.run.hp,
    maxFloor: g.run.maxFloor,
    violations,
    ...(verbose ? { log } : {}),
  }
}

function summarize(results: RunResult[]) {
  const n = results.length
  const endings = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.ending] = (acc[r.ending] ?? 0) + 1
    return acc
  }, {})
  const avg = (fn: (r: RunResult) => number) =>
    Math.round((results.reduce((s, r) => s + fn(r), 0) / n) * 10) / 10
  const allViolations = results.flatMap(r => r.violations)
  const violationCounts = allViolations.reduce<Record<string, number>>((acc, v) => {
    // 턴/위치 제거하고 패턴만 집계
    const key = v.replace(/^T\d+ \[\d+F [^\]]+\] \w+: /, '')
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  return {
    endings,
    avgTurns: avg(r => r.turns),
    avgFinalHp: avg(r => r.finalHp),
    avgMaxFloor: avg(r => r.maxFloor),
    totalViolations: allViolations.length,
    violationCounts,
  }
}

/* ============================================================
   API 핸들러
   ============================================================ */
export async function GET(req: NextRequest) {
  // 개발용. 배포본에서는 누구나 서버 자원을 쓰게 되므로 닫아 둔다
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'not found' }, { status: 404 })
  const url = new URL(req.url)
  const runs = Math.min(Math.max(Number(url.searchParams.get('runs') ?? '1'), 1), 2000)
  const verbose = url.searchParams.get('verbose') === '1'
  const compare = url.searchParams.get('compare') === '1'
  const strategy = (url.searchParams.get('strategy') ?? 'up') as Strategy
  const godmode = url.searchParams.get('godmode') === '1'

  if (compare) {
    const strategies: Strategy[] = ['up', 'random', 'explorer', 'fighter', 'cautious']
    const comparison: Record<string, ReturnType<typeof summarize>> = {}
    for (const s of strategies) {
      const results = Array.from({ length: runs }, () => runOnce(s, false))
      comparison[s] = summarize(results)
    }
    return NextResponse.json({ runs, comparison })
  }

  const results = Array.from({ length: runs }, () => runOnce(strategy, verbose, godmode))
  return NextResponse.json({
    runs,
    strategy,
    stats: summarize(results),
    results: verbose || runs === 1 ? results : undefined,
  })
}
