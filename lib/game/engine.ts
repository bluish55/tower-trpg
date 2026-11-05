/* =========================================================
   게임 엔진 — "AI는 이야기하고, 코드는 결정한다."
   주사위, 적 행동, 시험 시간, 보상, 기사, 쪽지 공개, 결말을
   AI를 부르기 전에 전부 여기서 결정한다. AI는 resolve()가
   돌려준 Turn을 받아 서술만 한다.

   사용법: 상태를 복사해서 넘기고, 끝나면 engine.g를 저장한다.
     const eng = new Engine(structuredClone(game))
     const turn = eng.resolve(action)
     setGame(eng.g)
   ========================================================= */
import gameData from '@/data/game-data.json'
import type {
  ActionTag, Archive, CompanionId, EndingId, EnemyDef, EnemyInst, EnemyMove, Game, GameData,
  Intent, PartyMember, PlayerAction, RewardCard, RoomDef, RunState, RunSummary, SysNotice, Tier, Turn,
} from './types'
import { ACTION_TAGS, INTENTS, SAFE_KNIGHT, TIER_KO } from './types'

export const D = gameData as unknown as GameData

const COMP_ID: Record<string, CompanionId> = { '가렛': 'garret', '리라': 'lira', '피오': 'pio' }

/** 태그 인자의 동료 이름이 우선. 문장에서는 단어 첫머리만 찾는다 ("자리라도"의 "리라"는 이름이 아니다) */
function namedCompanion(arg: string | null | undefined, text: string): CompanionId | null {
  const name = Object.keys(COMP_ID).find(k => (arg ?? '').includes(k))
    ?? Object.keys(COMP_ID).find(k => new RegExp(`(^|[^가-힣])${k}`).test(text))
  return name ? COMP_ID[name] : null
}

/** [이동: 2B, 버림: 가렛, 데리고: 리라] 에서 "버림" 또는 "데리고" 뒤의 동료 */
function companionAfter(arg: string, word: '버림' | '데리고'): CompanionId | null {
  const m = arg.match(new RegExp(`${word}\\s*[:：]\\s*(${Object.keys(COMP_ID).join('|')})`))
  return m ? COMP_ID[m[1]] : null
}

/* ---------------- dice (2d6) ---------------- */
function rnd(n: number): number {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] % n
}
export const d6 = () => 1 + rnd(6)
export function rollSpec(spec: string): number {
  const m = spec.replace(/\s/g, '').match(/(\d+)d(\d+)([+-]\d+)?/)
  if (!m) return 0
  let total = m[3] ? Number(m[3]) : 0
  for (let i = 0; i < Number(m[1]); i++) total += 1 + rnd(Number(m[2]))
  return total
}
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
/** 받침 여부로 조사 고르기: 가렛을 / 리라를 */
const josa = (w: string, withB: string, noB: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return w + (c >= 0 && c <= 11171 && c % 28 !== 0 ? withB : noB)
}
const sign = (n: number) => (n >= 0 ? '+' : '-') + Math.abs(n)
const OK = (t: Tier) => t === 'crit' || t === 'success'

/** 판정 4단계. 동점(합계 = 목표)은 rules.tie_success에 따라 성공 또는 실패. */
export function tierOf(a: number, b: number, total: number, dc: number): Tier {
  if (a + b === 12) return 'crit'
  if (a + b === 2) return 'critfail'
  if (total >= dc + 5) return 'crit'
  if (total > dc || (total === dc && D.rules.tie_success)) return 'success'
  if (total >= dc - 3) return 'fail'
  return 'critfail'
}

/* ---------------- state factories ---------------- */
export function emptyArchive(): Archive {
  return { weak: {}, notes: {}, endings: {}, dives: 0 }
}

export function newRun(archive: Archive): RunState {
  return {
    floor: 0, room: null,
    hp: D.pc.hp, maxHp: D.pc.hp,
    weapon: { ...D.pc.start_weapon },
    relics: [], powers: {},
    flags: { oath: false, fang: false, breath: false, breathUsed: false, cloak: false, shard: false, shardHit: {} },
    party: [], recruited: {},
    enemies: {}, spawned: {}, visited: {}, uid: 0,
    trial: null,
    loud: 0, hidden: false, pendingSpawn: false, pendingPioNote: false,
    knight: { hp: D.enemies.knight.hp, max: D.enemies.knight.hp, helm: 0, state: 'unseen', glimpsed: false, read: false },
    notes: [], noteCount: {},
    known: { ...archive.weak },
    turn: 0, floorTurn: 0, maxFloor: 0,
    offer: null, pendingMove: null,
    intents: {}, f4used: { garret: false, pio: false },
    kills: 0, damageTaken: 0, lastRangedUid: null, log: [],
    pages: 0, prone: false, aid: 0, foresight: false, slain: {},
    left: [], abandoned: [], trustCleared: {}, pendingRoomNote: {},
  }
}

export function newGame(prev: Game | null, archive: Archive): Game {
  return {
    v: 3, phase: 'title',
    playthrough: prev ? prev.playthrough + 1 : 1,
    dive: 1, run: newRun(archive), archive,
    history: [], choices: [], feed: [], dives: [], ending: null,
  }
}

export function newTurn(): Turn {
  return { lines: [], events: [], reveals: [], sys: [], codeNotes: [], dmgTaken: 0 }
}

interface Ctx {
  tag: ActionTag
  dodge: number; dodgeAll: boolean
  defend: number; defendAll: boolean
  blockAll: boolean              // 신뢰 3의 방패: 이번 턴 남은 공격을 모두 막는다
  garretCooldown: boolean        // 가렛이 직전 턴에 방패를 썼는지
  blind: boolean; hitBonus: number
  quiet: boolean; silent: boolean; hideSkip: boolean
  moved: boolean; struggled: boolean
  joint: CompanionId | null      // 협공 상대 (반격이 그 동료에게 간다)
  jointTarget: EnemyInst | null
  rolled: Tier | null            // 이번 턴 진우 판정 결과 (대실패 = 넘어짐)
  resting: CompanionId[]         // 이번 턴 쉬는 동료 (턴 끝에 부상이 풀림)
  jointHit: boolean              // 협공 상대에게 반격이 이미 갔는지
  noCounterUid: number | null    // 원거리 지형지물 공격의 대상: 이번 턴 되받아치지 못한다
}
const newCtx = (tag: ActionTag): Ctx => ({
  tag, dodge: 0, dodgeAll: false, defend: 0, defendAll: false,
  blockAll: false, garretCooldown: false, blind: false, hitBonus: 0,
  quiet: false, silent: false, hideSkip: false, moved: false, struggled: false,
  joint: null, jointTarget: null, rolled: null, resting: [], jointHit: false, noCounterUid: null,
})

/* =========================================================
   Engine
   ========================================================= */
export class Engine {
  constructor(public g: Game) {}

  get r(): RunState { return this.g.run }
  room(): RoomDef { if (!this.r.room) throw new Error('room() called with null room'); return D.rooms[this.r.room] }
  inParty(id: CompanionId) { return this.r.party.some(p => p.id === id) }
  member(id: CompanionId) { return this.r.party.find(p => p.id === id) }
  /** 아직 만나지 않았거나 설득에 실패한 동료만 영입할 수 있다. 남겨진 동료는 그 방에 돌아가 일으켜야 한다 */
  canRecruit(id: CompanionId) { return !this.inParty(id) && !this.r.abandoned.includes(id) && !this.r.left.some(x => x.id === id) }
  here(): EnemyInst[] { return (this.r.enemies[this.r.room ?? ''] ?? []).filter(e => e.hp > 0) }
  engaged(): EnemyInst[] { return this.here().filter(e => e.state === 'engaged') }
  def(e: EnemyInst): EnemyDef { return D.enemies[e.type] }
  displayName(e: EnemyInst): string {
    const same = this.here().filter(x => x.type === e.type)
    return same.length > 1 ? `${e.name} ${same.indexOf(e) + 1}` : e.name
  }
  private log(type: string, detail?: string) { this.r.log.push({ t: this.r.turn, type, detail }) }
  hasFloorNote(f: number) { return this.r.notes.some(n => D.notes[n].floor === f) }

