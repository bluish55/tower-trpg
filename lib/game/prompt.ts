/* =========================================================
   AI에게 보낼 턴 메시지와 조건부 페이지 목록을 만든다.
   - turnMessage(): <state> <pc_knowledge> <resolution> <reveal> <event> <player_input>
   - dynamicPages(): 이번 턴에 불러올 페이지 id (서버가 data/pages/ 에서 읽음)
   Game Mechanics 페이지가 약속한 정보와 1:1로 맞춘다.
   ========================================================= */
import { D, Engine } from './engine'
import type { GameEvent, Turn } from './types'

const SAFE_KNIGHT = ['yielded', 'bypassed', 'defeated']

export function stateBlock(eng: Engine): string {
  const g = eng.g, r = eng.r, L: string[] = []
  L.push(`dive: ${g.dive} (playthrough ${g.playthrough})`)
  if (!r.floor || !r.room) {
    L.push('location: outside the mind — 한빛대학교병원 임상연구동, the dive room')
    return `<state>\n${L.join('\n')}\n</state>`
  }
  const f = D.floors[String(r.floor)], rm = eng.room()
  L.push(`floor: ${r.floor} (${f.name}, book ${f.volume}) | room: ${r.room} ${rm.name}`)
  const exits = rm.exits.map(x => {
    let lock = ''
    if (D.rooms[x].floor > r.floor) {
      lock = r.floor === 4 && !SAFE_KNIGHT.includes(r.knight.state) ? ' [blocked by the Knight]' : ' [up]'
    }
    return `${x} ${D.rooms[x].name}${lock}`
  })
  L.push(`exits: ${exits.length ? exits.join(', ') : 'none'}`)
  if (r.trial) {
    const req = r.trial.requires && !eng.inParty(r.trial.requires) ? ` | needs ${D.companions[r.trial.requires].name} in the party` : ''
    const clock = r.trial.limit ? `turns left: ${r.trial.left}/${r.trial.limit}` : 'no time limit'
    L.push(`trial: ${r.trial.title} | goal: ${r.trial.goal} | ${clock}${r.trial.failed ? ' | FAILED' : ''}${req}`)
  }
  L.push(`hp: ${Math.max(0, r.hp)}/${r.maxHp}${r.hp <= 6 ? ' (badly hurt)' : ''}`)
  const powers = Object.values(r.powers).map(p => `${p.name} (${p.uses} uses)`).join(', ') || 'none'
  L.push(`weapon: ${r.weapon.name} | relics: ${r.relics.join(', ') || 'none'} | powers: ${powers}`)
  const party = r.party.map(p => {
    const c = D.companions[p.id]
    return `${c.name} [${p.id}] (trust ${p.trust}/3, ${c.ability} ${p.ready ? 'READY' : 'used this floor'})`
  })
  L.push(`party: ${party.length ? party.join('; ') : 'alone'}`)
  if (rm.npc && !eng.inParty(rm.npc)) L.push(`here, not in party: ${D.companions[rm.npc].name} [${rm.npc}] — can be recruited with [말]`)
  const es = eng.here()
  if (es.length) {
    L.push('enemies here:')
    for (const e of es) {
      const w = eng.def(e).weak
      const known = w && r.known[w.id] ? ` | weakness (player knows): ${w.label}` : ''
      const kst = e.type === 'knight' ? ` | knight status: ${r.knight.state}, helm stage ${r.knight.helm}` : ''
      const eng_ = e.state === 'engaged' ? '(engaged)' : `(not engaged: ${e.state})`
      L.push(`- ${eng.displayName(e)} ${e.hp}/${e.max} ${eng_} — ${eng.nextMoveText(e)}${known}${kst}`)
    }
  } else L.push('enemies here: none')
  if (r.floor === 5) {
    L.push(`the Knight: ${r.knight.state === 'defeated' ? 'defeated on floor 4 — not here' : 'here, standing between the PC and the witch; he will not fight in her presence'}`)
  }
  L.push(`noise: ${r.loud}/${D.loud_threshold}`)
  return `<state>\n${L.join('\n')}\n</state>`
}

export function knowledgeBlock(eng: Engine): string {
  const r = eng.r, L: string[] = []
  L.push('- The book 「꼭대기까지 데려다줄게」: he read volumes 1–2 with his sister as a kid. He never read volume 3 or later.')
  if (r.notes.length) {
    L.push('- Notes in her handwriting he has read in this dive:')
    r.notes.forEach(n => L.push(`  · ${D.notes[n].text}`))
  }
  if (r.knight.helm >= 2) L.push("- He has seen the Knight's face. It is his own.")
  else if (r.knight.helm === 1) L.push("- He has seen part of the Knight's face under the cracked helm: his own jaw, his own mouth.")
  return `<pc_knowledge>\n${L.join('\n')}\n</pc_knowledge>`
}

