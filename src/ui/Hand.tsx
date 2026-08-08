import React from 'react';
import type { Card, GameState, Side, Cell, Attribute, PlannedCard } from '../engine/types';
import { soundEngine } from './TacticalAudio';
import { Zap, Play, Trash2, Flame, AlertCircle, Info, Compass, Anchor, Key, HeartHandshake, Eye, Crown, Crosshair, X, CheckCircle2 } from 'lucide-react';

interface HandProps {
  state: GameState;
  side: Side;
  targetingCard?: Card | null;
  onArmTargeting?: (card: Card) => void;
  onCancelTargeting?: () => void;
  onPlayCard: (cardId: string, targetPieceId?: string, targetCell?: Cell, secondaryPieceId?: string) => void;
  onUnstageCard?: (cardId: string) => void;
  onDiscardCard: (cardId: string) => void;
  disabled?: boolean;
}

const DIM_CONFIG: Record<
  Attribute,
  { bg: string; text: string; border: string; seal: string; icon: React.ReactNode }
> = {
  RESOURCE: {
    bg: 'bg-[#f4ebd0]',
    text: 'text-emerald-900',
    border: 'border-emerald-700',
    seal: 'bg-emerald-700 text-emerald-100',
    icon: <Compass className="w-3 h-3" />,
  },
  RISK: {
    bg: 'bg-[#faebd7]',
    text: 'text-amber-900',
    border: 'border-amber-700',
    seal: 'bg-amber-700 text-amber-100',
    icon: <Anchor className="w-3 h-3" />,
  },
  COMPOSURE: {
    bg: 'bg-[#e8f0fe]',
    text: 'text-blue-900',
    border: 'border-blue-700',
    seal: 'bg-blue-700 text-blue-100',
    icon: <Key className="w-3 h-3" />,
  },
  TEAMWORK: {
    bg: 'bg-[#f3e8ff]',
    text: 'text-purple-900',
    border: 'border-purple-700',
    seal: 'bg-purple-700 text-purple-100',
    icon: <HeartHandshake className="w-3 h-3" />,
  },
  SPATIAL: {
    bg: 'bg-[#e0f7fa]',
    text: 'text-cyan-900',
    border: 'border-cyan-700',
    seal: 'bg-cyan-700 text-cyan-100',
    icon: <Eye className="w-3 h-3" />,
  },
  LEADERSHIP: {
    bg: 'bg-[#ffe4e6]',
    text: 'text-rose-900',
    border: 'border-rose-700',
    seal: 'bg-rose-700 text-rose-100',
    icon: <Crown className="w-3 h-3" />,
  },
};