  private knowWeak(id: string, t?: Turn) {
    if (this.r.known[id]) return
    this.r.known[id] = true
    this.g.archive.weak[id] = true
    const e = Object.values(D.enemies).find(x => x.weak?.id === id)
    if (t && e?.weak) t.sys.push({ kind: 'weak', title: '약점 발견', text: `${e.name} — ${e.weak.label}` })
    this.log('weak', id)
  }

  private makeEnemy(type: string, hp?: number): EnemyInst {
    const e = D.enemies[type]
    const base = { uid: ++this.r.uid, type, name: e.name, step: 0, state: 'engaged' as const, stunned: 0, calm: 0, warn: null }
    if (type === 'knight') return { ...base, hp: this.r.knight.hp, max: this.r.knight.max }
    return { ...base, hp: hp || e.hp, max: e.hp }
  }

  private spawnRoom(id: string, t: Turn) {
    const r = this.r, rm = D.rooms[id]
    if (r.spawned[id]) return
    r.spawned[id] = true
    r.enemies[id] = (rm.spawn ?? []).map(s => this.makeEnemy(s.type, s.hp))
    if (rm.knight && (r.knight.state === 'unseen' || r.knight.state === 'hunting')) {
      r.enemies[id].push(this.makeEnemy('knight'))
      r.knight.state = 'guarding'
      t.events.push({ type: 'knight_confront' })
    }
  }

  private removeKnightInstances() {
    for (const id of Object.keys(this.r.enemies)) {
      this.r.enemies[id] = this.r.enemies[id].filter(e => e.type !== 'knight' || D.rooms[id].knight)
    }
  }

  /* ---------------- checks ---------------- */
  private check(tag: ActionTag, dc: number, extra: number, t: Turn, label?: string, ctx?: Ctx) {
    const r = this.r
    let mod = (D.pc.mods[tag] ?? 0) + extra
    if (tag === '공격') mod += (r.weapon.atk ?? 0) + (r.flags.oath ? 2 : 0)
    if (tag === '숨기' && r.flags.cloak) mod += 2
    const notes: string[] = []
    if (r.prone) { mod -= D.rules.prone_penalty; r.prone = false; notes.push(`넘어짐 −${D.rules.prone_penalty}`) }
    if (r.aid) { mod += r.aid; notes.push(`리라 +${r.aid}`); r.aid = 0 }
    const a = d6(), b = d6(), total = a + b + mod
    const tier = tierOf(a, b, total, dc)
    t.lines.push({ who: 'pc', text: `[${label ?? tag} 판정: 2d6(${a},${b}) ${sign(mod)}${notes.length ? ` (${notes.join(', ')})` : ''} = ${total} / 목표 ${dc} — ${TIER_KO[tier]}]` })
    this.log('roll', `${tag} ${TIER_KO[tier]}`)
    if (ctx) ctx.rolled = tier
    return { tier, ok: OK(tier), total }
  }

  /** 실패의 대가 (교전 중일 때만). 공격·살핌 실패 = 빈틈, 모든 대실패 = 넘어짐. */
  private exposure(tier: Tier, exposing: boolean, ctx: Ctx, t: Turn) {
    if (!this.engaged().length) return
    const ob = D.rules.opening_bonus
    if (tier === 'critfail') {
      ctx.hitBonus += ob
      this.r.prone = true
      t.lines.push({ who: 'sys', text: `넘어짐 — 이번 턴 적 명중 +${ob}, 다음 판정 −${D.rules.prone_penalty}` })
    } else if (tier === 'fail' && exposing) {
      ctx.hitBonus += ob
      t.lines.push({ who: 'sys', text: `빈틈 — 이번 턴 적 명중 +${ob}` })
    }
  }

  /* ---------------- damage ---------------- */
  private damagePC(dmg: number, t: Turn) {
    const r = this.r
    r.hp -= dmg
    r.damageTaken += dmg
    t.dmgTaken += dmg
    if (r.hp <= 0 && r.flags.breath && !r.flags.breathUsed) {
      r.flags.breathUsed = true
      r.hp = 1
      t.lines.push({ who: 'sys', text: '익사자의 숨 — 쓰러질 피해를 받았지만 HP 1로 버틴다.' })
    }
  }

  private damageEnemy(e: EnemyInst, dmg: number, t: Turn) {
    const r = this.r
    if (e.type === 'knight' && r.floor !== 4) {
      t.lines.push({ who: 'sys', text: '회색 기사의 갑옷이 칼날을 튕겨낸다 — 피해 없음.' })
      return
    }
    e.hp = Math.max(0, e.hp - dmg)
    t.lines.push({ who: 'sys', text: `${this.displayName(e)}에게 피해 ${dmg} → ${e.hp}/${e.max}` })
    if (e.type === 'knight') {
      r.knight.hp = e.hp
      if (e.hp <= 16 && r.knight.helm < 1) {
        r.knight.helm = 1
        t.events.push({ type: 'helm_crack' })
        this.revealFloorNote(4, t, true)
      }
      if (e.hp <= 8 && r.knight.helm < 2) {
        r.knight.helm = 2
        t.events.push({ type: 'helm_shatter' })
      }
      if (e.hp <= 0) {
        e.state = 'lost' // I11: hp=0인데 engaged로 남지 않도록
        r.knight.state = 'defeated'
        t.events.push({ type: 'knight_defeated' })
        this.log('knight', 'defeated')
      }
      return
    }
    if (e.hp <= 0) this.onKill(e, t)
  }

  /** 적이 쓰러질 때: 처치 수, 처치 시험 기록, 찢긴 책장 */
  private onKill(e: EnemyInst, t: Turn, line = true) {
    const r = this.r
    e.state = 'lost' // hp=0인데 engaged로 남지 않도록 (I11)
    r.kills++
    r.slain[e.type] = true
    if (line) t.lines.push({ who: 'sys', text: `${e.name} 쓰러짐.` })
    let n = this.def(e).pages ?? 0
    const pio = this.member('pio')
    if (n > 0 && pio && !pio.down && pio.trust >= 3) n += 1
    if (n > 0) {
      r.pages += n
      t.lines.push({ who: 'sys', text: `찢긴 책장 +${n} (모두 ${r.pages})` })
    }
  }

  /* ---------------- weaknesses ---------------- */
  private weakMatch(e: EnemyInst, tag: ActionTag, text: string) {
    const w = this.def(e).weak
    if (!w?.keys || !w.tags || !w.tags.includes(tag)) return false
    return w.keys.some(k => text.includes(k))
  }

  private applyWeak(e: EnemyInst, t: Turn) {
    const w = this.def(e).weak
    if (!w) return
    this.knowWeak(w.id, t)
    switch (w.effect) {
      case 'kill':
        t.lines.push({ who: 'sys', text: `약점 적중 — ${this.displayName(e)}의 투구가 떨어지고, 갑옷이 무너진다.` })
        e.hp = 0
        this.onKill(e, t, false)
        break
      case 'horn': {
        e.stunned = 1
        const hounds = this.here().filter(x => x.type === 'hound')
        const bite = rollSpec('2d6')
        e.hp = Math.max(0, e.hp - bite)
        t.lines.push({ who: 'sys', text: `약점 적중 — 뿔피리가 부서졌다. 사냥개들이 사냥꾼에게 달려든다: 피해 ${bite} → ${e.hp}/${e.max}. 사냥꾼은 한 턴 움직이지 못한다.` })
        hounds.forEach(h => { h.hp = 0; this.onKill(h, t) })
        if (e.hp <= 0) this.onKill(e, t)
        break
      }
      case 'height':
        this.here().filter(x => x.type === 'drowned').forEach(x => { x.state = 'lost' })
        t.lines.push({ who: 'sys', text: '약점 적중 — 물보다 높이 올라섰다. 익사자들이 닿지 못한다.' })
        break
      case 'rope':
        e.silenced = true
        e.stunned = 1
        t.lines.push({ who: 'sys', text: '약점 적중 — 종 밧줄이 끊어졌다. 종이 멈추고, 종지기가 한 턴 비틀거린다.' })
        break
    }
    this.log('weak_used', w.id)
  }

  /* ---------------- party ---------------- */
  private join(id: CompanionId, t: Turn) {
    const c = D.companions[id]
    if (this.inParty(id) || this.r.left.some(x => x.id === id)) return
    this.r.party.push({ id, trust: c.trust, uses: 0, onCooldown: false, injured: false, down: false })
    this.r.recruited[id] = true
    t.events.push({ type: 'companion_join', id })
    t.sys.push({ kind: 'join', title: '동료 합류', text: `${c.name} — ${c.ability}: ${c.desc}` })
    this.log('join', id)
  }

