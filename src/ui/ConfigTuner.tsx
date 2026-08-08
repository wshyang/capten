import React, { useState } from 'react';
import type { GameConfig } from '../engine/types';
import { MCTS_TIERS, type MCTSTier } from '../engine/config/mcts';
import { Sliders, X, Check, Cpu, Settings } from 'lucide-react';

interface ConfigTunerProps {
  config: GameConfig;
  isOpen: boolean;
  onClose: () => void;
  onApplyConfig: (newConfig: GameConfig) => void;
}

export const ConfigTuner: React.FC<ConfigTunerProps> = ({
  config,
  isOpen,
  onClose,
  onApplyConfig,
}) => {
  const [localConfig, setLocalConfig] = useState<GameConfig>({ ...config });

  if (!isOpen) return null;

  const handleMCTSTierChange = (tier: MCTSTier) => {
    const tierConfig = MCTS_TIERS[tier];
    setLocalConfig(prev => ({
      ...prev,
      mcts: {
        ...prev.mcts,
        tier,
        iterations: tierConfig.iterations,
        rolloutDepth: tierConfig.rolloutDepth,
        ismctsSamples: tierConfig.ismctsSamples,
        explorationConstant: tierConfig.explorationConstant,
      },
    }));
  };

  const handleCustomDepthChange = (depth: number) => {
    setLocalConfig(prev => ({
      ...prev,
      mcts: {
        ...prev.mcts,
        tier: 'CUSTOM',
        rolloutDepth: Math.max(1, Math.min(20, depth)),
      },
    }));
  };

  const handleCustomSamplesChange = (samples: number) => {
    setLocalConfig(prev => ({
      ...prev,
      mcts: {
        ...prev.mcts,
        tier: 'CUSTOM',
        ismctsSamples: Math.max(1, Math.min(30, samples)),
      },
    }));
  };

  const handleCustomIterationsChange = (iters: number) => {
    setLocalConfig(prev => ({
      ...prev,
      mcts: {
        ...prev.mcts,
        tier: 'CUSTOM',
        iterations: Math.max(100, Math.min(100000, iters)),
      },
    }));
  };

  const handleCustomExplorationChange = (c: number) => {
    setLocalConfig(prev => ({
      ...prev,
      mcts: {
        ...prev.mcts,
        tier: 'CUSTOM',
        explorationConstant: Math.max(0.1, Math.min(3.0, c)),
      },
    }));
  };

  const saveAndApply = () => {
    onApplyConfig(localConfig);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn font-serif">
      <div className="w-full max-w-3xl parchment-card rounded-3xl p-6 sm:p-7 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto border-4 border-[#5c3a1e]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-800" />
            <h2 className="text-xl font-black text-amber-950">
              ENGINE CONFIG TUNER & CUSTOM MCTS (v3.1)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-amber-200 border border-amber-700 text-amber-950 hover:bg-amber-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI MCTS Preset Tier Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-800" />
              <span>MCTS Search Tiers & Custom Mode</span>
            </label>
            <span className="text-[10px] font-mono font-bold bg-amber-200 border border-amber-800 text-amber-950 px-2 py-0.5 rounded-full">
              Current: {localConfig.mcts.tier}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(Object.keys(MCTS_TIERS) as MCTSTier[]).map(tierKey => {
              const t = MCTS_TIERS[tierKey];
              const isSelected = localConfig.mcts.tier === tierKey;

              return (
                <div
                  key={tierKey}
                  onClick={() => handleMCTSTierChange(tierKey)}
                  className={`p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-100 border-blue-700 text-blue-950 shadow-md ring-2 ring-blue-500 scale-[1.02]'
                      : 'bg-amber-100/60 border-amber-700/40 text-amber-900 hover:border-amber-700'
                  }`}
                >
                  <div className="font-black text-xs sm:text-sm text-amber-950">{tierKey}</div>
                  <div className="text-[10px] text-amber-900 font-bold mt-0.5">
                    {tierKey === 'CUSTOM' ? `${localConfig.mcts.iterations} iters` : `${t.iterations} iters`}
                  </div>
                  <div className="text-[9px] text-amber-800 mt-0.5">
                    {tierKey === 'CUSTOM'
                      ? `Depth ${localConfig.mcts.rolloutDepth} • ${localConfig.mcts.ismctsSamples} samples`
                      : `Depth ${t.rolloutDepth} • ${t.ismctsSamples} samples`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dedicated Custom MCTS Parameters Section */}
        <div className="p-4 rounded-2xl bg-amber-200/50 border-2 border-amber-700/70 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-amber-700/30 pb-2">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-900" />
              <h3 className="font-black text-xs sm:text-sm text-amber-950">
                USER-SPECIFIED CUSTOM MCTS CONTROLS
              </h3>
            </div>
            <span className="text-[10px] font-sans font-bold text-amber-900">
              Sliders automatically switch tier to CUSTOM
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Lookahead Rollout Depth */}
            <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-700/50 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-black text-amber-950">
                <span>1. Lookahead Rollout Depth (D):</span>
                <span className="font-mono bg-blue-100 text-blue-950 px-2 py-0.5 rounded border border-blue-700 font-black">
                  {localConfig.mcts.rolloutDepth} turns ahead
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="20"
                step="1"
                value={localConfig.mcts.rolloutDepth}
                onChange={e => handleCustomDepthChange(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <p className="text-[10px] text-amber-900/80">
                How many turns into the future the simulation cascade evaluates (1 to 20).
              </p>
            </div>

            {/* 2. IS-MCTS Hand Sample Size */}
            <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-700/50 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-black text-amber-950">
                <span>2. Hidden Hand Samples (S):</span>
                <span className="font-mono bg-purple-100 text-purple-950 px-2 py-0.5 rounded border border-purple-700 font-black">
                  {localConfig.mcts.ismctsSamples} samples
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={localConfig.mcts.ismctsSamples}
                onChange={e => handleCustomSamplesChange(Number(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer"
              />
              <p className="text-[10px] text-amber-900/80">
                Number of hidden card deck permutations determinized per MCTS root (1 to 30).
              </p>
            </div>

            {/* 3. Search Iterations */}
            <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-700/50 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-black text-amber-950">
                <span>3. Search Iterations (N):</span>
                <span className="font-mono bg-emerald-100 text-emerald-950 px-2 py-0.5 rounded border border-emerald-700 font-black">
                  {localConfig.mcts.iterations.toLocaleString()} iters
                </span>
              </div>
              <input
                type="range"
                min="100"
                max="100000"
                step="500"
                value={localConfig.mcts.iterations}
                onChange={e => handleCustomIterationsChange(Number(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <p className="text-[10px] text-amber-900/80">
                Total simulated tree rollouts executed per AI planning cycle (100 to 100,000).
              </p>
            </div>

            {/* 4. Exploration Constant (c_puct) */}
            <div className="bg-amber-50/90 p-3 rounded-xl border border-amber-700/50 space-y-1.5 shadow-xs">
              <div className="flex items-center justify-between text-xs font-black text-amber-950">
                <span>4. UCB1 Exploration (c):</span>
                <span className="font-mono bg-amber-100 text-amber-950 px-2 py-0.5 rounded border border-amber-700 font-black">
                  {localConfig.mcts.explorationConstant?.toFixed(3) || '1.414'}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="3.0"
                step="0.05"
                value={localConfig.mcts.explorationConstant || 1.414}
                onChange={e => handleCustomExplorationChange(Number(e.target.value))}
                className="w-full accent-amber-600 cursor-pointer"
              />
              <p className="text-[10px] text-amber-900/80">
                Balances deep exploitation of winning shots vs exploratory breadth (0.1 to 3.0).
              </p>
            </div>
          </div>
        </div>

        {/* Throw, Elevation & Missed Catch Physics Configuration (§10) */}
        <div className="space-y-3">
          <label className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-amber-800" />
            <span>Throw & Elevation Physics (§10 Tunables)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-amber-100/90 p-3 rounded-2xl border border-amber-700/60 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                <span>Lob Cost (+e):</span>
                <span className="font-mono font-black">{localConfig.throw?.lobCost ?? 1.0}e</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.5"
                value={localConfig.throw?.lobCost ?? 1.0}
                onChange={e =>
                  setLocalConfig(prev => ({
                    ...prev,
                    throw: { ...prev.throw, lobCost: Number(e.target.value) },
                  }))
                }
                className="w-full accent-amber-600"
              />
            </div>

            <div className="bg-amber-100/90 p-3 rounded-2xl border border-amber-700/60 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                <span>High Lob Cost (+e):</span>
                <span className="font-mono font-black">{localConfig.throw?.highLobCost ?? 2.0}e</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.5"
                value={localConfig.throw?.highLobCost ?? 2.0}
                onChange={e =>
                  setLocalConfig(prev => ({
                    ...prev,
                    throw: { ...prev.throw, highLobCost: Number(e.target.value) },
                  }))
                }
                className="w-full accent-amber-600"
              />
            </div>

            <div className="bg-amber-100/90 p-3 rounded-2xl border border-amber-700/60 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                <span>Undershoot Contest (±%):</span>
                <span className="font-mono font-black">{Math.round((localConfig.throw?.contestFactor ?? 0.2) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="0.50"
                step="0.05"
                value={localConfig.throw?.contestFactor ?? 0.20}
                onChange={e =>
                  setLocalConfig(prev => ({
                    ...prev,
                    throw: { ...prev.throw, contestFactor: Number(e.target.value) },
                  }))
                }
                className="w-full accent-amber-600"
              />
            </div>
          </div>
        </div>

        {/* Scoring & Objective Config */}
        <div className="space-y-3">
          <label className="text-xs font-black text-amber-950 uppercase tracking-wider">
            Match Objective & Rules Invariants
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-amber-100/90 p-3 rounded-2xl border border-amber-700/60">
              <span className="text-[10px] font-bold text-amber-900">SCORES TO WIN</span>
              <input
                type="number"
                value={localConfig.board.pointsToWin}
                onChange={e =>
                  setLocalConfig(prev => ({
                    ...prev,
                    board: { ...prev.board, pointsToWin: Number(e.target.value) },
                  }))
                }
                className="w-full bg-amber-50 border border-amber-700 rounded-lg p-1.5 text-sm font-mono text-amber-950 mt-1"
              />
            </div>

            <div className="bg-amber-100/90 p-3 rounded-2xl border border-amber-700/60">
              <span className="text-[10px] font-bold text-amber-900">MAX TURNS</span>
              <input
                type="number"
                value={localConfig.board.maxTurns}
                onChange={e =>
                  setLocalConfig(prev => ({
                    ...prev,
                    board: { ...prev.board, maxTurns: Number(e.target.value) },
                  }))
                }
                className="w-full bg-amber-50 border border-amber-700 rounded-lg p-1.5 text-sm font-mono text-amber-950 mt-1"
              />
            </div>

            <div className="bg-amber-100/90 p-3 rounded-2xl border border-amber-700/60 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-amber-900">CARRIER PIVOT STEP</span>
              <button
                type="button"
                onClick={() =>
                  setLocalConfig(prev => ({
                    ...prev,
                    board: { ...prev.board, carrierMayPivotStep: !prev.board.carrierMayPivotStep },
                  }))
                }
                className={`w-full py-1.5 rounded-lg text-xs font-bold mt-1 border cursor-pointer ${
                  localConfig.board.carrierMayPivotStep
                    ? 'bg-emerald-600 text-white border-emerald-800'
                    : 'bg-amber-200 text-amber-900 border-amber-700'
                }`}
              >
                {localConfig.board.carrierMayPivotStep ? 'ENABLED (OFF-SPEC)' : 'DISABLED (RULES STRICT)'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-dashed border-[#8b5a2b]/40">
          <button
            onClick={onClose}
            className="py-2 px-4 rounded-xl border-2 border-amber-800 text-amber-950 text-xs font-bold hover:bg-amber-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={saveAndApply}
            className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg border-2 border-blue-950 flex items-center gap-1.5 active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply Config to Match</span>
          </button>
        </div>
      </div>
    </div>
  );
};