export const Hand: React.FC<HandProps> = ({
  state,
  side,
  targetingCard = null,
  onArmTargeting,
  onCancelTargeting,
  onPlayCard,
  onUnstageCard,
  onDiscardCard,
  disabled = false,
}) => {
  const hand = state.hands[side];
  const momentum = state.momentum[side];
  const maxMomentum = state.config.momentum.maxMomentum;
  const handLimit = state.config.momentum.handLimit;
  const alreadyPlayed = state.cardPlayedThisTurn[side] && (!state.plannedCards || state.plannedCards.length === 0);
  const isOverHandLimit = hand.length > handLimit;
  const isTimerExpired = state.timer.isExpired;

  const playerPieces = state.pieces.filter(p => p.side === 'PLAYER');
  const enemyPieces = state.pieces.filter(p => p.side === 'AI');

  const getStagedTargetLabel = (staged: PlannedCard): string => {
    if (staged.targetPieceId) {
      const isPlayer = staged.targetPieceId.startsWith('p_');
      const piece = state.pieces.find(p => p.id === staged.targetPieceId);
      let pieceName = '';
      if (piece?.isCaptain || staged.targetPieceId.includes('captain')) {
        pieceName = isPlayer ? '★ Captain' : '★ AI Captain';
      } else if (piece?.isBlocker || staged.targetPieceId.includes('blocker')) {
        pieceName = isPlayer ? '🛡️ Blocker' : '🛡️ AI Blocker';
      } else {
        const match = staged.targetPieceId.match(/\d+/);
        const num = match ? match[0] : '1';
        pieceName = isPlayer ? `P${num}` : `A${num}`;
      }
      return `Played on ${pieceName}`;
    }
    if (staged.targetCell) {
      return `Played on (${staged.targetCell.col},${staged.targetCell.row})`;
    }
    return 'Played (Team)';
  };

  const handleCardClick = (card: Card) => {
    if (disabled || isTimerExpired) return;

    if (card.targetType === 'NONE') {
      soundEngine.playCardChime();
      onPlayCard(card.id);
    } else {
      soundEngine.playBlip(520, 0.06);
      if (onArmTargeting) {
        onArmTargeting(card);
      }
    }
  };

  const handleDirectChipSelect = (card: Card, targetPieceId: string) => {
    soundEngine.playCardChime();
    onPlayCard(card.id, targetPieceId);
    if (onCancelTargeting) {
      onCancelTargeting();
    }
  };

  return (
    <div className="parchment-card rounded-2xl p-3.5 space-y-2.5 font-serif shadow-xl border-2 border-[#8b5a2b]">
      {/* Top Header: Momentum Battery styled as Golden Doubloons / Crystals */}
      <div
        data-testid="momentum-doubloons-counter"
        className="flex flex-wrap items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-2.5 gap-2"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full wax-seal-gold flex items-center justify-center text-amber-950 font-black shadow-sm">
            <Zap className="w-3.5 h-3.5 text-amber-950 fill-amber-950" />
          </div>
          <span className="font-extrabold text-xs sm:text-sm text-amber-950 tracking-wider">
            MOMENTUM DOUBLOONS
          </span>
          <div className="flex items-center gap-1 ml-1.5">
            {Array.from({ length: maxMomentum }).map((_, i) => (
              <div
                key={i}
                className={`w-3.5 h-5 rounded-md border-2 transition-all duration-300 ${
                  i < momentum
                    ? 'bg-gradient-to-t from-amber-600 via-amber-400 to-yellow-200 border-amber-800 shadow-sm scale-105'
                    : 'bg-amber-900/20 border-amber-900/40'
                }`}
              />
            ))}
            <span className="text-xs font-black text-amber-950 ml-1 font-mono">
              {momentum}/{maxMomentum}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-amber-900 font-bold">
          <span
            data-testid="hand-limit-badge"
            className={`px-2 py-0.5 rounded-full border-2 text-[11px] ${
              isOverHandLimit ? 'bg-amber-200 text-amber-950 border-amber-800 font-black animate-bounce' : 'bg-amber-100 border-amber-700/60'
            }`}
          >
            Hand: {hand.length}/{handLimit}
          </span>
          <span>•</span>
          <span className="text-[11px]">+1/turn</span>
        </div>
      </div>

      {/* Hand Limit Banner */}
      {isOverHandLimit ? (
        <div className="p-2 rounded-xl bg-amber-200 border-2 border-amber-800 text-amber-950 text-xs flex items-center gap-2 animate-fadeIn shadow-sm">
          <AlertCircle className="w-4 h-4 text-amber-800 flex-shrink-0 animate-bounce" />
          <span className="text-[11px]">
            <strong>{isTimerExpired ? 'DISCARD TO COMMIT:' : 'DRAW PHASE:'}</strong> Hand is at {hand.length}/{handLimit}. Click <strong>Discard</strong> to proceed.
          </span>
        </div>
      ) : (
        <div className="px-2.5 py-1 rounded-lg bg-amber-100/80 text-amber-950 text-[10px] flex items-center justify-between border border-amber-700/30">
          <div className="flex items-center gap-1">
            <Info className="w-3 h-3 text-blue-700" />
            <span>Draw 1 card each turn • Discard anytime</span>
          </div>
          {state.plannedCards?.length > 0 ? (
            <span className="text-emerald-800 font-extrabold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>{state.plannedCards.length} Card Staged</span>
            </span>
          ) : alreadyPlayed ? (
            <span className="text-emerald-800 font-extrabold">✓ Card Played</span>
          ) : null}
        </div>
      )}

      {/* Tactical Parchment Cards in Hand: Compact Sized Grid with Stacked Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {hand.map((card, idx) => {
          const cfg = DIM_CONFIG[card.dim] || DIM_CONFIG.RESOURCE;
          const isAffordable = card.momentumCost <= momentum;
          const isSwing = !!card.swingEnergyCost;
          const isCardTargetingActive = targetingCard?.id === card.id;
          const stagedCard = state.plannedCards?.find(pc => pc.cardId === card.id);
          const canPlay = !disabled && !stagedCard && !alreadyPlayed && isAffordable && !isTimerExpired;
          const canDiscard = state.phase === 'PLAYER_PLAN';

          const eligiblePieces = card.targetType === 'ENEMY_PIECE'
            ? enemyPieces
            : (card.targetType === 'FRIENDLY_PIECE' || card.targetType === 'TWO_FRIENDLY')
            ? playerPieces
            : [];

          return (
            <div
              key={card.id + idx}
              data-testid={`card-${card.id}`}
              className={`relative rounded-2xl border-2 p-3 flex flex-col justify-between transition-all duration-200 shadow-md ${
                cfg.bg
              } ${
                stagedCard
                  ? 'border-emerald-700 ring-4 ring-emerald-400 shadow-xl bg-emerald-50/90'
                  : isCardTargetingActive
                  ? 'border-amber-600 ring-4 ring-amber-400 shadow-xl scale-[1.02] bg-amber-50'
                  : cfg.border
              } ${
                canPlay || stagedCard ? 'hover:-translate-y-0.5 hover:shadow-lg' : 'opacity-90'
              }`}
            >
              {/* Swing Card Banner */}
              {isSwing && (
                <div className="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-amber-500 text-amber-950 text-[9px] font-black tracking-wider flex items-center gap-0.5 shadow-md border border-amber-800">
                  <Flame className="w-2.5 h-2.5 text-amber-900 fill-amber-900" />
                  <span>⚡ SWING (−{card.swingEnergyCost}e)</span>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black border ${cfg.text} ${cfg.border} bg-white/80 shadow-xs`}>
                    {cfg.icon}
                    <span>{card.dim}</span>
                  </div>
                  <div className="flex items-center gap-0.5 text-amber-950 font-black text-[11px] bg-amber-300 px-2 py-0.5 rounded-full border border-amber-700 shadow-xs">
                    <Zap className="w-3 h-3 fill-amber-800 text-amber-800" />
                    <span>{card.momentumCost}M</span>
                  </div>
                </div>

                <h4 className="font-extrabold text-xs text-amber-950 tracking-tight leading-snug">{card.name}</h4>
                <p className="text-[11px] text-amber-900 mt-0.5 leading-tight">{card.description}</p>
              </div>

              {/* Direct Targeting Interactive Panel (When Card is Armed) */}
              {isCardTargetingActive && (
                <div className="my-2 p-2 rounded-xl bg-amber-200/90 border border-amber-700 space-y-1.5 animate-fadeIn shadow-xs">
                  <div className="flex items-center justify-between text-[10px] font-black text-amber-950">
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3 h-3 text-amber-900 animate-spin" />
                      <span>Select target piece:</span>
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (onCancelTargeting) onCancelTargeting();
                      }}
                      className="p-0.5 rounded hover:bg-amber-300 text-amber-900 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Quick-select chips for all valid pieces */}
                  <div className="flex flex-wrap gap-1">
                    {eligiblePieces.map((p, pIdx) => {
                      const num = p.id.match(/\d+/)?.[0] || `${pIdx + 1}`;
                      const label = p.side === 'PLAYER'
                        ? (p.isCaptain ? '★ Captain' : p.isBlocker ? '🛡️ Blocker' : `P${num}`)
                        : (p.isCaptain ? '★ AI Captain' : p.isBlocker ? '🛡️ AI Blocker' : `A${num}`);

                      return (
                        <button
                          key={p.id}
                          onClick={e => {
                            e.stopPropagation();
                            handleDirectChipSelect(card, p.id);
                          }}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black border transition-all active:scale-95 cursor-pointer ${
                            p.side === 'PLAYER'
                              ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-900 shadow-xs'
                              : 'bg-red-600 hover:bg-red-500 text-white border-red-900 shadow-xs'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actions Footer: Placed Vertically ONE ABOVE ANOTHER */}
              <div className="mt-2.5 pt-2 border-t border-[#8b5a2b]/30 flex flex-col gap-1.5">
                {stagedCard ? (
                  <button
                    data-testid={`staged-card-btn-${card.id}`}
                    onClick={() => {
                      soundEngine.playBlip(300, 0.05);
                      if (onUnstageCard) {
                        onUnstageCard(card.id);
                      }
                    }}
                    title="Click to cancel/unstage this card"
                    className="w-full py-1.5 px-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white border-2 border-emerald-950 shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ring-2 ring-emerald-400"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{getStagedTargetLabel(stagedCard)}</span>
                  </button>
                ) : isCardTargetingActive ? (
                  <button
                    onClick={() => {
                      if (onCancelTargeting) onCancelTargeting();
                    }}
                    className="w-full py-1.5 px-2 rounded-xl text-xs font-black bg-amber-300 hover:bg-amber-400 text-amber-950 border-2 border-amber-800 shadow flex items-center justify-center gap-1 cursor-pointer transition-all active:scale-95"
                  >
                    <X className="w-3 h-3" />
                    <span>Cancel Targeting</span>
                  </button>
                ) : (
                  <button
                    data-testid={`deploy-card-btn-${card.id}`}
                    disabled={!canPlay}
                    onClick={() => handleCardClick(card)}
                    className={`w-full py-1.5 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition-all border-2 ${
                      canPlay
                        ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-950 shadow-md active:scale-95 cursor-pointer'
                        : 'bg-amber-200/60 text-amber-900/50 border-amber-300 cursor-not-allowed'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>
                      {isTimerExpired
                        ? 'LOCKED'
                        : alreadyPlayed
                        ? '1 PLAYED'
                        : isAffordable
                        ? card.targetType === 'NONE'
                          ? 'PLAY'
                          : 'PLAY (TARGET)'
                        : 'NEED MOMENTUM'}
                    </span>
                  </button>
                )}

                {/* Discard Button Placed Directly Underneath */}
                <button
                  data-testid={`discard-card-btn-${card.id}`}
                  disabled={!canDiscard}
                  onClick={() => {
                    soundEngine.playBlip(300, 0.05);
                    if (isCardTargetingActive && onCancelTargeting) {
                      onCancelTargeting();
                    }
                    if (stagedCard && onUnstageCard) {
                      onUnstageCard(card.id);
                    }
                    onDiscardCard(card.id);
                  }}
                  title="Discard to cycle card and maintain hand limit"
                  className={`w-full py-1 px-2 rounded-xl border text-[11px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer ${
                    isOverHandLimit
                      ? 'bg-amber-400 hover:bg-amber-300 text-amber-950 border-amber-800 shadow-sm animate-pulse'
                      : 'bg-amber-100/80 hover:bg-red-100 hover:text-red-900 text-amber-900 border-amber-700/60 shadow-2xs'
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Discard</span>
                </button>
              </div>
            </div>
          );
        })}

        {hand.length === 0 && (
          <div className="col-span-3 py-6 text-center text-amber-900/70 text-xs border-2 border-dashed border-[#8b5a2b]/40 rounded-2xl bg-amber-50/50">
            No cards in hand. Next tactical card will be drawn at the start of your turn.
          </div>
        )}
      </div>
    </div>
  );
};