  /** canLeave: 코드가 낸 하락에만 켠다. 신뢰 0에서 더 떨어지면 떠난다. AI 태그는 0 아래로 내리지 못한다 */
  changeTrust(id: CompanionId, delta: number, reason: string, out: SysNotice[], t?: Turn, canLeave = false) {
    const m = this.member(id)
    if (!m) return
    const before = m.trust
    if (canLeave && before === 0 && delta < 0) {
      this.abandon(id, 'trust', out, t)
      return
    }
    m.trust = clamp(m.trust + Math.sign(delta), 0, 3)
    if (m.trust === before) return
    out.push({ kind: 'trust', title: m.trust > before ? '신뢰 상승' : '신뢰 하락', text: `${D.companions[id].name} ${m.trust}/3${reason ? ' — ' + reason : ''}` })
    this.log('trust', `${id} ${m.trust > before ? '+' : '-'}`)
    if (id === 'pio' && m.trust >= 2) this.r.pendingPioNote = true
  }

  /** 동료를 잃는다: 직접 버림 / 쓰러진 채 남겨두고 계단을 오름 / 신뢰가 바닥나 떠남.
   *  셋 다 똑같이 "버림"이고, 이번 다이브의 약속 결말이 잠긴다. */
  private abandon(id: CompanionId, how: 'chosen' | 'bait' | 'left' | 'trust', out: SysNotice[], t?: Turn) {
    const r = this.r
    if (r.abandoned.includes(id)) return
    r.party = r.party.filter(p => p.id !== id)
    r.left = r.left.filter(x => x.id !== id)
    r.abandoned.push(id)
    const name = D.companions[id].name
    const text = how === 'chosen' ? `${josa(name, '을', '를')} 두고 떠났다.`
      : how === 'bait' ? `${josa(name, '을', '를')} 미끼로 두고 빠져나왔다.`
      : how === 'left' ? `쓰러진 ${josa(name, '을', '를')} 두고 계단을 올랐다.`
        : `${josa(name, '이', '가')} 진우를 떠났다.`
    out.push({ kind: 'fail', title: '동료를 잃었다', text })
    t?.events.push({ type: 'companion_abandoned', id, how })
    this.log('abandon', `${id} ${how}`)
    // 그 장면을 본 동료들의 신뢰 −1 (스스로 떠난 경우는 제외 — 연쇄로 번지지 않게)
    if (how !== 'trust') {
      for (const m of [...r.party]) this.changeTrust(m.id, -1, `${josa(name, '을', '를')} 버리는 걸 봤다`, out, t, true)
    }
  }

  /** 쓰러진 동료를 두고 방을 떠난다 → 그 방에 남는다. 계단을 오르기 전이면 돌아와서 구할 수 있다. */
  private leaveBehind(m: PartyMember, t: Turn) {
    const r = this.r
    if (!r.room) return
    r.party = r.party.filter(p => p !== m)
    r.left.push({ id: m.id, room: r.room, floor: r.floor, trust: m.trust })
    const name = D.companions[m.id].name
    t.sys.push({ kind: 'fail', title: '남겨짐', text: `${josa(name, '이', '가')} ${D.rooms[r.room].name}에 쓰러진 채 남았다. 계단을 오르기 전에 돌아가면 구할 수 있다.` })
    this.log('left', m.id)
  }

  /** 계단을 오를 때: 곁에 없는 동료는 버림으로 확정 */
  private confirmAtStairs(t: Turn, carried?: PartyMember) {
    const r = this.r
    for (const m of r.party.filter(p => p.down && p !== carried)) this.leaveBehind(m, t)
    for (const x of r.left.filter(l => l.floor === r.floor)) this.abandon(x.id, 'left', t.sys, t)
  }

  /* ---------------- notes ---------------- */
  private revealNote(id: string, t: Turn) {
    const r = this.r
    if (r.notes.includes(id)) return
    r.notes.push(id)
    const f = D.notes[id].floor
    r.noteCount[f] = (r.noteCount[f] ?? 0) + 1
    this.g.archive.notes[id] = true
    t.reveals.push({ id, text: D.notes[id].text })
    t.sys.push({ kind: 'note', title: '하은의 쪽지', text: D.notes[id].text })
    this.log('note', id)
  }

  private revealFloorNote(f: number, t: Turn, ignoreCap = false): boolean {
    const r = this.r
    if (!ignoreCap && (r.noteCount[f] ?? 0) >= D.notes_per_floor) return false
    const pool = Object.keys(D.notes).filter(k => D.notes[k].floor === f && !r.notes.includes(k))
    if (!pool.length) return false
    this.revealNote(pool[rnd(pool.length)], t)
    return true
  }

  /* ---------------- noise ---------------- */
  addLoud(n: number, t: Turn | null) {
    const r = this.r
    if (!r.floor || r.floor >= 5) return
    r.loud += n
    if (r.loud >= D.loud_threshold) {
      r.loud = 0
      if (t) this.spawnReinforcement(t)
      else r.pendingSpawn = true
    }
  }

  private spawnReinforcement(t: Turn) {
    const r = this.r, type = D.floors[r.floor].minion
    if (!type || !r.room) return
    ;(r.enemies[r.room] ??= []).push(this.makeEnemy(type))
    t.events.push({ type: 'reinforcement', name: D.enemies[type].name })
    t.sys.push({ kind: 'info', title: '소리를 들켰다', text: `${D.enemies[type].name}이(가) 몰려온다.` })
  }

  /* ---------------- rooms & floors ---------------- */
  private enterRoom(id: string, t: Turn) {
    const r = this.r, rm = D.rooms[id]
    const prevFloor = r.floor
    r.room = id
    if (rm.floor !== prevFloor) {
      r.floor = rm.floor
      r.floorTurn = 0
      r.maxFloor = Math.max(r.maxFloor, r.floor)
      r.loud = 0
      r.hidden = false
      r.party.forEach(p => { p.uses = 0; p.onCooldown = false; p.injured = false })
      this.removeKnightInstances()
      if (r.knight.state === 'hunting') r.knight.state = 'unseen'
      const f = D.floors[String(r.floor)]
      if (f.trial) {
        r.trial = {
          floor: r.floor, title: f.trial.title, goal: f.trial.goal, limit: f.trial.limit, left: f.trial.limit, failed: false,
          requires: f.trial.requires ?? null, kind: f.trial.kind ?? 'reach', target: f.trial.target ?? null,
        }
        t.events.push({ type: 'trial_start' })
        t.sys.push({ kind: 'trial', title: f.trial.title, text: `목표: ${f.trial.goal}\n제한: ${f.trial.limit ? f.trial.limit + '턴' : '없음'}\n실패 시: ???` })
      } else {
        r.trial = null
        t.events.push({ type: 'floor5' })
      }
      t.floorChanged = true
      this.log('floor', String(r.floor))
    }
    this.spawnRoom(id, t)
    // 이 방에 남겨 두었던 동료를 다시 찾는다 (쓰러진 채로 — 일으켜야 한다)
    for (const x of r.left.filter(l => l.room === id)) {
      r.left = r.left.filter(l => l !== x)
      r.party.push({ id: x.id, trust: x.trust, uses: 0, onCooldown: false, injured: false, down: true })
      t.events.push({ type: 'companion_found', id: x.id })
      t.sys.push({ kind: 'join', title: '다시 찾았다', text: `${josa(D.companions[x.id].name, '이', '가')} 아직 여기 쓰러져 있다. 일으켜 세울 수 있다.` })
    }
    if (rm.event === 'knight_glimpse' && !r.knight.glimpsed) {
      r.knight.glimpsed = true
      t.events.push({ type: 'knight_glimpse' })
    }
    if (rm.note_on_enter && !r.visited[id]) {
      if (typeof rm.note_on_enter === 'string') this.revealNote(rm.note_on_enter, t)
      else if (this.engaged().length) {
        // 적이 남아 있으면 쪽지는 읽을 수 없다 — 방을 정리하면 공개된다
        r.pendingRoomNote[id] = true
        t.events.push({ type: 'note_blocked' })
        t.lines.push({ who: 'sys', text: '벽에 하은의 글씨가 보인다 — 싸움이 끝나기 전에는 읽을 수 없다.' })
      } else this.revealFloorNote(rm.floor, t)
    }
    if (id === '5A' && r.party.length) t.events.push({ type: 'threshold' })
    r.visited[id] = true
    if (rm.npc && this.canRecruit(rm.npc)) t.events.push({ type: 'npc_present', id: rm.npc })
    else if (rm.npc && r.abandoned.includes(rm.npc)) t.codeNotes.push(`${D.companions[rm.npc].name} is not here anymore, or will not look at him. He left them behind this dive.`)
    if (id === '5B') t.events.push({ type: 'witch' })
  }

