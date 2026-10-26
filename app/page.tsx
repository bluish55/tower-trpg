'use client'

import { useState, useEffect, useRef } from 'react'
import ChatWindow, { Message } from '@/components/ChatWindow'
import SystemAlert from '@/components/SystemAlert'
import DebugPanel, { type DebugTurn } from '@/components/DebugPanel'
import type { RunState, StateChangeProposal } from '@/types/state'
import type { ResolutionData } from '@/lib/buildResolution'
import type { ParsedChoice } from '@/lib/parseChanges'
import { applyStateChanges } from '@/lib/engine'
import { resolveAction } from '@/lib/resolveAction'
import { parseStateChanges, parseChoices, extractNarration } from '@/lib/parseChanges'

// ── 턴 단계 ───────────────────────────────────────────────────
type Phase =
  | 'idle'           // 선택지 표시, 입력 대기
  | 'rolled'         // 주사위 완료, SystemAlert 표시 중
  | 'calling_gm'     // GM API 호출 중
  | 'awaiting_apply' // GM 응답 완료, 상태 반영 대기

const INITIAL_STATE: RunState = {
  회차: 1,
  현재층: 1,
  현재방: '1A',
  시험_남은_턴: 3,
  소음: 'low',
  기사_투구: null,
  플레이어: {
    HP: 20,
    maxHP: 20,
    소지품: [],
    능력치: { 매력: 1, 지력: 0, 지각: 1, 민첩: 0, 근력: 0 },
    현재_무기: '나무검',
  },
  동료: [],
  현재_적: [],
  열린_문: [],
  발견한_통로: [],
  발견한_요소: [],
  쓰러진_몬스터: [],
  로그: [],
}

const PHASE_LABEL: Record<Phase, string> = {
  idle:           '선택 대기',
  rolled:         '주사위 완료',
  calling_gm:     'GM 서술 중...',
  awaiting_apply: '서술 완료',
}

