import React, { useState, useEffect, useReducer, useCallback, useRef } from 'react';
import type { GameConfig, Side } from './engine/types';
import { createInitialState } from './engine/setup';
import { gameReducer } from './engine/reducer';
import { Board } from './ui/Board';
import { Hand } from './ui/Hand';
import { JumpBall } from './ui/JumpBall';
import { TurnTimer } from './ui/TurnTimer';
import { ResultsRadar } from './ui/ResultsRadar';
import { ConfigTuner } from './ui/ConfigTuner';
import { MCTSVisualizer } from './ui/MCTSVisualizer';
import { OpponentTacticalFeed } from './ui/OpponentTacticalFeed';
import { TutorialOverlay, TUTORIAL_STEPS } from './ui/TutorialOverlay';
import { soundEngine } from './ui/TacticalAudio';
import {
  Trophy,
  Volume2,
  VolumeX,
  Sliders,
  RotateCcw,
  ArrowRight,
  HelpCircle,
  Bot,
  AlertTriangle,
  Play,
  CheckCircle2,
  Compass,
  AlertOctagon,
  ShieldAlert,
  GraduationCap,
} from 'lucide-react';

export const App: React.FC = () => {
  const [initialSeed, setInitialSeed] = useState<number>(4242);
  const [seedInput, setSeedInput] = useState<string>('4242');
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState<boolean>(false);
  const [tutorialStepIndex, setTutorialStepIndex] = useState<number>(0);
  const [showTutorialConfirm, setShowTutorialConfirm] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAutoPlayAI, setIsAutoPlayAI] = useState<boolean>(false);
  const [recentFoulNotice, setRecentFoulNotice] = useState<string | null>(null);
  const [targetingCard, setTargetingCard] = useState<any | null>(null);
  const [captainAttemptPopup, setCaptainAttemptPopup] = useState<{
    side: 'PLAYER' | 'AI';
    targetCaptainId: string;
    throwerId: string;
    outcome: 'GOAL' | 'INTERCEPTED' | 'INCOMPLETE';
    interceptedById?: string;
    playerScore: number;
    aiScore: number;
  } | null>(null);

  const [state, dispatch] = useReducer(
    gameReducer,
    createInitialState(initialSeed, {
      ai: {
        aiEngineMode: 'EPSILON_GREEDY_NN',
        playerEngineMode: 'EPSILON_GREEDY_NN',
        defaultEngineMode: 'EPSILON_GREEDY_NN',
        epsilonExploitRate: 0.75,
      },
    })
  );
  const prevEventCountRef = useRef<number>(state.eventLog.length);
  const boardContainerRef = useRef<HTMLDivElement>(null);

  const stagedCardIds = new Set((state.plannedCards || []).map(pc => pc.cardId));
  const effectivePlayerHandCount = state.hands.PLAYER.filter(c => !stagedCardIds.has(c.id)).length;
  const isPlayerOverHandLimit = effectivePlayerHandCount > state.config.momentum.handLimit;

  // Prime & unlock AudioContext on user interaction across the browser session
  useEffect(() => {
    const handleUserGesture = () => {
      soundEngine.init();
    };
    window.addEventListener('pointerdown', handleUserGesture);
    window.addEventListener('keydown', handleUserGesture);
    return () => {
      window.removeEventListener('pointerdown', handleUserGesture);
      window.removeEventListener('keydown', handleUserGesture);
    };
  }, []);

  const toggleAudio = () => {
    const muted = soundEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleJumpBallComplete = (wonBy: Side, marginMs: number) => {
    dispatch({
      type: 'JUMP_BALL_RELEASE',
      releaseMarginMs: marginMs,
      wonBy,
    });
    // Smoothly scroll directly onto the Board UI interface upon match start
    setTimeout(() => {
      if (boardContainerRef.current && typeof boardContainerRef.current.scrollIntoView === 'function') {
        boardContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const handleStartPlayerTurn = () => {
    soundEngine.playWhistle();
    dispatch({ type: 'START_PLAYER_TURN' });
    // Smoothly scroll onto the Board UI interface instead of scrolling to the bottom
    setTimeout(() => {
      if (boardContainerRef.current && typeof boardContainerRef.current.scrollIntoView === 'function') {
        boardContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  // Watch for new game events in the log to trigger audio & visual foul/interception notifications
  useEffect(() => {
    if (state.eventLog.length > prevEventCountRef.current) {
      const newEvents = state.eventLog.slice(prevEventCountRef.current);
      prevEventCountRef.current = state.eventLog.length;

      for (const ev of newEvents) {
        if (ev.type === 'HOLDING_FOUL_TURNOVER') {
          // Play the authentic referee double-blast whistle!
          soundEngine.playFoulWhistle();
          setRecentFoulNotice(
            `⚠️ REFEREE WHISTLE: Holding foul on ${ev.details.foulPieceId || 'Carrier'}. Turnover to Opponent!`
          );
          setTimeout(() => setRecentFoulNotice(null), 5000);
        } else if (ev.type === 'PASS_INTERCEPTED') {
          soundEngine.playIntercepted();
          const defender = ev.details.interceptedByPieceId ? ev.details.interceptedByPieceId.replace('ai_', 'A').replace('p_', 'P') : 'Defender';
          const cell = ev.details.interceptedAtCell ? ` at (${ev.details.interceptedAtCell.col}, ${ev.details.interceptedAtCell.row})` : '';
          setRecentFoulNotice(`🛡️ INTERCEPTION! Pass snatched by ${defender}${cell}! Defender lunges to ball and takes possession.`);
          setTimeout(() => setRecentFoulNotice(null), 4500);
        }
      }

      // Check if any throw attempt was made targeting either Captain, or if a goal was scored
      const captainAttempt = newEvents.find(
        e =>
          e.type === 'PASS_ATTEMPTED' &&
          (e.details?.targetPieceId === 'p_captain' || e.details?.targetPieceId === 'ai_captain')
      );
      const goalEvent = newEvents.find(e => e.type === 'SCORE_GOAL');
      const interceptEvent = newEvents.find(e => e.type === 'PASS_INTERCEPTED');

      if (captainAttempt || goalEvent) {
        const side = (goalEvent?.side || captainAttempt?.side || 'PLAYER') as 'PLAYER' | 'AI';
        const targetCaptainId =
          captainAttempt?.details?.targetPieceId || (side === 'PLAYER' ? 'p_captain' : 'ai_captain');
        const throwerId = captainAttempt?.details?.throwerId || 'Carrier';
        let outcome: 'GOAL' | 'INTERCEPTED' | 'INCOMPLETE' = 'INCOMPLETE';
        let interceptedById: string | undefined = undefined;

        if (goalEvent) {
          outcome = 'GOAL';
          soundEngine.playGoal();
        } else if (interceptEvent) {
          outcome = 'INTERCEPTED';
          interceptedById = interceptEvent.details?.interceptedByPieceId;
        } else {
          outcome = 'INCOMPLETE';
        }

        setCaptainAttemptPopup({
          side,
          targetCaptainId,
          throwerId,
          outcome,
          interceptedById,
          playerScore: goalEvent?.details?.playerScore ?? state.score.PLAYER,
          aiScore: goalEvent?.details?.aiScore ?? state.score.AI,
        });
      }
    }
  }, [state.eventLog]);

  // AI Turn auto-execution
  useEffect(() => {
    if (state.phase === 'AI_TURN' && !state.matchResult.isOver) {
      const timer = setTimeout(() => {
        dispatch({ type: 'RUN_AI_TURN' });
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state.phase, state.matchResult.isOver]);

  // Auto-play AI vs AI demo loop when enabled
  useEffect(() => {
    if (isAutoPlayAI && !state.matchResult.isOver) {
      if (state.phase === 'AI_PLANNED_REVIEW') {
        const timer = setTimeout(() => {
          dispatch({ type: 'START_PLAYER_TURN' });
        }, 1000);
        return () => clearTimeout(timer);
      } else if (state.phase === 'PLAYER_PLAN') {
        const timer = setTimeout(() => {
          const carrier = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
          if (carrier) {
            dispatch({ type: 'THROW_BALL', targetCell: { col: 5, row: 10 } });
          }
          dispatch({ type: 'END_PLAYER_TURN' });
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
    return undefined;
  }, [isAutoPlayAI, state.phase, state.pieces, state.matchResult.isOver]);

  const handleRestartMatch = useCallback(() => {
    const s = parseInt(seedInput, 10) || Math.floor(Math.random() * 90000) + 10000;
    setInitialSeed(s);
    setSeedInput(s.toString());
    setRecentFoulNotice(null);
    dispatch({ type: 'INIT_MATCH', seed: s, configOverrides: state.config });
  }, [seedInput, state.config]);

  const handleApplyConfig = (newConfig: GameConfig) => {
    dispatch({ type: 'INIT_MATCH', seed: state.seed, configOverrides: newConfig });
  };

  const ballHolder = state.pieces.find(p => p.hasBall);

  // Only prompt "end current match?" if the user has actually made progress
  // worth losing. During JUMP_BALL, during MATCH_OVER, and on a pristine
  // turn-1 opening with nothing staged, we silently reset — no dialog needed.
  const isGameInProgress =
    state.phase !== 'JUMP_BALL' &&
    state.phase !== 'MATCH_OVER' &&
    !state.matchResult.isOver &&
    (state.turn > 1 ||
      state.score.PLAYER > 0 ||
      state.score.AI > 0 ||
      (state.plannedMoves && state.plannedMoves.length > 0) ||
      !!state.plannedThrow ||
      (state.plannedCards && state.plannedCards.length > 0));

  // Enter the tutorial's dedicated sandbox environment: fresh deterministic
  // seed AND auto-resolve the opening jump-ball so the picker modal never
  // appears on top of the board the tutorial wants to highlight. The ball is
  // placed on p_1 (PLAYER) so the ball-carrier steps light up the correct
  // piece from the very first frame.
  const enterTutorialEnvironment = useCallback(() => {
    setShowTutorialConfirm(false);
    const TUTORIAL_SEED = 424242;
    setInitialSeed(TUTORIAL_SEED);
    setSeedInput(TUTORIAL_SEED.toString());
    setRecentFoulNotice(null);
    setCaptainAttemptPopup(null);
    setTargetingCard(null);
    setIsAutoPlayAI(false);
    dispatch({ type: 'INIT_MATCH', seed: TUTORIAL_SEED, configOverrides: state.config });
    // Immediately resolve the jump-ball in the PLAYER's favour so we skip the
    // full-screen JumpBall picker modal and land straight in PLAYER_PLAN.
    dispatch({ type: 'JUMP_BALL_RELEASE', releaseMarginMs: 0, wonBy: 'PLAYER' });
    setTutorialStepIndex(0);
    setIsTutorialOpen(true);
    soundEngine.playBlip(540, 0.05);
  }, [state.config]);

  const requestTutorial = useCallback(() => {
    if (isGameInProgress) {
      setShowTutorialConfirm(true);
    } else {
      enterTutorialEnvironment();
    }
  }, [isGameInProgress, enterTutorialEnvironment]);

  return (
    <div className="min-h-screen parchment-bg text-[#2c1810] flex flex-col items-center justify-between p-2 sm:p-4 selection:bg-amber-600 selection:text-white font-serif">
      {/* Top Navigation Bar - Aged Maritime Timber Header */}
      <header className="w-full max-w-[min(96rem,98vw)] parchment-card rounded-2xl px-4 py-3 shadow-2xl flex flex-wrap items-center justify-between gap-3 mb-3 border-2 border-[#8b5a2b]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl wax-seal-gold flex items-center justify-center shadow-md">
            <Trophy className="w-5 h-5 text-amber-950 drop-shadow" />
          </div>
          <div>
            <h1 className="font-black text-lg sm:text-xl tracking-tight text-amber-950 flex items-center gap-2">
              <span>THE CAPTAIN&apos;S COMBINE</span>
              <span className="text-[10px] font-black bg-amber-200 border border-amber-800 text-amber-950 px-2 py-0.5 rounded-full">
                v3.1 MCTS TABLETOP
              </span>
            </h1>
            <p className="text-xs text-amber-900 font-bold hidden sm:block">
              Solo Tactical Beach Tabletop Aptitude Assessment for Captain&apos;s Ball
            </p>
          </div>
        </div>

        {/* Live Scoreboard styled as Maritime Ship Score Slate */}
        <div className="flex items-center gap-3 bg-amber-100/90 border-2 border-amber-800/80 rounded-2xl px-4 py-1.5 shadow-inner">
          <div data-testid="header-score-player" className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600 animate-pulse border border-blue-900" />
            <span className="text-xs font-black text-blue-950">PLAYER</span>
            <span className="text-xl font-black text-blue-950 font-mono">{state.score.PLAYER}</span>
          </div>

          <span className="text-amber-800 font-black text-sm">:</span>

          <div data-testid="header-score-ai" className="flex items-center gap-2">
            <span className="text-xl font-black text-red-950 font-mono">{state.score.AI}</span>
            <span className="text-xs font-black text-red-950">AI PIRATES</span>
            <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse border border-red-900" />
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2">
          {/* Tutorial Academy Button */}
          <button
            data-testid="btn-tutorial"
            onClick={requestTutorial}
            title="Open Interactive Tutorial Academy"
            className="p-2 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 border-2 border-amber-800 flex items-center gap-1 text-xs font-black shadow-md ring-1 ring-amber-400 cursor-pointer"
          >
            <GraduationCap className="w-4 h-4 text-amber-950 animate-pulse" />
            <span className="hidden sm:inline">Tutorial</span>
          </button>

          {/* Seed Input for 100% Determinism */}
          <div className="flex items-center bg-amber-100 border-2 border-amber-800/70 rounded-xl px-2.5 py-1 gap-1.5 shadow-sm">
            <span className="text-[10px] font-black text-amber-900">SEED #</span>
            <input
              type="text"
              value={seedInput}
              onChange={e => setSeedInput(e.target.value)}
              className="w-16 bg-transparent text-xs font-mono text-amber-950 font-black outline-none"
            />
            <button
              data-testid="btn-restart-match"
              onClick={handleRestartMatch}
              title="Reset match with this seed"
              className="p-1 text-amber-900 hover:text-amber-950 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* AI Auto Demo Mode */}
          <button
            data-testid="btn-auto-demo"
            onClick={() => setIsAutoPlayAI(!isAutoPlayAI)}
            title={isAutoPlayAI ? 'Pause Auto Demo' : 'Start Auto AI vs AI Demo'}
            className={`p-2 rounded-xl border-2 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
              isAutoPlayAI
                ? 'bg-amber-400 border-amber-900 text-amber-950 shadow-md ring-2 ring-amber-500'
                : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-800/70'
            }`}
          >
            <Bot className="w-4 h-4 text-amber-900" />
            <span className="hidden sm:inline">{isAutoPlayAI ? 'Demo Active' : 'Auto Demo'}</span>
          </button>

          <button
            onClick={toggleAudio}
            title={isMuted ? 'Unmute Sound' : 'Mute Sound'}
            className="p-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-amber-800/70 shadow-sm cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-700" /> : <Volume2 className="w-4 h-4 text-amber-900" />}
          </button>

          <button
            data-testid="btn-config"
            onClick={() => setIsConfigOpen(true)}
            title="Open Config Tuner (§14)"
            className="p-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-amber-800/70 flex items-center gap-1 text-xs font-bold shadow-sm cursor-pointer"
          >
            <Sliders className="w-4 h-4 text-amber-900" />
            <span className="hidden sm:inline">Config</span>
          </button>

          <button
            data-testid="btn-help"
            onClick={() => setIsHelpOpen(true)}
            title="Combine Primer & Rulebook"
            className="p-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border-2 border-amber-800/70 shadow-sm cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-blue-900" />
          </button>
        </div>
      </header>

      {/* Referee Foul Alert Notification Banner */}
      {recentFoulNotice && (
        <div className="w-full max-w-[min(96rem,98vw)] mb-3 p-3 rounded-2xl bg-rose-200 border-4 border-rose-700 shadow-2xl text-rose-950 text-xs font-serif font-black flex items-center justify-between gap-3 animate-bounce">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 text-rose-700 animate-spin" />
            <span className="text-sm">{recentFoulNotice}</span>
          </div>
          <button
            onClick={() => setRecentFoulNotice(null)}
            className="p-1 rounded-lg bg-rose-300 hover:bg-rose-400 text-rose-950 font-sans text-xs px-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Tactical Arena Content */}
      <main className="w-full max-w-[min(96rem,98vw)] grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 items-start">
        {/* Board (Cols 1 to 8) */}
        <div ref={boardContainerRef} className="lg:col-span-8 flex flex-col items-center gap-3">
          {/* Goal Concession & Restart Thrower Selection Toolbar */}
          {state.phase === 'PLAYER_PLAN' && ballHolder && ballHolder.side === 'PLAYER' && (ballHolder.cell.row >= 9) && (
            <div data-testid="restart-thrower-toolbar" className="parchment-card rounded-2xl p-3.5 shadow-md flex flex-wrap items-center justify-between gap-2 border-2 border-amber-700/70 animate-fadeIn">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-blue-800 animate-pulse" />
                <span className="text-xs font-serif font-black text-amber-950">
                  BASELINE RESTART THROWER:
                </span>
                <span className="text-[11px] font-serif text-amber-900">
                  Ball with <strong>{ballHolder.isCaptain ? 'Captain (5,10)' : `${ballHolder.id.replace('p_', 'P')} at (${ballHolder.cell.col},${ballHolder.cell.row})`}</strong>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-serif text-amber-900 font-bold">Switch Thrower:</span>
                {state.pieces.filter(p => p.side === 'PLAYER').map(p => (
                  <button
                    key={p.id}
                    onClick={() => dispatch({ type: 'CHOOSE_RESTART_THROWER', pieceId: p.id })}
                    className={`py-1 px-2 rounded-lg text-[10px] font-serif font-black border transition-all ${
                      ballHolder.id === p.id
                        ? 'bg-blue-600 text-white border-blue-900 shadow-sm ring-1 ring-blue-400'
                        : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-700/60'
                    }`}
                  >
                    {p.isCaptain ? '★ Captain (5,10)' : `${p.id.replace('p_', 'P')} (Goal Line)`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Phase Banner */}
          <div className="w-full flex flex-wrap items-center justify-between parchment-card rounded-2xl px-4 py-2 text-xs font-serif gap-2 border-2 border-[#8b5a2b]">
            <div className="flex items-center gap-2">
              <span className="text-amber-900 font-bold">TURN {state.turn} •</span>
              <span
                className={`font-black px-2.5 py-0.5 rounded-full border-2 ${
                  state.phase === 'PLAYER_PLAN'
                    ? 'bg-blue-100 text-blue-950 border-blue-700 shadow-sm'
                    : state.phase === 'AI_PLANNED_REVIEW'
                    ? 'bg-amber-200 text-amber-950 border-amber-800 animate-pulse shadow-sm'
                    : state.phase === 'AI_TURN'
                    ? 'bg-red-100 text-red-950 border-red-700 shadow-sm'
                    : 'bg-amber-100 text-amber-900 border-amber-800'
                }`}
              >
                {state.phase === 'PLAYER_PLAN'
                  ? 'PLAYER PLANNING PHASE'
                  : state.phase === 'AI_PLANNED_REVIEW'
                  ? '🤖 AI PIRATE MOVES PLANNED (REVIEW VECTORS ON COURT)'
                  : state.phase === 'AI_TURN'
                  ? 'AI EVALUATING (MCTS SEARCH)'
                  : state.phase}
              </span>
            </div>

            {/*
              Turn timer: fully hidden while the tutorial is open so beginners
              are not stressed by a countdown they can't see anyway. Still
              rendered (but paused) when help/config/captain-popup modals are
              up — those are momentary.
            */}
            {state.phase === 'PLAYER_PLAN' && !isTutorialOpen && (
              <TurnTimer
                remainingSeconds={state.timer.remainingSeconds}
                maxSeconds={state.config.timing.turnTimerSeconds}
                isPaused={isHelpOpen || isConfigOpen || !!captainAttemptPopup}
                onTimeExpired={() => {}}
                onTick={s => dispatch({ type: 'TIMER_TICK', secondsElapsed: s })}
              />
            )}
            {state.phase === 'PLAYER_PLAN' && isTutorialOpen && (
              <span
                data-testid="tutorial-timer-hidden-badge"
                className="text-[10px] font-black uppercase tracking-wider bg-emerald-200 border border-emerald-800 text-emerald-950 px-2 py-0.5 rounded-full"
                title="Turn timer paused while the tutorial is active"
              >
                Timer paused for tutorial
              </span>
            )}

            {/* In AI_PLANNED_REVIEW: Start Turn Banner Button */}
            {state.phase === 'AI_PLANNED_REVIEW' && (
              <button
                onClick={handleStartPlayerTurn}
                className="py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md border-2 border-emerald-900 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Start Turn {state.turn} (Resolve AI Moves)</span>
              </button>
            )}
          </div>

          <Board
            state={state}
            targetingCard={targetingCard}
            onCancelTargeting={() => setTargetingCard(null)}
            onPlayTargetedCard={(cardId, targetPieceId, targetCell) => {
              setTargetingCard(null);
              soundEngine.playCardChime();
              dispatch({ type: 'STAGE_CARD', cardId, targetPieceId, targetCell });
            }}
            onStageMove={(pieceId, destCell) => dispatch({ type: 'STAGE_MOVE', pieceId, destCell })}
            onUnstageMove={pieceId => dispatch({ type: 'UNSTAGE_MOVE', pieceId })}
            onStageThrow={(targetPieceId, targetCell, throwType) => dispatch({ type: 'STAGE_THROW', targetPieceId, targetCell, throwType })}
            onUnstageThrow={() => dispatch({ type: 'UNSTAGE_THROW' })}
            disabled={state.phase !== 'PLAYER_PLAN' || state.timer.isExpired}
          />

          {/* Opponent Tactical Action Feed & Live Telemetry Stream */}
          <OpponentTacticalFeed state={state} className="w-full mt-1" />
        </div>

        {/* Right Sidebar (Cols 9 to 12) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* In AI_PLANNED_REVIEW: Prominent Start Turn Card in Sidebar */}
          {state.phase === 'AI_PLANNED_REVIEW' ? (
            <div className="parchment-card rounded-3xl p-5 shadow-2xl space-y-3 font-serif animate-fadeIn border-4 border-emerald-800">
              <div className="flex items-center gap-2 text-emerald-900 font-black text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" />
                <span>AI MOVEMENT VECTORS PLANNED</span>
              </div>
              <p className="text-xs text-amber-950 leading-relaxed">
                The AI opponent has planned its tactical formation and passing vectors (shown in red on the court). Click below to resolve the AI&apos;s moves and start your planning timer.
              </p>
              <button
                onClick={handleStartPlayerTurn}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-xl border-2 border-emerald-950 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>START PLANNING (TURN {state.turn})</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Hand
              state={state}
              side="PLAYER"
              targetingCard={targetingCard}
              onArmTargeting={card => setTargetingCard(card)}
              onCancelTargeting={() => setTargetingCard(null)}
              onPlayCard={(cardId, targetPieceId, targetCell, secondaryPieceId) => {
                setTargetingCard(null);
                dispatch({ type: 'STAGE_CARD', cardId, targetPieceId, targetCell, secondaryPieceId });
              }}
              onUnstageCard={cardId => dispatch({ type: 'UNSTAGE_CARD', cardId })}
              onDiscardCard={cardId => dispatch({ type: 'DISCARD_CARD', cardId })}
              disabled={state.phase !== 'PLAYER_PLAN' || state.timer.isExpired}
            />
          )}

          {/* Turn Resolution & Tactical Controls */}
          <div className="parchment-card rounded-2xl p-4 shadow-xl space-y-3 border-2 border-[#8b5a2b]">
            <div className="text-xs font-bold text-amber-950 flex items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-2">
              <span>POSSESSION & ACTIONS</span>
              {ballHolder && (
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full border ${
                  ballHolder.side === 'PLAYER' ? 'bg-blue-100 text-blue-950 border-blue-800' : 'bg-red-100 text-red-950 border-red-800'
                }`}>
                  Ball with {ballHolder.isCaptain ? 'Captain' : ballHolder.id}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {isPlayerOverHandLimit && (
                <div className="p-2.5 rounded-xl bg-amber-200 border-2 border-amber-800 text-amber-950 text-xs font-serif flex items-center gap-2 animate-bounce">
                  <AlertTriangle className="w-4 h-4 text-amber-800 flex-shrink-0" />
                  <span>Hand limit: {effectivePlayerHandCount}/{state.config.momentum.handLimit}. Deploy or discard 1 card to commit turn.</span>
                </div>
              )}

              <button
                data-testid="commit-turn-button"
                disabled={state.phase !== 'PLAYER_PLAN' || isPlayerOverHandLimit}
                onClick={() => {
                  const carrier = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);
                  if (carrier && !state.plannedThrow) {
                    // Holding foul will occur upon commit — play referee foul whistle!
                    soundEngine.playFoulWhistle();
                  } else {
                    soundEngine.playWhistle();
                  }
                  dispatch({ type: 'END_PLAYER_TURN' });
                }}
                className={`w-full py-3 px-4 rounded-xl text-white font-serif font-black text-sm shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all border-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isPlayerOverHandLimit
                    ? 'bg-amber-600 cursor-not-allowed text-amber-950 border-amber-900'
                    : state.timer.isExpired
                    ? 'bg-rose-600 hover:bg-rose-500 border-rose-950 shadow-rose-900/40 ring-2 ring-rose-400 animate-pulse'
                    : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-950 shadow-blue-900/30 cursor-pointer'
                }`}
              >
                <span>
                  {isPlayerOverHandLimit
                    ? `Discard a Card to End Turn (${effectivePlayerHandCount}/3)`
                    : 'Commit & End Player Turn'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                data-testid="btn-finalize-match"
                onClick={() => dispatch({ type: 'CONCEDE_OR_END' })}
                className="w-full py-2 px-3 rounded-xl border-2 border-amber-800/60 hover:bg-amber-200/80 text-amber-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Finalize Match & View Scouting Radar</span>
              </button>
            </div>
          </div>

          {/* MCTS Visualizer & Real-time Tree Diagnostics */}
          <MCTSVisualizer
            isThinking={state.phase === 'AI_TURN'}
            posture={state.aiStatus.selectedPosture}
            tier={state.config.mcts.tier}
            engineMode={state.config.ai?.aiEngineMode || state.config.ai?.defaultEngineMode || 'NN_ACTIVE'}
            adaptiveTelemetry={{
              lastHumanLatencyMs: state.aiStatus.lastHumanLatencyMs,
              humanUsedSeconds: state.aiStatus.humanUsedSeconds,
              aiTargetBudgetSeconds: state.aiStatus.aiTargetBudgetSeconds,
              maxTurnBudgetSeconds: state.aiStatus.maxTurnBudgetSeconds,
              speedRatio: state.aiStatus.speedRatio,
              adaptiveIterations: state.aiStatus.adaptiveIterations,
              adaptiveRolloutDepth: state.aiStatus.adaptiveRolloutDepth,
              adaptiveSamples: state.aiStatus.adaptiveSamples,
              adaptiveTier: state.aiStatus.adaptiveTier,
            }}
            lastSearchStats={state.aiStatus.lastSearchStats}
            onTriggerAIStep={() => dispatch({ type: 'RUN_AI_TURN' })}
            canTriggerAI={state.phase === 'AI_TURN'}
          />
        </div>
      </main>

      {/* Jump-Ball Modal */}
      {state.jumpBall.active && (
        <JumpBall
          seed={state.seed}
          windowMs={state.config.timing.jumpBallWindowMs}
          onComplete={handleJumpBallComplete}
        />
      )}

      {/* Results Radar Modal */}
      {state.matchResult.isOver && state.matchResult.aptitudeReport && (
        <ResultsRadar
          report={state.matchResult.aptitudeReport}
          seed={state.seed}
          winner={state.matchResult.winner}
          eventLog={state.eventLog}
          onRestartMatch={handleRestartMatch}
        />
      )}

      {/* Captain Attempt & Goal Scored Notification Modal */}
      {captainAttemptPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn font-serif">
          <div className="w-full max-w-md parchment-card rounded-3xl p-6 sm:p-7 shadow-2xl border-4 border-[#5c3a1e] space-y-4 text-center animate-bounceIn">
            <div className={`inline-flex p-3 rounded-full border-2 mb-1 ${
              captainAttemptPopup.outcome === 'GOAL'
                ? 'bg-amber-400/20 border-amber-500'
                : captainAttemptPopup.outcome === 'INTERCEPTED'
                ? 'bg-rose-500/20 border-rose-600'
                : 'bg-amber-500/20 border-amber-600'
            }`}>
              {captainAttemptPopup.outcome === 'GOAL' && (
                <Trophy className="w-10 h-10 text-amber-600 animate-pulse" />
              )}
              {captainAttemptPopup.outcome === 'INTERCEPTED' && (
                <ShieldAlert className="w-10 h-10 text-rose-600 animate-pulse" />
              )}
              {captainAttemptPopup.outcome === 'INCOMPLETE' && (
                <AlertTriangle className="w-10 h-10 text-amber-700 animate-pulse" />
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-amber-950 uppercase tracking-wide">
              {captainAttemptPopup.outcome === 'GOAL'
                ? captainAttemptPopup.side === 'PLAYER'
                  ? '🏆 GOAL SCORED! 🏆'
                  : '⚠️ OPPONENT SCORED! ⚠️'
                : captainAttemptPopup.outcome === 'INTERCEPTED'
                ? captainAttemptPopup.side === 'PLAYER'
                  ? '🛡️ CAPTAIN THROW INTERCEPTED! 🛡️'
                  : '🛡️ OPPONENT STRIKE INTERCEPTED! 🛡️'
                : captainAttemptPopup.side === 'PLAYER'
                ? '⚠️ CAPTAIN THROW DEFLECTED! ⚠️'
                : '⚠️ OPPONENT STRIKE INCOMPLETE! ⚠️'}
            </h2>

            <div className="text-xs font-mono font-black tracking-widest uppercase mb-1">
              {captainAttemptPopup.outcome === 'GOAL' && (
                <span className="text-emerald-800">STRIKE ON CAPTAIN SUCCESSFUL (+1 POINT)</span>
              )}
              {captainAttemptPopup.outcome === 'INTERCEPTED' && (
                <span className="text-rose-800">STRIKE ON CAPTAIN DENIED BY DEFENSE</span>
              )}
              {captainAttemptPopup.outcome === 'INCOMPLETE' && (
                <span className="text-amber-800">STRIKE ON CAPTAIN DEFLECTED / MISSED</span>
              )}
            </div>

            <div className="bg-amber-100/80 border-2 border-[#8b5a2b]/40 rounded-2xl p-3 font-bold text-amber-950">
              <div className="text-sm uppercase tracking-wider text-amber-800 mb-1">Current Score</div>
              <div className="text-2xl sm:text-3xl font-black">
                PLAYER {captainAttemptPopup.playerScore} - {captainAttemptPopup.aiScore} AI
              </div>
            </div>

            <p className="text-sm sm:text-base text-amber-950 font-bold leading-relaxed">
              {captainAttemptPopup.outcome === 'GOAL'
                ? captainAttemptPopup.side === 'PLAYER'
                  ? "Your team threw to the Captain and scored! Under Capten restart rules, possession of the ball is immediately awarded to the opposing AI team."
                  : "The AI team threw to the Captain and scored! Under Capten restart rules, possession of the ball is immediately awarded to your team."
                : captainAttemptPopup.outcome === 'INTERCEPTED'
                ? captainAttemptPopup.side === 'PLAYER'
                  ? `Your team attempted a scoring throw at P.captain, but it was intercepted by ${
                      captainAttemptPopup.interceptedById
                        ? captainAttemptPopup.interceptedById.replace('ai_', 'A').replace('p_', 'P')
                        : 'the defense'
                    }! No goal was scored, and possession turns over to the defending piece.`
                  : "The AI team attempted a scoring throw at A.captain, but your defense intercepted the trajectory! No goal was scored, and your team takes possession."
                : captainAttemptPopup.side === 'PLAYER'
                ? "Your team attempted a scoring throw at P.captain, but the catch was contested and incomplete! No goal was scored."
                : "The AI team attempted a scoring throw at A.captain, but the catch was incomplete! No goal was scored."}
            </p>

            <button
              onClick={() => setCaptainAttemptPopup(null)}
              className="w-full py-3.5 px-6 rounded-2xl bg-[#7c4d24] hover:bg-[#8b5a2b] text-[#f4edd0] font-black text-sm tracking-wider uppercase shadow-lg border-2 border-[#5c3a1e] active:scale-95 transition-all cursor-pointer"
            >
              Continue Match
            </button>
          </div>
        </div>
      )}

      {/* Config Tuner */}
      <ConfigTuner
        config={state.config}
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        onApplyConfig={handleApplyConfig}
      />

      {/* Combine Primer Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn font-serif">
          <div className="w-full max-w-2xl parchment-card rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto border-4 border-[#5c3a1e]">
            <div className="flex items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-3">
              <h2 className="text-lg font-black text-amber-950 flex items-center gap-2">
                <Compass className="w-5 h-5 text-amber-800" />
                <span>The Captain&apos;s Combine — Tactical Tabletop Guide (v3.1)</span>
              </h2>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="p-1 rounded-xl bg-amber-200 border border-amber-800 text-amber-950 hover:bg-amber-300"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-amber-950 space-y-3 leading-relaxed">
              <div>
                <strong className="text-blue-900 font-bold">1. Scoring & Objectives (Patch v3.1 §B)</strong>
                <p>Player attacks UP toward the Player Captain at <strong>(5, 10)</strong>. AI attacks DOWN toward the AI Captain at <strong>(5, 0)</strong>. The Captain is a stationary target on the stool. A completed pass to your Captain scores a goal!</p>
              </div>

              <div>
                <strong className="text-emerald-900 font-bold">2. Post-Goal Baseline Restart & Mandatory Court Pass Rule</strong>
                <p>After a goal is scored, ball possession is awarded to the conceding team at their baseline. By official tournament regulations, the restarting team <strong>must complete at least one mandatory pass to an active court player (P1–P5 / A1–A5)</strong> before any pass to the Captain can be attempted. Direct passes to the Captain straight from the baseline restart are prohibited. The initial inbound restart pass is protected from interception.</p>
              </div>

              <div>
                <strong className="text-rose-900 font-bold">3. In-Motion Pieces Cannot Receive Throws</strong>
                <p>If a piece moves or is staged to move &gt; 1.42 cells in a turn, it cannot receive a throw in that same turn. Stationary pieces and pieces executing a 1-step pivot/cut (dist &le; 1.42) are eligible recipients!</p>
              </div>

              <div>
                <strong className="text-amber-900 font-bold">4. Holding Fouls & Whistle</strong>
                <p>Holding the ball without passing during a turn triggers a holding foul turnover and a referee whistle blast.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tutorial Entry Confirmation — appears when a game is in progress */}
      {showTutorialConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn font-serif">
          <div className="w-full max-w-md parchment-card rounded-3xl p-6 shadow-2xl border-4 border-[#5c3a1e] space-y-4 text-center">
            <div className="inline-flex p-3 rounded-full border-2 mb-1 bg-amber-400/20 border-amber-600">
              <GraduationCap className="w-10 h-10 text-amber-800" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-amber-950 uppercase tracking-wide">
              End Current Match to Enter Tutorial?
            </h2>
            <p className="text-sm text-amber-950 leading-relaxed">
              The tutorial runs in its own scripted training environment. Starting it will
              <strong> end your current match</strong> (score {state.score.PLAYER}–{state.score.AI}, turn {state.turn})
              and reset the board to the tutorial scenario. This cannot be undone.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={() => setShowTutorialConfirm(false)}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-black text-sm border-2 border-amber-800 shadow active:scale-95 transition-all cursor-pointer"
              >
                Keep Playing
              </button>
              <button
                onClick={enterTutorialEnvironment}
                className="flex-1 py-2.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm border-2 border-emerald-950 shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <GraduationCap className="w-4 h-4" />
                End Match & Start Tutorial
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Tutorial Academy Overlay */}
      <TutorialOverlay
        isOpen={isTutorialOpen}
        currentStepIndex={tutorialStepIndex}
        onNextStep={() => setTutorialStepIndex(prev => Math.min(prev + 1, TUTORIAL_STEPS.length - 1))}
        onPrevStep={() => setTutorialStepIndex(prev => Math.max(prev - 1, 0))}
        onGoToStep={idx => setTutorialStepIndex(idx)}
        onClose={() => setIsTutorialOpen(false)}
        gameState={state}
      />
    </div>
  );
};

export default App;