const COMPANION_INTRO: Record<string, string> = {
  garret: 'In this room, 가렛 (the old guard) is fighting hollow armor alone. Introduce him mid-fight. He sees the PC\'s face and mistakes him for his knight.',
  lira: 'In this tent sits 리라 the healer, whose healing no longer works. Introduce her mid-something. She reads the PC\'s face as an impostor\'s.',
  pio: 'In the thieves\' den is 피오, the thief boy. He knows exactly who the PC is and hates him. Introduce him already hostile.',
}

function eventText(e: GameEvent, dive: number): string {
  switch (e.type) {
    case 'opening': return 'Dive 1. The PC is outside the mind, in the dive room. Play the first-dive opening from the Run Frame page. Do not enter the tower yet. End with choices about how he goes in (all [선택]).'
    case 'enter_tower': return 'He lies down; the dive begins. Narrate the fall into her mind and his arrival at the foot of the tower (Floor 1, room 1A), in the book\'s opening — and that he is holding a wooden practice sword he does not remember picking up.'
    case 'dive_outside': return `Dive ${dive}. He is back in the dive room — he remembers nothing from inside. The player\'s action is in <player_input>. Narrate 3–5 sentences: the chair, the room, how that action lands in his body right now. Do not enter the tower. End with 2–3 choices about lying down again (all [선택]).`
    case 'dive_start': return `He lies down again. Narrate the fall and arrival at room 1A in 2–3 sentences. Pick up directly from the moment he closes his eyes — no chair scene.`
    case 'trial_start': return 'A new floor begins. The website already shows the trial window. Open the floor from the PC\'s body and make the threat present within this response.'
    case 'trial_clear': return 'The trial is cleared as he reaches the stairs.'
    case 'reward_offer': return `The tower offers three rewards (the website shows them as cards): ${e.cards.map(c => `${c.name} (${c.kind}: ${c.desc}${c.cost ? `, costs ${c.cost} HP` : ''})`).join(' / ')}. Narrate the offering in 2–3 sentences. Write NO numbered choices.`
    case 'reward_taken': return `He takes: ${e.card.name} — ${e.card.desc}${e.card.cost ? `. It costs ${e.card.cost} HP immediately: show the price in his body` : ''}. Then he climbs to the next floor.`
    case 'trial_unclear': return e.reason === 'clock' ? 'He climbs after failing the trial. No reward.' : 'He climbs without completing the trial (the boy is not with him). No reward. The tower does not acknowledge him.'
    case 'trial_fail': return 'The trial clock has run out. The grey Knight descends into this room — visor down, unhurried. On this floor no weapon can hurt him. Make this the worst moment so far. Choices must include fleeing.'
    case 'knight_glimpse': return 'At the top of the stairs, through the fog: a grey knight, visor down, standing perfectly still, watching. Then he is gone. He says nothing. Do not describe his face.'
    case 'knight_confront': return 'The grey Knight stands on the last stair, visor down, sword drawn. This is the fight. He speaks in flat, final sentences.'
    case 'helm_crack': return 'The Knight\'s helm cracks. Part of his face shows through: a jaw, a mouth — the PC\'s own. Show the PC\'s body reacting before his mind accepts it. Do not show the whole face yet.'
    case 'helm_shatter': return 'The helm shatters. The whole face: Jin-woo\'s own face, unmistakably. Give it a full beat.'
    case 'knight_defeated': return 'The Knight falls. He does not die like an enemy; his armor empties like the hollow soldiers on Floor 1, and the helm rolls to the PC\'s feet. The stair to the top is open.'
    case 'knight_yields': return 'The Knight lowers his sword. He does not forgive; he steps aside, and follows the PC up the stair at a distance. The way is open.'
    case 'knight_bypassed': return 'Garret holds the Knight with his shield while Pio pulls the PC through a gap — past him, onto the stair. The Knight turns and follows, slowly. The way is open.'
    case 'companion_join': return `${D.companions[e.id].name} joins the PC.`
    case 'npc_present': return COMPANION_INTRO[e.id]
    case 'reinforcement': return `Noise drew more: a ${e.name} arrives in the room now.`
    case 'floor5': return 'The unwritten top. White. Sentences hanging half-finished in the air. No enemies, no clock. Quiet, but heavy.'
    case 'witch': return 'The real house, the first place in the tower that is not the book. The witch — Ha-eun at about ten, in the witch\'s hat — sits on the floor with volume 4 open on her lap. Mom is here. If the Knight is not defeated, he stands between the PC and them. Follow the Floor 5 page. Remember to send <intents>.'
    case 'expelled': return 'HP has reached 0. Follow the expulsion section of the Run Frame page: the tower throws him out, he wakes in the chair remembering nothing from inside. End with 2–3 choices about the moment before the next dive (all [선택]).'
    case 'ending': return `ENDING "${e.id}". Play it exactly as the Endings page describes, in three beats. Then stop. No choices.`
  }
}

