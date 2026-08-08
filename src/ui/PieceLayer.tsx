import React from 'react';
import type { Piece, PlannedMove, PlannedThrow, AIPlannedActionsData, Card } from '../engine/types';
import { Flame, Target, Sparkles, Crosshair } from 'lucide-react';
import { isInDefenseCircle, BOARD_CONFIG } from '../engine/config/board';
import {
  CaptainPlayerIllustration,
  CarrierPlayerIllustration,
  CutterPlayerIllustration,
  BlockerPlayerIllustration,
  CaptainAIIllustration,
  PieceAIIllustration,
  BlockerAIIllustration,
} from './HandDrawnCharacters';
import { CaptainBallIllustration } from './HandDrawnIllustrations';

interface PieceLayerProps {
  pieces: Piece[];
  plannedMoves?: PlannedMove[];
  plannedThrow?: PlannedThrow | null;
  aiPlannedActions?: AIPlannedActionsData | null;
  selectedPieceId: string | null;
  ballCarrierId: string | null;
  targetingCard?: Card | null;
  onSelectPiece: (piece: Piece) => void;
  onSelectPieceTarget?: (piece: Piece) => void;
  cellSizePx: number;
}

const getUniformLabel = (id: string, isCaptain: boolean, isBlocker?: boolean): string => {
  if (isCaptain) return '★ Captain';
  if (isBlocker || id.includes('blocker')) return '🛡️ Blocker';
  const match = id.match(/\d+/);
  const num = match ? match[0] : '1';
  return id.startsWith('ai_') ? `A${num}` : `P${num}`;
};