  /** 탑에 들어가는 순간 (첫 다이브든 다음 다이브든) */
  enterTower(): Turn {
    const t = newTurn()
    this.enterRoom(D.floors['1'].start, t)
    t.events.unshift({ type: this.g.dive === 1 ? 'enter_tower' : 'dive_start' })
    return t
  }

  /* ---------------- companion auto-actions ---------------- */
  private companionAttack(m: PartyMember, t: Turn, ctx: Ctx, forced?: EnemyInst) {
    const target = forced && forced.hp > 0 && forced.type !== 'knight' && !this.def(forced).mirror
      ? forced
      : this.engaged().find(e => e.type !== 'knight' && !this.def(e).mirror)
    if (!target) return
    const isGarret = m.id === 'garret'
    const hitMod = isGarret ? 1 : 2
    const dmgSpec = isGarret ? '1d6+1' : '1d8'
    const label = isGarret ? '가렛' : '피오'
    const a = d6(), b = d6()
    const total = a + b + hitMod
    const tier = tierOf(a, b, total, this.def(target).def)
    const hit = tier !== 'fail' && tier !== 'critfail'
    t.lines.push({ who: 'ally', text: `${label} — 공격: 2d6(${a},${b})${sign(hitMod)}=${total} / 방어 ${this.def(target).def} — ${hit ? '적중' : '빗나감'}` })
    if (hit) this.damageEnemy(target, rollSpec(dmgSpec), t)
    // 반격: 가렛은 확률로, 피오는 대실패시만. 이번 공격으로 쓰러진 적은 반격하지 않는다
    const counterExposed = target.hp > 0 && (isGarret ? Math.random() < D.rules.garret_counter_chance : tier === 'critfail')
    if (counterExposed) {
      if (ctx.joint === m.id) ctx.jointHit = true // 협공 상대가 받는 반격은 하나뿐이다
      const mv = this.basicMove(target)
      const counterMod = !isGarret ? 3 : 0 // 피오 대실패: 역보정 +3
      const ca = d6(), cb = d6()
      const ctotal = ca + cb + (mv.a ?? 0) + counterMod
      const chit = ca + cb !== 2 && (ca + cb === 12 || ctotal >= D.companions[m.id].def)
      t.lines.push({ who: 'ally', text: `${this.displayName(target)} 반격 → ${label}: ${chit ? '적중' : '빗나감'}` })
      if (chit) this.hurtAlly(m, t)
    }
  }

  /** 동료가 맞았을 때: 멀쩡하면 부상(다음 턴 쉼), 부상 중이면 쓰러짐 */
  private hurtAlly(m: PartyMember, t: Turn) {
    const name = D.companions[m.id].name
    if (m.injured) {
      m.down = true
      m.injured = false
      t.lines.push({ who: 'ally', text: `${name} — 쓰러졌다. 일으켜 세우기 전에는 움직이지 못한다.` })
      t.events.push({ type: 'companion_down', id: m.id })
      t.sys.push({ kind: 'fail', title: '동료가 쓰러졌다', text: `${name} — [동료: ${name}]로 일으켜 세울 수 있다. 두고 방을 떠나면 남겨진다.` })
      this.log('down', m.id)
    } else {
      m.injured = true
      t.lines.push({ who: 'ally', text: `${name} — 맞았다. 다음 턴 쉰다.` })
    }
  }

  /** 평타 하나가 진우 대신 동료를 노린다 (협공 상대가 먼저, 아니면 확률). 예고된 큰 공격은 항상 진우. */
  private pickAllyTarget(ctx: Ctx): PartyMember | null {
    const up = this.r.party.filter(p => !p.down)
    if (!up.length) return null
    if (ctx.joint && !ctx.jointHit) {
      const j = up.find(p => p.id === ctx.joint)
      if (j) { ctx.jointHit = true; return j }
    }
    if (Math.random() < D.rules.companion_target_chance) return up[rnd(up.length)]
    return null
  }

  private attackAlly(e: EnemyInst, mv: EnemyMove, m: PartyMember, t: Turn) {
    const c = D.companions[m.id]
    const a = d6(), b = d6()
    const total = a + b + (mv.a ?? 0)
    const hit = a + b !== 2 && (a + b === 12 || total >= c.def)
    t.lines.push({ who: 'enemy', text: `[${this.displayName(e)} → ${c.name}: 2d6(${a},${b}) ${sign(mv.a ?? 0)} = ${total} / 방어 ${c.def} — ${hit ? '적중' : '빗나감'}]` })
    if (hit) this.hurtAlly(m, t)
  }

  private companionsAct(ctx: Ctx, t: Turn) {
    const r = this.r
    r.foresight = false
    if (r.floor >= 5) return // 동료들은 빈 페이지의 문턱에서 멈춘다
    const kn = this.here().find(e => e.type === 'knight' && e.state === 'engaged')

    for (const m of r.party) {
      if (m.down) continue // 쓰러진 동료는 아무것도 못 한다

      const wasOnCooldown = m.onCooldown
      const wasInjured = m.injured
      m.onCooldown = false
      if (m.id === 'garret') ctx.garretCooldown = wasOnCooldown
      if (wasInjured) ctx.resting.push(m.id) // 이번 턴은 쉰다 (턴 끝에 부상이 풀린다)
      const isJoint = ctx.joint === m.id
      if (m.id === 'lira' && m.trust >= 3) r.foresight = true

      // 발동 조건과 확률 결정
      const engaged = this.engaged()
      let condition = false
      const prob = [0.10, 0.30, 0.60, 0.90][m.trust]

      if (m.id === 'lira') {
        condition = this.here().some(e => this.def(e).weak && !r.known[this.def(e).weak!.id])
      } else if (m.id === 'pio') {
        condition = engaged.length > 0
      }

      // 능력 자동 발동 (선배): 층당 2회, 연속 불가(5% 행운 돌파), 부상 중엔 쓰지 못한다.
      // 협공 중인 동료는 능력 대신 진우와 같이 친다. 가렛의 방패는 여기서 나가지 않는다 (tryShield).
      let canSkill = m.uses < 2 && condition && !isJoint && !wasInjured
      if (canSkill && wasOnCooldown && Math.random() >= 0.05) canSkill = false

      let skillFired = false
      if (canSkill && Math.random() < prob) {
        m.uses++
        m.onCooldown = true
        skillFired = true

        if (m.id === 'lira') {
          const targets = this.here().filter(e => this.def(e).weak && !r.known[this.def(e).weak!.id])
          const list = m.trust >= 3 ? targets : targets.slice(0, 1)
          list.forEach(e => this.knowWeak(this.def(e).weak!.id, t))
          t.lines.push({ who: 'ally', text: '리라 — 진단' })
        } else if (m.id === 'pio') {
          const steal = m.trust >= 3 && this.here().find(e => e.state === 'engaged' && (this.def(e).weak?.tags ?? []).includes('동료'))
          if (steal) {
            t.lines.push({ who: 'ally', text: '피오 — 훔치기' })
            this.applyWeak(steal, t)
          } else {
            this.here().forEach(e => { if (e.type !== 'knight' && e.state === 'engaged' && !this.def(e).mirror) e.state = 'lost' })
            r.hidden = true
            ctx.hideSkip = true
            t.lines.push({ who: 'ally', text: '피오 — 샛길: 적들을 따돌렸다.' })
          }
          if (kn) r.f4used.pio = true
        }
      }

      if (skillFired || wasInjured) continue // 부상 중이면 쉰다

      if (m.id === 'lira') {
        // 리라 — 조언·부축: 이번 턴 진우의 판정 +1 (협공이면 항상)
        if (engaged.length && (isJoint || Math.random() < (D.rules.lira_aid_chance[m.trust] ?? 0))) {
          r.aid = 1
          t.lines.push({ who: 'ally', text: '리라 — 조언: 이번 판정 +1' })
        }
        continue
      }

      // 플레이어 행동 연계 공격 (선배). 협공이면 반드시 같은 적을 친다.
      let attackProb = -1
      if (isJoint) attackProb = 1
      else if (m.id === 'garret') {
        if (ctx.tag === '공격' || ctx.tag === '방어') attackProb = [0.50, 0.65, 0.80, 0.95][m.trust]
      } else if (m.id === 'pio') {
        if (ctx.tag === '공격') attackProb = [0.50, 0.65, 0.80, 0.95][m.trust]
        else if (ctx.tag === '방어') attackProb = [0.40, 0.55, 0.70, 0.85][m.trust]
        else if (ctx.tag === '회피') attackProb = [0.25, 0.33, 0.40, 0.50][m.trust]
      }
      if (attackProb >= 0 && Math.random() < attackProb) this.companionAttack(m, t, ctx, isJoint ? ctx.jointTarget ?? undefined : undefined)
    }

    // 기사 우회 체크
    const knCheck = this.here().find(e => e.type === 'knight' && e.state === 'engaged')
    if (knCheck && r.f4used.garret && r.f4used.pio && r.knight.state === 'guarding') {
      r.knight.state = 'bypassed'
      knCheck.state = 'bypassed'
      t.events.push({ type: 'knight_bypassed' })
      this.log('knight', 'bypassed')
    }
  }