export function turnMessage(eng: Engine, t: Turn, playerText: string): string {
  const parts = [stateBlock(eng), knowledgeBlock(eng)]
  if (t.lines.length || t.action) {
    const head = t.action ? `PC action: [${t.action.tag}${t.action.arg ? ': ' + t.action.arg : ''}] ${t.action.text}\n` : ''
    parts.push(`<resolution>\n${head}${t.lines.map(l => l.text).join('\n')}\n</resolution>`)
  }
  if (t.codeNotes.length) parts.push(`<code_notes>\n${t.codeNotes.join('\n')}\n</code_notes>`)
  for (const x of t.reveals) {
    parts.push(`<reveal id="${x.id}">\nA note in Ha-eun's handwriting appears in the scene (on a wall, a page, glass): "${x.text}"\nShow where it is written and the PC reading it.\n</reveal>`)
  }
  for (const e of t.events) parts.push(`<event type="${e.type}">\n${eventText(e, eng.g.dive)}\n</event>`)
  parts.push(`<player_input>\n${playerText}\n</player_input>`)
  return parts.join('\n\n')
}

/** 대화 기록에 남길 짧은 버전 (상태 블록 없이) */
export function historyText(t: Turn, playerText: string): string {
  const b: string[] = []
  if (t.lines.length) b.push('<resolution>' + t.lines.map(l => l.text).join(' ') + '</resolution>')
  for (const x of t.reveals) b.push(`<reveal>${x.text}</reveal>`)
  if (t.events.length) b.push(t.events.map(e => `<event type="${e.type}"/>`).join(''))
  b.push(`<player_input>${playerText}</player_input>`)
  return b.join('\n')
}

/** 이번 턴에 불러올 조건부 페이지 (data/pages/ 기준 경로, 확장자 없음) */
export function dynamicPages(eng: Engine, t: Turn): string[] {
  const r = eng.r, pages: string[] = []
  const ev = t.events.map(e => e.type)
  if (!r.floor || ev.some(x => ['opening', 'enter_tower', 'dive_start', 'dive_outside', 'expelled'].includes(x))) pages.push('npcs/run-frame')
  if (r.floor) pages.push(`floors/floor-${r.floor}`)
  r.party.forEach(p => pages.push(D.companions[p.id].sheet))
  const rm = r.room ? D.rooms[r.room] : null
  if (rm?.npc && !eng.inParty(rm.npc)) pages.push(D.companions[rm.npc].sheet)
  const knightNear = eng.here().some(e => e.type === 'knight') || ev.includes('knight_glimpse') || ev.includes('trial_fail') ||
    r.floor === 4 || (r.floor === 5 && r.knight.state !== 'defeated')
  // 반전 보호: 투구에 금이 가기 전에는 정체 페이지를 절대 보내지 않는다
  if (knightNear) pages.push(r.knight.helm >= 1 ? 'npcs/knight-revealed' : 'npcs/knight-masked')
  if (r.floor === 5) pages.push('npcs/witch-mom', 'npcs/endings')
  return [...new Set(pages)]
}

/** 자유 입력 → 태그 분류용 시스템 프롬프트 */
export function classifierPrompt(eng: Engine): string {
  const r = eng.r
  const rm = r.room ? D.rooms[r.room] : null
  const exits = rm ? rm.exits.map(x => `${x} ${D.rooms[x].name}`).join(', ') : 'none'
  const ready = r.party.filter(p => p.ready).map(p => D.companions[p.id].name).join(', ') || 'none'
  const powers = Object.values(r.powers).filter(p => p.uses > 0).map(p => p.name).join(', ') || 'none'
  const enemies = eng.here().map(e => e.name).join(', ') || 'none'
  const top = r.floor === 5
  return `Classify a player's action in a Korean dungeon game. Reply with JSON only, no prose: {"tag":"...","arg":"...","intent":"..."}
tag is exactly one of: 공격 (attack), 회피 (dodge), 방어 (brace/block), 살핌 (look closely, study, search), 숨기 (hide, sneak, stay silent), 몸쓰기 (climb, run, jump, force), 말 (talk, persuade, provoke), 사용 (use a power; arg = power name), 동료 (ask a companion to use their ability; arg = companion name), 이동 (go to an exit; arg = exit id like 2B), 선택 (anything else; no risk).
Exits: ${exits}. Companions ready: ${ready}. Powers: ${powers}. Enemies: ${enemies}.
${top ? "Also set intent: promise (he keeps the promise — takes her the last step / says 꼭대기까지 데려다줄게), speak (talks to her), helm (puts on the knight's helm / takes the knight's place), leave (turns back, leaves), stay (stays with mom), other." : 'Set intent to "other".'}`
}