export const PieceLayer: React.FC<PieceLayerProps> = ({
  pieces,
  plannedMoves = [],
  plannedThrow = null,
  aiPlannedActions = null,
  selectedPieceId,
  ballCarrierId,
  targetingCard = null,
  onSelectPiece,
  onSelectPieceTarget,
  cellSizePx,
}) => {
  const isCarrierSelected = Boolean(ballCarrierId && selectedPieceId && selectedPieceId === ballCarrierId);
  const carrier = pieces.find(p => p.id === ballCarrierId);

  return (
    <div className="absolute inset-0 pointer-events-none z-20">
      {/* 1. PLAYER STAGED MOVEMENT VECTORS & GHOST SHADOW PIECES */}
      {plannedMoves.map(planned => {
        const piece = pieces.find(p => p.id === planned.pieceId);
        if (!piece) return null;

        const x1 = (piece.cell.col + 0.5) * cellSizePx;
        const y1 = (piece.cell.row + 0.5) * cellSizePx;
        const x2 = (planned.destCell.col + 0.5) * cellSizePx;
        const y2 = (planned.destCell.row + 0.5) * cellSizePx;

        const ghostX = planned.destCell.col * cellSizePx;
        const ghostY = planned.destCell.row * cellSizePx;

        return (
          <React.Fragment key={`planned-${planned.pieceId}`}>
            <svg className="w-full h-full absolute inset-0 overflow-visible pointer-events-none">
              <defs>
                <marker
                  id={`move-arrow-${planned.pieceId}`}
                  markerWidth="10"
                  markerHeight="7"
                  refX="8"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7, 2 3.5" fill="#0284c7" stroke="#0369a1" strokeWidth="1" />
                </marker>
              </defs>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#0284c7"
                strokeWidth="3.5"
                strokeDasharray="6 4"
                className="animate-[dash-slow_1s_linear_infinite]"
                markerEnd={`url(#move-arrow-${planned.pieceId})`}
              />
            </svg>

            {/* Cartoon Ghost / Shadow Piece at Destination */}
            <div
              className="absolute pointer-events-none flex flex-col items-center justify-center animate-pulse"
              style={{
                left: `${ghostX}px`,
                top: `${ghostY}px`,
                width: `${cellSizePx}px`,
                height: `${cellSizePx}px`,
              }}
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-cyan-200/40 border-2 border-dashed border-cyan-700 flex items-center justify-center shadow-lg shadow-cyan-900/20 opacity-85">
                <span className="font-serif text-[10px] font-black text-cyan-950">
                  {getUniformLabel(piece.id, piece.isCaptain)}
                </span>
              </div>
              <span className="text-[9px] font-serif font-bold text-amber-950 mt-0.5 bg-amber-100/95 px-1.5 py-0.2 rounded-md border border-amber-700/60 shadow">
                -{planned.cost.toFixed(1)}e
              </span>
            </div>
          </React.Fragment>
        );
      })}

      {/* 2. PLAYER STAGED THROW VECTOR & GOLDEN GHOST BALL */}
      {plannedThrow && carrier && (
        <React.Fragment>
          <svg className="w-full h-full absolute inset-0 overflow-visible pointer-events-none">
            <defs>
              <marker
                id="planned-throw-arrowhead"
                markerWidth="12"
                markerHeight="8"
                refX="10"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 12 4, 0 8, 2 4" fill="#d97706" stroke="#78350f" strokeWidth="1" />
              </marker>
            </defs>
            <line
              x1={(carrier.cell.col + 0.5) * cellSizePx}
              y1={(carrier.cell.row + 0.5) * cellSizePx}
              x2={(plannedThrow.targetCell.col + 0.5) * cellSizePx}
              y2={(plannedThrow.targetCell.row + 0.5) * cellSizePx}
              stroke="#d97706"
              strokeWidth="4"
              strokeDasharray="7 4"
              className="animate-[dash-slow_1s_linear_infinite]"
              markerEnd="url(#planned-throw-arrowhead)"
            />
          </svg>

          {/* Golden Ball Ghost Shadow at Target */}
          <div
            className="absolute pointer-events-none flex flex-col items-center justify-center animate-bounce"
            style={{
              left: `${plannedThrow.targetCell.col * cellSizePx}px`,
              top: `${plannedThrow.targetCell.row * cellSizePx}px`,
              width: `${cellSizePx}px`,
              height: `${cellSizePx}px`,
            }}
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
              <CaptainBallIllustration className="w-full h-full drop-shadow-lg" />
            </div>
            <span className="text-[8px] font-serif font-extrabold text-amber-950 mt-0.5 bg-amber-200/95 px-1.5 py-0.2 rounded-md border border-amber-800 shadow">
              PASS TARGET
            </span>
          </div>
        </React.Fragment>
      )}

      {/* 3. AI PLANNED MOVEMENT VECTORS & RED GHOST SHADOWS */}
      {aiPlannedActions?.moves.map(m => {
        const piece = pieces.find(p => p.id === m.pieceId);
        if (!piece) return null;

        const x1 = (m.fromCell.col + 0.5) * cellSizePx;
        const y1 = (m.fromCell.row + 0.5) * cellSizePx;
        const x2 = (m.destCell.col + 0.5) * cellSizePx;
        const y2 = (m.destCell.row + 0.5) * cellSizePx;

        const ghostX = m.destCell.col * cellSizePx;
        const ghostY = m.destCell.row * cellSizePx;

        return (
          <React.Fragment key={`ai-move-${m.pieceId}`}>
            <svg className="w-full h-full absolute inset-0 overflow-visible pointer-events-none">
              <defs>
                <marker
                  id={`ai-move-arrow-${m.pieceId}`}
                  markerWidth="10"
                  markerHeight="7"
                  refX="8"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7, 2 3.5" fill="#dc2626" stroke="#991b1b" strokeWidth="1" />
                </marker>
              </defs>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#dc2626"
                strokeWidth="3.5"
                strokeDasharray="6 4"
                className="animate-[dash-slow_1s_linear_infinite]"
                markerEnd={`url(#ai-move-arrow-${m.pieceId})`}
              />
            </svg>

            {/* AI Ghost Shadow at Destination */}
            <div
              className="absolute pointer-events-none flex flex-col items-center justify-center animate-pulse"
              style={{
                left: `${ghostX}px`,
                top: `${ghostY}px`,
                width: `${cellSizePx}px`,
                height: `${cellSizePx}px`,
              }}
            >
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-rose-200/40 border-2 border-dashed border-rose-700 flex items-center justify-center shadow-lg shadow-rose-900/20">
                <span className="font-serif text-[10px] font-black text-rose-950">
                  {getUniformLabel(piece.id, piece.isCaptain)}
                </span>
              </div>
              <span className="text-[8px] font-serif font-bold text-rose-950 mt-0.5 bg-rose-100/95 px-1.5 py-0.2 rounded-md border border-rose-700/60 shadow">
                AI CUT
              </span>
            </div>
          </React.Fragment>
        );
      })}

      {/* 4. AI PLANNED THROW VECTOR & RED GHOST BALL */}
      {aiPlannedActions?.throwAction && (
        <React.Fragment>
          <svg className="w-full h-full absolute inset-0 overflow-visible pointer-events-none">
            <defs>
              <marker
                id="ai-throw-arrowhead"
                markerWidth="12"
                markerHeight="8"
                refX="10"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 12 4, 0 8, 2 4" fill="#e11d48" stroke="#881337" strokeWidth="1" />
              </marker>
            </defs>
            <line
              x1={(aiPlannedActions.throwAction.fromCell.col + 0.5) * cellSizePx}
              y1={(aiPlannedActions.throwAction.fromCell.row + 0.5) * cellSizePx}
              x2={(aiPlannedActions.throwAction.targetCell.col + 0.5) * cellSizePx}
              y2={(aiPlannedActions.throwAction.targetCell.row + 0.5) * cellSizePx}
              stroke="#e11d48"
              strokeWidth="4"
              strokeDasharray="7 4"
              className="animate-[dash-slow_1s_linear_infinite]"
              markerEnd="url(#ai-throw-arrowhead)"
            />
          </svg>

          <div
            className="absolute pointer-events-none flex flex-col items-center justify-center animate-bounce"
            style={{
              left: `${aiPlannedActions.throwAction.targetCell.col * cellSizePx}px`,
              top: `${aiPlannedActions.throwAction.targetCell.row * cellSizePx}px`,
              width: `${cellSizePx}px`,
              height: `${cellSizePx}px`,
            }}
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center">
              <CaptainBallIllustration className="w-full h-full drop-shadow-lg" />
            </div>
            <span className="text-[8px] font-serif font-extrabold text-rose-950 mt-0.5 bg-rose-200/95 px-1.5 py-0.2 rounded-md border border-rose-800 shadow">
              AI PASS TARGET
            </span>
          </div>
        </React.Fragment>
      )}

      {/* 5. REAL CARTOON HAND-DRAWN CHARACTERS ON COURT */}
      {pieces.map(piece => {
        const isPlayer = piece.side === 'PLAYER';
        const isSelected = selectedPieceId === piece.id;
        const hasMovedThisTurn = piece.movedLastTurn || plannedMoves.some(m => m.pieceId === piece.id);
        const isPotentialPassTarget = isCarrierSelected && isPlayer && piece.id !== ballCarrierId && !hasMovedThisTurn;

        // Card Direct-Targeting Eligibility
        const isEligibleCardTarget = targetingCard && (
          ((targetingCard.targetType === 'FRIENDLY_PIECE' || targetingCard.targetType === 'TWO_FRIENDLY') && isPlayer) ||
          (targetingCard.targetType === 'ENEMY_PIECE' && !isPlayer)
        );

        const x = piece.cell.col * cellSizePx;
        const y = piece.cell.row * cellSizePx;
        const energyPct = Math.min(100, Math.max(0, (piece.energy / 10.0) * 100));

        // All mobile court player pieces are uniform athletic cartoon players with numbered jerseys (1-5)!
        const num = piece.isCaptain ? '★' : (piece.id.match(/\d+/)?.[0] || '1');
        const hasDebuff = piece.buffs.some(b => b.type === 'CLAMP' || b.type === 'DRAIN');
        const hasBuff = piece.buffs.some(b => b.type !== 'CLAMP' && b.type !== 'DRAIN');

        const isBlocker = piece.isBlocker || (!piece.isCaptain && (
          (piece.side === 'PLAYER' && isInDefenseCircle(piece.cell, BOARD_CONFIG.aiScoringCell)) ||
          (piece.side === 'AI' && isInDefenseCircle(piece.cell, BOARD_CONFIG.playerScoringCell))
        ));

        const renderCharacterIllustration = () => {
          if (isPlayer) {
            if (piece.isCaptain) {
              return <CaptainPlayerIllustration hasBall={piece.hasBall} jerseyNumber="★" />;
            }
            if (isBlocker) {
              return <BlockerPlayerIllustration hasBall={piece.hasBall} />;
            }
            if (piece.hasBall) {
              return <CarrierPlayerIllustration hasBall={true} jerseyNumber={num} />;
            }
            return <CutterPlayerIllustration hasBall={false} jerseyNumber={num} />;
          } else {
            if (piece.isCaptain) {
              return <CaptainAIIllustration hasBall={piece.hasBall} jerseyNumber="★" />;
            }
            if (isBlocker) {
              return <BlockerAIIllustration hasBall={piece.hasBall} />;
            }
            return <PieceAIIllustration hasBall={piece.hasBall} jerseyNumber={num} />;
          }
        };

        return (
          <div
            key={piece.id}
            data-testid={`piece-${piece.id}`}
            onClick={e => {
              e.stopPropagation();
              if (isEligibleCardTarget && onSelectPieceTarget) {
                onSelectPieceTarget(piece);
              } else {
                onSelectPiece(piece);
              }
            }}
            className={`absolute pointer-events-auto transition-all duration-300 ease-out flex flex-col items-center justify-center cursor-pointer select-none group ${
              isEligibleCardTarget ? 'scale-110 z-40' : ''
            }`}
            style={{
              left: `${x}px`,
              top: `${y}px`,
              width: `${cellSizePx}px`,
              height: `${cellSizePx}px`,
            }}
          >
            {/* Active Ball Glow Halo */}
            {piece.hasBall && (
              <div className="absolute -inset-2 rounded-full bg-amber-400/40 blur-md animate-pulse pointer-events-none" />
            )}

            {/* Active Debuff Crimson Warning Halo */}
            {hasDebuff && (
              <div className="absolute -inset-2 rounded-full bg-rose-500/35 blur-sm animate-pulse pointer-events-none ring-2 ring-rose-600" />
            )}

            {/* Active Positive Buff Emerald Halo */}
            {hasBuff && (
              <div className="absolute -inset-2 rounded-full bg-emerald-400/30 blur-sm animate-pulse pointer-events-none ring-2 ring-emerald-500" />
            )}

            {/* Selection Ring (Inked Golden / Blue) */}
            {isSelected && !isEligibleCardTarget && (
              <div className="absolute -inset-1 rounded-full border-2 border-dashed border-amber-600 animate-spin pointer-events-none" />
            )}

            {/* Active Card Targeting Reticle & Golden Glow Halo */}
            {isEligibleCardTarget && (
              <div className="absolute -inset-2 rounded-full border-3 border-amber-400 bg-amber-400/25 animate-pulse flex items-center justify-center pointer-events-none shadow-xl ring-2 ring-amber-500">
                <Crosshair className="w-5 h-5 text-amber-950 animate-spin opacity-95" />
              </div>
            )}

            {/* Target Reticle if Carrier is selected and this piece has NOT moved */}
            {isPotentialPassTarget && !isEligibleCardTarget && (
              <div className="absolute -inset-1.5 rounded-full border-2 border-amber-500 border-dashed animate-pulse pointer-events-none flex items-center justify-center">
                <Target className="w-4 h-4 text-amber-600 opacity-95 drop-shadow" />
              </div>
            )}

            {/* Main Hand-drawn Character Avatar */}
            <div className="relative w-8 h-8 sm:w-11 sm:h-11 flex items-center justify-center transition-transform duration-200 group-hover:scale-115">
              {renderCharacterIllustration()}

              {/* Single Clean Uniform ID Tag / Blocker / Captain Badge */}
              <div
                data-testid={`jersey-number-${piece.id}`}
                className={`absolute -top-2.5 px-1.5 py-0.2 rounded-md text-[8px] font-serif font-black border shadow-sm pointer-events-none z-30 whitespace-nowrap ${
                  isPlayer
                    ? piece.isCaptain
                      ? 'bg-blue-600 text-white border-blue-900 ring-1 ring-amber-400'
                      : isBlocker
                      ? 'bg-blue-700 text-white border-blue-950 ring-1 ring-cyan-300'
                      : 'bg-blue-100/95 text-blue-950 border-blue-800'
                    : piece.isCaptain
                    ? 'bg-red-600 text-white border-red-900 ring-1 ring-amber-400'
                    : isBlocker
                    ? 'bg-red-700 text-white border-red-950 ring-1 ring-rose-300'
                    : 'bg-rose-100/95 text-rose-950 border-rose-800'
                }`}
              >
                {getUniformLabel(piece.id, piece.isCaptain, isBlocker)}
              </div>

              {/* Rest Streak Badge */}
              {!piece.movedLastTurn && piece.restStreak > 0 && (
                <div
                  data-testid={`rest-badge-${piece.id}`}
                  title={`Compounding Rest: +${1 + piece.restStreak} regen/turn`}
                  className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded-full bg-amber-100 border border-amber-700 text-amber-900 text-[8px] font-serif font-black flex items-center gap-0.5 shadow-md z-30"
                >
                  <Flame className="w-2.5 h-2.5 text-amber-600" />
                  <span>+{1 + piece.restStreak}</span>
                </div>
              )}

              {/* Active Piece Buffs & Debuffs Badges */}
              {piece.buffs.length > 0 && (
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-0.5 pointer-events-none z-40 max-w-[80px]">
                  {piece.buffs.map((buff, bIdx) => {
                    const isDebuff = buff.type === 'CLAMP' || buff.type === 'DRAIN';
                    const label =
                      buff.type === 'SLOW_BURN'
                        ? `🔥 Burn (${buff.durationTurns}T)`
                        : buff.type === 'OVERCLOCK'
                        ? `⚡ Overclock`
                        : buff.type === 'ANCHOR'
                        ? `⚓ Anchor`
                        : buff.type === 'SCREEN'
                        ? `🛡️ Screen`
                        : buff.type === 'OVERLAP'
                        ? `🧬 Overlap`
                        : buff.type === 'CLAMP'
                        ? `🗜️ Clamp`
                        : buff.type === 'FULL_COURT_PRESS'
                        ? `🌐 Press`
                        : buff.type;

                    return (
                      <span
                        key={`${buff.id}-${bIdx}`}
                        data-testid={`buff-badge-${piece.id}-${buff.type.toLowerCase()}`}
                        title={`${buff.type} active for ${buff.durationTurns} turn(s)`}
                        className={`px-1 py-0.2 rounded text-[7.5px] font-serif font-black tracking-tight border shadow-md leading-none whitespace-nowrap animate-fadeIn ${
                          isDebuff
                            ? 'bg-rose-600 text-white border-rose-950 ring-1 ring-rose-300'
                            : 'bg-emerald-600 text-white border-emerald-950 ring-1 ring-emerald-300'
                        }`}
                      >
                        {label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card Direct-Target Callout Badge */}
            {isEligibleCardTarget && (
              <div className="absolute -top-5 px-1.5 py-0.2 rounded-md bg-amber-400 text-amber-950 font-serif font-black text-[8px] tracking-tight shadow-lg pointer-events-none whitespace-nowrap animate-bounce border border-amber-900 z-50 flex items-center gap-0.5">
                <Sparkles className="w-2.5 h-2.5 text-amber-900" />
                <span>CLICK TARGET</span>
              </div>
            )}

            {/* Pass Target Label Callout */}
            {isPotentialPassTarget && !isEligibleCardTarget && (
              <div className="absolute -top-4 px-1.5 py-0.2 rounded-md bg-amber-400 text-amber-950 font-serif font-black text-[8px] tracking-tight shadow-md pointer-events-none whitespace-nowrap animate-bounce border border-amber-800">
                READY CATCH
              </div>
            )}

            {/* Energy Bar (Vintage Sand & Ink Style) */}
            <div data-testid={`energy-gauge-${piece.id}`} className="w-8 sm:w-10 mt-0.5 flex flex-col items-center z-10">
              <div className="w-full bg-amber-950/40 rounded-full h-1.5 border border-amber-900/60 overflow-hidden shadow-inner">
                <div
                  className={`h-full transition-all duration-300 ${
                    energyPct > 50
                      ? 'bg-emerald-600'
                      : energyPct > 25
                      ? 'bg-amber-500'
                      : 'bg-rose-600'
                  }`}
                  style={{ width: `${energyPct}%` }}
                />
              </div>
              <span className="text-[8px] font-serif font-extrabold text-amber-950 leading-none mt-0.5 drop-shadow-sm">
                {piece.energy.toFixed(1)}e
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