  /* ---------------- enemy actions ---------------- */
  private enemyAttack(e: EnemyInst, mv: EnemyMove, ctx: Ctx, t: Turn, free = false) {
    const r = this.r
    const a = d6(), b = d6()
    const hitMod = (mv.a ?? 0) + ctx.hitBonus - ctx.dodge
    const total = a + b + hitMod
    let hit = total >= D.pc.defense
    if (a + b === 2) hit = false
    if (a + b === 12) hit = true
    if (ctx.dodgeAll) hit = false
    if (e.type === 'knight' && mv.kill && r.knight.read) {
      hit = false
      r.knight.read = false
      t.lines.push({ who: 'sys', text: '읽어 둔 그대로 — 처형의 일격이 빗나간다.' })
    }
    const label = free ? '등 뒤 공격' : (mv.label ?? '공격')
    t.lines.push({ who: 'enemy', text: `[${this.displayName(e)} ${label}: 2d6(${a},${b}) ${sign(hitMod)} = ${total} / 방어 ${D.pc.defense} — ${hit ? '적중' : '빗나감'}]` })
    if (!hit) return
    let dmg = rollSpec(mv.dmg ?? '1d6')
    if (ctx.defendAll) dmg = 0
    dmg -= ctx.defend
    const shardReady = r.flags.shard && !r.flags.shardHit[r.floor] && dmg > 0
    if (shardReady) dmg -= 2
    dmg = Math.max(0, dmg)
    if (dmg > 0 && this.tryShield(e, mv, dmg, ctx, t)) {
      t.lines.push({ who: 'sys', text: '가렛의 방패가 막았다 — 피해 없음.' })
      return
    }
    if (shardReady) r.flags.shardHit[r.floor] = true // 방패가 막았으면 방패 조각은 아껴진다
    this.damagePC(dmg, t)
    t.lines.push({ who: 'sys', text: `피해 ${dmg} → HP ${Math.max(0, r.hp)}/${r.maxHp}` })
  }

  /** 가렛의 방패: 평소에는 공격만 하다가, 진우가 위기에 맞는 순간에 뛰어든다.
   *  위기 = 예고된 큰 공격, 또는 이번 피해로 HP가 rules.garret_shield_hp 이하가 될 때. 층당 2회, 연속 불가(5% 돌파). */
  private tryShield(e: EnemyInst, mv: EnemyMove, dmg: number, ctx: Ctx, t: Turn): boolean {
    if (ctx.blockAll) return true
    const r = this.r, m = this.member('garret')
    if (!m || m.down || m.uses >= 2 || ctx.joint === 'garret') return false
    const bigHit = !!mv.label && !this.def(e).mirror
    if (!bigHit && r.hp - dmg > D.rules.garret_shield_hp) return false
    if (ctx.garretCooldown && Math.random() >= 0.05) return false
    const chance = m.injured ? D.rules.garret_shield_injured_chance : D.rules.garret_shield_chance[m.trust]
    if (Math.random() >= chance) return false
    m.uses++
    m.onCooldown = true
    ctx.garretCooldown = true
    if (m.trust >= 3) ctx.blockAll = true
    if (e.type === 'knight') r.f4used.garret = true
    t.lines.push({ who: 'ally', text: `가렛 — 방패${m.trust >= 3 ? ' (이번 턴 모든 공격)' : ''}` })
    this.log('shield', e.type)
    return true
  }

  private basicMove(e: EnemyInst): EnemyMove {
    return (this.def(e).cycle ?? []).find(m => m.a) ?? { a: 2, dmg: '1d6' }
  }

