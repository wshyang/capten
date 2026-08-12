import React, { useState } from 'react';
import type { GameConfig } from '../engine/types';
import type { AIEngineMode } from '../engine/ai/interface';
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
  const [localEngineMode, setLocalEngineMode] = useState<AIEngineMode>(
    config.ai?.aiEngineMode || config.ai?.defaultEngineMode || 'EPSILON_GREEDY_NN'
  );
  const [localNNModelSize, setLocalNNModelSize] = useState<'32' | '64'>(
    config.ai?.nnModelSize || '64'
  );
  const [localEpsilonRate, setLocalEpsilonRate] = useState<number>(
    config.ai?.epsilonExploitRate ?? 0.75
  );

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
    const finalConfig: GameConfig = {
      ...localConfig,
      ai: {
        ...localConfig.ai,
        aiEngineMode: localEngineMode,
        playerEngineMode: localEngineMode,
        defaultEngineMode: localEngineMode,
        nnModelSize: localNNModelSize,
        epsilonExploitRate: localEpsilonRate,
      },
    };
    onApplyConfig(finalConfig);
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
              ENGINE & AI CONFIG TUNER (v3.2)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-amber-200 border border-amber-700 text-amber-950 hover:bg-amber-300 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dedicated AI Engine Mode & Architecture Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-amber-800" />
              <span>AI Engine Mode & Neural Network Architecture</span>
            </label>
            <span className="text-[10px] font-mono font-bold bg-amber-200 border border-amber-800 text-amber-950 px-2 py-0.5 rounded-full">
              Engine: {localEngineMode}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                mode: 'NN_ACTIVE' as const,
                title: 'NN_ACTIVE (ResNet CNN)',
                desc: 'Reigning ResNet CNN Champion. Direct policy/value evaluation without tree search.',
              },
              {
                mode: 'EPSILON_GREEDY_NN' as const,
                title: 'EPSILON GREEDY NN (75%)',
                desc: 'NN Champion with configurable greedy policy & random exploration. Prevents static gridlocks.',
              },
              {
                mode: 'MCTS_ONLY' as const,
                title: 'MCTS_ONLY (Tree Search)',
                desc: 'Pure Monte Carlo Tree Search using selected MCTS presets (T1..T4 or Custom).',
              },
              {
                mode: 'MCTS_WITH_NN_SHADOW' as const,
                title: 'MCTS + CNN SHADOW',
                desc: 'Hybrid mode: MCTS search evaluated in parallel with CNN value predictions.',
              },
            ].map(item => {
              const isSelected = localEngineMode === item.mode;
              return (
                <div
                  key={item.mode}
                  onClick={() => {
                    setLocalEngineMode(item.mode);
                  }}
                  className={`p-3 rounded-2xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-100 border-blue-700 text-blue-950 shadow-md ring-2 ring-blue-500 scale-[1.02]'
                      : 'bg-amber-100/60 border-amber-700/40 text-amber-900 hover:border-amber-700'
                  }`}
                >
                  <div className="font-black text-xs sm:text-sm text-amber-950 flex items-center justify-between">
                    <span>{item.title}</span>
                    {isSelected && <Check className="w-4 h-4 text-blue-700" />}
                  </div>
                  <div className="text-[10px] text-amber-800 mt-1 leading-relaxed">
                    {item.desc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dedicated NN Champion Banner (Shown when NN_ACTIVE or EPSILON_GREEDY_NN is selected) */}
        {(localEngineMode === 'NN_ACTIVE' || localEngineMode === 'EPSILON_GREEDY_NN') && (
          <div className="p-4 rounded-2xl bg-blue-100/90 border-2 border-blue-700 space-y-3.5 shadow-md animate-fadeIn">
            <div className="flex items-center justify-between border-b border-blue-700/30 pb-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-800" />
                <h3 className="font-black text-xs sm:text-sm text-blue-950 uppercase tracking-wide">
                  {localEngineMode === 'EPSILON_GREEDY_NN'
                    ? 'Epsilon Greedy NN (75%) Active'
                    : 'Reigning ResNet CNN Champion Active'}
                </h3>
              </div>
              <span className="text-[10px] font-mono font-black bg-blue-200 border border-blue-800 text-blue-950 px-2.5 py-0.5 rounded-full">
                MCTS Options Hidden
              </span>
            </div>

            {/* Model Layer / Channel Selector (64-Layer Default) */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                <span>Select Neural Network Architecture Mode</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    size: '64' as const,
                    title: '64-LAYER RESNET (DEFAULT)',
                    badge: 'DEFAULT • 788K PARAMS',
                    desc: 'Extended 64-channel ResNet with full 32..63 tactical reachability grids, distance gradients & card broadcasts.',
                    latency: '~15ms Turn Latency',
                  },
                  {
                    size: '32' as const,
                    title: '32-LAYER RESNET (LEGACY)',
                    badge: 'LEGACY • 386K PARAMS',
                    desc: 'Original lightweight 32-channel ResNet champion checkpoint (supreme_champion.json).',
                    latency: '~8ms Turn Latency',
                  },
                ].map(model => {
                  const isSelected = localNNModelSize === model.size;
                  return (
                    <div
                      key={model.size}
                      onClick={() => setLocalNNModelSize(model.size)}
                      className={`cursor-pointer rounded-2xl p-3 border-2 transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-950 shadow-md scale-[1.02]'
                          : 'bg-blue-50/90 text-blue-950 border-blue-700/40 hover:bg-blue-100/90'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-xs tracking-wider">{model.title}</span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                              isSelected
                                ? 'bg-white text-blue-900'
                                : 'bg-blue-200 text-blue-950 border border-blue-800/40'
                            }`}
                          >
                            {model.badge}
                          </span>
                        </div>
                        <p
                          className={`text-[10px] leading-relaxed ${
                            isSelected ? 'text-blue-100' : 'text-blue-900'
                          }`}
                        >
                          {model.desc}
                        </p>
                      </div>
                      <div className="mt-2 text-[9px] font-mono font-bold flex items-center justify-between opacity-90">
                        <span>{model.latency}</span>
                        <span>{isSelected ? '✓ SELECTED' : 'CLICK TO SELECT'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-blue-950 font-bold">
              <div className="bg-blue-50/90 p-2.5 rounded-xl border border-blue-700/40">
                <div className="text-[10px] text-blue-800 uppercase">Architecture</div>
                <div className="font-black mt-0.5">
                  {localNNModelSize === '64' ? '64-Layer Dual-Head ResNet' : '32-Layer Dual-Head ResNet'}
                </div>
                <div className="text-[9px] text-blue-900 mt-0.5 font-normal">
                  {localNNModelSize === '64'
                    ? '788,801 parameters • Extended Spatial Features'
                    : '386,305 parameters • No Batch Norm (CPU Optimized)'}
                </div>
              </div>

              <div className="bg-blue-50/90 p-2.5 rounded-xl border border-blue-700/40">
                <div className="text-[10px] text-blue-800 uppercase">Inference Performance</div>
                <div className="font-black mt-0.5">
                  {localNNModelSize === '64' ? '~15ms Turn Latency' : '~8ms Turn Latency'}
                </div>
                <div className="text-[9px] text-blue-900 mt-0.5 font-normal">
                  Instantaneous policy/value evaluation (0 tree search overhead)
                </div>
              </div>

              <div className="bg-blue-50/90 p-2.5 rounded-xl border border-blue-700/40">
                <div className="text-[10px] text-blue-800 uppercase">Evaluation Benchmark</div>
                <div className="font-black text-emerald-800 mt-0.5">100.0% Win Rate vs d4@50</div>
                <div className="text-[9px] text-blue-900 mt-0.5 font-normal">
                  Proven across 16 symmetric home-and-away audit matches
                </div>
              </div>
            </div>

            {localEngineMode === 'EPSILON_GREEDY_NN' && (
              <div className="p-3.5 rounded-2xl bg-blue-50/90 border-2 border-blue-700/60 space-y-2.5 shadow-sm animate-fadeIn">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Epsilon Exploitation Rate ({Math.round(localEpsilonRate * 100)}% Greedy)</span>
                  </label>
                  <span className="text-[10px] font-mono font-black bg-blue-200 border border-blue-800 text-blue-950 px-2 py-0.5 rounded-full">
                    {Math.round((1 - localEpsilonRate) * 100)}% Exploration
                  </span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="1.00"
                  step="0.05"
                  value={localEpsilonRate}
                  onChange={e => setLocalEpsilonRate(parseFloat(e.target.value))}
                  className="w-full accent-blue-700 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-blue-900 font-mono font-bold">
                  <span>50% (High Explore)</span>
                  <span>75% (Default)</span>
                  <span>100% (Pure Greedy)</span>
                </div>
              </div>
            )}

            <p className="text-[11px] text-blue-900 leading-relaxed font-sans italic">
              Note: Monte Carlo Tree Search (MCTS) tiers and custom rollout lookahead controls are automatically hidden because NN_ACTIVE evaluates board states directly with trained weights without requiring simulation rollouts.
            </p>
          </div>
        )}

        {/* AI MCTS Preset Tier Selection */}
        {localEngineMode !== 'NN_ACTIVE' && localEngineMode !== 'EPSILON_GREEDY_NN' && (
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
                    <div className="font-black text-xs sm:text-sm text-amber-950">
                      {t.label}
                    </div>
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
        )}

        {/* Dedicated Custom MCTS Parameters Section */}
        {localEngineMode !== 'NN_ACTIVE' && localEngineMode !== 'EPSILON_GREEDY_NN' && (
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
        )}

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
