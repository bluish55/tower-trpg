// 규칙 시나리오 검사: npx tsx --tsconfig tsconfig.json scripts/rules-check.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { D, Engine, emptyArchive, newGame, tierOf } from '../lib/game/engine'
import type { CompanionId, Intent, PartyMember } from '../lib/game/types'
let fails = 0
const ok = (c: boolean, msg: string) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fails++ }
function fresh() { const g = newGame(null, emptyArchive()); g.phase = 'mind'; const e = new Engine(g); e.enterTower(); return { g, e, r: g.run } }
function member(id: CompanionId, extra: Partial<PartyMember> = {}): PartyMember {
  return { id, trust: 2, uses: 0, onCooldown: false, injured: false, down: false, ...extra }
}

// 1. tiers
{
  ok(tierOf(3, 4, 7, 7) === (D.rules.tie_success ? 'success' : 'fail'), `동점 처리 = ${D.rules.tie_success ? '성공' : '실패'}`)
  ok(!['partial'].includes(tierOf(3, 3, 6, 6)), '부분 성공 없음')
  ok(tierOf(1, 1, 20, 3) === 'critfail' && tierOf(6, 6, 0, 30) === 'crit', '1·1 대실패, 6·6 대성공')
}
// 2. disengage: 교전 중 이동은 판정, 실패하면 방에 남는다
{
  let stayed = 0, left = 0
  for (let i = 0; i < 400; i++) {
    const { e, r } = fresh(); r.room = '1B'; r.enemies['1B'] = []; (e as any).spawnRoom('1B', { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 })
    r.party = []
    const t = e.resolve({ tag: '이동', arg: '1A', text: '1A' })
    if (r.room === '1B') { stayed++; if (!t.events.some(x => x.type === 'disengage_fail')) { ok(false, 'disengage_fail event'); break } } else left++
    if (!t.lines.some(l => l.text.includes('이탈 판정'))) { ok(false, '이탈 판정 줄'); break }
  }
  ok(stayed > 0 && left > 0, `이탈 판정 (2마리, 목표 ${D.rules.disengage_dc + 1}): 성공 ${left} / 실패 ${stayed}`)
}
// 3. 쪽지: 교전 중인 4A에서는 공개되지 않고, 정리하면 공개
{
  const { e, r } = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
  r.floor = 3; r.room = '3C'; r.enemies['3C'] = []; (e as any).enterRoom('4A', t0)
  ok(r.room === '4A' && !t0.reveals.length && r.pendingRoomNote['4A'], '4A 입장: 거울이 있으면 쪽지 보류')
  r.enemies['4A'].forEach(x => { x.hp = 1; x.calm = 1 })
  let revealed = false
  for (let i = 0; i < 5 && !revealed; i++) { const t = e.resolve({ tag: '선택', arg: null, text: '가만히 선다' }); revealed = t.reveals.length > 0 }
  ok(revealed, '거울이 사라지면 미뤄 둔 쪽지 공개')
}
// 4. 책장과 보상 두 장
{
  const { e, r } = fresh(); r.pages = 3; r.offer = D.rewards['1'].map(c => ({ ...c })); r.pendingMove = '2A'
  const cards = r.offer.filter(c => !c.cost)
  const t = e.takeReward(cards[0].id, cards[1].id)!
  ok(t.events.filter(x => x.type === 'reward_taken').length === 2 && r.pages === 0, '책장 3장 → 보상 두 장')
}
// 5. 2층 처치 시험
{
  const { e, r } = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
  ;(e as any).enterRoom('2A', t0); r.room = '2C'; r.enemies['2C'] = []; r.spawned['2C'] = true; r.hidden = true
  let t = e.resolve({ tag: '이동', arg: '3A', text: '3A' })
  ok(!r.offer && t.events.some(x => x.type === 'trial_unclear' && (x as any).reason === 'target'), '사냥꾼을 안 잡고 오르면 시험 미통과')
  const g2 = fresh(); g2.e['enterRoom']('2A', t0); g2.r.room = '2C'; g2.r.enemies['2C'] = []; g2.r.spawned['2C'] = true; g2.r.slain.hunter = true; g2.r.hidden = true
  t = g2.e.resolve({ tag: '이동', arg: '3A', text: '3A' })
  ok(!!g2.r.offer, '사냥꾼을 잡고 오르면 보상')
}
// 6. 쓰러짐 → 남겨짐 → 구출 / 계단에서 버림 확정
{
  const { e, r } = fresh(); r.room = '1B'; r.enemies['1B'] = []; r.spawned['1B'] = true
  r.party = [member('garret', { down: true }) as any]
  e.resolve({ tag: '이동', arg: '1A', text: '1A' })
  ok(r.left.length === 1 && !r.party.length, '쓰러진 가렛을 두고 떠나면 남겨짐')
  e.resolve({ tag: '이동', arg: '1B', text: '1B' })
  ok(r.party.length === 1 && r.party[0].down, '돌아오면 다시 찾음 (쓰러진 채)')
  e.resolve({ tag: '동료', arg: '가렛', text: '가렛을 일으킨다' })
  ok(!r.party[0].down, '[동료: 가렛]으로 일으킴')
  r.party[0].down = true
  e.resolve({ tag: '이동', arg: '2A', text: '2A' })
  ok(r.abandoned.includes('garret'), '쓰러진 채 계단을 오르면 버림 확정')
}
// 7. [떠남]과 목격자 신뢰, 신뢰 바닥 → 떠남
{
  const { e, r } = fresh(); r.party = [member('garret') as any, member('lira', { trust: 0 }) as any]
  const t = e.resolve({ tag: '떠남', arg: '가렛', text: '가렛을 두고 간다' })
  ok(r.abandoned.includes('garret'), '[떠남: 가렛] → 버림')
  ok(r.abandoned.includes('lira') && t.events.some(x => x.type === 'companion_abandoned' && (x as any).how === 'trust'), '본 리라(신뢰 0)는 신뢰가 바닥나 떠남')
}
// 8. 결말
function at5B(abandoned: CompanionId[], party: CompanionId[], intent: Intent) {
  const { e, r } = fresh(); r.floor = 5; r.room = '5B'; r.trial = null
  r.notes = ['N1', 'N6']; r.knight.state = 'yielded'; r.abandoned = abandoned
  r.party = party.map(id => member(id) as any)
  const t = e.resolve({ tag: '선택', arg: null, text: '...', intent })
  const end = t.events.find(x => x.type === 'ending') as any
  return { id: end?.id ?? null, notes: t.codeNotes.join(' ') }
}
{
  ok(at5B([], ['garret'], 'promise').id === 'promise', '약속')
  ok(at5B([], ['garret', 'lira', 'pio'], 'promise').id === 'promise_together', '셋 다 함께 → 약속 — 함께')
  const lock = at5B(['lira'], ['garret', 'pio'], 'promise')
  ok(lock.id === null && lock.notes.includes('리라'), '버린 동료가 있으면 약속 잠김 (마녀가 리라를 말함)')
  ok(at5B(['lira'], [], 'helm').id === 'knight' && at5B(['lira'], [], 'leave').id === 'alone' && at5B(['lira'], [], 'stay').id === 'stay', '다른 결말은 열려 있음')
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
