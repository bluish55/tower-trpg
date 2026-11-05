// 게임 상태 타입. 모든 수치는 data/game-data.json에서 온다.

export type ActionTag =
  | '공격' | '회피' | '방어' | '살핌' | '숨기' | '몸쓰기' | '말'
  | '사용' | '동료' | '이동' | '선택' | '떠남'

export const ACTION_TAGS: ActionTag[] = [
  '공격', '회피', '방어', '살핌', '숨기', '몸쓰기', '말', '사용', '동료', '이동', '선택', '떠남',
]

export type Intent = 'promise' | 'speak' | 'helm' | 'leave' | 'stay' | 'other'
export const INTENTS: Intent[] = ['promise', 'speak', 'helm', 'leave', 'stay', 'other']

// 판정 4단계. 부분 성공은 없다 (동점 처리는 game-data.json rules.tie_success)
export type Tier = 'crit' | 'success' | 'fail' | 'critfail'
export const TIER_KO: Record<Tier, string> = {
  crit: '대성공', success: '성공', fail: '실패', critfail: '대실패',
}

export type CompanionId = 'garret' | 'lira' | 'pio'
export type EndingId = 'promise' | 'promise_together' | 'forced' | 'knight' | 'alone' | 'stay'
export type KnightState = 'unseen' | 'hunting' | 'guarding' | 'yielded' | 'bypassed' | 'defeated'
export const SAFE_KNIGHT: KnightState[] = ['yielded', 'bypassed', 'defeated']
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
  pages?: number      // 쓰러뜨리면 떨어지는 찢긴 책장
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
export interface TrialDef { title: string; goal: string; limit: number; requires?: CompanionId; kind?: 'reach' | 'slay' | 'escort'; target?: string }
export interface FloorDef { name: string; volume: string; start: string; minion: string | null; trial: TrialDef | null }
export interface CompanionDef { name: string; room: string; dc: number; trust: number; def: number; ability: string; sheet: string; desc: string }
export interface RewardCard {
  id: string; kind: string; name: string; desc: string
  cost?: number
  weapon?: { dice: string; atk: number; water?: number }
  disabled?: boolean
}
export interface NoteDef { floor: number; text: string; placeholder?: boolean }
export interface Rules {
  tie_success: boolean          // 합계 = 목표일 때 성공으로 칠지
  opening_bonus: number         // 빈틈·넘어짐: 이번 턴 적 명중 +
  prone_penalty: number         // 넘어짐: 다음 판정 −
  disengage_dc: number          // 이탈 판정 기본 목표 (+ 교전 중인 적 수 − 1)
  pages_per_extra_card: number  // 보상 카드 한 장 더 고르는 데 드는 책장
  companion_target_chance: number // 평타가 진우 대신 동료를 노릴 확률
  joint_bonus: number           // 협공 판정 +
  lira_aid_chance: number[]     // 리라 조언 확률 (신뢰 0–3)
}
export interface GameData {
  pc: { hp: number; defense: number; mods: Record<string, number>; start_weapon: Weapon }
  dc: Record<string, number>
  rules: Rules
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

export interface PartyMember {
  id: CompanionId; trust: number; uses: number; onCooldown: boolean
  injured: boolean   // 부상: 다음 턴 쉰다 (선배 구현)
  down: boolean      // 쓰러짐: 진우가 [동료: 이름]으로 일으켜야 한다
}
/** 쓰러진 채 방에 남겨진 동료. 계단을 오르기 전에 돌아오면 구할 수 있다. */
export interface LeftBehind { id: CompanionId; room: string; floor: number; trust: number }

export interface Trial {
  floor: number; title: string; goal: string
  limit: number; left: number; failed: boolean
  requires: CompanionId | null
  kind: 'reach' | 'slay' | 'escort'
  target: string | null
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
  /* 11-04 피드백 반영 */
  pages: number                          // 찢긴 책장
  prone: boolean                         // 넘어짐: 다음 판정 −
  aid: number                            // 이번 턴 판정 보너스 (리라 조언)
  foresight: boolean                     // 리라 신뢰 3: 적의 다음 행동이 보인다
  slain: Record<string, boolean>         // 쓰러뜨린 적 종류 (처치 시험)
  left: LeftBehind[]                     // 남겨진 동료
  abandoned: CompanionId[]               // 이번 다이브에 버린 동료 (약속 결말 잠김)
  trustCleared: Record<string, boolean>  // "층:동료" — 함께 방 정리 신뢰 +1 (층당 1번)
  pendingRoomNote: Record<string, boolean> // 적이 남아 아직 못 읽은 방의 쪽지
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
  abandoned?: string[]
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
export interface TurnLine { who: 'pc' | 'enemy' | 'ally' | 'sys'; text: string }
export interface SysNotice { kind: 'trial' | 'clear' | 'fail' | 'reward' | 'join' | 'weak' | 'note' | 'trust' | 'info'; title: string; text: string }
export type GameEvent =
  | { type: 'opening' | 'enter_tower' | 'dive_start' | 'dive_outside' | 'trial_start' | 'trial_clear' | 'trial_fail' | 'knight_glimpse' | 'knight_confront' | 'helm_crack' | 'helm_shatter' | 'knight_defeated' | 'knight_yields' | 'knight_bypassed' | 'floor5' | 'witch' | 'expelled' }
  | { type: 'reward_offer'; cards: RewardCard[] }
  | { type: 'reward_taken'; card: RewardCard }
  | { type: 'trial_unclear'; reason: 'clock' | 'requirement' | 'target' }
  | { type: 'companion_join' | 'npc_present' | 'companion_down' | 'companion_raised' | 'companion_found'; id: CompanionId }
  | { type: 'companion_abandoned'; id: CompanionId; how: 'chosen' | 'left' | 'trust' }
  | { type: 'disengage_fail' | 'threshold' | 'note_blocked' }
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
