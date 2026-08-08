import React, { useEffect, useRef } from 'react';
import { Timer, AlertTriangle } from 'lucide-react';
import { soundEngine } from './TacticalAudio';

interface TurnTimerProps {
  remainingSeconds: number;
  maxSeconds?: number;
  isPaused?: boolean;
  onTimeExpired: () => void;
  onTick: (secondsElapsed: number) => void;
}

export const TurnTimer: React.FC<TurnTimerProps> = ({
  remainingSeconds,
  maxSeconds = 60,
  isPaused = false,
  onTimeExpired,
  onTick,
}) => {
  const prevRemainingRef = useRef<number>(remainingSeconds);
  const hasPlayedExpiredRef = useRef<boolean>(false);

  useEffect(() => {
    if (isPaused || remainingSeconds <= 0) return;

    const interval = setInterval(() => {
      onTick(1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, remainingSeconds, onTick]);

  // Reset expired sound guard when timer is restarted with positive seconds
  useEffect(() => {
    if (remainingSeconds > 0) {
      hasPlayedExpiredRef.current = false;
    }
  }, [remainingSeconds]);

  // Play the procedural "doo" rhythm sound on each second tick
  // In the last 10 seconds (<=10s), the "doo" is longer and louder (isUrgent: true)
  useEffect(() => {
    if (!isPaused && remainingSeconds > 0 && remainingSeconds !== prevRemainingRef.current) {
      prevRemainingRef.current = remainingSeconds;
      const isUrgent = remainingSeconds <= 10;
      soundEngine.playTimerTick(isUrgent);
    }
  }, [remainingSeconds, isPaused]);

  // When timer expires, play the higher-pitched, louder 3-second "dooo" alarm once and notify parent
  useEffect(() => {
    if (remainingSeconds <= 0 && !hasPlayedExpiredRef.current) {
      hasPlayedExpiredRef.current = true;
      soundEngine.playTimerExpiredDooo();
      onTimeExpired();
    }
  }, [remainingSeconds, onTimeExpired]);

  const pct = Math.min(100, Math.max(0, (remainingSeconds / maxSeconds) * 100));
  const isTimeUp = remainingSeconds <= 0;
  const isUrgent = remainingSeconds <= 10 && remainingSeconds > 0;

  return (
    <div className={`flex items-center gap-3 border-2 rounded-xl px-4 py-2 shadow-md transition-all font-serif ${
      isTimeUp
        ? 'bg-rose-100 border-rose-700 shadow-rose-900/30 animate-pulse text-rose-950'
        : isUrgent
        ? 'bg-amber-200/95 border-amber-900 shadow-amber-900/40 text-amber-950 ring-2 ring-amber-500 animate-pulse'
        : 'bg-amber-100/90 border-amber-800/60 text-amber-950'
    }`}>
      <div className="flex items-center gap-1.5 text-xs font-bold">
        {isTimeUp ? (
          <AlertTriangle className="w-4 h-4 text-rose-700 animate-bounce" />
        ) : isUrgent ? (
          <AlertTriangle className="w-4 h-4 text-amber-900 animate-bounce" />
        ) : (
          <Timer className="w-4 h-4 text-blue-700" />
        )}
        <span className={isTimeUp ? 'text-rose-950 font-black' : isUrgent ? 'text-amber-950 font-black tracking-wide' : 'text-amber-950'}>
          {isTimeUp ? 'TIME EXPIRED (ACTIONS LOCKED)' : isUrgent ? `⏳ FINAL COUNTDOWN: ${remainingSeconds}s` : `PLANNING TIMER: ${remainingSeconds}s`}
        </span>
      </div>

      <div className="w-24 sm:w-32 bg-amber-900/20 rounded-full h-2.5 border border-amber-900/50 overflow-hidden shadow-inner">
        <div
          className={`h-full transition-all duration-300 ${
            isTimeUp ? 'bg-rose-600' : isUrgent ? 'bg-rose-600 animate-pulse' : pct > 40 ? 'bg-blue-600' : 'bg-amber-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
