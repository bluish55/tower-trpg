// 게임 상태 타입. 모든 수치는 data/game-data.json에서 온다.

export type ActionTag =
  | '공격' | '회피' | '방어' | '살핌' | '숨기' | '몸쓰기' | '말'
  | '사용' | '동료' | '이동' | '선택'

export const ACTION_TAGS: ActionTag[] = [
  '공격', '회피', '방어', '살핌', '숨기', '몸쓰기', '말', '사용', '동료', '이동', '선택',
]

export type Intent = 'promise' | 'speak' | 'helm' | 'leave' | 'stay' | 'other'
export const INTENTS: Intent[] = ['promise', 'speak', 'helm', 'leave', 'stay', 'other']

export type Tier = 'crit' | 'success' | 'partial' | 'fail' | 'critfail'
export const TIER_KO: Record<Tier, string> = {
  crit: '대성공', success: '성공', partial: '부분 성공', fail: '실패', critfail: '대실패',
}

export type CompanionId = 'garret' | 'lira' | 'pio'
export type EndingId = 'promise' | 'forced' | 'knight' | 'alone' | 'stay'
export type KnightState = 'unseen' | 'hunting' | 'guarding' | 'yielded' | 'bypassed' | 'defeated'
export type Phase = 'title' | 'outside' | 'mind' | 'reward' | 'run_over' | 'ending'

/* ---------- game data (data/game-data.json) ---------- */
export interface EnemyMove {
  a?: number          // 명중 보정
  dmg?: string        // '1d6+2'
  label?: string
  tell?: string       // 예고 동작 서술
  warn?: string       // 화면에 표시할 경고
  ring?: boolean      // 종지기: 시험 턴 -1
  kill?: boolean      // 기사의 처형
}
export interface Weakness {
  id: string
  label: string
  keys?: string[]
  tags?: ActionTag[]
  effect: 'kill' | 'silence' | 'horn' | 'height' | 'rope' | 'mirror'
}
export interface EnemyDef {
  name: string; hp: number; def: number
  water?: boolean; mirror?: boolean
  cycle?: EnemyMove[]
  weak?: Weakness
}
export interface RoomDef {
  floor: number; name: string; exits: string[]
  spawn?: { type: string; hp?: number }[]
  npc?: CompanionId
  notes?: number
  note_on_enter?: boolean | string
  event?: 'knight_glimpse'
  knight?: boolean
}
export interface TrialDef { title: string; goal: string; limit: number; requires?: CompanionId }
export interface FloorDef { name: string; volume: string; start: string; minion: string | null; trial: TrialDef | null }
export interface CompanionDef { name: string; room: string; dc: number; trust: number; ability: string; sheet: string; desc: string }
export interface RewardCard {
  id: string; kind: string; name: string; desc: string
  cost?: number
  weapon?: { dice: string; atk: number; water?: number }
  disabled?: boolean
}
export interface NoteDef { floor: number; text: string; placeholder?: boolean }
export interface GameData {
  pc: { hp: number; defense: number; mods: Record<string, number>; start_weapon: Weapon }
  dc: Record<string, number>
  floors: Record<string, FloorDef>
  rooms: Record<string, RoomDef>
  enemies: Record<string, EnemyDef>
  companions: Record<CompanionId, CompanionDef>
  rewards: Record<string, RewardCard[]>
  notes: Record<string, NoteDef>
  endings: Record<EndingId, { name: string }>
  loud_threshold: number
  notes_per_floor: number
}

/* ---------- runtime state ---------- */
export interface Weapon { id?: string; name: string; dice: string; atk: number; water?: number }

export interface EnemyInst {
  uid: number; type: string; name: string
  hp: number; max: number; step: number
  state: 'engaged' | 'lost' | 'yielded' | 'bypassed'
  stunned: number; calm: number
  warn: string | null
  silenced?: boolean
}

export interface PartyMember { id: CompanionId; trust: number; uses: number; onCooldown: boolean; injured: boolean }

