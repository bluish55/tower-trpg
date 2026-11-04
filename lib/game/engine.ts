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
  Intent, PartyMember, PlayerAction, RoomDef, RunState, RunSummary, SysNotice, Tier, Turn,
} from './types'
import { ACTION_TAGS, INTENTS, SAFE_KNIGHT, TIER_KO } from './types'

export const D = gameData as unknown as GameData

const COMP_ID: Record<string, CompanionId> = { '가렛': 'garret', '리라': 'lira', '피오': 'pio' }

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
const sign = (n: number) => (n >= 0 ? '+' : '-') + Math.abs(n)
const OK = (t: Tier) => t === 'crit' || t === 'success' || t === 'partial'

export function tierOf(a: number, b: number, total: number, dc: number): Tier {
  if (a + b === 12) return 'crit'
  if (a + b === 2) return 'critfail'
  if (total >= dc + 5) return 'crit'
  if (total > dc) return 'success'
  if (total === dc) return 'partial'
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
    kills: 0, damageTaken: 0, log: [],
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
  blockOne: boolean; blockAll: boolean; blockUsed: boolean
  blind: boolean; hitBonus: number
  quiet: boolean; silent: boolean; hideSkip: boolean
  moved: boolean; struggled: boolean
}
const newCtx = (tag: ActionTag): Ctx => ({
  tag, dodge: 0, dodgeAll: false, defend: 0, defendAll: false,
  blockOne: false, blockAll: false, blockUsed: false, blind: false, hitBonus: 0,
  quiet: false, silent: false, hideSkip: false, moved: false, struggled: false,
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
  private check(tag: ActionTag, dc: number, extra: number, t: Turn, label?: string) {
    const r = this.r
    let mod = (D.pc.mods[tag] ?? 0) + extra
    if (tag === '공격') mod += (r.weapon.atk ?? 0) + (r.flags.oath ? 2 : 0)
    if (tag === '숨기' && r.flags.cloak) mod += 2
    const a = d6(), b = d6(), total = a + b + mod
    const tier = tierOf(a, b, total, dc)
    t.lines.push({ who: 'pc', text: `[${label ?? tag} 판정: 2d6(${a},${b}) ${sign(mod)} = ${total} / 목표 ${dc} — ${TIER_KO[tier]}]` })
    this.log('roll', `${tag} ${TIER_KO[tier]}`)
    return { tier, ok: OK(tier), total }
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
        r.knight.state = 'defeated'
        t.events.push({ type: 'knight_defeated' })
        this.log('knight', 'defeated')
      }
      return
    }
    if (e.hp <= 0) {
      r.kills++
      t.lines.push({ who: 'sys', text: `${e.name} 쓰러짐.` })
    }
  }

  /* ---------------- weaknesses ---------------- */
  private weakMatch(e: EnemyInst, tag: ActionTag, text: string) {
    const w = this.def(e).weak
    if (!w?.keys || !w.tags || !w.tags.includes(tag)) return false
    return w.keys.some(k => text.includes(k))
  }

  private applyWeak(e: EnemyInst, t: Turn) {
    const r = this.r, w = this.def(e).weak
    if (!w) return
    this.knowWeak(w.id, t)
    switch (w.effect) {
      case 'kill':
        e.hp = 0
        r.kills++
        t.lines.push({ who: 'sys', text: `약점 적중 — ${this.displayName(e)}의 투구가 떨어지고, 갑옷이 무너진다.` })
        break
      case 'horn': {
        e.stunned = 1
        this.here().filter(x => x.type === 'hound').forEach(h => { h.hp = 0 })
        const bite = rollSpec('2d6')
        e.hp = Math.max(0, e.hp - bite)
        t.lines.push({ who: 'sys', text: `약점 적중 — 뿔피리가 부서졌다. 사냥개들이 사냥꾼에게 달려든다: 피해 ${bite} → ${e.hp}/${e.max}. 사냥꾼은 한 턴 움직이지 못한다.` })
        if (e.hp <= 0) { r.kills++; t.lines.push({ who: 'sys', text: '사냥꾼 쓰러짐.' }) }
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
    if (this.inParty(id)) return
    this.r.party.push({ id, trust: c.trust, uses: 0, onCooldown: false, injured: false })
    this.r.recruited[id] = true
    t.events.push({ type: 'companion_join', id })
    t.sys.push({ kind: 'join', title: '동료 합류', text: `${c.name} — ${c.ability}: ${c.desc}` })
    this.log('join', id)
  }

  changeTrust(id: CompanionId, delta: number, reason: string, out: SysNotice[]) {
    const m = this.member(id)
    if (!m) return
    const before = m.trust
    m.trust = clamp(m.trust + Math.sign(delta), 0, 3)
    if (m.trust === before) return
    out.push({ kind: 'trust', title: m.trust > before ? '신뢰 상승' : '신뢰 하락', text: `${D.companions[id].name} ${m.trust}/3${reason ? ' — ' + reason : ''}` })
    this.log('trust', `${id} ${m.trust > before ? '+' : '-'}`)
    if (id === 'pio' && m.trust >= 2) this.r.pendingPioNote = true
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
        r.trial = { floor: r.floor, title: f.trial.title, goal: f.trial.goal, limit: f.trial.limit, left: f.trial.limit, failed: false, requires: f.trial.requires ?? null }
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
    if (rm.event === 'knight_glimpse' && !r.knight.glimpsed) {
      r.knight.glimpsed = true
      t.events.push({ type: 'knight_glimpse' })
    }
    if (rm.note_on_enter && !r.visited[id]) {
      if (typeof rm.note_on_enter === 'string') this.revealNote(rm.note_on_enter, t)
      else this.revealFloorNote(rm.floor, t)
    }
    r.visited[id] = true
    if (rm.npc && !this.inParty(rm.npc)) t.events.push({ type: 'npc_present', id: rm.npc })
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
  private specMax(spec: string): number {
    const m = spec.replace(/\s/g, '').match(/(\d+)d(\d+)([+-]\d+)?/)
    if (!m) return 0
    return Number(m[1]) * Number(m[2]) + (m[3] ? Number(m[3]) : 0)
  }

  private companionAttack(m: PartyMember, t: Turn) {
    const target = this.engaged().find(e => e.type !== 'knight' && !this.def(e).mirror)
    if (!target) return
    const isGarret = m.id === 'garret'
    const hitMod = isGarret ? 1 : 2
    const dmgSpec = isGarret ? '1d6+1' : '1d8'
    const label = isGarret ? '가렛' : '피오'
    const a = d6(), b = d6()
    const total = a + b + hitMod
    const tier = tierOf(a, b, total, this.def(target).def)
    const hit = tier !== 'fail' && tier !== 'critfail'
    t.lines.push({ who: 'sys', text: `${label} — 공격: 2d6(${a},${b})${sign(hitMod)}=${total} / 방어 ${this.def(target).def} — ${hit ? '적중' : '빗나감'}` })
    if (hit) this.damageEnemy(target, rollSpec(dmgSpec), t)
    // 반격: 가렛은 항상, 피오는 대실패시만
    const counterExposed = isGarret || tier === 'critfail'
    if (counterExposed) {
      const mv = this.basicMove(target)
      const counterMod = !isGarret ? 3 : 0 // 피오 대실패: 역보정 +3
      const ca = d6(), cb = d6()
      const ctotal = ca + cb + (mv.a ?? 0) + counterMod
      const chit = ca + cb !== 2 && (ca + cb === 12 || ctotal >= D.pc.defense)
      t.lines.push({ who: 'sys', text: `${this.displayName(target)} 반격 → ${label}: ${chit ? '적중' : '빗나감'}` })
      if (chit) {
        m.injured = true
        t.lines.push({ who: 'sys', text: `${label} — 반격을 맞았다. 다음 턴 쉰다.` })
      }
    }
  }

  private companionsAct(ctx: Ctx, t: Turn) {
    const r = this.r
    const kn = this.here().find(e => e.type === 'knight' && e.state === 'engaged')

    for (const m of r.party) {
      if (m.uses >= 2) continue // 층당 2회 한도 소진

      const wasOnCooldown = m.onCooldown
      const wasInjured = m.injured
      m.onCooldown = false
      m.injured = false

      // 발동 조건과 확률 결정
      const engaged = this.engaged()
      let condition = false
      let prob = [0.10, 0.30, 0.60, 0.90][m.trust]

      if (m.id === 'garret') {
        condition = engaged.length > 0
        if (condition) {
          const deathRisk = engaged.some(e =>
            e.type !== 'knight' && r.hp <= this.specMax(this.basicMove(e).dmg ?? '1d6')
          )
          if (deathRisk) prob = [0.10, 0.30, 0.60, 0.80][m.trust]
        }
      } else if (m.id === 'lira') {
        condition = this.here().some(e => this.def(e).weak && !r.known[this.def(e).weak!.id])
      } else if (m.id === 'pio') {
        condition = engaged.length > 0
      }

      if (!condition) continue

      // 스킬 쿨다운: 5% 행운 돌파
      if (wasOnCooldown && Math.random() >= 0.05) continue

      // 부상 쿨다운: 가렛만 위급 시 20% 돌파, 나머지는 돌파 불가
      if (wasInjured) {
        if (m.id === 'garret') {
          const deathRisk = engaged.some(e =>
            e.type !== 'knight' && r.hp <= this.specMax(this.basicMove(e).dmg ?? '1d6')
          )
          if (!deathRisk || Math.random() >= 0.20) continue
        } else {
          continue
        }
      }

      // 스킬 확률 판정 및 발동
      let skillFired = false
      if (Math.random() < prob) {
        m.uses++
        m.onCooldown = true
        skillFired = true

        if (m.id === 'garret') {
          if (m.trust >= 3) ctx.blockAll = true
          else ctx.blockOne = true
          t.lines.push({ who: 'sys', text: `가렛 — 방패${m.trust >= 3 ? ' (이번 턴 모든 공격)' : ''}` })
          if (kn) r.f4used.garret = true
        } else if (m.id === 'lira') {
          const targets = this.here().filter(e => this.def(e).weak && !r.known[this.def(e).weak!.id])
          const list = m.trust >= 3 ? targets : targets.slice(0, 1)
          list.forEach(e => this.knowWeak(this.def(e).weak!.id, t))
          t.lines.push({ who: 'sys', text: '리라 — 진단' })
        } else if (m.id === 'pio') {
          const steal = m.trust >= 3 && this.here().find(e => e.state === 'engaged' && (this.def(e).weak?.tags ?? []).includes('동료'))
          if (steal) {
            t.lines.push({ who: 'sys', text: '피오 — 훔치기' })
            this.applyWeak(steal, t)
          } else {
            this.here().forEach(e => { if (e.type !== 'knight' && e.state === 'engaged' && !this.def(e).mirror) e.state = 'lost' })
            r.hidden = true
            ctx.hideSkip = true
            t.lines.push({ who: 'sys', text: '피오 — 샛길: 적들을 따돌렸다.' })
          }
          if (kn) r.f4used.pio = true
        }
      }

      // 스킬 미발동 + 부상 없음 → 플레이어 행동 연계 공격 시도
      if (!skillFired && !wasInjured && m.id !== 'lira') {
        let attackProb = -1
        if (m.id === 'garret') {
          if (ctx.tag === '공격' || ctx.tag === '방어') attackProb = [0.50, 0.65, 0.80, 0.95][m.trust]
        } else if (m.id === 'pio') {
          if (ctx.tag === '공격') attackProb = [0.50, 0.65, 0.80, 0.95][m.trust]
          else if (ctx.tag === '방어') attackProb = [0.40, 0.55, 0.70, 0.85][m.trust]
          else if (ctx.tag === '회피') attackProb = [0.25, 0.33, 0.40, 0.50][m.trust]
        }
        if (attackProb >= 0 && Math.random() < attackProb) this.companionAttack(m, t)
      }
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
    if (ctx.blockAll || (ctx.blockOne && !ctx.blockUsed)) {
      ctx.blockUsed = true
      t.lines.push({ who: 'sys', text: '가렛의 방패가 막았다 — 피해 없음.' })
      return
    }
    if (ctx.defendAll) dmg = 0
    dmg -= ctx.defend
    if (r.flags.shard && !r.flags.shardHit[r.floor] && dmg > 0) {
      r.flags.shardHit[r.floor] = true
      dmg -= 2
    }
    dmg = Math.max(0, dmg)
    this.damagePC(dmg, t)
    t.lines.push({ who: 'sys', text: `피해 ${dmg} → HP ${Math.max(0, r.hp)}/${r.maxHp}` })
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
      if (def.mirror) {
        if (ctx.tag === '공격') {
          this.enemyAttack(e, { a: (D.pc.mods['공격'] ?? 0) + (r.weapon.atk ?? 0), dmg: r.weapon.dice, label: '따라 휘두르기' }, ctx, t)
        } else {
          e.calm++
          this.knowWeak('mirror', t)
          if (e.calm >= 2) {
            e.hp = 0
            r.kills++
            t.lines.push({ who: 'sys', text: `${this.displayName(e)} — 따라 할 것이 없자 흐려져 사라진다.` })
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
    const tag: ActionTag = ACTION_TAGS.includes(action.tag) ? action.tag : '선택'
    r.turn++
    r.floorTurn++
    const ctx = newCtx(tag)
    t.action = { tag, arg: action.arg ?? null, text }

    if (r.pendingSpawn) { r.pendingSpawn = false; this.spawnReinforcement(t) }
    if (r.pendingPioNote && r.floor === 3) { r.pendingPioNote = false; this.revealFloorNote(3, t) }
    this.companionsAct(ctx, t)
    const silenceKeys = D.enemies.hound.weak?.keys ?? []
    if ((tag === '선택' || tag === '숨기') && silenceKeys.some(k => text.includes(k))) {
      ctx.quiet = true
      ctx.silent = true
    }

    /* ---- top floor: endings ---- */
    if (r.floor === 5) {
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
      else if (tag === '말' || tag === '살핌' || tag === '몸쓰기' || tag === '숨기') this.check(tag, D.dc[tag] ?? 9, 0, t)
      return t
    }

    /* ---- player action ---- */
    switch (tag) {
      case '공격': {
        const e = this.findTarget(text)
        if (!e) { this.check('공격', 8, 0, t); t.codeNotes.push('There is nothing here to strike.'); break }
        const res = this.check('공격', this.def(e).def, 0, t, `${this.displayName(e)} 공격`)
        if (res.tier === 'critfail') ctx.hitBonus += 2
        if (!res.ok) break
        if (this.weakMatch(e, '공격', text)) { this.applyWeak(e, t); break }
        let dmg = rollSpec(r.weapon.dice)
        if (r.flags.fang && e.hp < e.max) dmg += 2
        if (r.weapon.water && this.def(e).water) dmg += r.weapon.water
        if (res.tier === 'crit') dmg += 4
        if (res.tier === 'partial') dmg = Math.ceil(dmg / 2)
        this.damageEnemy(e, dmg, t)
        break
      }
      case '회피': {
        const res = this.check('회피', D.dc['회피'], 0, t)
        if (res.tier === 'crit') ctx.dodgeAll = true
        else if (res.tier === 'success') ctx.dodge = 4
        else if (res.tier === 'partial') ctx.dodge = 2
        else if (res.tier === 'critfail') ctx.hitBonus += 2
        break
      }
      case '방어': {
        const res = this.check('방어', D.dc['방어'], 0, t)
        if (res.tier === 'crit') ctx.defendAll = true
        else if (res.tier === 'success') ctx.defend = 3
        else if (res.tier === 'partial') ctx.defend = 1
        else if (res.tier === 'critfail') ctx.hitBonus += 2
        break
      }
      case '살핌': {
        const res = this.check('살핌', D.dc['살핌'], 0, t)
        if (res.tier === 'critfail') ctx.hitBonus += 2
        if (!res.ok) break
        const target = this.here().find(e => this.def(e).weak && !r.known[this.def(e).weak!.id])
        if (target) this.knowWeak(this.def(target).weak!.id, t)
        else if (this.room().notes && this.revealFloorNote(this.room().notes!, t)) { /* 쪽지 발견 */ }
        else if (this.here().some(e => e.type === 'knight') && r.floor === 4) {
          r.knight.read = true
          t.lines.push({ who: 'sys', text: '기사의 처형 동작을 읽었다 — 다음 처형의 일격은 빗나간다.' })
        } else t.codeNotes.push('The search turns up nothing new.')
        break
      }
      case '숨기': {
        const knightHere = this.here().some(e => e.type === 'knight' && e.state === 'engaged')
        const res = this.check('숨기', knightHere ? 11 : D.dc['숨기'], 0, t)
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
        const res = this.check('몸쓰기', D.dc['몸쓰기'], 0, t)
        if (res.tier === 'critfail') this.addLoud(1, t)
        if (!res.ok) break
        const e = this.here().find(x => x.state === 'engaged' && this.weakMatch(x, '몸쓰기', text))
        if (e) this.applyWeak(e, t)
        break
      }
      case '말': {
        const rm = this.room()
        const kn = this.here().find(e => e.type === 'knight' && e.state === 'engaged')
        if (rm.npc && !this.inParty(rm.npc)) {
          const c = D.companions[rm.npc]
          const res = this.check('말', c.dc, 0, t, `${c.name} 설득`)
          if (res.ok) this.join(rm.npc, t)
          else t.codeNotes.push(`${c.name} is not persuaded (yet). They can be asked again.`)
        } else if (kn && r.floor === 4) {
          const canReach = r.knight.helm >= 1 && this.hasFloorNote(4)
          const res = this.check('말', canReach ? 10 : 15, 0, t, '기사에게 말하기')
          if (res.ok && canReach) {
            r.knight.state = 'yielded'
            kn.state = 'yielded'
            t.events.push({ type: 'knight_yields' })
            this.log('knight', 'yielded')
          } else if (!canReach) {
            t.codeNotes.push('The Knight does not listen. Words cannot reach him yet (his helm is whole, or the PC has not seen what she wrote about him).')
          }
        } else this.check('말', D.dc['말'], 0, t)
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
      case '동료':
        t.codeNotes.push('Companions act automatically each turn. Treat this as a [선택] moment.')
        ctx.quiet = true
        break
      case '이동':
        this.doMove(action.arg ?? '', ctx, t)
        break
      default:
        ctx.quiet = true // 선택
    }

    if (r.offer) return t // 보상 선택 대기: 이 턴은 여기서 멈춤
    if (!ctx.moved && r.hp > 0) this.enemiesAct(ctx, t)
    if (ctx.silent && !this.engaged().length) r.hidden = true

    /* ---- after effects ---- */
    if (r.room === '1A' && !this.inParty('garret') && !this.here().length) this.join('garret', t)

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
    // 교전 중에 도망치면 등 뒤 공격
    if (!r.hidden) {
      for (const e of this.engaged()) {
        if (r.hp <= 0) break
        if (this.def(e).mirror || e.stunned > 0) continue
        if (e.type === 'knight' && SAFE_KNIGHT.includes(r.knight.state)) continue
        const mv = this.basicMove(e)
        this.enemyAttack(e, { ...mv, a: (mv.a ?? 0) - 1 }, ctx, t, true)
      }
    }
    r.hidden = false
    ctx.moved = true
    if (r.hp <= 0) return
    t.lines.push({ who: 'sys', text: `이동 → ${D.rooms[target].name}` })
    const huntingKnight = this.here().find(e => e.type === 'knight' && r.knight.state === 'hunting')
    if (up) {
      const tr = r.trial
      const cleared = tr && !tr.failed && (!tr.requires || this.inParty(tr.requires))
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
        t.events.push({ type: 'trial_unclear', reason: tr.failed ? 'clock' : 'requirement' })
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
  takeReward(cardId: string): Turn | null {
    const r = this.r, t = newTurn()
    const card = (r.offer ?? []).find(c => c.id === cardId && !c.disabled)
    if (!card || !r.pendingMove) return null
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
    r.offer = null
    const dest = r.pendingMove
    r.pendingMove = null
    this.enterRoom(dest, t)
    return t
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
      if (intent === 'promise' && this.hasFloorNote(3) && this.hasFloorNote(4)) return 'promise'
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
    }
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

