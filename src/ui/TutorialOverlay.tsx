import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  HelpCircle,
  MousePointerClick,
  Lock,
} from 'lucide-react';
import { soundEngine } from './TacticalAudio';
import {
  TUTORIAL_STEPS,
  resolveTestId,
  type TutorialStep,
} from '../engine/config/tutorial';
import type { GameState } from '../engine/types';

export { TUTORIAL_STEPS, type TutorialStep };

interface TutorialOverlayProps {
  isOpen: boolean;
  currentStepIndex: number;
  onNextStep: () => void;
  onPrevStep: () => void;
  onGoToStep: (index: number) => void;
  onClose: () => void;
  gameState?: GameState;
}

/** Small helper: locate an element by data-testid or id. */
function findEl(testId: string | undefined): HTMLElement | null {
  if (!testId) return null;
  return (
    (document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null) ||
    (document.getElementById(testId) as HTMLElement | null)
  );
}

/**
 * Hand-drawn oval highlight ring around the focused element.
 * Reports the element's bounding rect back to the parent so the popup card
 * and pointer arrow can position themselves relative to it.
 */
const EdStyleOvalHighlight: React.FC<{
  testId?: string;
  onRectChange: (rect: DOMRect | null) => void;
}> = ({ testId, onRectChange }) => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!testId) {
      setRect(null);
      onRectChange(null);
      return;
    }
    const measure = () => {
      const el = findEl(testId);
      if (el) {
        const r = el.getBoundingClientRect();
        // Auto-scroll into view if hidden.
        if (
          r.top < 40 ||
          r.bottom > window.innerHeight - 40 ||
          r.left < 0 ||
          r.right > window.innerWidth
        ) {
          try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          } catch {
            /* ignore */
          }
        }
        setRect(r);
        onRectChange(r);
      } else {
        setRect(null);
        onRectChange(null);
      }
    };
    measure();
    const interval = setInterval(measure, 200);
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
          cx="50" cy="50" rx="47" ry="45"
          fill="none" stroke="#dc2626" strokeWidth="2.5"
          strokeDasharray="14 3 8 4 20 2" strokeLinecap="round"
          transform="rotate(-2 50 50)" className="opacity-95"
        />
        <ellipse
          cx="51" cy="49" rx="49" ry="48"
          fill="none" stroke="#f59e0b" strokeWidth="3"
          strokeDasharray="18 4 12 3 24 2" strokeLinecap="round"
          transform="rotate(3 50 50)" className="opacity-90"
        />
      </svg>
    </div>
  );
};

/**
 * A blinking pointer badge + arrow anchored on the target element.
 * Renders on top of the highlight; sits outside the popup card so the two
 * don't overlap.
 */
const PointerBadge: React.FC<{ rect: DOMRect | null; label?: string }> = ({ rect, label }) => {
  if (!rect) return null;
  // Anchor the badge on the top-right corner of the target and let it
  // pop OUTWARD so it doesn't obscure the target itself.
  const x = Math.min(window.innerWidth - 160, rect.right + 6);
  const y = Math.max(6, rect.top - 34);
  return (
    <div
      style={{ position: 'fixed', left: x, top: y, zIndex: 52 }}
      className="pointer-events-none animate-bounce"
    >
      <div className="flex items-center gap-1 bg-red-600 border-2 border-amber-300 text-white font-black text-[10px] px-2 py-1 rounded-full shadow-lg tracking-wider">
        <MousePointerClick className="w-3 h-3" />
        <span>{label || 'CLICK ME'}</span>
      </div>
    </div>
  );
};

/**
 * Compute a card position (in viewport coords) that does NOT overlap the
 * highlighted target's rect. Falls back to a top-right anchor if there is
 * no target rect. Card size is roughly 384x360px (max-w-sm).
 */
