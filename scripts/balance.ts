// 밸런스 측정: npx tsx --tsconfig tsconfig.json scripts/balance.ts [판수] [덮어쓸 수치 JSON]
// 예: npx tsx --tsconfig tsconfig.json scripts/balance.ts 2000 '{"def":8,"rules":{"disengage_dc":8}}'
// 숙련 봇: 약점을 다 알고, 예고 공격은 피하고, 협공하고, 쓰러진 동료를 일으키고, 기사가 오면 계단으로. 초보 봇: 그냥 벤다.
import { D, Engine, emptyArchive, newGame } from '../lib/game/engine'
import type { ActionTag, Archive, CompanionId } from '../lib/game/types'
const over = process.argv[3] ? JSON.parse(process.argv[3]) : {}
Object.assign(D.rules, over.rules ?? {})
if (over.f2limit) D.floors['2'].trial!.limit = over.f2limit
if (over.f1limit) D.floors['1'].trial!.limit = over.f1limit
if (over.def) D.pc.defense = over.def
if (over.basic) for (const e of Object.values(D.enemies)) (e.cycle ?? []).forEach(m => { if (m.a !== undefined && !m.label && m.dmg) m.dmg = m.dmg.replace(/^1d6$/, over.basic) })
const ROUTE: Record<string, string> = { '1A': '1B', '1B': '2A', '2A': '2B', '2B': '2C', '2C': '3A', '3A': '3B', '3B': '3C', '3C': '4A', '4A': '4B' }
const WEAK: Record<string, [ActionTag, string]> = {
  armor: ['공격', '투구를 노린다'], hound: ['선택', '가만히 숨죽인다'], hunter: ['공격', '뿔피리를 부순다'],
  drowned: ['몸쓰기', '난간 위로 올라간다'], bellringer: ['공격', '종 밧줄을 끊는다'], mirror: ['선택', '가만히 기다린다'],
}
const NAME: Record<CompanionId, string> = { garret: '가렛', lira: '리라', pio: '피오' }
function play(skilled: boolean) {
  const a: Archive = emptyArchive()
  if (skilled) Object.values(D.enemies).forEach(e => { if (e.weak) a.weak[e.weak.id] = true })
  const g = newGame(null, a); g.phase = 'mind'
  const eng = new Engine(g); eng.enterTower()
  const r = g.run, arrive: Record<number, number> = { 1: 20 }
  for (let i = 0; i < 250; i++) {
    if (r.hp <= 0) return { arrive, out: r.floor, r }
    if (r.room === '4B') return { arrive, out: 0, r }
    if (r.offer) {
      const free = r.offer.filter(c => !c.cost && !c.disabled)
      const two = r.pages >= D.rules.pages_per_extra_card && free.length >= 2
      eng.takeReward(free[0].id, two ? free[1].id : undefined)
      if (arrive[r.floor] == null) arrive[r.floor] = r.hp
      continue
    }
    const rm = D.rooms[r.room!], es = eng.engaged()
    const next = ROUTE[r.room!]
    const nextUp = D.rooms[next].floor > r.floor
    const tr = r.trial
    const blocked = nextUp && ((r.floor === 2 && !r.slain.hunter && skilled && !tr?.failed) || (r.floor === 3 && !eng.inParty('pio')))
    let tag: ActionTag = '공격', text = '벤다', arg: string | null = null
    const down = r.party.find(p => p.down)
    const warned = es.find(e => e.warn && e.type !== 'bellringer')
    const timeShort = tr && tr.limit > 0 && tr.left <= 1 && !tr.failed
    const knightHunt = es.some(e => e.type === 'knight') && r.knight.state === 'hunting'
    const upExit = rm.exits.find(x => D.rooms[x].floor > r.floor)
    if (knightHunt && skilled) {
      // 기사가 내려왔다: 쓰러진 동료가 있으면 일으키고, 아니면 계단으로 (위층 출구가 없으면 경로대로)
      if (down) { tag = '동료'; arg = NAME[down.id] } else { tag = '이동'; arg = upExit ?? next }
    }
    else if (down && (skilled || Math.random() < 0.4)) { tag = '동료'; arg = NAME[down.id] }
    else if (rm.npc && !eng.inParty(rm.npc) && !r.abandoned.includes(rm.npc) && (skilled || Math.random() < 0.5)) tag = '말'
    else if (!es.length) {
      if (blocked && r.floor === 2) { tag = '이동'; arg = r.room === '2C' ? '2A' : '2C' } // 사냥꾼을 찾아간다
      else { tag = '이동'; arg = next }
    }
    else if (timeShort && !blocked && skilled) { tag = '이동'; arg = next }
    else if (skilled) {
      if (warned?.type === 'hound') [tag, text] = WEAK.hound
      else if (warned) tag = '회피'
      else {
        const tgt = es.find(e => e.type === 'hunter') ?? es[0];
        [tag, text] = WEAK[tgt.type] ?? ['공격', '벤다']
        if (tgt.type === 'hunter') text = r.known.horn && !tgt.stunned && !r.slain.hound ? '뿔피리를 부순다' : '사냥꾼을 벤다'
        const buddy = r.party.find(p => !p.down && !p.injured && p.id !== 'lira')
        if (tag === '공격' && buddy) arg = NAME[buddy.id]
      }
    } else {
      if (warned && Math.random() < 0.3) tag = '회피'
      else if (es[0].type === 'mirror' || timeShort) { tag = '이동'; arg = next }
    }
    const before = r.floor
    eng.resolve({ tag, arg, text, intent: null })
    if (r.floor > before && arrive[r.floor] == null) arrive[r.floor] = r.hp
  }
  return { arrive, out: -1, r }
}
const N = Number(process.argv[2] ?? 3000)
for (const skilled of [true, false]) {
  const hp: Record<number, number[]> = { 2: [], 3: [], 4: [] }, out: Record<string, number> = {}
  let aband = 0, knightDeaths = 0, deaths = 0
  for (let i = 0; i < N; i++) {
    const res = play(skilled)
    for (const f of [2, 3, 4]) if (res.arrive[f] != null) hp[f].push(res.arrive[f])
    const k = res.out === 0 ? '4층끝' : res.out === -1 ? '시간초과' : `${res.out}층추방`
    out[k] = (out[k] ?? 0) + 1
    if (res.r.abandoned.length) aband++
    if (res.out > 0) { deaths++; if (res.r.log.some(l => l.type === 'trial' && l.detail === 'fail' )) knightDeaths++ }
  }
  const avg = (a: number[]) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-'
  const pct = (v: number) => `${(v / N * 100).toFixed(0)}%`
  console.log(`${skilled ? '숙련' : '초보'} | 도착HP 2/3/4층 ${avg(hp[2])} / ${avg(hp[3])} / ${avg(hp[4])} | ${Object.entries(out).sort().map(([k, v]) => `${k} ${pct(v)}`).join(', ')} | 버림 ${pct(aband)} | 추방 중 시험실패(기사) ${deaths ? (knightDeaths / deaths * 100).toFixed(0) : 0}%`)
}
