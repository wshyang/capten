import React from 'react';
import type { Piece, Cell, ThrowType, GameState } from '../engine/types';
import { previewThrow } from '../engine/interception';
import { calculateTotalThrowCost, THROW_CONFIG } from '../engine/config/throw';
import { soundEngine } from './TacticalAudio';
import { Shield, Crosshair, X, Sparkles } from 'lucide-react';

interface ThrowPlanningModalProps {
  state: GameState;
  thrower: Piece;
  targetPiece: Piece;
  targetCell: Cell;
  currentThrowType?: ThrowType;
  isOpen: boolean;
  onSelectThrowType: (type: ThrowType) => void;
  onCancel: () => void;
}

export const ThrowPlanningModal: React.FC<ThrowPlanningModalProps> = ({
  state,
  thrower,
  targetPiece,
  targetCell,
  currentThrowType = 'FLAT',
  isOpen,
  onSelectThrowType,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isRestart = !!state.isRestartPhase?.[thrower.side];
  const catcherHeight = targetPiece.height ?? (targetPiece.isCaptain ? THROW_CONFIG.captainHeight : 0);
  const distance = Math.hypot(targetCell.col - thrower.cell.col, targetCell.row - thrower.cell.row);

  const throwOptions: { type: ThrowType; label: string; loft: number; surcharge: number; desc: string; icon: string }[] = [
    {
      type: 'FLAT',
      label: 'Flat Ground Pass',
      loft: 0,
      surcharge: 0,
      desc: 'Fast line-drive ground throw. Best for ground receivers (h=0). Low relief over ground defenders.',
      icon: '⚡',
    },
    {
      type: 'LOB',
      label: 'Medium Lob',
      loft: 1,
      surcharge: THROW_CONFIG.lobCost,
      desc: 'Medium trajectory arc. 37.5% clear relief over ground blockers. Balanced catch rate (65%).',
      icon: '🏹',
    },
    {
      type: 'HIGH_LOB',
      label: 'High Arc Lob',
      loft: 2,
      surcharge: THROW_CONFIG.highLobCost,
      desc: 'High soaring arc. 75% clear relief over blockers. Perfect 100% catch rate for elevated Captain on stool!',
      icon: '🚀',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs animate-fadeIn font-serif">
      <div className="w-full max-w-xl parchment-card rounded-3xl p-5 sm:p-7 shadow-2xl border-4 border-[#5c3a1e] space-y-4 relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full wax-seal-gold flex items-center justify-center shadow-md">
              <Crosshair className="w-4 h-4 text-amber-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200 border border-amber-800 text-amber-950 px-2 py-0.5 rounded-full">
                  THROW-PLANNING RADAR (§5)
                </span>
                <span className="text-xs font-bold text-amber-900">Elevation & Loft Selector</span>
              </div>
              <h3 className="font-extrabold text-base sm:text-lg text-amber-950 tracking-tight">
                Targeting {targetPiece.isCaptain ? '★ Captain on Stool' : targetPiece.id.replace('p_', 'P').replace('ai_', 'A')}
              </h3>
            </div>
          </div>

          <button
            onClick={() => {
              soundEngine.playBlip(300, 0.05);
              onCancel();
            }}
            className="p-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 border border-amber-800 text-amber-950 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Catcher Elevation Banner */}
        <div className="p-3 rounded-2xl bg-amber-100/90 border-2 border-amber-700 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-amber-950">
            <Shield className="w-4 h-4 text-blue-800 flex-shrink-0" />
            <span>
              <strong>Receiver Elevation:</strong> Height <strong>{catcherHeight}</strong> ({catcherHeight >= 2 ? 'Elevated on Wooden Stool' : 'Ground Level Runner'})
            </span>
          </div>
          <div className="text-[11px] font-mono font-black text-blue-900 bg-blue-100 px-2 py-0.5 rounded-md border border-blue-700">
            Thrower Energy: {thrower.energy.toFixed(1)}e (Pre-Throw)
          </div>
        </div>

        {/* 3 Interactive Throw Options */}
        <div className="grid grid-cols-1 gap-2.5">
          {throwOptions.map(opt => {
            const preview = previewThrow(
              thrower,
              targetCell,
              state.pieces,
              state.controlMap,
              state.temporaryState,
              state.plannedMoves,
              isRestart,
              opt.type
            );

            const totalCost = calculateTotalThrowCost(thrower.cell, targetCell, opt.type, THROW_CONFIG);
            const canAfford = thrower.energy >= totalCost - 0.001;
            const isSelected = currentThrowType === opt.type;
            const catchPct = Math.round(preview.catchRate * 100);
            const riskPct = Math.round(preview.cumulativeCaptureRisk * 100);
            const reliefPct = Math.round(preview.clearRelief * 100);

            return (
              <div
                key={opt.type}
                onClick={() => {
                  if (!canAfford) return;
                  soundEngine.playPassWhoosh();
                  onSelectThrowType(opt.type);
                }}
                className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer shadow-sm ${
                  !canAfford
                    ? 'bg-stone-200/60 border-stone-400 opacity-60 cursor-not-allowed'
                    : isSelected
                    ? 'bg-amber-100 border-amber-800 ring-2 ring-amber-600 shadow-md scale-[1.01]'
                    : 'bg-amber-50/80 hover:bg-amber-100/90 border-amber-700/60'
                }`}
              >
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{opt.icon}</span>
                    <span className="font-black text-sm text-amber-950">{opt.label}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-200 border border-amber-800 text-amber-950">
                      Loft L = {opt.loft}
                    </span>
                    {!canAfford && (
                      <span className="text-[10px] font-black bg-rose-200 text-rose-950 px-1.5 py-0.2 rounded border border-rose-700">
                        Insufficient Energy
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-900 leading-snug">{opt.desc}</p>

                  <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-950 border border-emerald-700 font-bold">
                      Catch Reliability: <strong>{catchPct}%</strong>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-950 border border-blue-700 font-bold">
                      Clear Relief: <strong>{reliefPct}%</strong>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 border border-amber-800 font-bold">
                      Capture Risk: <strong>{preview.isClean ? '0% (Clean)' : `${riskPct}%`}</strong>
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="text-xs font-black text-amber-950 font-mono">
                    Total: <strong className="text-sm text-blue-950">{totalCost.toFixed(1)}e</strong>
                  </div>
                  <span className="text-[10px] text-amber-800">
                    ({(distance / 3.0).toFixed(1)}e dist {opt.surcharge > 0 ? `+ ${opt.surcharge}e loft` : '+ 0e'})
                  </span>

                  <button
                    disabled={!canAfford}
                    className={`py-1 px-3 rounded-xl text-xs font-black border transition-all mt-1 ${
                      !canAfford
                        ? 'bg-stone-300 text-stone-600 border-stone-400 cursor-not-allowed'
                        : isSelected
                        ? 'bg-amber-600 text-white border-amber-950 shadow-sm'
                        : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-950 shadow-sm active:scale-95'
                    }`}
                  >
                    {isSelected ? '✓ Selected' : 'Select'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tactical Guidance Footer */}
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-700/40 text-[11px] text-amber-950 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-700 flex-shrink-0" />
            <span>
              <strong>Captain&apos;s Pro Tip:</strong> High Lob clears ground blockers at 75% relief and guarantees 100% catch rate on the elevated stool!
            </span>
          </div>
          <button
            onClick={onCancel}
            className="text-xs font-bold text-amber-900 hover:text-amber-950 underline flex-shrink-0 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