  private enemiesAct(ctx: Ctx, t: Turn) {
    const r = this.r
    for (const e of this.engaged()) {
      if (r.hp <= 0) break
      if (e.state !== 'engaged' || e.hp <= 0) continue
      if (e.stunned > 0) {
        e.stunned--
        t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 비틀거린다. 행동하지 못한다.` })
        continue
      }
      const def = this.def(e)
      if (e.uid === ctx.noCounterUid) {
        t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 거리가 멀어 되받아치지 못한다.` })
        continue
      }
      if (def.mirror) {
        if (ctx.tag === '공격') {
          this.enemyAttack(e, { a: (D.pc.mods['공격'] ?? 0) + (r.weapon.atk ?? 0), dmg: r.weapon.dice, label: '따라 휘두르기' }, ctx, t)
        } else {
          e.calm++
          this.knowWeak('mirror', t)
          if (e.calm >= 2) {
            t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 따라 할 것이 없자 흐려져 사라진다.` })
            e.hp = 0
            this.onKill(e, t, false)
          } else t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 진우를 따라 멈춰 선다.` })
        }
        continue
      }
      if (e.type === 'knight' && SAFE_KNIGHT.includes(r.knight.state)) continue
      const cyc = def.cycle ?? []
      let mv = cyc[e.step % cyc.length]
      if (mv.ring && e.silenced) mv = this.basicMove(e)
      e.step++
      e.warn = null
      if (mv.tell) {
        e.warn = mv.warn ?? null
        t.lines.push({ who: 'enemy', text: `${this.displayName(e)} — ${mv.tell}.` })
        continue
      }
      if (mv.ring) {
        if (r.trial) r.trial.left = Math.max(0, r.trial.left - 1)
        t.lines.push({ who: 'enemy', text: `${this.displayName(e)} — 종이 울린다. 물이 한 칸 더 차오른다. (남은 턴 −1)` })
        continue
      }
      if (ctx.blind) { t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 눈이 멀어 허공을 친다.` }); continue }
      if (e.type === 'hound' && ctx.quiet) {
        this.knowWeak('silence', t)
        if (ctx.silent) {
          e.state = 'lost'
          t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 소리를 완전히 놓쳤다. 안개 속으로 멀어진다.` })
        } else t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 소리를 놓쳐 코만 킁킁댄다.` })
        continue
      }
      if (ctx.hideSkip && e.type !== 'knight') {
        t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 진우를 찾지 못한다.` })
        continue
      }
      // 예고된 큰 공격(label 있음)은 항상 진우. 평타는 가끔 동료를 노린다.
      if (!mv.label && e.type !== 'knight') {
        const ally = this.pickAllyTarget(ctx)
        if (ally) { this.attackAlly(e, mv, ally, t); continue }
      }
      this.enemyAttack(e, mv, ctx, t)
    }
  }

  /* ---------------- turn resolution ---------------- */
  private findTarget(text: string): EnemyInst | undefined {
    const list = this.engaged().length ? this.engaged() : this.here()
    const byName = list.find(e => text.includes(e.name))
    if (byName) return byName
    const nonKnight = list.filter(e => e.type !== 'knight')
    return nonKnight[0] ?? list[0]
  }

  resolve(action: PlayerAction): Turn {
    const r = this.r, t = newTurn()
    const text = action.text ?? ''
    // 없는 물건을 쓰려 하면 판정 없이 턴만 흐른다. 공격 연계·거울상 복사가 일어나지 않게 [선택]으로 둔다
    const missing = action.missingItem?.trim() || null
    const missingNote = `The PC tries to use "${missing}", but he does not have it. Show him reaching for it and finding nothing. The action does not happen. Do not let the item appear.`
    const tag: ActionTag = missing ? '선택' : ACTION_TAGS.includes(action.tag) ? action.tag : '선택'
    r.turn++
    r.floorTurn++
    const prevRangedUid = r.lastRangedUid
    r.lastRangedUid = null
    const ctx = newCtx(tag)
    t.action = { tag, arg: action.arg ?? null, text }

    if (r.pendingSpawn) { r.pendingSpawn = false; this.spawnReinforcement(t) }
    if (r.pendingPioNote && r.floor === 3) { r.pendingPioNote = false; this.revealFloorNote(3, t) }
    const hadEngaged = this.engaged().length > 0
    const killsBefore = r.kills

    // 협공: [공격: 가렛] — 그 동료가 반드시 같이 치고, 판정 +2, 반격은 그 동료에게. 태그 인자로만 정한다
    if (tag === '공격' && !action.improvised) {
      const id = namedCompanion(action.arg, '')
      const jm = id ? this.member(id) : undefined
      const target = jm ? this.findTarget(text) : undefined
      if (jm && (jm.down || jm.injured)) t.codeNotes.push(`${D.companions[jm.id].name} cannot join the attack right now (hurt or down). The PC strikes alone.`)
      // 기사와 거울상은 동료가 치지 못하고 동료를 노리지도 않아서 협공이 성립하지 않는다
      else if (jm && target && (target.type === 'knight' || this.def(target).mirror)) t.codeNotes.push(`${D.companions[jm.id].name} cannot join an attack on ${target.name}. The PC strikes alone.`)
      else if (jm && target) {
        ctx.joint = jm.id
        ctx.jointTarget = target
      }
    }
    this.companionsAct(ctx, t)
    const silenceKeys = D.enemies.hound.weak?.keys ?? []
    if (!missing && (tag === '선택' || tag === '숨기') && silenceKeys.some(k => text.includes(k))) {
      ctx.quiet = true
      ctx.silent = true
    }

    /* ---- top floor: endings ---- */
    if (r.floor === 5) {
      if (missing) { t.codeNotes.push(missingNote); return t }
      const intent: Intent = action.intent && INTENTS.includes(action.intent) ? action.intent : 'other'
      t.intent = intent
      this.log('intent', intent)
      const end = this.checkEnding(intent, t)
      if (end) {
        t.events.push({ type: 'ending', id: end })
        t.ended = true
        return t
      }
      if (tag === '이동' && action.arg) this.doMove(action.arg, ctx, t)
      else if (tag === '말' || tag === '살핌' || tag === '몸쓰기' || tag === '숨기') this.check(tag, D.dc[tag] ?? 9, 0, t, undefined, ctx)
      return t
    }

    /* ---- player action ---- */
    if (missing) t.codeNotes.push(missingNote)
    else switch (tag) {
      case '공격': {
        // 협공 대상을 동료가 먼저 쓰러뜨렸으면 남은 적을 친다. 남은 적이 없으면 휘두를 일도 없다
        const jointDown = !!ctx.jointTarget && ctx.jointTarget.hp <= 0
        const e = (jointDown ? undefined : ctx.jointTarget) ?? this.findTarget(text)
        if (!e && jointDown) { t.codeNotes.push('The target was already brought down by a companion this turn.'); break }
        if (!e) { this.check('공격', 8, 0, t, undefined, ctx); t.codeNotes.push('There is nothing here to strike.'); break }
        const improvised = action.improvised ?? null
        const ranged = improvised === 'ranged'
        // 기사는 곧바로 다가온다. 다른 적도 같은 대상에게 연속으로 던지면 거리를 좁혀 온다
        const keptAway = ranged && e.type !== 'knight' && prevRangedUid !== e.uid
        if (ranged) r.lastRangedUid = e.uid
        if (keptAway) ctx.noCounterUid = e.uid
        if (improvised) t.codeNotes.push(`The PC attacks with an object from the scene, not his weapon${!ranged ? '' : keptAway ? ', from a distance. The target cannot strike back this turn' : ', from a distance. The target closes the gap and acts as usual this turn'}.`)
        const bonus = improvised ? -D.improvised_penalty : ctx.joint ? D.rules.joint_bonus : 0
        const label = `${this.displayName(e)} ${improvised ? '지형지물 ' : ''}공격${ctx.joint ? ` (${josa(D.companions[ctx.joint].name, '과', '와')} 협공)` : ''}`
        const res = this.check('공격', this.def(e).def, bonus, t, label, ctx)
        this.exposure(res.tier, true, ctx, t)
        if (!res.ok) break
        if (this.weakMatch(e, '공격', text)) { this.applyWeak(e, t); break }
        let dmg = rollSpec(r.weapon.dice)
        if (r.flags.fang && e.hp < e.max) dmg += 2
        if (!improvised && r.weapon.water && this.def(e).water) dmg += r.weapon.water
        if (res.tier === 'crit') dmg += 4
        this.damageEnemy(e, dmg, t)
        break
      }
      case '회피': {
        const res = this.check('회피', D.dc['회피'], 0, t, undefined, ctx)
        if (res.tier === 'crit') ctx.dodgeAll = true
        else if (res.tier === 'success') ctx.dodge = 4
        this.exposure(res.tier, false, ctx, t)
        break
      }
      case '방어': {
        const res = this.check('방어', D.dc['방어'], 0, t, undefined, ctx)
        if (res.tier === 'crit') ctx.defendAll = true
        else if (res.tier === 'success') ctx.defend = 3
        this.exposure(res.tier, false, ctx, t)
        break
      }
      case '살핌': {
        const res = this.check('살핌', D.dc['살핌'], 0, t, undefined, ctx)
        this.exposure(res.tier, true, ctx, t)
        if (!res.ok) break
        const target = this.here().find(e => this.def(e).weak && !r.known[this.def(e).weak!.id])
        const noteRoom = this.room().notes && (r.noteCount[this.room().notes!] ?? 0) < D.notes_per_floor
        if (target) this.knowWeak(this.def(target).weak!.id, t)
        else if (noteRoom && this.engaged().length) {
          // 쪽지는 적이 남은 방에서는 읽을 수 없다
          t.events.push({ type: 'note_blocked' })
          t.lines.push({ who: 'sys', text: '벽에 하은의 글씨가 보인다 — 싸움이 끝나기 전에는 읽을 수 없다.' })
        }
        else if (this.room().notes && this.revealFloorNote(this.room().notes!, t)) { /* 쪽지 발견 */ }
        else if (this.here().some(e => e.type === 'knight') && r.floor === 4) {
          r.knight.read = true
          t.lines.push({ who: 'sys', text: '기사의 처형 동작을 읽었다 — 다음 처형의 일격은 빗나간다.' })
        } else t.codeNotes.push('The search turns up nothing new.')
        break
      }
      case '숨기': {
        const knightHere = this.here().some(e => e.type === 'knight' && e.state === 'engaged')
        const res = this.check('숨기', knightHere ? 11 : D.dc['숨기'], 0, t, undefined, ctx)
        this.exposure(res.tier, false, ctx, t)
        if (res.ok) {
          ctx.quiet = true
          ctx.hideSkip = true
          r.hidden = true
          this.here().forEach(e => {
            if (e.type === 'knight' || this.def(e).mirror || e.type === 'bellringer') return
            if (e.state === 'engaged') e.state = 'lost'
          })
          if (this.here().some(e => e.type === 'hound')) this.knowWeak('silence', t)
          if (knightHere) ctx.dodge = 4
        } else this.addLoud(res.tier === 'critfail' ? 2 : 1, t)
        break
      }
      case '몸쓰기': {
        const res = this.check('몸쓰기', D.dc['몸쓰기'], 0, t, undefined, ctx)
        if (res.tier === 'critfail') this.addLoud(1, t)
        this.exposure(res.tier, false, ctx, t)
        if (!res.ok) break
        const e = this.here().find(x => x.state === 'engaged' && this.weakMatch(x, '몸쓰기', text))
        if (e) this.applyWeak(e, t)
        break
      }
      case '말': {
        const rm = this.room()
        const kn = this.here().find(e => e.type === 'knight' && e.state === 'engaged')
        if (rm.npc && !this.inParty(rm.npc) && r.abandoned.includes(rm.npc)) {
          t.codeNotes.push(`${D.companions[rm.npc].name} will not come with him again this dive — he left them behind. They do not join, whatever he says.`)
        } else if (rm.npc && this.canRecruit(rm.npc)) {
          const c = D.companions[rm.npc]
          const res = this.check('말', c.dc, 0, t, `${c.name} 설득`, ctx)
          this.exposure(res.tier, false, ctx, t)
          if (res.ok) this.join(rm.npc, t)
          else t.codeNotes.push(`${c.name} is not persuaded (yet). They can be asked again.`)
        } else if (kn && r.floor === 4) {
          const canReach = r.knight.helm >= 1 && this.hasFloorNote(4)
          const res = this.check('말', canReach ? 10 : 15, 0, t, '기사에게 말하기', ctx)
          this.exposure(res.tier, false, ctx, t)
          if (res.ok && canReach) {
            r.knight.state = 'yielded'
            kn.state = 'yielded'
            t.events.push({ type: 'knight_yields' })
            this.log('knight', 'yielded')
          } else if (!canReach) {
            t.codeNotes.push('The Knight does not listen. Words cannot reach him yet (his helm is whole, or the PC has not seen what she wrote about him).')
          }
        } else this.exposure(this.check('말', D.dc['말'], 0, t, undefined, ctx).tier, false, ctx, t)
        break
      }
      case '사용': {
        const p = r.powers.ember
        if (p && p.uses > 0 && (!action.arg || /불씨|마녀/.test((action.arg ?? '') + text))) {
          p.uses--
          ctx.blind = true
          t.lines.push({ who: 'sys', text: `마녀의 불씨 — 모든 적의 눈이 먼다. (남은 횟수 ${p.uses})` })
        } else t.codeNotes.push('That power is not available. Treat this as a moment of hesitation.')
        break
      }
      case '동료': {
        // 동료는 알아서 움직인다(선배). [동료: 이름]은 쓰러진 동료를 일으켜 세울 때만 쓴다.
        const nm = namedCompanion(action.arg, text)
        const m = nm ? this.member(nm) : r.party.find(p => p.down)
        if (m && m.down) {
          m.down = false
          m.injured = true // 일어섰지만 다음 턴은 쉰다
          t.lines.push({ who: 'ally', text: `${josa(D.companions[m.id].name, '을', '를')} 일으켜 세웠다. 다음 턴은 쉰다.` })
          t.events.push({ type: 'companion_raised', id: m.id })
        } else {
          t.codeNotes.push('Companions act automatically each turn. Treat this as a [선택] moment.')
          ctx.quiet = true
        }
        break
      }
      case '떠남': {
        // 동료를 직접 버린다. AI가 서술로 내보낼 수는 없고, 플레이어가 고른 이 태그로만 일어난다.
        const id = namedCompanion(action.arg, text)
        if (id && (this.inParty(id) || r.left.some(x => x.id === id))) this.abandon(id, 'chosen', t.sys, t)
        else t.codeNotes.push('There is no such companion with him. Treat this as a [선택] moment.')
        ctx.quiet = true
        break
      }
      case '이동':
        this.doMove(action.arg ?? '', ctx, t)
        break
      default:
        ctx.quiet = true // 선택
    }

    if (r.offer) { r.aid = 0; return t } // 보상 선택 대기: 이 턴은 여기서 멈춤. 리라의 조언은 다음 층으로 넘어가지 않는다
    if (!ctx.moved && r.hp > 0) this.enemiesAct(ctx, t)
    if (ctx.silent && !this.engaged().length) r.hidden = true

    /* ---- after effects ---- */
    if (r.room === '1A' && !this.inParty('garret') && !r.recruited.garret && !this.here().length) this.join('garret', t)

    // 방을 정리했다 (이번 턴에 적을 쓰러뜨려 교전이 끝남): 함께 싸운 동료 신뢰 +1, 미뤄 둔 쪽지 공개
    if (hadEngaged && !ctx.moved && !this.engaged().length && r.kills > killsBefore && r.room) {
      for (const m of r.party.filter(p => !p.down)) {
        const key = `${r.floor}:${m.id}`
        if (r.trustCleared[key]) continue
        r.trustCleared[key] = true
        this.changeTrust(m.id, 1, '함께 싸워 방을 정리했다', t.sys, t)
      }
    }
    if (r.room && r.pendingRoomNote[r.room] && !this.engaged().length) {
      r.pendingRoomNote[r.room] = false
      this.revealFloorNote(this.room().floor, t)
    }
    // 쉬던 동료의 부상이 풀린다 (쉬는 턴에 또 맞았으면 이미 쓰러짐)
    for (const id of ctx.resting) { const m = this.member(id); if (m && !m.down) m.injured = false }
    r.aid = 0

    if (r.trial && r.trial.limit > 0 && !r.trial.failed && !t.floorChanged) {
      r.trial.left = Math.max(0, r.trial.left - 1)
      if (r.trial.left <= 0) {
        r.trial.failed = true
        t.events.push({ type: 'trial_fail' })
        t.sys.push({ kind: 'fail', title: '시험 실패', text: '회색 기사가 내려온다.' })
        if (r.floor <= 3 && !this.here().some(e => e.type === 'knight') && r.room) {
          ;(r.enemies[r.room] ??= []).push(this.makeEnemy('knight'))
          r.knight.state = 'hunting'
        }
        this.log('trial', 'fail')
      }
    }
    if (r.hp <= 0) {
      t.events.push({ type: 'expelled' })
      t.ended = true
    }
    return t
  }

  private doMove(arg: string, ctx: Ctx, t: Turn) {
    const r = this.r, rm = this.room()
    const a = arg.trim().toUpperCase()
    const target = rm.exits.find(x => a === x) ??
      rm.exits.find(x => a.startsWith(x)) ??
      rm.exits.find(x => arg.includes(D.rooms[x].name)) ?? null
    if (!target) { t.codeNotes.push(`There is no exit "${arg}" from here. The PC hesitates.`); return }
    const up = D.rooms[target].floor > r.floor
    if (up && r.floor === 4 && !SAFE_KNIGHT.includes(r.knight.state)) {
      t.lines.push({ who: 'sys', text: '회색 기사가 마지막 계단을 막고 있다.' })
      return
    }
    // 교전 중에 빠져나가려면 이탈 판정 (회피). 숨은 상태·피오의 샛길이면 판정 없이 나간다.
    // 시험 실패로 내려온 기사(hunting)는 느리게 뒤따라올 뿐 길을 막지 않는다 — 도망쳐서 계단을 오르는 게 살 길
    const blockers = this.engaged().filter(e =>
      !this.def(e).mirror && e.stunned <= 0 && !(e.type === 'knight' && (SAFE_KNIGHT.includes(r.knight.state) || r.knight.state === 'hunting')))
    // [이동: 2B, 버림: 가렛]으로 고른 미끼, 또는 두고 가는 쓰러진 동료가 있으면 빠져나가기 쉽고,
    // [이동: 2B, 데리고: 가렛]으로 쓰러진 동료를 데려가면 어렵다
    const baitId = companionAfter(arg, '버림'), carryId = companionAfter(arg, '데리고')
    const bait = baitId ? this.member(baitId) : undefined
    const carried = carryId && carryId !== baitId ? r.party.find(p => p.id === carryId && p.down) : undefined
    const leftDown = r.party.find(p => p.down && p !== bait && p !== carried)
    if (!r.hidden && blockers.length) {
      const pio = this.member('pio')
      const pioHelp = pio && !pio.down && pio.trust >= 3 && pio !== bait ? 2 : 0
      const decoyBonus = bait ? D.rules.bait_bonus : leftDown ? D.rules.down_left_bonus : 0
      const notes = [
        ...(bait ?? leftDown ? [`${josa(D.companions[(bait ?? leftDown)!.id].name, '을', '를')} 미끼로`] : []),
        ...(carried ? [`${josa(D.companions[carried.id].name, '을', '를')} 데리고`] : []),
      ]
      const label = notes.length ? `이탈 (${notes.join(', ')})` : '이탈'
      const res = this.check('회피', D.rules.disengage_dc + blockers.length - 1, pioHelp + decoyBonus - (carried ? D.rules.carry_penalty : 0), t, label, ctx)
      if (!res.ok) {
        // 못 빠져나갔다: 이 방에 그대로 있고, 적들이 이번 턴 정상적으로 움직인다
        this.exposure(res.tier, false, ctx, t)
        t.events.push({ type: 'disengage_fail' })
        return
      }
    }
    r.hidden = false
    ctx.moved = true
    if (r.hp <= 0) return
    if (bait) this.abandon(bait.id, 'bait', t.sys, t) // 스스로 고른 미끼: 이번 다이브에서 돌아오지 않는다
    // 쓰러진 동료는 따라오지 못한다
    if (!up) for (const m of r.party.filter(p => p.down && p !== carried)) this.leaveBehind(m, t)
    else this.confirmAtStairs(t, carried) // 계단을 오르는 순간: 곁에 없는 동료는 버림으로 확정
    if (carried) {
      const name = D.companions[carried.id].name
      t.lines.push({ who: 'ally', text: `${josa(name, '을', '를')} 들쳐 메고 함께 움직인다.` })
      t.codeNotes.push(`He drags ${name} along with him. ${name} is still DOWN and cannot act until raised. Show the weight of it.`)
    }
    t.lines.push({ who: 'sys', text: `이동 → ${D.rooms[target].name}` })
    const huntingKnight = this.here().find(e => e.type === 'knight' && r.knight.state === 'hunting')
    if (up) {
      const tr = r.trial
      const slainOk = !tr || tr.kind !== 'slay' || !tr.target || !!r.slain[tr.target]
      const cleared = tr && !tr.failed && (!tr.requires || this.inParty(tr.requires)) && slainOk
      if (tr && cleared) {
        t.events.push({ type: 'trial_clear' })
        t.sys.push({ kind: 'clear', title: '시험 통과', text: tr.title })
        this.log('trial', 'clear')
        const cards = D.rewards[String(r.floor)]
        if (cards) {
          r.offer = cards.map(c => ({ ...c, disabled: c.cost ? r.hp <= c.cost : false }))
          r.pendingMove = target
          t.events.push({ type: 'reward_offer', cards: r.offer })
          return
        }
      } else if (tr && r.floor <= 3) {
        t.events.push({ type: 'trial_unclear', reason: tr.failed ? 'clock' : !slainOk ? 'target' : 'requirement' })
      }
      this.enterRoom(target, t)
    } else {
      if (huntingKnight && r.room) r.enemies[r.room] = r.enemies[r.room].filter(e => e !== huntingKnight)
      this.enterRoom(target, t)
      if (huntingKnight) {
        huntingKnight.step = 0
        ;(r.enemies[target] ??= []).push(huntingKnight)
      }
    }
  }

  /* ---------------- rewards ---------------- */
  /** 보상 카드 고르기. 찢긴 책장이 충분하면 extraId로 한 장 더 고를 수 있다. */
  takeReward(cardId: string, extraId?: string): Turn | null {
    const r = this.r, t = newTurn()
    const card = (r.offer ?? []).find(c => c.id === cardId && !c.disabled)
    if (!card || !r.pendingMove) return null
    const need = D.rules.pages_per_extra_card
    const extra = extraId && extraId !== cardId && r.pages >= need
      ? (r.offer ?? []).find(c => c.id === extraId && !c.disabled && (!c.cost || r.hp - (card.cost ?? 0) > c.cost))
      : undefined
    if (extra) {
      r.pages -= need
      t.lines.push({ who: 'sys', text: `찢긴 책장 ${need}장 — 한 장 더 (남은 책장 ${r.pages})` })
    }
    for (const c of extra ? [card, extra] : [card]) this.applyCard(c, t)
    r.offer = null
    const dest = r.pendingMove
    r.pendingMove = null
    this.enterRoom(dest, t)
    return t
  }

  private applyCard(card: RewardCard, t: Turn) {
    const r = this.r
    if (card.cost) {
      r.hp -= card.cost
      t.lines.push({ who: 'sys', text: `피의 대가 — HP −${card.cost} → ${r.hp}/${r.maxHp}` })
    }
    if (card.weapon) r.weapon = { id: card.id, name: card.name, ...card.weapon }
    const flagCards: Record<string, keyof RunState['flags']> = { shard: 'shard', cloak: 'cloak', oath: 'oath', fang: 'fang', breath: 'breath' }
    if (flagCards[card.id]) {
      ;(r.flags[flagCards[card.id]] as boolean) = true
      r.relics.push(card.name)
    }
    if (card.id === 'ember') r.powers.ember = { name: card.name, uses: 2 }
    t.events.push({ type: 'reward_taken', card })
    t.sys.push({ kind: 'reward', title: `보상 획득 — ${card.kind}`, text: `${card.name}: ${card.desc}` })
    this.log('reward', card.id)
  }

  /* ---------------- endings ---------------- */
  private checkEnding(intent: Intent, t: Turn): EndingId | null {
    const r = this.r
    if (intent === 'leave') return 'alone'
    if (r.room !== '5B') return null
    if (intent === 'stay') return 'stay'
    if (intent === 'helm') return 'knight'
    if (intent === 'promise' || intent === 'speak') {
      if (r.knight.state === 'defeated') return 'forced'
      if (intent === 'promise' && r.abandoned.length) {
        // 동료를 버린 다이브: 약속 결말이 잠긴다. 마녀가 이유를 직접 말한다.
        const names = r.abandoned.map(id => D.companions[id].name).join(', ')
        t.codeNotes.push(`She does not believe him. He left someone behind on the way up this dive (${names}), and she knows it. Follow the Witch page: she names who he left, in her own ten-year-old words, and asks why she should believe he would not leave her too. Do not end the scene; let it land, then offer choices.`)
        return null
      }
      if (intent === 'promise' && this.hasFloorNote(3) && this.hasFloorNote(4)) {
        // 셋이 모두 곁에 남아 여기까지 왔다면 확장판
        return r.party.length >= 3 ? 'promise_together' : 'promise'
      }
      if (intent === 'promise') {
        t.codeNotes.push('She does not believe him yet. The witch looks past him, to the Knight (or to where the Knight would stand). He has not understood enough of her days, or of what she thought of him, in this dive. Do not end the scene; let the refusal land quietly, then offer choices.')
      }
    }
    return null
  }

  /* ---------------- AI가 제안한 태그 반영 (검증 후) ---------------- */
  applyAITags(p: { trust: { npc: CompanionId; delta: number; reason: string }[]; loud: boolean; intents: Record<string, Intent> }): SysNotice[] {
    const out: SysNotice[] = []
    const seen: Partial<Record<CompanionId, boolean>> = {}
    for (const tr of p.trust) {
      if (seen[tr.npc]) continue
      seen[tr.npc] = true
      this.changeTrust(tr.npc, tr.delta, tr.reason, out)
    }
    if (p.loud) this.addLoud(1, null)
    this.r.intents = p.intents
    return out
  }

  /* ---------------- summaries ---------------- */
  runSummary(cause: string): RunSummary {
    const r = this.r
    return {
      dive: this.g.dive, cause, maxFloor: r.maxFloor, turns: r.turn, kills: r.kills, damage: r.damageTaken,
      notes: r.notes.slice(),
      met: (Object.keys(r.recruited) as CompanionId[]).map(k => D.companions[k].name),
      weapon: r.weapon.name, knight: r.knight.state,
      abandoned: r.abandoned.map(id => D.companions[id].name),
    }
  }

  /** 화면용: 적의 다음 행동 (리라 신뢰 3일 때 상태 패널에 보인다) */
  nextMoveKo(e: EnemyInst): string {
    const def = this.def(e)
    if (def.mirror) return '진우를 따라 한다'
    if (e.warn) return e.warn
    const cyc = def.cycle ?? []
    const mv = cyc[e.step % cyc.length]
    if (!mv) return '기다린다'
    if (mv.tell) return mv.warn ?? '큰 동작을 준비하려 한다'
    if (mv.ring) return '종을 울리려 한다'
    return '공격하려 한다'
  }

  nextMoveText(e: EnemyInst): string {
    const def = this.def(e)
    if (def.mirror) return 'copies whatever the PC does; if the PC does not attack, it does not attack'
    if (e.warn) return `WINDING UP — ${e.warn} (next turn)`
    const cyc = def.cycle ?? []
    const mv = cyc[e.step % cyc.length]
    if (!mv) return 'waiting'
    if (mv.tell) return 'about to wind up a big move'
    if (mv.ring) return 'about to ring the bell'
    return 'about to attack'
  }
}