function computeCardPosition(
  targetRect: DOMRect | null,
  cardSize: { w: number; h: number }
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;
  const gap = 20;

  if (!targetRect) {
    return { left: Math.max(margin, vw - cardSize.w - margin), top: margin };
  }

  // Candidate positions relative to the target: right, left, below, above.
  const candidates = [
    // Right of target, vertically centered
    { left: targetRect.right + gap, top: Math.min(vh - cardSize.h - margin, Math.max(margin, targetRect.top + targetRect.height / 2 - cardSize.h / 2)) },
    // Left of target
    { left: targetRect.left - gap - cardSize.w, top: Math.min(vh - cardSize.h - margin, Math.max(margin, targetRect.top + targetRect.height / 2 - cardSize.h / 2)) },
    // Below target
    { left: Math.min(vw - cardSize.w - margin, Math.max(margin, targetRect.left + targetRect.width / 2 - cardSize.w / 2)), top: targetRect.bottom + gap },
    // Above target
    { left: Math.min(vw - cardSize.w - margin, Math.max(margin, targetRect.left + targetRect.width / 2 - cardSize.w / 2)), top: targetRect.top - gap - cardSize.h },
    // Bottom-right corner fallback
    { left: vw - cardSize.w - margin, top: vh - cardSize.h - margin },
    // Top-left corner fallback
    { left: margin, top: margin },
  ];

  const targetBox = {
    left: targetRect.left - 8,
    top: targetRect.top - 8,
    right: targetRect.right + 8,
    bottom: targetRect.bottom + 8,
  };

  const overlaps = (pos: { left: number; top: number }) => {
    const cardBox = {
      left: pos.left,
      top: pos.top,
      right: pos.left + cardSize.w,
      bottom: pos.top + cardSize.h,
    };
    return !(
      cardBox.right < targetBox.left ||
      cardBox.left > targetBox.right ||
      cardBox.bottom < targetBox.top ||
      cardBox.top > targetBox.bottom
    );
  };

  const inViewport = (pos: { left: number; top: number }) =>
    pos.left >= margin &&
    pos.top >= margin &&
    pos.left + cardSize.w <= vw - margin &&
    pos.top + cardSize.h <= vh - margin;

  // Pick the first candidate that (a) is in viewport and (b) doesn't overlap.
  for (const c of candidates) {
    if (inViewport(c) && !overlaps(c)) return c;
  }
  // Otherwise the first in-viewport one, or the very last fallback.
  for (const c of candidates) {
    if (inViewport(c)) return c;
  }
  return candidates[candidates.length - 1];
}

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isOpen,
  currentStepIndex,
  onNextStep,
  onPrevStep,
  onGoToStep,
  onClose,
  gameState,
}) => {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [clickTargetRect, setClickTargetRect] = useState<DOMRect | null>(null);
  const [clickSatisfied, setClickSatisfied] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number }>({ left: 20, top: 20 });

  const currentStep = TUTORIAL_STEPS[currentStepIndex] || TUTORIAL_STEPS[0];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === TUTORIAL_STEPS.length - 1;

  // Resolve dynamic testIds against the current game state so, for example,
  // step 5 highlights whichever piece currently carries the ball rather than
  // hard-coding p_1.
  const highlightTestId = useMemo(
    () => resolveTestId(currentStep.highlightTestId, gameState),
    [currentStep, gameState]
  );
  const clickTestId = useMemo(
    () => resolveTestId(currentStep.clickTarget?.testId, gameState),
    [currentStep, gameState]
  );

  // Reset the click-satisfied flag on every step change.
  useEffect(() => {
    setClickSatisfied(false);
    setClickTargetRect(null);
  }, [currentStepIndex, clickTestId]);

  // Track the click-target rect (may differ from the highlight rect when we
  // want to point at a chip inside the highlighted region).
  useEffect(() => {
    if (!isOpen || !clickTestId) {
      setClickTargetRect(null);
      return;
    }
    const measure = () => {
      const el = findEl(clickTestId);
      setClickTargetRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const interval = setInterval(measure, 200);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [isOpen, clickTestId]);

  // Listen (in capture phase) for the required click anywhere in the app.
  useEffect(() => {
    if (!isOpen || !clickTestId) return;
    const handler = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      // Walk up and see if we're inside the required element.
      const wanted =
        (document.querySelector(`[data-testid="${clickTestId}"]`) as HTMLElement | null) ||
        (document.getElementById(clickTestId) as HTMLElement | null);
      if (wanted && (wanted === target || wanted.contains(target))) {
        setClickSatisfied(true);
        soundEngine.playBlip(720, 0.04);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [isOpen, clickTestId]);

  // Recompute the popup card position whenever the target moves or the step
  // changes. Uses the card's actual measured size when possible.
  const updateCardPosition = useCallback(() => {
    const cardW = cardRef.current?.offsetWidth || 384;
    const cardH = cardRef.current?.offsetHeight || 360;
    setCardPos(computeCardPosition(targetRect, { w: cardW, h: cardH }));
  }, [targetRect]);

  useEffect(() => {
    updateCardPosition();
  }, [updateCardPosition, currentStepIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => updateCardPosition();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen, updateCardPosition]);

  if (!isOpen) return null;

  const canAdvance = !currentStep.clickTarget || clickSatisfied;

  return (
    <div
      data-testid="tutorial-step-overlay"
      className="fixed inset-0 z-50 pointer-events-none font-serif overflow-hidden"
    >
      {/* Dashed oval highlight around the focused element */}
      <EdStyleOvalHighlight testId={highlightTestId} onRectChange={setTargetRect} />

      {/* Pointer arrow badge, only when the step has a required click */}
      {currentStep.clickTarget && !clickSatisfied && (
        <PointerBadge rect={clickTargetRect || targetRect} label={currentStep.clickTarget.pointerLabel} />
      )}

      {/* Popup card, positioned dynamically to avoid the highlight */}
      <div
        ref={cardRef}
        style={{
          position: 'fixed',
          left: cardPos.left,
          top: cardPos.top,
          width: 'min(24rem, calc(100vw - 32px))',
        }}
        className="parchment-card rounded-2xl p-4 shadow-2xl border-2 border-[#5c3a1e] space-y-2.5 pointer-events-auto animate-fadeIn max-h-[85vh] overflow-y-auto"
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

          {/* Interactive prompt: what the user must click to advance */}
          {currentStep.clickTarget && (
            <div
              className={`p-2.5 rounded-xl border-2 flex items-start gap-1.5 shadow-xs transition-all ${
                clickSatisfied
                  ? 'bg-emerald-100 border-emerald-700'
                  : 'bg-red-100 border-red-700 animate-pulse'
              }`}
            >
              {clickSatisfied ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
              ) : (
                <MousePointerClick className="w-4 h-4 text-red-700 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <strong className={`block text-[10px] uppercase tracking-wider font-sans font-black ${clickSatisfied ? 'text-emerald-950' : 'text-red-950'}`}>
                  {clickSatisfied ? 'Nice — click registered!' : 'Your turn:'}
                </strong>
                <span className={`text-[11px] font-serif ${clickSatisfied ? 'text-emerald-900' : 'text-red-900'}`}>
                  {currentStep.clickTarget.prompt}
                </span>
              </div>
            </div>
          )}

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
              disabled={!canAdvance}
              onClick={() => {
                soundEngine.playGoal();
                onClose();
              }}
              className={`py-1.5 px-3 rounded-lg text-white font-black text-[11px] shadow-md border flex items-center gap-1 active:scale-95 transition-all ${
                canAdvance
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 border-emerald-950 cursor-pointer'
                  : 'bg-gray-400 border-gray-600 opacity-60 cursor-not-allowed'
              }`}
              title={canAdvance ? 'Finish tutorial' : 'Complete the required click first'}
            >
              {!canAdvance && <Lock className="w-3 h-3" />}
              <span>Finish!</span>
              <CheckCircle2 className="w-3 h-3 fill-white" />
            </button>
          ) : (
            <button
              disabled={!canAdvance}
              onClick={() => {
                soundEngine.playBlip(540, 0.06);
                onNextStep();
              }}
              className={`py-1.5 px-3 rounded-lg text-white font-black text-[11px] shadow-md border flex items-center gap-1 active:scale-95 transition-all ${
                canAdvance
                  ? 'bg-blue-600 hover:bg-blue-500 border-blue-950 cursor-pointer'
                  : 'bg-gray-400 border-gray-600 opacity-60 cursor-not-allowed'
              }`}
              title={canAdvance ? 'Next step' : 'Complete the required click first'}
            >
              {!canAdvance && <Lock className="w-3 h-3" />}
              <span>Next</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
