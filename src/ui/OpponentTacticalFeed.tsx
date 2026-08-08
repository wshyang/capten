import React, { useState, useRef, useEffect } from 'react';
import type { GameEvent, GameState } from '../engine/types';
import { Bot, User, AlertOctagon, Trophy, ShieldAlert, Sparkles, ScrollText, Dices } from 'lucide-react';

interface OpponentTacticalFeedProps {
  state: GameState;
  className?: string;
}

export const OpponentTacticalFeed: React.FC<OpponentTacticalFeedProps> = ({
  state,
  className = '',
}) => {
  const [filter, setFilter] = useState<'ALL' | 'AI_ONLY' | 'BUFFS_DEBUFFS'>('ALL');
  const feedEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of feed on new events
  useEffect(() => {
    if (feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.eventLog.length]);

  const formatPieceName = (pieceId?: string, isPlayer?: boolean): string => {
    if (!pieceId) return 'Piece';
    const isPlayerPiece = isPlayer !== undefined ? isPlayer : pieceId.startsWith('p_');
    if (pieceId.includes('captain')) return isPlayerPiece ? '★ Player Captain' : '★ AI Captain';
    if (pieceId.includes('blocker')) return isPlayerPiece ? '🛡️ Blocker (P)' : '🛡️ Blocker (AI)';
    const match = pieceId.match(/\d+/);
    const num = match ? match[0] : '1';
    return isPlayerPiece ? `P${num}` : `A${num}`;
  };

  const renderEventDescription = (ev: GameEvent) => {
    const isAI = ev.side === 'AI';
    const sidePrefix = isAI ? 'AI' : 'Player';

    switch (ev.type) {
      case 'PIECE_MOVED': {
        const piece = formatPieceName(ev.details.pieceId);
        const from = ev.details.fromCell ? `(${ev.details.fromCell.col},${ev.details.fromCell.row})` : '';
        const to = ev.details.toCell ? `(${ev.details.toCell.col},${ev.details.toCell.row})` : '';
        const cost = ev.details.cost ? `[-${ev.details.cost.toFixed(1)}e]` : '';
        return (
          <span>
            <strong>{sidePrefix}</strong> moved <strong>{piece}</strong> from {from} to <strong>{to}</strong> <span className="text-amber-900 font-mono text-[10px]">{cost}</span>
          </span>
        );
      }

      case 'PASS_ATTEMPTED': {
        const thrower = formatPieceName(ev.details.throwerId);
        const target = formatPieceName(ev.details.targetPieceId);
        const throwType = ev.details.throwType ? ` [${ev.details.throwType}]` : '';
        const cleanTag = ev.details.isClean ? '⚡ Clean Inbound' : 'Contested Ray';
        return (
          <span>
            <strong>{sidePrefix}</strong> attempted throw{throwType} from <strong>{thrower}</strong> to <strong>{target}</strong> <span className="text-emerald-800 text-[10px] font-bold">({cleanTag})</span>
          </span>
        );
      }

      case 'ROULETTE_EVALUATED': {
        const cellStr = `(${ev.details.cell.col},${ev.details.cell.row})`;
        const defPiece = formatPieceName(ev.details.defPieceId);
        const pPct = ((ev.details.pCell || 0) * 100).toFixed(1);
        const rollVal = (ev.details.roll || 0).toFixed(3);
        const fEff = (ev.details.fEffective || 0).toFixed(2);
        const defE = ev.details.defEnergy !== undefined ? `${ev.details.defEnergy.toFixed(1)}e` : '';
        const attE = ev.details.throwerEnergy !== undefined ? `${ev.details.throwerEnergy.toFixed(1)}e` : '';
        const intercepted = ev.details.intercepted;

        return (
          <span className={intercepted ? 'text-rose-950 font-bold' : 'text-amber-950'}>
            🎲 <strong>Roulette at {cellStr}:</strong> [{defPiece} AoC f_eff={fEff}, Def={defE} vs Att={attE}] ➔ <strong>p={pPct}%</strong> | Roll: <strong>{rollVal}</strong> ➔ {intercepted ? <span className="text-rose-700 font-black">INTERCEPTED!</span> : <span className="text-emerald-800 font-bold">Passed (Clean)</span>}
          </span>
        );
      }

      case 'PASS_COMPLETED': {
        const receiver = formatPieceName(ev.details.receiverId);
        return (
          <span>
            <strong>{sidePrefix}</strong> completed pass safely to <strong>{receiver}</strong>!
          </span>
        );
      }

      case 'PASS_INTERCEPTED': {
        const defPiece = formatPieceName(ev.details.interceptedByPieceId);
        const cell = ev.details.interceptedAtCell ? ` at (${ev.details.interceptedAtCell.col},${ev.details.interceptedAtCell.row})` : '';
        const lunge = ev.details.lungeCost ? ` [Lunge cost: -${ev.details.lungeCost.toFixed(1)}e]` : '';
        return (
          <span className="text-rose-950 font-bold">
            🛡️ <strong>{sidePrefix} THROW INTERCEPTED!</strong> Snatched{cell} by <strong>{defPiece}</strong>! Defender lunges to ball{lunge}.
          </span>
        );
      }

      case 'SCORE_GOAL': {
        const scorer = formatPieceName(ev.details.scorerPieceId);
        return (
          <span className="text-emerald-950 font-black">
            ⭐ <strong>GOAL SCORED!</strong> {sidePrefix} scored a point with <strong>{scorer}</strong>! (Score: {state.score.PLAYER} - {state.score.AI})
          </span>
        );
      }

      case 'HOLDING_FOUL_TURNOVER': {
        const foul = formatPieceName(ev.details.foulPieceId);
        return (
          <span className="text-rose-900 font-extrabold">
            ⚠️ <strong>REFEREE FOUL:</strong> Holding foul turnover on <strong>{foul}</strong>! Ball held without throwing. Possession awarded to opponent.
          </span>
        );
      }

      case 'CARD_PLAYED': {
        const cardName = ev.details.cardName || ev.details.cardId;
        const targetPieceId: string | undefined = ev.details.targetPieceId;
        const targetCell = ev.details.targetCell
          ? `at (${ev.details.targetCell.col},${ev.details.targetCell.row})`
          : null;
        const isDebuff = ev.details.cardId === 'drain' || ev.details.cardId === 'clamp' || ev.details.cardId === 'bait' || ev.details.isDebuff;

        let targetLabel: string | null = null;
        if (targetPieceId) {
          const isTargetPlayer = targetPieceId.startsWith('p_');
          const pieceName = formatPieceName(targetPieceId);
          if (isAI) {
            targetLabel = isTargetPlayer ? `your ${pieceName}` : pieceName;
          } else {
            targetLabel = isTargetPlayer ? pieceName : `enemy ${pieceName}`;
          }
        }

        if (isDebuff) {
          return (
            <span className="text-rose-950">
              🩸 <strong>{sidePrefix} played DEBUFF card [{cardName}]</strong>
              {targetLabel ? <> targeting <strong>{targetLabel}</strong></> : targetCell ? <> {targetCell}</> : ''}!
            </span>
          );
        }

        const targetDesc = targetLabel
          ? `targeting ${targetLabel}`
          : targetCell
          ? targetCell
          : '(Whole Team / Aura)';

        return (
          <span>
            ✨ <strong>{sidePrefix} played card [{cardName}]</strong> {targetDesc ? <>targeting <strong>{targetDesc}</strong></> : ''} ({ev.details.momentumCost || 1}M)
          </span>
        );
      }

      case 'REST_COMPOUNDED': {
        const piece = formatPieceName(ev.details.pieceId);
        const streak = ev.details.restStreak;
        const amount = ev.details.regenAmount ? `+${ev.details.regenAmount.toFixed(1)}e` : '+2.0e';
        return (
          <span className="text-amber-900">
            🔥 <strong>{piece}</strong> rested (Streak {streak}): gained <strong>{amount}</strong> energy.
          </span>
        );
      }

      case 'JUMP_BALL_WON': {
        return (
          <span>
            🏀 Opening Jump-Ball won by <strong>{sidePrefix}</strong>! Ball inbounded to {isAI ? 'A1' : 'P1'}.
          </span>
        );
      }

      default:
        return (
          <span>
            {sidePrefix}: {ev.type.replace(/_/g, ' ')}
          </span>
        );
    }
  };

  const filteredEvents = state.eventLog.filter(ev => {
    if (filter === 'AI_ONLY') return ev.side === 'AI';
    if (filter === 'BUFFS_DEBUFFS') {
      return (
        ev.type === 'CARD_PLAYED' ||
        ev.type === 'PASS_INTERCEPTED' ||
        ev.type === 'ROULETTE_EVALUATED' ||
        ev.type === 'HOLDING_FOUL_TURNOVER' ||
        ev.type === 'REST_COMPOUNDED'
      );
    }
    return true;
  });

  return (
    <div className={`parchment-card rounded-2xl p-3.5 shadow-xl border-2 border-[#8b5a2b] flex flex-col font-serif ${className}`}>
      {/* Header with Title & Filter Toggles */}
      <div className="flex flex-wrap items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-2.5 mb-2 gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-amber-200 border border-amber-800 flex items-center justify-center shadow-sm">
            <ScrollText className="w-3.5 h-3.5 text-amber-900" />
          </div>
          <div>
            <h3 className="font-extrabold text-xs text-amber-950 tracking-tight">
              TACTICAL PLAY-BY-PLAY & OPPONENT LOG
            </h3>
            <p className="text-[10px] text-amber-900/80 font-bold">
              Live text telemetry of AI and Player movements, throws & card plays
            </p>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-2 py-0.5 rounded-lg text-[9px] font-black border transition-all ${
              filter === 'ALL'
                ? 'bg-amber-800 text-white border-amber-950 shadow-sm'
                : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-700/60'
            }`}
          >
            All ({state.eventLog.length})
          </button>
          <button
            onClick={() => setFilter('AI_ONLY')}
            className={`px-2 py-0.5 rounded-lg text-[9px] font-black border transition-all ${
              filter === 'AI_ONLY'
                ? 'bg-red-700 text-white border-red-950 shadow-sm'
                : 'bg-amber-100 hover:bg-red-100 text-red-950 border-amber-700/60'
            }`}
          >
            AI Actions
          </button>
          <button
            onClick={() => setFilter('BUFFS_DEBUFFS')}
            className={`px-2 py-0.5 rounded-lg text-[9px] font-black border transition-all ${
              filter === 'BUFFS_DEBUFFS'
                ? 'bg-emerald-700 text-white border-emerald-950 shadow-sm'
                : 'bg-amber-100 hover:bg-emerald-100 text-emerald-950 border-amber-700/60'
            }`}
          >
            Buffs & Debuffs
          </button>
        </div>
      </div>

      {/* AI Planned Vector Preview Notice when in AI_PLANNED_REVIEW */}
      {state.phase === 'AI_PLANNED_REVIEW' && state.aiPlannedActions && (
        <div className="mb-2 p-2 rounded-xl bg-red-100 border-2 border-red-700 text-red-950 text-[11px] font-serif shadow-sm animate-pulse flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-black">
            <Bot className="w-3.5 h-3.5 text-red-700" />
            <span>AI PLANNED ACTION SUMMARY:</span>
          </div>
          <div className="text-[10px] leading-relaxed text-red-900">
            {state.aiPlannedActions.moves.map(m => `AI moves ${formatPieceName(m.pieceId, false)} to (${m.destCell.col},${m.destCell.row}) [-${m.cost.toFixed(1)}e]`).join(' • ')}
            {state.aiPlannedActions.throwAction && ` • AI stages throw to ${formatPieceName(state.aiPlannedActions.throwAction.targetPieceId, false)}`}
            {state.aiPlannedActions.stage0Card && ` • AI plays [${state.aiPlannedActions.stage0Card}]${state.aiPlannedActions.stage0CardTarget ? ` targeting ${formatPieceName(state.aiPlannedActions.stage0CardTarget)}` : ''}`}
            {state.aiPlannedActions.stage2Card && ` • AI plays [${state.aiPlannedActions.stage2Card}]${state.aiPlannedActions.stage2CardTarget ? ` targeting ${formatPieceName(state.aiPlannedActions.stage2CardTarget)}` : ''}`}
          </div>
        </div>
      )}

      {/* Event Stream Log */}
      <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-xs select-text scrollbar-thin">
        {filteredEvents.length === 0 ? (
          <div className="py-4 text-center text-amber-900/60 text-xs italic">
            No events recorded yet for this filter.
          </div>
        ) : (
          filteredEvents.map(ev => {
            const isAI = ev.side === 'AI';
            const isCard = ev.type === 'CARD_PLAYED';
            const isFoul = ev.type === 'HOLDING_FOUL_TURNOVER';
            const isIntercept = ev.type === 'PASS_INTERCEPTED';
            const isGoal = ev.type === 'SCORE_GOAL';
            const isRoulette = ev.type === 'ROULETTE_EVALUATED';

            return (
              <div
                key={ev.id}
                className={`p-1.5 rounded-xl border flex items-start gap-2 transition-all ${
                  isGoal
                    ? 'bg-amber-200/90 border-amber-600 shadow-md ring-1 ring-amber-400'
                    : isIntercept
                    ? 'bg-rose-100 border-rose-600 shadow-sm'
                    : isFoul
                    ? 'bg-rose-200 border-rose-700 shadow-sm animate-bounce'
                    : isCard
                    ? 'bg-purple-50 border-purple-300'
                    : isRoulette
                    ? 'bg-amber-50/90 border-amber-300 shadow-2xs font-mono'
                    : isAI
                    ? 'bg-red-50/80 border-red-200'
                    : 'bg-blue-50/80 border-blue-200'
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {isGoal ? (
                    <Trophy className="w-3.5 h-3.5 text-amber-800" />
                  ) : isIntercept ? (
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
                  ) : isFoul ? (
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-700 animate-spin" />
                  ) : isCard ? (
                    <Sparkles className="w-3.5 h-3.5 text-purple-700" />
                  ) : isRoulette ? (
                    <Dices className="w-3.5 h-3.5 text-amber-700" />
                  ) : isAI ? (
                    <Bot className="w-3.5 h-3.5 text-red-700" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-blue-700" />
                  )}
                </div>

                <div className="flex-1 text-[11px] leading-snug">
                  {renderEventDescription(ev)}
                </div>

                <span className="text-[9px] font-mono font-bold text-amber-900/60 self-center flex-shrink-0">
                  T{ev.turn}
                </span>
              </div>
            );
          })
        )}
        <div ref={feedEndRef} />
      </div>
    </div>
  );
};
