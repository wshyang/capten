import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { GameState, Piece, Cell, ThrowPreviewData, Card, ThrowType } from '../engine/types';
import { ControlShading } from './ControlShading';
import { PieceLayer } from './PieceLayer';
import { ThrowPreview } from './ThrowPreview';
import { ThrowPlanningModal } from './ThrowPlanningModal';
import { getReachableCells } from '../engine/movement';
import { previewThrow } from '../engine/interception';
import { areCellsEqual, BOARD_CONFIG } from '../engine/config/board';
import { soundEngine } from './TacticalAudio';
import { Sparkles, Send, AlertTriangle, RotateCcw, Crosshair, X, Compass } from 'lucide-react';
import {
  PirateFlagIllustration,
  TreasureMapScrollIllustration,
  TreasureChestIllustration,
  OceanWavesIllustration,
  MarinerCompassIllustration,
} from './HandDrawnIllustrations';

interface BoardProps {
  state: GameState;
  targetingCard?: Card | null;
  onCancelTargeting?: () => void;
  onPlayTargetedCard?: (cardId: string, targetPieceId?: string, targetCell?: Cell) => void;
  onStageMove: (pieceId: string, destCell: Cell) => void;
  onUnstageMove: (pieceId: string) => void;
  onStageThrow: (targetPieceId: string, targetCell: Cell, throwType?: ThrowType) => void;
  onUnstageThrow: () => void;
  disabled?: boolean;
}

