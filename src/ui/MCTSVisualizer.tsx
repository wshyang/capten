import React from 'react';
import type { Posture } from '../engine/types';
import { Cpu, Zap, CheckCircle2, Gauge, Flame } from 'lucide-react';

interface MCTSVisualizerProps {
  isThinking: boolean;
  posture: Posture | null;
  tier: string;
  engineMode?: string;
  adaptiveTelemetry?: {
    lastHumanLatencyMs?: number;
    humanUsedSeconds?: number;
    aiTargetBudgetSeconds?: number;
    maxTurnBudgetSeconds?: number;
    speedRatio?: number;
    adaptiveIterations?: number;
    adaptiveRolloutDepth?: number;
    adaptiveSamples?: number;
    adaptiveTier?: string;
  };
  lastSearchStats?: {
    iterations: number;
    nodesEvaluated: number;
    bestScore: number;
    candidateCount?: number;
    bestActionDescription?: string;
    stage0Card?: string | null;
    stage2Card?: string | null;
    timeMs: number;
  };
  onTriggerAIStep?: () => void;
  canTriggerAI?: boolean;
}

const POSTURE_BADGES: Record<Posture, { label: string; color: string; desc: string }> = {
  ALL_OUT_ATTACK: {
    label: 'ALL OUT ATTACK',
    color: 'bg-red-100 border-red-700 text-red-950',
    desc: 'Driving aggressive scoring passes into the Pirate Captain target.',
  },
  BALANCED: {
    label: 'BALANCED FORMATION',
    color: 'bg-blue-100 border-blue-700 text-blue-950',
    desc: 'Coordinating joint cuts and maintaining high passing lane access.',
  },
  LOCK_DEFENCE: {
    label: 'LOCK DEFENCE',
    color: 'bg-emerald-100 border-emerald-700 text-emerald-950',
    desc: 'Anchoring stationary court players on enemy carrier passing angles.',
  },
  SPREAD_CONTROL: {
    label: 'SPREAD CONTROL',
    color: 'bg-purple-100 border-purple-700 text-purple-950',
    desc: 'Widening area-of-control field coverage across mid-court.',
  },
  COLLAPSE_ON_BALL: {
    label: 'COLLAPSE ON BALL',
    color: 'bg-amber-100 border-amber-700 text-amber-950',
    desc: 'Suffocating vulnerable low-energy enemy ball carriers.',
  },
};

