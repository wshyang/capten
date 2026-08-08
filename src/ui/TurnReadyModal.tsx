import React, { useEffect } from 'react';
import type { GameState } from '../engine/types';
import { soundEngine } from './TacticalAudio';
import { Play, Zap, Target, ArrowRight } from 'lucide-react';

interface TurnReadyModalProps {
  state: GameState;
  onStartPlanning: () => void;
}

export const TurnReadyModal: React.FC<TurnReadyModalProps> = ({
  state,
  onStartPlanning,
}) => {
  const turn = state.turn;
  const ballHolder = state.pieces.find(p => p.hasBall);
  const playerPieces = state.pieces.filter(p => p.side === 'PLAYER');
  const totalPlayerEnergy = playerPieces.reduce((sum, p) => sum + p.energy, 0);

  // Extract recent AI events from the event log for a rich tactical recap
  const recentAIEvents = state.eventLog
    .filter(e => e.side === 'AI' && e.turn === turn - 1)
    .slice(-4);

  // Keyboard shortcut: Press Enter or Space to start
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        soundEngine.playWhistle();
        onStartPlanning();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStartPlanning]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fadeIn">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-blue-950/50 space-y-6 relative overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -inset-1 opacity-20 blur-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 pointer-events-none" />

        <div className="relative z-10 space-y-5">
          {/* Header Banner */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950 border border-blue-600/40 text-xs font-mono text-cyan-300">
              <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span>AI TURN RESOLVED • TURN {turn} READY</span>
            </div>
            <div className="font-mono text-xs font-bold text-slate-400">
              SCORE: <span className="text-blue-300 font-bold">{state.score.PLAYER}</span> - <span className="text-red-300 font-bold">{state.score.AI}</span>
            </div>
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Your Turn to Command
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              The AI has completed its turn. Review court positioning and start your planning phase.
            </p>
          </div>

          {/* AI Turn Summary Recap */}
          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs font-mono">
            <div className="text-slate-400 font-bold flex items-center gap-1.5 text-[11px] text-amber-300">
              <Target className="w-3.5 h-3.5" />
              <span>AI TURN RECAP (TURN {turn - 1}):</span>
            </div>

            {recentAIEvents.length > 0 ? (
              <div className="space-y-1 text-slate-300 text-[11px]">
                {recentAIEvents.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2 border-b border-slate-900 pb-1">
                    <span className="text-red-400 font-bold">•</span>
                    <span className="text-slate-200">{ev.type.replace(/_/g, ' ')}</span>
                    {ev.details?.toCell && (
                      <span className="text-slate-500">
                        to ({ev.details.toCell.col}, {ev.details.toCell.row})
                      </span>
                    )}
                    {ev.details?.cardName && (
                      <span className="text-purple-300 font-bold">[{ev.details.cardName}]</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-500 text-[11px]">AI maintained holding posture and compounded rest.</div>
            )}
          </div>

          {/* Player Ready State Overview */}
          <div className="grid grid-cols-3 gap-2.5 text-center font-mono text-xs">
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-500">BALL POSSESSION</div>
              <div className={`font-bold text-xs mt-0.5 ${
                ballHolder?.side === 'PLAYER' ? 'text-blue-400' : 'text-red-400'
              }`}>
                {ballHolder?.side === 'PLAYER' ? 'Player Ball' : 'AI Ball'}
              </div>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-500">MOMENTUM POOL</div>
              <div className="font-bold text-xs text-purple-400 mt-0.5">
                {state.momentum.PLAYER}/{state.config.momentum.maxMomentum}
              </div>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-500">TEAM ENERGY</div>
              <div className="font-bold text-xs text-emerald-400 mt-0.5">
                {totalPlayerEnergy.toFixed(1)}e
              </div>
            </div>
          </div>

          {/* Start Planning Phase Button */}
          <div className="pt-2">
            <button
              onClick={() => {
                soundEngine.playWhistle();
                onStartPlanning();
              }}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-mono font-extrabold text-sm sm:text-base tracking-wider shadow-xl shadow-blue-600/40 flex items-center justify-center gap-3 active:scale-95 transition-all cursor-pointer"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>START PLANNING (TURN {turn})</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <div className="text-center text-[10px] font-mono text-slate-500 mt-2">
              Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">Space</kbd> or <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-slate-300">Enter</kbd> to begin
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