export interface Trial {
  floor: number; title: string; goal: string
  limit: number; left: number; failed: boolean
  requires: CompanionId | null
}

export interface RunState {
  floor: number; room: string | null
  hp: number; maxHp: number
  weapon: Weapon
  relics: string[]
  powers: Record<string, { name: string; uses: number }>
  flags: { oath: boolean; fang: boolean; breath: boolean; breathUsed: boolean; cloak: boolean; shard: boolean; shardHit: Record<number, boolean> }
  party: PartyMember[]
  recruited: Partial<Record<CompanionId, boolean>>
  enemies: Record<string, EnemyInst[]>
  spawned: Record<string, boolean>
  visited: Record<string, boolean>
  uid: number
  trial: Trial | null
  loud: number; hidden: boolean; pendingSpawn: boolean; pendingPioNote: boolean
  knight: { hp: number; max: number; helm: number; state: KnightState; glimpsed: boolean; read: boolean }
  notes: string[]
  noteCount: Record<number, number>
  known: Record<string, boolean>
  turn: number; floorTurn: number; maxFloor: number
  offer: RewardCard[] | null
  pendingMove: string | null
  intents: Record<string, Intent>
  f4used: { garret: boolean; pio: boolean }
  kills: number; damageTaken: number
  log: { t: number; type: string; detail?: string }[]
}

export interface Archive {
  weak: Record<string, boolean>
  notes: Record<string, boolean>
  endings: Record<string, boolean>
  dives: number
}

export interface Choice {
  n: string
  text: string           // 원문 (태그 포함)
  label: string          // 태그를 뺀 표시용 문구
  tag: ActionTag | null
  arg: string | null
}

export type FeedItem =
  | { type: 'player'; text: string }
  | { type: 'gm'; text: string; notices?: SysNotice[] }
  | { type: 'strip'; lines: TurnLine[] }
  | { type: 'sys'; notice: SysNotice }
  | { type: 'divider'; text: string }

export interface RunSummary {
  dive: number; cause: string; maxFloor: number; turns: number
  kills: number; damage: number; notes: string[]; met: string[]; weapon: string; knight: KnightState
}

export interface Game {
  v: 3
  phase: Phase
  playthrough: number
  dive: number
  run: RunState
  archive: Archive
  history: { role: 'user' | 'assistant'; content: string }[]
  choices: Choice[]
  feed: FeedItem[]
  dives: RunSummary[]
  ending: EndingId | null
}

/* ---------- one turn ---------- */
export interface TurnLine { who: 'pc' | 'enemy' | 'sys'; text: string }
export interface SysNotice { kind: 'trial' | 'clear' | 'fail' | 'reward' | 'join' | 'weak' | 'note' | 'trust' | 'info'; title: string; text: string }
export type GameEvent =
  | { type: 'opening' | 'enter_tower' | 'dive_start' | 'dive_outside' | 'trial_start' | 'trial_clear' | 'trial_fail' | 'knight_glimpse' | 'knight_confront' | 'helm_crack' | 'helm_shatter' | 'knight_defeated' | 'knight_yields' | 'knight_bypassed' | 'floor5' | 'witch' | 'expelled' }
  | { type: 'reward_offer'; cards: RewardCard[] }
  | { type: 'reward_taken'; card: RewardCard }
  | { type: 'trial_unclear'; reason: 'clock' | 'requirement' }
  | { type: 'companion_join' | 'npc_present'; id: CompanionId }
  | { type: 'reinforcement'; name: string }
  | { type: 'ending'; id: EndingId }

export interface Turn {
  action?: { tag: ActionTag; arg: string | null; text: string }
  intent?: Intent
  lines: TurnLine[]
  events: GameEvent[]
  reveals: { id: string; text: string }[]
  sys: SysNotice[]
  codeNotes: string[]
  dmgTaken: number
  floorChanged?: boolean
  ended?: boolean
}

export interface PlayerAction {
  tag: ActionTag
  arg?: string | null
  text: string
  intent?: Intent | null
}
