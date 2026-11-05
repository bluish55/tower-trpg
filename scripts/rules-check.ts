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
  r.enemies['1A'] = [] // 돌아올 때 이탈 판정이 끼지 않게
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
// 9. 신뢰 바닥: AI 태그로는 떠나지 않는다
{
  const { e, r } = fresh(); r.party = [member('lira', { trust: 0 }) as any]
  e.applyAITags({ trust: [{ npc: 'lira', delta: -1, reason: '' }], loud: false, intents: {} })
  ok(r.party.length === 1 && !r.abandoned.length, 'AI 태그 −1: 신뢰 0 유지, 이탈 없음')
}
// 10. 남겨진 동료는 원래 방에서 다시 영입되지 않는다
{
  const { e, r } = fresh(); r.room = '1B'; r.enemies['1B'] = []; r.spawned['1B'] = true
  r.enemies['1A'] = []; r.party = [member('garret', { down: true }) as any]
  const t = e.resolve({ tag: '이동', arg: '1A', text: '1A' })
  ok(!t.events.some(x => x.type === 'npc_present'), '남겨진 가렛은 1A에 소개되지 않음')
  const t2 = e.resolve({ tag: '말', arg: null, text: '말을 건다' })
  ok(!r.party.length && !t2.lines.some(l => l.text.includes('설득')), '남겨진 가렛은 설득 판정이 없음')
}
// 11. 동료 이름 인식
{
  const a = fresh(); a.r.party = [member('garret') as any, member('pio') as any]
  a.e.resolve({ tag: '떠남', arg: '피오', text: '가렛과 함께 피오를 두고 간다' })
  ok(a.r.abandoned.includes('pio') && !a.r.abandoned.includes('garret'), '태그 인자 우선: [떠남: 피오]')
  const b = fresh(); b.r.party = [member('lira') as any]
  const t = b.e.resolve({ tag: '공격', arg: null, text: '자리라도 지키며 벤다' })
  ok(!t.lines.some(l => l.text.includes('협공')), '"자리라도"는 리라 협공이 아님')
  const c = fresh(); c.r.party = [member('lira') as any]
  c.e.resolve({ tag: '떠남', arg: null, text: '리라를 두고 간다' })
  ok(c.r.abandoned.includes('lira'), '인자가 없으면 문장의 이름 사용')
}
// 12. 협공
{
  let double = 0, wasted = 0, shield = 0, allyOnKnight = 0, bonus = 0
  for (let i = 0; i < 500; i++) {
    const a = fresh(); a.r.party = [member('garret') as any]; a.e.here()[0].hp = 1
    const t = a.e.resolve({ tag: '공격', arg: '가렛', text: '투구를 노린다' })
    if (a.r.kills > 1) double++
    if (t.lines.some(l => /빈 갑옷 0/.test(l.text))) wasted++
    const k = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
    ;(k.e as any).enterRoom('4B', t0); k.r.hp = 10; k.r.party = [member('garret', { trust: 3 }) as any] // HP가 낮아야 방패가 나간다
    const kt = k.e.resolve({ tag: '공격', arg: '가렛', text: '벤다' })
    if (kt.lines.some(l => l.text.includes('협공'))) bonus++
    if (kt.lines.some(l => l.text.startsWith('가렛 — 공격'))) allyOnKnight++
    if (k.r.f4used.garret) shield++
  }
  ok(!double && !wasted, '협공으로 죽은 적은 처치가 두 번 세지지 않음')
  ok(!bonus && !allyOnKnight && shield > 0, '기사에게는 협공이 없고, 가렛의 방패는 발동함')
}
// 13. 협공 상대의 반격은 하나, 반격은 동료 방어값
{
  let hit = 0, all = 0, forced = 0
  for (let i = 0; i < 2000; i++) {
    const a = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
    ;(a.e as any).enterRoom('1B', t0); a.r.hp = 999; a.r.party = [member('garret') as any]
    a.e.here().forEach(x => { x.hp = 1000; x.max = 1000 })
    const t = a.e.resolve({ tag: '공격', arg: '가렛', text: '벤다' })
    const counter = t.lines.filter(l => l.text.includes('반격 → 가렛'))
    all += counter.length; hit += counter.filter(l => l.text.includes('적중')).length
    if (counter.length && t.lines.filter(l => l.text.includes('→ 가렛:')).length > 1) forced++
  }
  const rate = hit / all
  ok(rate > 0.1 && rate < 0.25, `반격 적중률 ${(rate * 100).toFixed(0)}% (빈 갑옷 → 가렛 방어 ${D.companions.garret.def})`)
  // 1B의 평타 2번이 각각 확률로 동료를 노릴 뿐, 반격 뒤 강제로 한 번 더 맞지는 않는다
  const chance = 1 - (1 - D.rules.companion_target_chance) ** 2
  ok(forced / 2000 < chance + 0.08, `협공 상대가 반격 뒤 또 노려지는 경우는 평타 확률만큼만 (${forced}/2000, 기대 ${(chance * 100).toFixed(0)}%)`)
}
// 14. 대실패의 대가는 설득에도, 리라의 조언은 다음 층으로 넘어가지 않음
{
  for (const room of ['4B', '1A']) {
    let cf = 0, fell = 0
    for (let i = 0; i < 4000 && cf < 30; i++) {
      const a = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
      if (room === '4B') (a.e as any).enterRoom('4B', t0)
      a.r.hp = 999; a.e.here().forEach(x => { x.hp = 1000; x.max = 1000 })
      const t = a.e.resolve({ tag: '말', arg: null, text: '말을 건다' })
      if (t.lines.some(l => l.who === 'pc' && l.text.includes('대실패'))) { cf++; if (a.r.prone) fell++ }
    }
    ok(cf > 0 && cf === fell, `${room} 설득 대실패 → 넘어짐 (${fell}/${cf})`)
  }
  const a = fresh(); r1b(a); a.r.aid = 1
  a.e.resolve({ tag: '이동', arg: '2A', text: '올라간다' })
  ok(!!a.r.offer && a.r.aid === 0, '보상 화면으로 넘어갈 때 조언 소멸')
}
function r1b(x: ReturnType<typeof fresh>) { x.r.room = '1B'; x.r.enemies['1B'] = []; x.r.spawned['1B'] = true; x.r.hidden = true }
// 15. 없는 물건과 지형지물
{
  const a = fresh(); a.r.hp = 999
  const left = a.r.trial!.left
  const t = a.e.resolve({ tag: '공격', arg: null, text: '권총을 쏜다', missingItem: '권총' })
  ok(!t.lines.some(l => l.who === 'pc') && a.r.trial!.left === left - 1 && t.codeNotes.some(n => n.includes('권총')), '없는 물건: 판정 없이 턴만 소모')
  const b = fresh(); b.r.hp = 999; b.r.party = []; b.e.here()[0].hp = 1000; b.e.here()[0].max = 1000
  const armor = b.e.here()[0]
  let s = armor.step
  const t1 = b.e.resolve({ tag: '공격', arg: null, text: '돌을 던진다', improvised: 'ranged' })
  ok(armor.step === s && t1.lines.some(l => l.text.includes('지형지물')), '원거리 첫 투척: 대상 행동 안 함')
  s = armor.step
  b.e.resolve({ tag: '공격', arg: null, text: '돌을 던진다', improvised: 'ranged' })
  ok(armor.step === s + 1, '연속 투척: 대상 행동')
  const k = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
  ;(k.e as any).enterRoom('4B', t0); k.r.hp = 999; k.r.party = []
  const kn = k.e.here()[0], ks = kn.step
  k.e.resolve({ tag: '공격', arg: null, text: '돌을 던진다', improvised: 'ranged' })
  ok(kn.step === ks + 1, '기사: 첫 투척에도 행동')
}
// 16. 미끼: 아군을 버리고 이동하면 이탈 판정이 쉬워진다
{
  const setup = (party: any[]) => {
    const x = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
    ;(x.e as any).enterRoom('1B', t0); x.r.hp = 999; x.r.party = party
    x.e.here().forEach(z => { z.hp = 1000; z.max = 1000; z.stunned = 0 })
    return x
  }
  const modOf = (t: any) => Number(t.lines.find((l: any) => l.text.includes('이탈'))?.text.match(/\) ([+-]\d+)/)?.[1])
  let okBonus = true, kept = true, gone = true, witness = true, wins = 0, plainWins = 0
  const N = 2000
  for (let i = 0; i < N; i++) {
    const a = setup([member('garret', { trust: 2 }), member('lira', { trust: 2 })])
    const t = a.e.resolve({ tag: '이동', arg: '1A, 버림: 가렛', text: '가렛을 두고 달린다' })
    const aid = t.lines.some(l => l.text.includes('리라 +')) ? 1 : 0 // 리라의 조언은 따로 붙는다
    if (modOf(t) - aid !== D.pc.mods['회피'] + D.rules.bait_bonus) okBonus = false
    if (a.r.room === '1A') {
      wins++
      if (!a.r.abandoned.includes('garret') || a.e.inParty('garret')) gone = false
      if (!t.events.some(x => x.type === 'companion_abandoned' && (x as any).how === 'bait')) gone = false
      if (a.e.member('lira')?.trust !== 1) witness = false
    } else if (a.r.abandoned.length || !a.e.inParty('garret')) kept = false
    const b = setup([])
    b.e.resolve({ tag: '이동', arg: '1A', text: '달린다' })
    if (b.r.room === '1A') plainWins++
  }
  ok(okBonus, `미끼: 이탈 판정 +${D.rules.bait_bonus}`)
  ok(wins > plainWins, `미끼 성공률이 더 높음 (${(wins / N * 100).toFixed(0)}% > ${(plainWins / N * 100).toFixed(0)}%)`)
  ok(gone, '이탈 성공: 미끼는 버림 확정')
  ok(witness, '이탈 성공: 본 동료 신뢰 −1')
  ok(kept, '이탈 실패: 미끼는 파티에 남음')
  const d = setup([member('garret', { down: true })])
  const downMod = modOf(d.e.resolve({ tag: '이동', arg: '1A', text: '달린다' })) // 첫 시도 (재시도는 넘어짐 −2가 섞인다)
  for (let tries = 0; d.r.room === '1B' && tries < 50; tries++) d.e.resolve({ tag: '이동', arg: '1A', text: '달린다' })
  ok(downMod === D.pc.mods['회피'] + D.rules.down_left_bonus && d.r.left.some(x => x.id === 'garret') && !d.r.abandoned.length, `쓰러진 동료를 두고 가면 +${D.rules.down_left_bonus}, 남겨짐 유지`)
  const c = setup([member('garret', { down: true })])
  const carryMod = modOf(c.e.resolve({ tag: '이동', arg: '1A, 데리고: 가렛', text: '가렛을 메고 달린다' }))
  for (let tries = 0; c.r.room === '1B' && tries < 50; tries++) c.e.resolve({ tag: '이동', arg: '1A, 데리고: 가렛', text: '가렛을 메고 달린다' })
  ok(carryMod === D.pc.mods['회피'] - D.rules.carry_penalty && c.e.member('garret')?.down === true && !c.r.left.length, `쓰러진 동료를 데리고 가면 −${D.rules.carry_penalty}, 쓰러진 채 파티에 남음`)
  const s = setup([member('garret', { down: true })]); s.r.enemies['1B'] = []; s.r.trial!.failed = true
  s.e.resolve({ tag: '이동', arg: '2A, 데리고: 가렛', text: '가렛을 메고 오른다' })
  ok(s.r.floor === 2 && s.e.member('garret')?.down === true && !s.r.abandoned.length, '데리고 계단을 오르면 버림 아님')
  const w = setup([member('garret')])
  const wt = w.e.resolve({ tag: '이동', arg: '1A, 데리고: 가렛', text: '가렛과 달린다' })
  ok(modOf(wt) === D.pc.mods['회피'], '쓰러지지 않은 동료에게 데리고를 붙이면 보정 없음')
  let counters = 0, exposed = 0
  for (let i = 0; i < 8000; i++) {
    const g = fresh(); g.r.hp = 999; g.r.party = [member('garret')]; g.e.here()[0].hp = 1000; g.e.here()[0].max = 1000
    const gt = g.e.resolve({ tag: '방어', arg: null, text: '막는다' })
    if (gt.lines.some(l => l.text.startsWith('가렛 — 공격'))) exposed++
    if (gt.lines.some(l => l.text.includes('반격 → 가렛'))) counters++
  }
  const rate = counters / exposed
  ok(Math.abs(rate - D.rules.garret_counter_chance) < 0.04, `가렛이 공격한 뒤 반격 확률 ${(rate * 100).toFixed(1)}% (설정 ${D.rules.garret_counter_chance * 100}%)`)
  const n = setup([member('garret')])
  const nt = n.e.resolve({ tag: '이동', arg: '1A', text: '가렛과 함께 달린다' })
  ok(modOf(nt) === D.pc.mods['회피'] && !n.r.abandoned.length, '버림 표시가 없으면 보정 없음')
}
// 17. 가렛의 방패: 위기에 명중한 공격만 막는다
{
  const setup = (hp: number, trust = 1) => {
    const x = fresh(); const t0 = { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 } as any
    ;(x.e as any).enterRoom('1B', t0); x.r.hp = hp; x.r.maxHp = 1000; x.r.party = [member('garret', { trust })]
    x.e.here().forEach(z => { z.hp = 1000; z.max = 1000 })
    return x
  }
  const N = 3000
  const shields = (t: any) => t.lines.filter((l: any) => l.text.startsWith('가렛 — 방패')).length
  const blocked = (t: any) => t.lines.filter((l: any) => l.text.includes('방패가 막았다')).length
  let calm = 0, low = 0, lowHits = 0, tellUse = 0, mismatch = 0, maxUses = 0, big = 0, bigHits = 0, jointUse = 0, all3 = 0
  for (let i = 0; i < N; i++) {
    const a = setup(999); a.r.party[0].trust = 3
    const ta = a.e.resolve({ tag: '방어', arg: null, text: '막는다' })
    calm += shields(ta)
    const b = setup(5, 1); b.r.flags.breath = true
    const tb = b.e.resolve({ tag: '선택', arg: null, text: '선다' })
    if (tb.lines.some(l => l.who === 'enemy' && l.text.includes('적중'))) lowHits++
    low += shields(tb)
    if (shields(tb) !== blocked(tb)) mismatch++
    const c = setup(5, 3); c.e.here().forEach(z => { z.step = 1 }) // 전원 예고 동작: 공격이 없다
    const tc = c.e.resolve({ tag: '선택', arg: null, text: '선다' })
    tellUse += c.r.party[0].uses + shields(tc)
    const d = setup(999, 3); d.e.here().forEach(z => { z.step = 2 }) // 전원 큰 공격 차례
    const td = d.e.resolve({ tag: '선택', arg: null, text: '선다' })
    if (td.lines.some(l => l.who === 'enemy' && l.text.includes('내려찍기') && l.text.includes('적중'))) { bigHits++; if (shields(td)) big++ }
    if (shields(td) === 1 && blocked(td) === td.lines.filter(l => l.who === 'enemy' && l.text.includes('적중')).length) all3++
    const e2 = setup(5, 3)
    const te = e2.e.resolve({ tag: '공격', arg: '가렛', text: '벤다' })
    jointUse += shields(te)
    const f = setup(5, 3); f.r.flags.breath = true
    for (let k = 0; k < 12; k++) { f.r.hp = 5; f.r.party[0].down = false; f.r.party[0].injured = false; f.e.resolve({ tag: '선택', arg: null, text: '선다' }) }
    maxUses = Math.max(maxUses, f.r.party[0].uses)
  }
  ok(!calm, 'HP가 넉넉한 평타에는 방패가 안 나감 (신뢰 3)')
  ok(low > 0 && low < lowHits, `HP가 낮으면 일부 명중에 방패 (신뢰 1, ${low}/${lowHits})`)
  ok(!mismatch, '방패가 나간 공격은 막힘')
  ok(!tellUse, '예고 동작 턴에는 횟수를 쓰지 않음')
  ok(big / bigHits > 0.8, `신뢰 3이면 큰 공격에 대부분 방패 (${big}/${bigHits})`)
  ok(all3 > 0, '신뢰 3: 그 턴의 남은 공격까지 막음')
  ok(!jointUse, '협공 중인 가렛은 방패를 쓰지 않음')
  ok(maxUses === 2, '방패는 층당 2회')
}
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED')
process.exit(fails ? 1 : 0)