export default function GamePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [choices, setChoices] = useState<ParsedChoice[]>([])
  const [runState, setRunState] = useState<RunState>(INITIAL_STATE)
  const [phase, setPhase] = useState<Phase>('calling_gm')
  const [turn, setTurn] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // 단계 간 임시 데이터
  const [draftResolution, setDraftResolution] = useState<ResolutionData | null>(null)
  const [draftOutput, setDraftOutput] = useState<string | null>(null)
  const [draftChanges, setDraftChanges] = useState<StateChangeProposal | null>(null)
  const [draftStateSnap, setDraftStateSnap] = useState<RunState | null>(null) // GM 호출 시점 상태

  // SystemAlert
  const [alertVisible, setAlertVisible] = useState(false)

  // 디버그
  const [debugTurn, setDebugTurn] = useState<DebugTurn | null>(null)

  // 최초 1회만 GM 호출 (dive_start)
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    callGM(INITIAL_STATE, null, null, 'dive_start')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 최근 대화 기록 (GM 호출용)
  function getHistory(msgs: Message[]) {
    return msgs.slice(-6).map(m => ({ role: m.role, text: m.text }))
  }

  // ── 1. 플레이어가 선택지 클릭 ──────────────────────────────
  function handleChoiceSelect(choice: ParsedChoice) {
    setError(null)

    // 플레이어 행동을 채팅에 먼저 추가
    const playerMsg: Message = { id: Date.now().toString(), role: 'player', text: choice.text }
    setMessages(prev => [...prev, playerMsg])

    // 이동 태그면 방 ID를 미리 반영
    let nextState = runState
    if (choice.tag === '이동' && choice.target) {
      nextState = { ...runState, 현재방: choice.target }
      setRunState(nextState)
    }

    const resolution = resolveAction(choice.tag, choice.target, nextState)
    setDraftResolution(resolution)
    setDraftStateSnap(nextState)

    // 주사위가 있으면 팝업 표시 후 GM 호출 대기
    if (resolution.diceResult) {
      setAlertVisible(true)
      setPhase('rolled')
    } else {
      callGM(nextState, resolution, choice.text)
    }
  }

  // SystemAlert 닫으면 GM 호출
  function handleAlertClose() {
    setAlertVisible(false)
    if (draftResolution && draftStateSnap) {
      const choiceText = messages[messages.length - 1]?.text ?? draftResolution.playerTag
      callGM(draftStateSnap, draftResolution, choiceText)
    }
  }

  // ── 2. GM API 호출 ────────────────────────────────────────
  async function callGM(
    state: RunState,
    resolution: ResolutionData | null,
    playerInput: string | null,
    event?: 'dive_start' | 'expulsion'
  ) {
    setPhase('calling_gm')
    setError(null)

    // 빈 resolution (dive_start / 판정 없는 첫 턴)
    const safeResolution: ResolutionData = resolution ?? {
      playerTag: '[선택]',
      diceResult: null,
      tier: '성공',
      enemies: [],
    }

    try {
      const res = await fetch('/api/gm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          resolution: safeResolution,
          recentHistory: getHistory(messages),
          playerInput: playerInput ?? (event === 'dive_start' ? '[다이브 시작]' : '[진행]'),
          event: event ?? null,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '알 수 없는 오류')

      const parsedChanges = parseStateChanges(data.output)
      const parsedChoices = parseChoices(data.output)

      setDraftOutput(data.output)
      setDraftChanges(parsedChanges)
      setDraftStateSnap(state)
      setDebugTurn({
        turn: turn + 1,
        judgment: null,
        diceResult: resolution?.diceResult ?? null,
        rawNarration: data.output,
        parsedChanges,
        usage: data.usage,
      })

      // 선택지가 있으면 awaiting_apply, 없으면 (결말 등) 바로 출력
      if (parsedChoices.length > 0) {
        setPhase('awaiting_apply')
      } else {
        applyAndDisplay(data.output, parsedChanges, parsedChoices, state)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  // ── 3. 상태 반영 + 채팅 출력 ──────────────────────────────
  function handleApply() {
    if (!draftOutput || !draftStateSnap) return
    const parsedChoices = parseChoices(draftOutput)
    applyAndDisplay(draftOutput, draftChanges, parsedChoices, draftStateSnap)
  }

  function applyAndDisplay(
    output: string,
    changes: StateChangeProposal | null,
    newChoices: ParsedChoice[],
    baseState: RunState
  ) {
    const nextTurn = turn + 1

    // 상태 반영
    const nextState = changes
      ? applyStateChanges(baseState, changes, nextTurn)
      : baseState
    setRunState(nextState)

    // HP 피해 (적 행동 결과에서)
    const totalDamage = (draftResolution?.enemies ?? [])
      .filter(e => e.hit)
      .reduce((sum, e) => sum + e.damage, 0)
    const stateAfterDamage = totalDamage > 0
      ? applyStateChanges(nextState, { HP_변화: -totalDamage }, nextTurn)
      : nextState
    setRunState(stateAfterDamage)

    // 서술 출력 (태그 제거)
    const narration = extractNarration(output)
    const gmMsg: Message = { id: Date.now().toString(), role: 'gm', text: narration }
    setMessages(prev => [...prev, gmMsg])

    // 선택지 업데이트
    setChoices(newChoices)
    setTurn(nextTurn)
    setDraftOutput(null)
    setDraftChanges(null)
    setDraftResolution(null)
    setDraftStateSnap(null)
    setPhase('idle')
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-2xl mx-auto">
      {/* 상단 상태바 */}
      <div className="border-b border-zinc-800 px-4 py-2 flex gap-4 text-xs text-zinc-500 font-mono">
        <span>HP <span className="text-zinc-300">{runState.플레이어.HP}/{runState.플레이어.maxHP}</span></span>
        <span>|</span>
        <span>{runState.현재층}층 {runState.현재방}</span>
        <span>|</span>
        <span>Turn {turn}</span>
        {runState.시험_남은_턴 !== null && (
          <>
            <span>|</span>
            <span className={runState.시험_남은_턴 <= 2 ? 'text-red-400' : ''}>
              시험 {runState.시험_남은_턴}턴
            </span>
          </>
        )}
      </div>

      <ChatWindow messages={messages} />

      {/* 단계 흐름 컨트롤 */}
      <div className="border-t border-zinc-800 px-4 py-3 space-y-3">
        {/* 에러 */}
        {error && (
          <div className="text-red-400 text-xs font-mono">{error}</div>
        )}

        {/* 단계 표시 */}
        {phase !== 'idle' && (
          <div className="text-xs font-mono text-zinc-500 animate-pulse">
            {PHASE_LABEL[phase]}
          </div>
        )}

        {/* 상태 반영 버튼 */}
        {phase === 'awaiting_apply' && (
          <button
            onClick={handleApply}
            className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-mono rounded border border-zinc-600"
          >
            상태 반영 + 출력 →
          </button>
        )}

        {/* 선택지 버튼 */}
        {phase === 'idle' && choices.length > 0 && (
          <div className="space-y-1.5">
            {choices.map(choice => (
              <button
                key={choice.number}
                onClick={() => handleChoiceSelect(choice)}
                className="w-full text-left px-3 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 rounded text-sm transition-colors group"
              >
                <span className="text-zinc-600 font-mono mr-2 text-xs">{choice.number}</span>
                <span className="text-zinc-200">{choice.text}</span>
              </button>
            ))}
          </div>
        )}

        {/* 선택지 없을 때 (GM 로딩 전) */}
        {phase === 'idle' && choices.length === 0 && (
          <div className="text-zinc-700 text-xs font-mono">선택지 없음</div>
        )}
      </div>

      <SystemAlert
        tag={draftResolution?.playerTag ?? null}
        diceResult={draftResolution?.diceResult ?? null}
        visible={alertVisible}
        onClose={handleAlertClose}
      />

      <DebugPanel latest={debugTurn} state={runState} />
    </div>
  )
}