export const MCTSVisualizer: React.FC<MCTSVisualizerProps> = ({
  isThinking,
  posture,
  tier,
  engineMode,
  adaptiveTelemetry,
  lastSearchStats,
  onTriggerAIStep,
  canTriggerAI,
}) => {
  const isNNMode = engineMode === 'NN_ACTIVE';
  const currentPosture = posture || 'BALANCED';
  const postureInfo = POSTURE_BADGES[currentPosture];

  const humanSec = adaptiveTelemetry?.humanUsedSeconds !== undefined
    ? adaptiveTelemetry.humanUsedSeconds.toFixed(1)
    : adaptiveTelemetry?.lastHumanLatencyMs
    ? (adaptiveTelemetry.lastHumanLatencyMs / 1000).toFixed(1)
    : '1.0';
  const aiSec = adaptiveTelemetry?.aiTargetBudgetSeconds !== undefined
    ? adaptiveTelemetry.aiTargetBudgetSeconds.toFixed(1)
    : '59.0';
  const speedPct = adaptiveTelemetry?.speedRatio !== undefined
    ? Math.round(adaptiveTelemetry.speedRatio * 100)
    : 98;
  const iters = adaptiveTelemetry?.adaptiveIterations || lastSearchStats?.iterations || 5000;
  const depth = adaptiveTelemetry?.adaptiveRolloutDepth || 6;

  return (
    <div
      data-testid="mcts-visualizer-hud"
      className="parchment-card rounded-2xl p-4 shadow-xl space-y-3 font-serif text-xs border-2 border-[#8b5a2b]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-2">
        <div className="flex items-center gap-2">
          <Cpu className={`w-4 h-4 ${isThinking ? 'text-red-700 animate-spin' : 'text-amber-800'}`} />
          <span className="font-extrabold text-amber-950 tracking-wide">
            {isNNMode
              ? '🧠 REIGNING 32-CH RESNET CNN CHAMPION'
              : isThinking
              ? 'MCTS SEARCH IN PROGRESS...'
              : 'AI ADAPTIVE TREE SEARCH'}
          </span>
        </div>
        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
          isNNMode
            ? 'bg-blue-200 border-blue-800 text-blue-950 ring-1 ring-blue-500'
            : (adaptiveTelemetry?.adaptiveTier || tier) === 'CUSTOM'
            ? 'bg-purple-200 border-purple-800 text-purple-950 ring-1 ring-purple-400'
            : 'bg-red-200 border-red-800 text-red-950'
        }`}>
          {isNNMode ? 'RESNET CNN (NN_ACTIVE)' : `${adaptiveTelemetry?.adaptiveTier || tier} TIER`}
        </span>
      </div>

      {/* Dynamic Inverse Latency Scaling Dashboard or NN Dashboard */}
      {isNNMode ? (
        <div
          data-testid="nn-champion-dashboard"
          className="p-2.5 rounded-xl bg-blue-100/90 border border-blue-700/60 flex flex-col gap-1.5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-blue-950 font-black text-[11px]">
              <Cpu className="w-3.5 h-3.5 text-blue-800" />
              <span>NEURAL NETWORK INFERENCE ENGINE:</span>
            </div>
            <span className="text-[10px] font-black text-blue-900 font-mono">
              ~8ms Latency • 0 Tree Search
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold text-blue-950">
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3 text-blue-600" />
              <span>Architecture: <strong>32-Ch Dual-Head ResNet</strong> (No BN)</span>
            </span>
            <span className="text-emerald-800 font-black">
              🧠 100.0% Win Rate vs d4@50
            </span>
          </div>
        </div>
      ) : (
        <div
          data-testid="mcts-iterations-gauge"
          className="p-2.5 rounded-xl bg-amber-100/90 border border-amber-700/60 flex flex-col gap-1.5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-amber-950 font-black text-[11px]">
              <Gauge className="w-3.5 h-3.5 text-amber-800" />
              <span>INVERSE-LATENCY DEPTH SCALING:</span>
            </div>
            <span className="text-[10px] font-black text-blue-900 font-mono">
              {humanSec}s Human ➔ {aiSec}s AI Budget
            </span>
          </div>

          {/* Dynamic Search Power Gauge */}
          <div className="w-full bg-amber-900/20 rounded-full h-2 overflow-hidden border border-amber-800/40">
            <div
              className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-amber-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.max(15, speedPct)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-bold text-amber-900">
            <span className="flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-600" />
              <span>Lookahead: <strong>{iters.toLocaleString()} iters</strong> • Depth <strong>{depth} turns</strong></span>
            </span>
            <span className="text-emerald-800 font-black">
              {speedPct >= 75
                ? '⚡ Deep Combine Engine (T4)'
                : speedPct >= 50
                ? '🧠 Grandmaster (T3)'
                : speedPct >= 25
                ? '⚡ Tactician (T2)'
                : '🎯 Standard Cadet (T1)'}
            </span>
          </div>
        </div>
      )}

      {/* Posture Banner */}
      <div className={`p-2.5 rounded-xl border-2 flex flex-col gap-1 transition-all shadow-sm ${postureInfo.color}`}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black tracking-wider">LEVEL 1 POSTURE:</span>
          <span className="font-black">{postureInfo.label}</span>
        </div>
        <p className="text-[10px] opacity-90 leading-tight font-sans">
          {postureInfo.desc}
        </p>
      </div>

      {/* Real-time MCTS / NN Search Diagnostics */}
      {lastSearchStats ? (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-amber-100/80 p-2 rounded-xl border border-amber-700/50 flex flex-col">
            <span className="text-amber-900 text-[9px] font-bold">
              {isNNMode ? 'EVALUATION METHOD' : 'ROLLOUT SAMPLES'}
            </span>
            <span className="font-black text-amber-950">
              {isNNMode ? 'Direct Policy/Value Pass' : `${lastSearchStats.nodesEvaluated} Nodes`}
            </span>
          </div>

          <div className="bg-amber-100/80 p-2 rounded-xl border border-amber-700/50 flex flex-col">
            <span className="text-amber-900 text-[9px] font-bold">
              {isNNMode ? 'INFERENCE TIME' : 'SEARCH TIME'}
            </span>
            <span className="font-black text-blue-900">{lastSearchStats.timeMs}ms</span>
          </div>

          <div className="col-span-2 bg-amber-100/80 p-2 rounded-xl border border-amber-700/50 flex flex-col gap-1">
            <div className="flex items-center justify-between text-amber-900 text-[9px] font-bold">
              <span>CHOSEN ROOT DECISION:</span>
              <span className="text-emerald-800 font-black">
                Q = {lastSearchStats.bestScore > 0 ? `+${lastSearchStats.bestScore.toFixed(0)}` : lastSearchStats.bestScore.toFixed(0)}
              </span>
            </div>
            <div className="font-bold text-amber-950 truncate flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
              <span>{lastSearchStats.bestActionDescription || 'Positioning & Passing Lanes'}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="py-3 text-center text-amber-900/70 text-[11px] border-2 border-dashed border-[#8b5a2b]/40 rounded-xl bg-amber-50/50">
          {isNNMode
            ? 'ResNet CNN (32-Ch) evaluates board state immediately upon turn trigger.'
            : 'MCTS plans from the committed board state upon turn trigger.'}
        </div>
      )}

      {/* Manual Trigger Option */}
      {canTriggerAI && onTriggerAIStep && (
        <button
          onClick={onTriggerAIStep}
          className="w-full py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 border-2 border-red-950 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
        >
          <Zap className="w-3.5 h-3.5 fill-amber-300 text-amber-300" />
          <span>{isNNMode ? 'Execute NN Turn Now' : 'Execute MCTS Turn Now'}</span>
        </button>
      )}
    </div>
  );
};
