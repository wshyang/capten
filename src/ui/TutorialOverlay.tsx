import React, { useState, useEffect } from 'react';
import { Compass, ArrowRight, ArrowLeft, X, Sparkles, CheckCircle2, RotateCcw, HelpCircle } from 'lucide-react';
import { soundEngine } from './TacticalAudio';
import { TUTORIAL_STEPS, type TutorialStep } from '../engine/config/tutorial';

export { TUTORIAL_STEPS, type TutorialStep };

interface TutorialOverlayProps {
  isOpen: boolean;
  currentStepIndex: number;
  onNextStep: () => void;
  onPrevStep: () => void;
  onGoToStep: (index: number) => void;
  onClose: () => void;
}

const EdStyleOvalHighlight: React.FC<{
  testId?: string;
  onRectChange?: (rect: DOMRect | null) => void;
}> = ({ testId, onRectChange }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!testId) {
      setRect(null);
      onRectChange?.(null);
      return;
    }
    const measure = () => {
      const el =
        document.querySelector(`[data-testid="${testId}"]`) ||
        document.querySelector(`[id="${testId}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        if (
          r.top < 0 ||
          r.bottom > window.innerHeight ||
          r.left < 0 ||
          r.right > window.innerWidth
        ) {
          try {
            if (typeof el.scrollIntoView === 'function') {
              el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
          } catch {
            // ignore scroll errors
          }
        }
        setRect(r);
        onRectChange?.(r);
      } else {
        const boardEl =
          document.querySelector('[data-testid="court-cell-5-10"]') ||
          document.querySelector('[data-testid="court-cell-5-5"]');
        if (boardEl) {
          const r = boardEl.getBoundingClientRect();
          setRect(r);
          onRectChange?.(r);
        } else {
          setRect(null);
          onRectChange?.(null);
        }
      }
    };
    measure();
    const interval = setInterval(measure, 150);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [testId, onRectChange]);

  if (!rect) return null;

  const padX = Math.max(16, rect.width * 0.15);
  const padY = Math.max(12, rect.height * 0.2);
  const x = Math.max(0, rect.left - padX);
  const y = Math.max(0, rect.top - padY);
  const width = rect.width + padX * 2;
  const height = rect.height + padY * 2;

  return (
    <div
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 51,
      }}
      className="transition-all duration-300 pointer-events-none animate-pulse"
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full overflow-visible drop-shadow-[0_2px_10px_rgba(217,119,6,0.7)]"
      >
        <ellipse
          cx="50"
          cy="50"
          rx="47"
          ry="45"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2.5"
          strokeDasharray="14 3 8 4 20 2"
          strokeLinecap="round"
          transform="rotate(-2 50 50)"
          className="opacity-95"
        />
        <ellipse
          cx="51"
          cy="49"
          rx="49"
          ry="48"
          fill="none"
          stroke="#f59e0b"
          strokeWidth="3"
          strokeDasharray="18 4 12 3 24 2"
          strokeLinecap="round"
          transform="rotate(3 50 50)"
          className="opacity-90"
        />
        <path
          d="M 15,25 Q 50,5 85,20 Q 98,50 82,85 Q 50,98 18,80 Q 5,50 15,25 Z"
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeDasharray="8 6"
          className="opacity-75"
        />
      </svg>

      <div className="absolute -top-3 -left-2 bg-red-600 border-2 border-amber-300 text-white font-black text-[10px] px-2 py-0.5 rounded-full shadow-lg transform -rotate-6 tracking-wider animate-bounce">
        ★ LOOK HERE!
      </div>
    </div>
  );
};

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isOpen,
  currentStepIndex,
  onNextStep,
  onPrevStep,
  onGoToStep,
  onClose,
}) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  if (!isOpen) return null;

  const currentStep = TUTORIAL_STEPS[currentStepIndex] || TUTORIAL_STEPS[0];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === TUTORIAL_STEPS.length - 1;

  const isTargetTop = targetRect && targetRect.top <= window.innerHeight * 0.48;
  const isTargetRight = targetRect && targetRect.left > window.innerWidth * 0.52;
  const cardPositionClass = isTargetTop
    ? isTargetRight
      ? 'bottom-3 left-3 sm:bottom-5 sm:left-5'
      : 'bottom-3 right-3 sm:bottom-5 sm:right-5'
    : isTargetRight
    ? 'top-3 left-3 sm:top-5 sm:left-5'
    : 'top-3 right-3 sm:top-5 sm:right-5';

  return (
    <div
      data-testid="tutorial-step-overlay"
      className="fixed inset-0 z-50 pointer-events-none font-serif overflow-hidden"
    >
      <EdStyleOvalHighlight
        testId={currentStep.highlightTestId}
        onRectChange={setTargetRect}
      />

      <div
        className={`absolute ${cardPositionClass} w-full max-w-sm parchment-card rounded-2xl p-4 shadow-2xl border-2 border-[#5c3a1e] space-y-2.5 pointer-events-auto animate-fadeIn max-h-[85vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between border-b border-dashed border-[#8b5a2b]/40 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full wax-seal-gold flex items-center justify-center shadow-xs">
              <Compass className="w-3.5 h-3.5 text-amber-950" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200 border border-amber-800 text-amber-950 px-1.5 py-0.5 rounded-full">
                Step {currentStepIndex + 1} / {TUTORIAL_STEPS.length}
              </span>
              <h2 className="font-extrabold text-sm sm:text-base text-amber-950 mt-0.5 tracking-tight">
                {currentStep.title}
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              soundEngine.playBlip(300, 0.05);
              onClose();
            }}
            className="p-1 rounded-lg bg-amber-200 hover:bg-amber-300 border border-amber-800 text-amber-950 transition-all cursor-pointer"
            title="Exit Tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs leading-relaxed text-amber-950">
          <div className="font-black text-amber-900 text-xs flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
            <span>{currentStep.subtitle}</span>
          </div>

          <p className="bg-amber-50/90 p-2.5 rounded-xl border border-amber-700/40 text-amber-950 text-xs leading-relaxed shadow-xs">
            {currentStep.explanation}
          </p>

          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-700/60 flex items-start gap-1.5 shadow-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-emerald-950 block text-[10px] uppercase tracking-wider font-sans font-black">
                Tactical Rule:
              </strong>
              <span className="text-emerald-900 font-serif text-[11px]">{currentStep.keyTakeaway}</span>
            </div>
          </div>

          {currentStep.tip && (
            <div className="px-2.5 py-1 rounded-lg bg-amber-200/80 border border-amber-700/60 text-[11px] text-amber-950 flex items-center gap-1.5 shadow-xs">
              <HelpCircle className="w-3.5 h-3.5 text-amber-800 flex-shrink-0" />
              <span><strong>Pro Tip:</strong> {currentStep.tip}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-1 py-0.5">
          {TUTORIAL_STEPS.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => {
                soundEngine.playBlip(480, 0.04);
                onGoToStep(idx);
              }}
              title={step.title}
              className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                idx === currentStepIndex
                  ? 'w-5 bg-amber-800 scale-105'
                  : idx < currentStepIndex
                  ? 'w-1.5 bg-emerald-600'
                  : 'w-1.5 bg-amber-300/80 hover:bg-amber-400'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-dashed border-[#8b5a2b]/40 pt-2 gap-1.5">
          <button
            disabled={isFirst}
            onClick={() => {
              soundEngine.playBlip(420, 0.05);
              onPrevStep();
            }}
            className="py-1.5 px-2.5 rounded-lg border border-amber-800/80 text-[11px] font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3" />
            <span>Prev</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playBlip(350, 0.05);
              onGoToStep(0);
            }}
            className="py-1 px-2 rounded-md text-[10px] font-bold text-amber-900 hover:text-amber-950 hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restart</span>
          </button>

          {isLast ? (
            <button
              onClick={() => {
                soundEngine.playGoal();
                onClose();
              }}
              className="py-1.5 px-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-[11px] shadow-md border border-emerald-950 flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <span>Finish!</span>
              <CheckCircle2 className="w-3 h-3 fill-white" />
            </button>
          ) : (
            <button
              onClick={() => {
                soundEngine.playBlip(540, 0.06);
                onNextStep();
              }}
              className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-black text-[11px] shadow-md border border-blue-950 flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
            >
              <span>Next</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
