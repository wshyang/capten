import React, { useState, useEffect, useRef } from 'react';
import type { Side } from '../engine/types';
import { SeededRNG } from '../engine/rng';
import { soundEngine } from './TacticalAudio';
import { Zap, Award } from 'lucide-react';

interface JumpBallProps {
  seed: number;
  windowMs: number;
  onComplete: (wonBy: Side, marginMs: number) => void;
}

export const JumpBall: React.FC<JumpBallProps> = ({ seed, windowMs, onComplete }) => {
  const [activeSide, setActiveSide] = useState<Side>('PLAYER');
  const [isHolding, setIsHolding] = useState<boolean>(false);
  const [completed, setCompleted] = useState<boolean>(false);
  const [resultData, setResultData] = useState<{ wonBy: Side; marginMs: number } | null>(null);
  const [currentBlinkDuration, setCurrentBlinkDuration] = useState<number>(windowMs);

  const rngRef = useRef<SeededRNG>(new SeededRNG(seed));
  const litStartRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);
  const currentDurationRef = useRef<number>(windowMs);

  useEffect(() => {
    rngRef.current = new SeededRNG(seed);
    litStartRef.current = Date.now();

    // Schedule next dynamic blink with -25% to +25% random skew (50% total variance)
    const scheduleNextBlink = () => {
      // Skew factor: float in [0, 1) -> (float * 0.5 - 0.25) in [-0.25, +0.25]
      const skew = rngRef.current.nextFloat() * 0.5 - 0.25;
      const nextDuration = Math.round(windowMs * (1.0 + skew));
      currentDurationRef.current = nextDuration;
      setCurrentBlinkDuration(nextDuration);

      timerRef.current = setTimeout(() => {
        setActiveSide(prev => {
          const next = prev === 'PLAYER' ? 'AI' : 'PLAYER';
          litStartRef.current = Date.now();
          soundEngine.playBlip(next === 'PLAYER' ? 520 : 380, 0.05);
          return next;
        });
        scheduleNextBlink();
      }, nextDuration);
    };

    scheduleNextBlink();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [seed, windowMs]);

  const handlePointerDown = () => {
    if (completed) return;
    setIsHolding(true);
    soundEngine.playBlip(600, 0.08);
  };

  const handlePointerUp = () => {
    if (!isHolding || completed) return;
    setIsHolding(false);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const now = Date.now();
    const elapsedInWindow = now - litStartRef.current;
    const center = currentDurationRef.current / 2;
    const marginMs = Math.round(elapsedInWindow - center);

    const won = activeSide === 'PLAYER';
    const wonBy: Side = won ? 'PLAYER' : 'AI';

    setCompleted(true);
    setResultData({ wonBy, marginMs });

    if (won) {
      soundEngine.playJumpBallWin();
    } else {
      soundEngine.playBlip(320, 0.15);
    }

    setTimeout(() => {
      onComplete(wonBy, marginMs);
    }, 1100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn font-serif">
      <div className="w-full max-w-lg parchment-card rounded-3xl p-6 sm:p-8 shadow-2xl border-4 border-[#5c3a1e] text-center relative overflow-hidden">
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-200 border-2 border-amber-800 text-xs font-bold text-amber-950">
            <Zap className="w-3.5 h-3.5 text-amber-800 animate-pulse" />
            <span>SEED #{seed} • OPENING JUMP-BALL MARITIME CONTEST</span>
          </div>

          <div>
            <h2 className="text-2xl font-black tracking-tight text-amber-950 sm:text-3xl">
              Possession Drop Contest
            </h2>
            <p className="text-sm text-amber-900 mt-1 max-w-md mx-auto">
              Hold the trigger and <strong className="text-blue-900">release</strong> exactly when the <strong className="text-blue-900">PLAYER</strong> indicator pulses lit.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 my-6">
            <div className={`relative p-5 rounded-2xl border-2 transition-all duration-150 flex flex-col items-center gap-2 shadow-md ${
              activeSide === 'PLAYER'
                ? 'bg-blue-100 border-blue-700 shadow-blue-900/30 scale-105 ring-2 ring-blue-500'
                : 'bg-amber-100/50 border-amber-800/40 opacity-50'
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                activeSide === 'PLAYER' ? 'bg-blue-600 shadow-md shadow-blue-500 animate-ping' : 'bg-amber-900/40'
              }`} />
              <span className="text-sm font-black tracking-wider text-blue-950">PLAYER POSSESSION</span>
              <span className="text-xs text-blue-900 font-bold">Tap when lit</span>
            </div>

            <div className={`relative p-5 rounded-2xl border-2 transition-all duration-150 flex flex-col items-center gap-2 shadow-md ${
              activeSide === 'AI'
                ? 'bg-red-100 border-red-700 shadow-red-900/30 scale-105 ring-2 ring-red-500'
                : 'bg-amber-100/50 border-amber-800/40 opacity-50'
            }`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                activeSide === 'AI' ? 'bg-red-600 shadow-md shadow-red-500 animate-ping' : 'bg-amber-900/40'
              }`} />
              <span className="text-sm font-black tracking-wider text-red-950">OPPONENT POSSESSION</span>
              <span className="text-xs text-red-900 font-bold">Wait for Player</span>
            </div>
          </div>

          {!completed ? (
            <div className="space-y-3">
              <button
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={`w-full py-5 px-6 rounded-2xl font-serif text-base sm:text-lg font-black tracking-wider uppercase transition-all shadow-xl select-none active:scale-95 border-2 cursor-pointer ${
                  isHolding
                    ? 'bg-amber-400 text-amber-950 border-amber-900 ring-4 ring-amber-500/50 scale-95'
                    : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-950 shadow-lg'
                }`}
              >
                {isHolding ? '⚡ RELEASE NOW ON BLUE PULSE!' : '👆 HOLD & RELEASE TO STRIKE'}
              </button>
              <div className="flex items-center justify-center gap-4 text-xs text-amber-900 font-bold">
                <span>Dynamic Window: {currentBlinkDuration}ms (±25% Skew)</span>
                <span>•</span>
                <span>Reaction Margin Audited</span>
              </div>
            </div>
          ) : (
            <div className={`p-4 rounded-2xl border-2 animate-bounce shadow-md ${
              resultData?.wonBy === 'PLAYER'
                ? 'bg-emerald-100 border-emerald-700 text-emerald-950'
                : 'bg-amber-200 border-amber-800 text-amber-950'
            }`}>
              <div className="flex items-center justify-center gap-2 font-black text-lg">
                <Award className="w-5 h-5" />
                <span>
                  {resultData?.wonBy === 'PLAYER' ? 'PLAYER WON OPENING POSSESSION!' : 'OPPONENT SECURED BALL'}
                </span>
              </div>
              <p className="text-xs mt-1 font-bold">
                Reaction release margin: <span className="font-mono font-black">{Math.abs(resultData?.marginMs || 0)}ms</span> from center pulse.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
