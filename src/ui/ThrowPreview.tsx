import React from 'react';
import type { ThrowPreviewData } from '../engine/types';
import { ShieldAlert, Sparkles, Zap } from 'lucide-react';
import { CaptainBallIllustration } from './HandDrawnIllustrations';

interface ThrowPreviewProps {
  preview: ThrowPreviewData;
  cellSizePx?: number;
}

export const ThrowPreview: React.FC<ThrowPreviewProps> = ({
  preview,
  cellSizePx = 48,
}) => {
  const { fromCell, targetCell, throwCost, isClean, cumulativeCaptureRisk, isNoLookPass } = preview;

  const x1 = (fromCell.col + 0.5) * cellSizePx;
  const y1 = (fromCell.row + 0.5) * cellSizePx;
  const x2 = (targetCell.col + 0.5) * cellSizePx;
  const y2 = (targetCell.row + 0.5) * cellSizePx;

  // Compute curved flight arc (arches upward like a real thrown ball)
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2 - Math.min(60, Math.hypot(x2 - x1, y2 - y1) * 0.25);
  const arcPath = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;

  const riskPct = Math.round(cumulativeCaptureRisk * 100);

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      <svg className="w-full h-full absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id="throwParchmentClean" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="throwParchmentRisk" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
          <marker
            id="hand-drawn-arrowhead"
            markerWidth="12"
            markerHeight="9"
            refX="10"
            refY="4.5"
            orient="auto"
          >
            <polygon
              points="0 0, 12 4.5, 0 9, 3 4.5"
              fill={isClean ? '#10b981' : '#d97706'}
              stroke="#451a03"
              strokeWidth="1"
            />
          </marker>
        </defs>

        {/* Outer Shadow Arc */}
        <path
          d={arcPath}
          stroke="#451a03"
          strokeWidth="6"
          strokeOpacity="0.4"
          strokeLinecap="round"
          fill="none"
        />

        {/* Hand-drawn Dashed Golden/White Flight Vector (matching image.png) */}
        <path
          d={arcPath}
          stroke={isClean ? 'url(#throwParchmentClean)' : 'url(#throwParchmentRisk)'}
          strokeWidth="3.5"
          strokeDasharray="8 5"
          className="animate-[dash-slow_1.2s_linear_infinite]"
          markerEnd="url(#hand-drawn-arrowhead)"
          fill="none"
        />

        {/* Mid-flight Soaring Ball Graphic */}
        <g transform={`translate(${midX - 12}, ${midY - 12})`}>
          <circle cx="12" cy="12" r="14" fill="rgba(245, 158, 11, 0.3)" className="animate-ping" />
        </g>

        {/* Enemy Interception Hazard Points on Arc */}
        {preview.pathCells.map((node, i) => {
          if (node.enemyControlFactor <= 0) return null;
          const cx = (node.cell.col + 0.5) * cellSizePx;
          const cy = (node.cell.row + 0.5) * cellSizePx;
          const nodeRisk = Math.round(node.captureProbability * 100);

          return (
            <g key={i} className="animate-pulse">
              <circle
                cx={cx}
                cy={cy}
                r="12"
                fill="rgba(220, 38, 38, 0.45)"
                stroke="#7f1d1d"
                strokeWidth="2"
                strokeDasharray="2 2"
              />
              <text
                x={cx}
                y={cy + 3.5}
                fill="#ffffff"
                fontSize="9"
                fontWeight="bold"
                textAnchor="middle"
                fontFamily="serif"
              >
                {nodeRisk}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Mini Ball atop arc */}
      <div
        className="absolute transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: midX, top: midY }}
      >
        <CaptainBallIllustration className="w-6 h-6 animate-bounce" />
      </div>

      {/* Hand-drawn Parchment Callout Tag */}
      <div
        className="absolute transform -translate-x-1/2 -translate-y-full mb-4 px-3 py-1.5 rounded-xl shadow-2xl border-2 text-xs font-serif select-none"
        style={{
          left: (x1 + x2) / 2,
          top: Math.min(y1, y2, midY) - 8,
          backgroundColor: isClean ? '#ecfdf5' : '#fffbeb',
          borderColor: isClean ? '#059669' : '#d97706',
          color: isClean ? '#065f46' : '#78350f',
          boxShadow: '3px 4px 12px rgba(44, 24, 16, 0.25)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.2 rounded bg-amber-200 border border-amber-800 text-amber-950 font-black text-[10px]">
            {preview.throwType === 'HIGH_LOB' ? '🚀 High Lob (L=2)' : preview.throwType === 'LOB' ? '🏹 Lob (L=1)' : '⚡ Flat (L=0)'}
          </span>
          {isClean ? (
            <>
              <Sparkles className="w-4 h-4 text-emerald-600 animate-spin" />
              <span className="font-extrabold tracking-wide">⚡ CLEAN PASS (0 AoC • Energy Refund)</span>
            </>
          ) : isNoLookPass ? (
            <>
              <Zap className="w-4 h-4 text-amber-600 animate-pulse" />
              <span className="font-extrabold tracking-wide">⚡ NO-LOOK PASS (Uninterceptable)</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-4 h-4 text-rose-600 animate-bounce" />
              <span className="font-extrabold">ROULETTE RISK: {riskPct}%</span>
              <span className="text-[11px] font-sans opacity-90">
                (Cost: {throwCost.toFixed(1)}e • Catch: {Math.round(preview.catchRate * 100)}%)
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
