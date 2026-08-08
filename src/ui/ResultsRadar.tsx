import React, { useState } from 'react';
import type { AptitudeReport, GameEvent } from '../engine/types';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import {
  Award,
  CheckCircle2,
  TrendingUp,
  RotateCcw,
  FileText,
  Clock,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ResultsRadarProps {
  report: AptitudeReport;
  seed: number;
  winner: string | null;
  eventLog: GameEvent[];
  onRestartMatch: () => void;
}

export const ResultsRadar: React.FC<ResultsRadarProps> = ({
  report,
  seed,
  eventLog,
  onRestartMatch,
}) => {
  const [showEventLog, setShowEventLog] = useState<boolean>(false);

  React.useEffect(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch {}
  }, []);

  const radarData = [
    {
      attribute: 'Resource Mgmt',
      score: report.normalizedScores.RESOURCE,
      fullMark: 10,
    },
    {
      attribute: 'Risk Judgement',
      score: report.normalizedScores.RISK,
      fullMark: 10,
    },
    {
      attribute: 'Composure',
      score: report.normalizedScores.COMPOSURE,
      fullMark: 10,
    },
    {
      attribute: 'Teamwork',
      score: report.normalizedScores.TEAMWORK,
      fullMark: 10,
    },
    {
      attribute: 'Spatial Control',
      score: report.normalizedScores.SPATIAL,
      fullMark: 10,
    },
    {
      attribute: 'Leadership',
      score: report.normalizedScores.LEADERSHIP,
      fullMark: 10,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto animate-fadeIn font-serif">
      <div className="w-full max-w-4xl parchment-card rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 my-auto border-4 border-[#5c3a1e]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b-2 border-dashed border-[#8b5a2b]/40 pb-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-200 border border-amber-800 text-xs font-serif font-black text-amber-950 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-800" />
              <span>SEED #{seed} • ADMIRAL&apos;S COMBINE SCOUTING DOSSIER</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-amber-950 tracking-tight">
              Aptitude Assessment Report
            </h2>
          </div>

          <div className="px-5 py-3 rounded-2xl bg-amber-100 border-2 border-amber-800 flex items-center gap-3 shadow-md">
            <div className="w-10 h-10 rounded-full wax-seal-gold flex items-center justify-center shadow-md">
              <Award className="w-6 h-6 text-amber-950 drop-shadow" />
            </div>
            <div>
              <div className="text-[10px] tracking-wider text-amber-900 font-extrabold uppercase">
                SUGGESTED ROLE
              </div>
              <div className="text-xl font-black text-amber-950">
                {report.suggestedRole}
              </div>
              <div className="text-xs text-blue-900 font-bold">
                {report.roleMatchConfidence}% Match Confidence
              </div>
            </div>
          </div>
        </div>

        {/* 6-Axis Radar Chart & Dimension Score Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="h-64 sm:h-72 w-full bg-amber-50/90 rounded-2xl border-2 border-amber-800/40 p-2 flex items-center justify-center relative shadow-inner">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#b4835a" strokeDasharray="3 3" />
                <PolarAngleAxis
                  dataKey="attribute"
                  stroke="#5c3a1e"
                  tick={{ fill: '#3d2314', fontSize: 11, fontWeight: 'bold', fontFamily: 'serif' }}
                />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 10]}
                  stroke="#8b5a2b"
                  tick={{ fill: '#78350f', fontSize: 9 }}
                />
                <Radar
                  name="Player Aptitude"
                  dataKey="score"
                  stroke="#1d4ed8"
                  strokeWidth={2.5}
                  fill="#3b82f6"
                  fillOpacity={0.45}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {radarData.map(item => {
              const score = item.score;
              const band = score < 4 ? 'Developing' : score < 7 ? 'Solid' : 'Strong';
              const bandColor =
                band === 'Strong'
                  ? 'text-emerald-950 bg-emerald-200 border-emerald-800'
                  : band === 'Solid'
                  ? 'text-blue-950 bg-blue-200 border-blue-800'
                  : 'text-amber-950 bg-amber-200 border-amber-800';

              return (
                <div
                  key={item.attribute}
                  className="bg-amber-100/90 border border-amber-700/50 rounded-xl p-3 flex flex-col justify-between shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-950">
                      {item.attribute}
                    </span>
                    <span className="text-base font-black text-amber-950 font-mono">
                      {score.toFixed(1)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="w-20 bg-amber-900/20 rounded-full h-2 overflow-hidden border border-amber-800/40">
                      <div
                        className="bg-blue-600 h-full rounded-full"
                        style={{ width: `${score * 10}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-black px-1.5 py-0.2 rounded border ${bandColor}`}>
                      {band}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scouting Summary & Tactical DNA */}
        <div className="bg-amber-50 border-2 border-amber-800/40 rounded-2xl p-4 sm:p-5 space-y-3 shadow-inner">
          <div className="flex items-center gap-2 text-amber-950 font-extrabold text-xs">
            <FileText className="w-4 h-4 text-amber-800" />
            <span>SCOUTING REPORT: {report.scoutingReport.headline}</span>
          </div>

          <p className="text-sm text-amber-950 leading-relaxed">
            {report.scoutingReport.summary}
          </p>

          <div className="p-2.5 rounded-xl bg-amber-200/70 border border-amber-700 text-xs text-amber-950">
            <strong className="text-amber-950">Tactical DNA:</strong> {report.scoutingReport.tacticalDNA}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-emerald-100/90 border border-emerald-700 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-950 text-xs font-black">
                <CheckCircle2 className="w-4 h-4 text-emerald-800" />
                <span>COMBINE STRENGTHS</span>
              </div>
              <ul className="text-xs text-emerald-950 space-y-1 list-disc list-inside">
                {report.scoutingReport.strengths.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-blue-100/90 border border-blue-700 space-y-1.5">
              <div className="flex items-center gap-1.5 text-blue-950 text-xs font-black">
                <TrendingUp className="w-4 h-4 text-blue-800" />
                <span>AREAS FOR GROWTH</span>
              </div>
              <ul className="text-xs text-blue-950 space-y-1 list-disc list-inside">
                {report.scoutingReport.areasForGrowth.map((g, idx) => (
                  <li key={idx}>{g}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Telemetry Metrics on Parchment */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="bg-amber-100 p-2.5 rounded-xl border border-amber-700/60 shadow-sm">
            <div className="text-amber-900 text-[10px] font-bold">CLEAN PASS RATE</div>
            <div className="text-emerald-900 font-black text-sm">{report.telemetry.cleanPassRate}%</div>
          </div>
          <div className="bg-amber-100 p-2.5 rounded-xl border border-amber-700/60 shadow-sm">
            <div className="text-amber-900 text-[10px] font-bold">AVG REST STREAK</div>
            <div className="text-blue-900 font-black text-sm">{report.telemetry.avgRestStreak} turns</div>
          </div>
          <div className="bg-amber-100 p-2.5 rounded-xl border border-amber-700/60 shadow-sm">
            <div className="text-amber-900 text-[10px] font-bold">PLANNING LATENCY</div>
            <div className="text-purple-900 font-black text-sm">{report.telemetry.avgTurnPlanningLatencyMs}ms</div>
          </div>
          <div className="bg-amber-100 p-2.5 rounded-xl border border-amber-700/60 shadow-sm">
            <div className="text-amber-900 text-[10px] font-bold">JUMP-BALL MARGIN</div>
            <div className="text-amber-950 font-black text-sm">{report.telemetry.jumpBallMarginMs}ms</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            onClick={() => setShowEventLog(!showEventLog)}
            className="py-2.5 px-4 rounded-xl border-2 border-amber-800 text-amber-950 text-xs font-bold hover:bg-amber-200 flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            <span>{showEventLog ? 'Hide Ship Log' : `Inspect Replay Log (${eventLog.length} Events)`}</span>
          </button>

          <button
            onClick={onRestartMatch}
            className="py-2.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-lg border-2 border-blue-900 flex items-center gap-2 active:scale-95"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New Seeded Match</span>
          </button>
        </div>

        {showEventLog && (
          <div className="mt-4 p-4 rounded-2xl bg-amber-50 border-2 border-amber-800 max-h-56 overflow-y-auto space-y-1.5 text-xs">
            <div className="font-black text-amber-950 mb-2">DETERMINISTIC EVENT SHIP LOG:</div>
            {eventLog.map((ev, i) => (
              <div key={i} className="flex items-center gap-2 text-amber-950 border-b border-amber-200 pb-1">
                <span className="text-amber-800 font-bold">T{ev.turn}</span>
                <span className={ev.side === 'PLAYER' ? 'text-blue-800 font-black' : 'text-red-800 font-black'}>
                  [{ev.side}]
                </span>
                <span className="font-bold">{ev.type}</span>
                <span className="text-[10px] text-amber-900 opacity-80">{JSON.stringify(ev.details)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