export const Board: React.FC<BoardProps> = ({
  state,
  targetingCard = null,
  onCancelTargeting,
  onPlayTargetedCard,
  onStageMove,
  onUnstageMove,
  onStageThrow,
  onUnstageThrow,
  disabled = false,
}) => {
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [baitSelectedEnemyId, setBaitSelectedEnemyId] = useState<string | null>(null);
  const [planningThrowTarget, setPlanningThrowTarget] = useState<{ targetPiece: Piece; targetCell: Cell } | null>(null);
  const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);
  const [throwPreview, setThrowPreview] = useState<ThrowPreviewData | null>(null);
  const [cellSizePx, setCellSizePx] = useState<number>(46);
  const containerRef = useRef<HTMLDivElement>(null);

  const cols = state.config.board.cols || 11;
  const rows = state.config.board.rows || 11;

  useEffect(() => {
    if (!targetingCard || targetingCard.id !== 'bait') {
      setBaitSelectedEnemyId(null);
    }
  }, [targetingCard]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        const calculated = Math.max(30, Math.min(56, Math.floor((width - 64) / cols)));
        setCellSizePx(calculated);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [cols]);

  const selectedPiece = state.pieces.find(p => p.id === selectedPieceId && p.side === 'PLAYER');
  const ballCarrier = state.pieces.find(p => p.side === 'PLAYER' && p.hasBall);

  // Automatically deselect piece and clear throw previews whenever it is not the player planning phase
  useEffect(() => {
    if (state.phase !== 'PLAYER_PLAN') {
      setSelectedPieceId(null);
      setPlanningThrowTarget(null);
      setThrowPreview(null);
    }
  }, [state.phase, state.turn]);

  // Reachable cells for the selected piece (filtering out cells already claimed by other staged moves)
  const reachableCells = selectedPiece && selectedPiece.side === 'PLAYER' && !selectedPiece.hasBall
    ? getReachableCells(
        selectedPiece,
        state.pieces,
        state.temporaryState,
        cols,
        rows,
        state.config.board.carrierMayPivotStep,
        state.plannedMoves
      )
    : [];

  // Filter eligible pass targets:
  // Stationary pieces OR pieces with a staged 1-step move (dist <= 1.42 cells)
  const playerTeammates = useMemo(() => state.pieces.filter(
    p => p.side === 'PLAYER' &&
      (!ballCarrier || p.id !== ballCarrier.id) &&
      !p.movedLastTurn &&
      (() => {
        const staged = state.plannedMoves.find(m => m.pieceId === p.id);
        if (!staged) return true;
        const dCol = Math.abs(staged.destCell.col - p.cell.col);
        const dRow = Math.abs(staged.destCell.row - p.cell.row);
        const dist = Math.hypot(staged.destCell.col - p.cell.col, staged.destCell.row - p.cell.row);
        return dCol <= 1 && dRow <= 1 && dist <= 1.42;
      })()
  ), [state.pieces, state.plannedMoves, ballCarrier]);

  useEffect(() => {
    if (ballCarrier && ballCarrier.side === 'PLAYER' && hoveredCell) {
      const targetTeammate = playerTeammates.find(
        p => areCellsEqual(p.cell, hoveredCell) || state.plannedMoves.some(m => m.pieceId === p.id && areCellsEqual(m.destCell, hoveredCell))
      );
      if (targetTeammate) {
        const staged = state.plannedMoves.find(m => m.pieceId === targetTeammate.id);
        const effectiveCell = staged ? staged.destCell : targetTeammate.cell;
        const isRestart = !!state.isRestartPhase?.[ballCarrier.side];
        const preview = previewThrow(
          ballCarrier,
          effectiveCell,
          state.pieces,
          state.controlMap,
          state.temporaryState,
          state.plannedMoves,
          isRestart
        );
        setThrowPreview(preview);
        return;
      }
    }
    setThrowPreview(null);
  }, [ballCarrier, hoveredCell, state.pieces, state.controlMap, state.temporaryState, state.plannedMoves, playerTeammates, state.isRestartPhase]);

  // Unified active throw preview (shown only during throw planning: hovering teammate or selecting loft in modal)
  const activeThrowPreview: ThrowPreviewData | null = useMemo(() => {
    if (throwPreview) return throwPreview;
    if (planningThrowTarget && ballCarrier) {
      const isRestart = !!state.isRestartPhase?.[ballCarrier.side];
      return previewThrow(
        ballCarrier,
        planningThrowTarget.targetCell,
        state.pieces,
        state.controlMap,
        state.temporaryState,
        state.plannedMoves,
        isRestart,
        state.plannedThrow?.throwType || 'FLAT'
      );
    }
    return null;
  }, [throwPreview, planningThrowTarget, state.plannedThrow, ballCarrier, state.pieces, state.controlMap, state.temporaryState, state.plannedMoves, state.isRestartPhase]);

  // Adjacent legal empty cells (1 step: orthogonal or diagonal, <=1.42 dist) around selected enemy for Bait card
  const baitSelectedEnemy = baitSelectedEnemyId ? state.pieces.find(p => p.id === baitSelectedEnemyId) : null;
  const baitAdjacentCells: Cell[] = [];
  if (targetingCard?.id === 'bait' && baitSelectedEnemy) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) continue;
        const c = baitSelectedEnemy.cell.col + dc;
        const r = baitSelectedEnemy.cell.row + dr;
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          const candidate: Cell = { col: c, row: r };
          const isOccupied = state.pieces.some(p => areCellsEqual(p.cell, candidate));
          if (!isOccupied) {
            baitAdjacentCells.push(candidate);
          }
        }
      }
    }
  }

  const handleCellClick = (cell: Cell) => {
    if (disabled || state.phase !== 'PLAYER_PLAN' || state.timer.isExpired) return;

    // 0a. Bait Card Step 2: Clicking an adjacent highlighted destination cell to bait the selected enemy
    if (targetingCard?.id === 'bait' && baitSelectedEnemyId && onPlayTargetedCard) {
      const isAdjacentBait = baitAdjacentCells.some(bc => areCellsEqual(bc, cell));
      if (isAdjacentBait) {
        soundEngine.playCardChime();
        onPlayTargetedCard('bait', baitSelectedEnemyId, cell);
        setBaitSelectedEnemyId(null);
        return;
      }
    }

    // 0b. Direct Card Cell Targeting (e.g. Jam the Lane)
    if (targetingCard && targetingCard.targetType === 'CELL' && onPlayTargetedCard) {
      soundEngine.playCardChime();
      onPlayTargetedCard(targetingCard.id, undefined, cell);
      return;
    }

    // 1. If friendly ball carrier is selected, clicking on an eligible teammate (or their staged cell) opens THROW-PLANNING RADAR!
    if (selectedPiece && selectedPiece.side === 'PLAYER' && selectedPiece.hasBall) {
      const targetPiece = playerTeammates.find(
        p => areCellsEqual(p.cell, cell) || state.plannedMoves.some(m => m.pieceId === p.id && areCellsEqual(m.destCell, cell))
      );
      if (targetPiece) {
        soundEngine.playBlip(520, 0.06);
        const staged = state.plannedMoves.find(m => m.pieceId === targetPiece.id);
        const effectiveDest = staged ? staged.destCell : targetPiece.cell;
        setPlanningThrowTarget({ targetPiece, targetCell: effectiveDest });
        return;
      }
    }

    // 2. Stage Move: Clicking a reachable empty cell stages a move with ghost shadow and vector arrow
    if (selectedPiece && selectedPiece.side === 'PLAYER' && !selectedPiece.hasBall) {
      const isAlreadyStagedByOther = state.plannedMoves.some(
        m => m.pieceId !== selectedPiece.id && areCellsEqual(m.destCell, cell)
      );
      if (isAlreadyStagedByOther) {
        soundEngine.playBlip(260, 0.04);
        return;
      }
      const reachable = reachableCells.find(r => areCellsEqual(r.cell, cell));
      if (reachable) {
        soundEngine.playBlip(540, 0.08);
        onStageMove(selectedPiece.id, cell);
        setSelectedPieceId(null);
        return;
      }
    }

    // 3. Clicking on an empty cell deselects
    const clickedPiece = state.pieces.find(p => areCellsEqual(p.cell, cell));
    if (!clickedPiece) {
      setSelectedPieceId(null);
    }
  };

  const handlePieceTargetClick = (piece: Piece) => {
    if (targetingCard && onPlayTargetedCard) {
      if (targetingCard.id === 'bait') {
        if (piece.side === 'AI') {
          soundEngine.playBlip(560, 0.08);
          setBaitSelectedEnemyId(piece.id);
          return;
        }
      }
      soundEngine.playCardChime();
      onPlayTargetedCard(targetingCard.id, piece.id);
    }
  };

  const handleSelectPiece = (piece: Piece) => {
    if (disabled || state.phase !== 'PLAYER_PLAN' || state.timer.isExpired) return;

    // 0. Direct Card Targeting on Piece Click
    if (targetingCard && onPlayTargetedCard) {
      const isPlayer = piece.side === 'PLAYER';
      if (targetingCard.id === 'bait') {
        if (!isPlayer) {
          soundEngine.playBlip(560, 0.08);
          setBaitSelectedEnemyId(piece.id);
          return;
        }
      }

      const isEligible =
        ((targetingCard.targetType === 'FRIENDLY_PIECE' || targetingCard.targetType === 'TWO_FRIENDLY') && isPlayer) ||
        (targetingCard.targetType === 'ENEMY_PIECE' && !isPlayer);

      if (isEligible) {
        soundEngine.playCardChime();
        onPlayTargetedCard(targetingCard.id, piece.id);
        return;
      }
    }

    // A player may NEVER select an enemy piece as an active thrower or mover
    if (!targetingCard && piece.side !== 'PLAYER') {
      soundEngine.playBlip(260, 0.04);
      return;
    }

    // If friendly ball carrier is selected and clicking on an eligible teammate -> OPEN THROW-PLANNING RADAR!
    if (selectedPiece && selectedPiece.side === 'PLAYER' && selectedPiece.hasBall && piece.side === 'PLAYER' && piece.id !== selectedPiece.id) {
      const staged = state.plannedMoves.find(m => m.pieceId === piece.id);
      const dCol = staged ? Math.abs(staged.destCell.col - piece.cell.col) : 0;
      const dRow = staged ? Math.abs(staged.destCell.row - piece.cell.row) : 0;
      const moveDist = staged ? Math.hypot(staged.destCell.col - piece.cell.col, staged.destCell.row - piece.cell.row) : 0;
      const isEligible = !piece.movedLastTurn && dCol <= 1 && dRow <= 1 && moveDist <= 1.42;

      if (isEligible) {
        soundEngine.playBlip(520, 0.06);
        const effectiveDest = staged ? staged.destCell : piece.cell;
        setPlanningThrowTarget({ targetPiece: piece, targetCell: effectiveDest });
        return;
      }
    }

    soundEngine.playBlip(480, 0.05);
    if (selectedPieceId === piece.id) {
      setSelectedPieceId(null);
    } else {
      setSelectedPieceId(piece.id);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full flex flex-col items-center justify-center p-3 sm:p-5 rounded-3xl relative overflow-hidden hand-drawn-court"
    >
      {/* Decorative Hand-Drawn Framing Elements matching image.png */}
      <div className="absolute top-1 left-1 pointer-events-none opacity-90 hidden sm:block z-0">
        <PirateFlagIllustration className="w-20 h-20 sm:w-24 sm:h-24" />
      </div>

      <div className="absolute top-1 right-1 pointer-events-none opacity-90 hidden sm:block z-0">
        <TreasureMapScrollIllustration className="w-20 h-20 sm:w-24 sm:h-24" />
      </div>

      <div className="absolute bottom-1 left-1 pointer-events-none opacity-90 hidden sm:block z-0">
        <TreasureChestIllustration className="w-24 h-24 sm:w-28 sm:h-28" />
      </div>

      <div className="absolute bottom-1 right-1 pointer-events-none opacity-90 hidden sm:block z-0">
        <MarinerCompassIllustration className="w-20 h-20 sm:w-24 sm:h-24" />
      </div>

      {/* Dedicated Reserved Status & Tactical Action Toolbar Slot (Prevents Layout Shifts & Obscuring Flag/Map) */}
      <div className="w-full min-h-[76px] flex flex-col justify-end mb-3 z-20">
        {/* Active In-UI Card Targeting Banner */}
        {targetingCard ? (
          <div className="w-full p-3 rounded-2xl bg-amber-200 border-2 border-amber-800 shadow-xl text-amber-950 text-xs font-serif flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-amber-900 animate-spin" />
              <div>
                <span className="font-black">PLAYING CARD: {targetingCard.name} — </span>
                <span className="text-amber-900">
                  {targetingCard.id === 'bait'
                    ? !baitSelectedEnemyId
                      ? 'Step 1: Click an enemy Pirate piece (A1–A5 or Captain) on the court to bait'
                      : `Step 2: Now click any highlighted adjacent cell (1 step) to pull ${baitSelectedEnemy?.isCaptain ? '★ AI Captain' : baitSelectedEnemy?.id.replace('ai_', 'A')}!`
                    : targetingCard.targetType === 'CELL'
                    ? 'Click any cell on the court to trigger this card effect'
                    : targetingCard.targetType === 'ENEMY_PIECE'
                    ? 'Click any enemy Pirate piece (P1–P5 or Captain) on the court'
                    : 'Click any friendly Player piece (P1–P5 or Captain) on the court'}
                </span>
              </div>
            </div>
            {onCancelTargeting && (
              <button
                onClick={() => {
                  setBaitSelectedEnemyId(null);
                  onCancelTargeting();
                }}
                className="py-1 px-2.5 rounded-xl bg-amber-300 hover:bg-amber-400 text-amber-950 font-bold border border-amber-800 flex items-center gap-1 shadow-sm transition-all cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>
        ) : state.timer.isExpired ? (
          /* Timer Expired Notice */
          <div className="w-full p-3 rounded-xl bg-rose-100 border-2 border-rose-600 shadow-md text-rose-950 text-xs font-serif flex items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 animate-bounce" />
              <span className="font-extrabold">PLANNING TIME EXPIRED — Actions locked. Click &quot;Commit & End Player Turn&quot; below.</span>
            </div>
          </div>
        ) : state.isRestartPhase?.PLAYER && ballCarrier && ballCarrier.side === 'PLAYER' ? (
          /* Baseline Restart Mandatory Court Pass Notice */
          <div className="w-full p-3.5 rounded-2xl bg-amber-100 border-2 border-amber-700 shadow-md text-amber-950 text-xs font-serif flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-700 animate-pulse" />
              <div>
                <span className="font-black text-amber-950">BASELINE RESTART (Mandatory Midfield Phase): </span>
                <span className="text-amber-900">
                  You must complete at least <strong>1 pass to an active court player (P1–P5)</strong> before throwing to the Captain. (Inbound pass is protected against interceptions).
                </span>
              </div>
            </div>
            <span className="text-[10px] font-black bg-amber-200 border border-amber-800 text-amber-950 px-2 py-0.5 rounded-full whitespace-nowrap">
              Captain Locked on Restart
            </span>
          </div>
        ) : selectedPiece && selectedPiece.hasBall ? (
          /* Selected Piece Status & Throw Action Toolbar */
          <div
            data-testid="throw-action-toolbar"
            className="w-full p-3 rounded-2xl bg-amber-100/95 border-2 border-amber-600 shadow-lg text-amber-950 text-xs font-serif flex flex-col sm:flex-row items-center justify-between gap-3 animate-fadeIn"
          >
            <div className="flex items-center gap-2">
              <Send className="w-4 h-4 text-amber-700 animate-bounce" />
              <div>
                <span className="font-black">BALL CARRIER ACTIVE: </span>
                <span className="text-amber-900">
                  {state.isRestartPhase?.PLAYER
                    ? 'Select a court player (P1–P5) to execute mandatory restart pass'
                    : 'Select stationary or 1-step moving teammate to stage pass'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {playerTeammates.map(teammate => {
                const staged = state.plannedMoves.find(m => m.pieceId === teammate.id);
                const effectiveCell = staged ? staged.destCell : teammate.cell;
                const isLockedCaptain = teammate.isCaptain && state.isRestartPhase?.PLAYER;
                const preview = previewThrow(
                  selectedPiece,
                  effectiveCell,
                  state.pieces,
                  state.controlMap,
                  state.temporaryState,
                  state.plannedMoves
                );
                const risk = state.isRestartPhase?.PLAYER ? 0 : Math.round(preview.cumulativeCaptureRisk * 100);
                const isStaged = state.plannedThrow?.targetPieceId === teammate.id;

                return (
                  <button
                    key={teammate.id}
                    data-testid={`stage-throw-btn-${teammate.id}`}
                    disabled={state.timer.isExpired || isLockedCaptain}
                    title={isLockedCaptain ? 'Direct pass to Captain is forbidden on baseline restart. Complete at least 1 pass to a court player first.' : undefined}
                    onClick={() => {
                      if (isLockedCaptain) return;
                      soundEngine.playPassWhoosh();
                      const chosenLoft = teammate.isCaptain ? 'HIGH_LOB' : 'FLAT';
                      onStageThrow(teammate.id, effectiveCell, chosenLoft);
                      setSelectedPieceId(null);
                      setThrowPreview(null);
                    }}
                    className={`py-1.5 px-3 rounded-xl text-xs font-serif font-extrabold flex items-center gap-1.5 shadow-md transition-all active:scale-95 border-2 ${
                      isLockedCaptain
                        ? 'bg-stone-200 text-stone-500 border-stone-400 cursor-not-allowed opacity-75'
                        : isStaged
                        ? 'bg-amber-400 text-amber-950 border-amber-800 ring-2 ring-amber-500'
                        : preview.isClean || state.isRestartPhase?.PLAYER
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-800'
                        : 'bg-amber-500 hover:bg-amber-400 text-amber-950 border-amber-800'
                    }`}
                  >
                    <span>{teammate.isCaptain ? (isLockedCaptain ? '🔒 Captain (Locked)' : '★ Captain (5,10)') : teammate.id.replace('p_', 'P')}</span>
                    {staged && <span className="text-[9px] bg-blue-700 text-white px-1 py-0.2 rounded font-sans">1-Step Cut</span>}
                    <span className="text-[10px] font-sans opacity-95">
                      {isLockedCaptain ? 'Midfield Pass Req.' : state.isRestartPhase?.PLAYER ? '⚡Free Restart Pass' : preview.isClean ? '⚡Clean' : `${risk}% risk`}
                    </span>
                  </button>
                );
              })}
              {playerTeammates.length === 0 && (
                <span className="text-rose-700 font-bold text-[11px]">
                  No eligible teammates in receiving range (moved &gt; 1 cell)
                </span>
              )}
            </div>
          </div>
        ) : selectedPiece && !selectedPiece.hasBall && selectedPiece.side === 'PLAYER' ? (
          /* Selected Mobile Piece Status Notice */
          <div className="w-full px-4 py-2.5 rounded-xl bg-blue-100/90 border-2 border-blue-600 shadow text-blue-950 text-xs font-serif flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-ping" />
              <span>
                <strong>{selectedPiece.id.replace('p_', 'P.')}</strong> Selected • Energy: <strong>{selectedPiece.energy.toFixed(1)}e</strong> (Click highlighted cell to stage path)
              </span>
            </div>
            <span className="text-[10px] font-bold text-blue-800">Moves resolve when turn commits</span>
          </div>
        ) : (() => {
          const temp = state.temporaryState;
          const activeBuffs: { label: string; icon: string; desc: string; isAi?: boolean }[] = [];

          if (temp.insuranceActive?.PLAYER) activeBuffs.push({ label: 'Insurance', icon: '🛡️', desc: 'Next throw retained if intercepted' });
          if (temp.threadedPassActive?.PLAYER) activeBuffs.push({ label: 'Threaded Pass', icon: '🎯', desc: 'Next throw ignores 1st enemy AoC cell' });
          if (temp.steadyHandsActive?.PLAYER) activeBuffs.push({ label: 'Steady Hands', icon: '🧤', desc: '+50% effective throw energy' });
          if (temp.longBombActive?.PLAYER) activeBuffs.push({ label: 'Long Bomb', icon: '🚀', desc: '2x throw range / half cost' });
          if (temp.noLookPassActive?.PLAYER) activeBuffs.push({ label: 'No-Look Pass', icon: '🔮', desc: '100% clean throw (<=4.5 dist)' });
          if (temp.setThePlayActive?.PLAYER) activeBuffs.push({ label: 'Set the Play', icon: '📐', desc: '-0.8e move cost across all court players' });
          if (temp.teamEnergyInterceptionBoost?.side === 'PLAYER') activeBuffs.push({ label: 'Rally', icon: '🚩', desc: '+25% team interception rolls' });
          if (temp.negateDebuff?.PLAYER) activeBuffs.push({ label: 'Ice in the Veins', icon: '❄️', desc: 'Next debuff negated' });
          if (temp.giveAndGoAvailablePieceId) activeBuffs.push({ label: 'Give-and-Go', icon: '🏃', desc: 'Free 1-cell move available after pass' });
          if (temp.extraControlCell) activeBuffs.push({ label: 'Jam the Lane', icon: '🗜️', desc: `Artificial AoC at (${temp.extraControlCell.cell.col}, ${temp.extraControlCell.cell.row})` });

          if (activeBuffs.length > 0) {
            return (
              <div
                data-testid="active-tactical-buffs-bar"
                className="w-full p-2.5 rounded-2xl bg-amber-100/95 border-2 border-amber-700/80 shadow-md text-amber-950 text-xs font-serif flex flex-wrap items-center justify-between gap-2 animate-fadeIn"
              >
                <div className="flex items-center gap-1.5 font-black text-amber-950">
                  <Sparkles className="w-4 h-4 text-amber-700 animate-pulse" />
                  <span>ACTIVE TACTICAL BUFFS:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeBuffs.map((b, idx) => (
                    <span
                      key={idx}
                      title={b.desc}
                      data-testid={`active-buff-${b.label.toLowerCase().replace(/\s+/g, '-')}`}
                      className="px-2 py-0.5 rounded-lg bg-amber-200 border border-amber-800 text-amber-950 font-serif font-black text-[10px] flex items-center gap-1 shadow-sm"
                    >
                      <span>{b.icon}</span>
                      <span>{b.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          }

          /* Default Stable Status Placeholder (Keeps Canvas Anchored & Never Obscures Flag/Map) */
          return (
            <div className="w-full px-4 py-2.5 rounded-2xl bg-amber-100/60 border border-[#8b5a2b]/30 shadow-xs text-amber-950/80 text-xs font-serif flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-800" />
                <span className="font-bold">
                  TACTICAL SAND COURT • {state.phase === 'PLAYER_PLAN' ? 'Click piece to stage cut, or carrier to stage pass' : 'Reviewing AI planned formation'}
                </span>
              </div>
              <span className="text-[10px] text-amber-900 font-mono font-bold">11×11 Grid</span>
            </div>
          );
        })()}
      </div>

      {/* Main 11x11 Cartoon Hand-drawn Grid Canvas (overflow-visible allows floating badges and captain crests to display unclipped) */}
      <div
        data-testid="court-grid"
        className="relative border-4 border-[#5c3a1e] rounded-2xl shadow-2xl bg-[#faedcd] z-10"
        style={{
          width: `${cols * cellSizePx}px`,
          height: `${rows * cellSizePx}px`,
          boxShadow: '0 10px 30px rgba(44, 24, 16, 0.4), inset 0 0 30px rgba(180, 130, 70, 0.25)',
        }}
      >
        {/* AI Captain Stool Circle (Red Dashed Target Rings r=1.5 & r=2.5) */}
        <div
          className="absolute rounded-full border-2 border-dashed border-red-600/70 pointer-events-none animate-pulse"
          style={{
            left: `${(BOARD_CONFIG.aiScoringCell.col + 0.5 - 1.5) * cellSizePx}px`,
            top: `${(BOARD_CONFIG.aiScoringCell.row + 0.5 - 1.5) * cellSizePx}px`,
            width: `${3 * cellSizePx}px`,
            height: `${3 * cellSizePx}px`,
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
          }}
        />

        {/* Player Captain Stool Circle (Blue Dashed Target Rings r=1.5 & r=2.5) */}
        <div
          className="absolute rounded-full border-2 border-dashed border-blue-600/70 pointer-events-none animate-pulse"
          style={{
            left: `${(BOARD_CONFIG.playerScoringCell.col + 0.5 - 1.5) * cellSizePx}px`,
            top: `${(BOARD_CONFIG.playerScoringCell.row + 0.5 - 1.5) * cellSizePx}px`,
            width: `${3 * cellSizePx}px`,
            height: `${3 * cellSizePx}px`,
            backgroundColor: 'rgba(37, 99, 235, 0.08)',
          }}
        />

        {/* Area of Control Concentric Watercolor Bleed & Shading */}
        <ControlShading controlMap={state.controlMap} cols={cols} rows={rows} />

        {/* Throw Flight Vector & Golden Ball Animation */}
        {activeThrowPreview && (
          <ThrowPreview preview={activeThrowPreview} cellSizePx={cellSizePx} />
        )}

        {/* 11x11 Inked Grid Cells */}
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, ${cellSizePx}px)`,
            gridTemplateRows: `repeat(${rows}, ${cellSizePx}px)`,
          }}
        >
          {Array.from({ length: rows }).map((_, r) =>
            Array.from({ length: cols }).map((_, c) => {
              const currentCell: Cell = { col: c, row: r };
              const isCenter = c === 5 && r === 5;
              const isReachable = reachableCells.find(reach => areCellsEqual(reach.cell, currentCell));
              const isBaitTarget = baitAdjacentCells.some(bc => areCellsEqual(bc, currentCell));

              const interceptCheckCell = activeThrowPreview?.pathCells.find(p =>
                areCellsEqual(p.cell, currentCell)
              );
              const interceptProb = interceptCheckCell ? interceptCheckCell.captureProbability : 0;
              const throwPathAlpha = interceptCheckCell
                ? Math.min(0.55, Math.max(0.12, interceptProb * 0.65 + 0.12))
                : 0;

              return (
                <div
                  key={`${c}-${r}`}
                  data-testid={`court-cell-${c}-${r}`}
                  onClick={() => handleCellClick(currentCell)}
                  onMouseEnter={() => setHoveredCell(currentCell)}
                  onMouseLeave={() => setHoveredCell(null)}
                  className={`relative border border-[#a47148]/40 transition-colors duration-150 flex items-center justify-center cursor-pointer select-none ${
                    isBaitTarget
                      ? 'bg-amber-400/60 border-amber-800 ring-2 ring-amber-600 animate-pulse hover:bg-amber-400/80 cursor-pointer z-10'
                      : isReachable
                      ? 'bg-blue-400/35 border-blue-700/80 hover:bg-blue-400/50 animate-pulse'
                      : isCenter
                      ? 'bg-amber-200/40'
                      : 'hover:bg-amber-100/50'
                  }`}
                >
                  {(c === 0 || r === 0) && (
                    <span className="absolute top-0.5 left-0.5 text-[8px] font-serif text-amber-900 opacity-60">
                      {c},{r}
                    </span>
                  )}

                  {isCenter && (
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-800/50 pointer-events-none" />
                  )}

                  {/* Trajectory Cell Interception Shading Indicator */}
                  {interceptCheckCell && (
                    <div
                      data-testid={`throw-path-cell-${c}-${r}`}
                      className="absolute inset-0 pointer-events-none z-0 transition-colors duration-200 rounded-lg animate-fadeIn"
                      style={{
                        backgroundColor: `rgba(190, 18, 60, ${throwPathAlpha})`,
                      }}
                    />
                  )}

                  {isBaitTarget && (
                    <div className="px-1.5 py-0.2 rounded-md bg-amber-700 text-white font-serif text-[9px] font-black shadow-md pointer-events-none border border-amber-950 animate-bounce">
                      Bait Here
                    </div>
                  )}

                  {isReachable && !isBaitTarget && (
                    <div className="px-1.5 py-0.2 rounded-md bg-blue-700 text-white font-serif text-[9px] font-black shadow-md pointer-events-none border border-blue-900">
                      -{isReachable.cost.toFixed(1)}e
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Hand-drawn Character Pieces, Staged Vectors & Stools */}
        <PieceLayer
          pieces={state.pieces}
          plannedMoves={state.plannedMoves}
          plannedThrow={state.plannedThrow}
          aiPlannedActions={state.aiPlannedActions}
          selectedPieceId={selectedPieceId}
          ballCarrierId={ballCarrier ? ballCarrier.id : null}
          targetingCard={targetingCard}
          onSelectPiece={handleSelectPiece}
          onSelectPieceTarget={handlePieceTargetClick}
          cellSizePx={cellSizePx}
        />
      </div>

      {/* Staged Formations & Planned Actions Management Bar */}
      {(state.plannedMoves.length > 0 || state.plannedThrow || (state.plannedCards && state.plannedCards.length > 0)) && (
        <div className="w-full mt-3 p-3 bg-amber-100/90 border-2 border-amber-700 rounded-2xl flex flex-wrap items-center justify-between gap-2 shadow-lg animate-fadeIn z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-700 animate-pulse" />
            <span className="text-xs font-serif font-bold text-amber-950">
              STAGED: {state.plannedMoves.length} MOVE(S) {state.plannedThrow ? '+ 1 THROW VECTOR' : ''} {state.plannedCards && state.plannedCards.length > 0 ? `+ ${state.plannedCards.length} CARD(S)` : ''} (Resolves when turn is committed)
            </span>
          </div>

          <div className="flex gap-2">
            {state.plannedThrow && (
              <button
                onClick={onUnstageThrow}
                className="py-1 px-3 rounded-xl border-2 border-amber-800 text-xs font-serif font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 flex items-center gap-1 shadow-sm transition-all cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Cancel Throw</span>
              </button>
            )}
            {state.plannedMoves.length > 0 && (
              <button
                onClick={() => onUnstageMove(state.plannedMoves[state.plannedMoves.length - 1].pieceId)}
                className="py-1 px-3 rounded-xl border-2 border-amber-800 text-xs font-serif font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 flex items-center gap-1 shadow-sm transition-all cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Undo Last Move</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hand-drawn Ocean Wave Graphic at the Bottom of Court matching image.png */}
      <div className="w-full mt-3 rounded-xl overflow-hidden border-2 border-[#5c3a1e] shadow-md z-10">
        <OceanWavesIllustration className="w-full h-12 sm:h-14" />
      </div>

      {/* Throw-Planning Radar Modal (§5: Loft & Elevation Selection) */}
      {planningThrowTarget && selectedPiece && (
        <ThrowPlanningModal
          state={state}
          thrower={selectedPiece}
          targetPiece={planningThrowTarget.targetPiece}
          targetCell={planningThrowTarget.targetCell}
          currentThrowType={state.plannedThrow?.throwType || 'FLAT'}
          isOpen={true}
          onSelectThrowType={type => {
            soundEngine.playPassWhoosh();
            onStageThrow(planningThrowTarget.targetPiece.id, planningThrowTarget.targetCell, type);
            setPlanningThrowTarget(null);
            setSelectedPieceId(null);
            setThrowPreview(null);
          }}
          onCancel={() => setPlanningThrowTarget(null)}
        />
      )}
    </div>
  );
};
