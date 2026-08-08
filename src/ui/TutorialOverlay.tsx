import React from 'react';
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

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({
  isOpen,
  currentStepIndex,
  onNextStep,
  onPrevStep,
  onGoToStep,
  onClose,
}) => {
  if (!isOpen) return null;

  const currentStep = TUTORIAL_STEPS[currentStepIndex] || TUTORIAL_STEPS[0];
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === TUTORIAL_STEPS.length - 1;

  return (
    <div
      data-testid="tutorial-step-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs font-serif animate-fadeIn"
    >
      <div className="w-full max-w-xl parchment-card rounded-3xl p-5 sm:p-7 shadow-2xl border-4 border-[#5c3a1e] space-y-4 relative">
        {/* Header with Step Counter & Close */}
        <div className="flex items-center justify-between border-b-2 border-dashed border-[#8b5a2b]/40 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full wax-seal-gold flex items-center justify-center shadow-md">
              <Compass className="w-4 h-4 text-amber-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-amber-200 border border-amber-800 text-amber-950 px-2 py-0.5 rounded-full">
                  Step {currentStepIndex + 1} of {TUTORIAL_STEPS.length}
                </span>
                <span className="text-xs font-bold text-amber-900">Tutorial Academy</span>
              </div>
              <h2 className="font-extrabold text-base sm:text-lg text-amber-950 mt-0.5 tracking-tight">
                {currentStep.title}
              </h2>
            </div>
          </div>

          <button
            onClick={() => {
              soundEngine.playBlip(300, 0.05);
              onClose();
            }}
            className="p-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 border border-amber-800 text-amber-950 transition-all cursor-pointer"
            title="Exit Tutorial"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Content */}
        <div className="space-y-3 text-xs leading-relaxed text-amber-950">
          <div className="font-black text-amber-900 text-sm flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-700 animate-pulse" />
            <span>{currentStep.subtitle}</span>
          </div>

          <p className="bg-amber-50/70 p-3 rounded-2xl border border-amber-700/30 text-amber-950 text-xs sm:text-[13px] leading-relaxed">
            {currentStep.explanation}
          </p>

          <div className="p-3 rounded-2xl bg-emerald-50 border-2 border-emerald-700/60 flex items-start gap-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-emerald-950 block text-[11px] uppercase tracking-wider font-sans font-black">
                Tactical Rule & Invariant:
              </strong>
              <span className="text-emerald-900 font-serif">{currentStep.keyTakeaway}</span>
            </div>
          </div>

          {currentStep.tip && (
            <div className="px-3 py-1.5 rounded-xl bg-amber-200/70 border border-amber-700/50 text-[11px] text-amber-950 flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-amber-800 flex-shrink-0" />
              <span><strong>Captain&apos;s Pro Tip:</strong> {currentStep.tip}</span>
            </div>
          )}
        </div>

        {/* Step Progress Indicators */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {TUTORIAL_STEPS.map((step, idx) => (
            <button
              key={step.id}
              onClick={() => {
                soundEngine.playBlip(480, 0.04);
                onGoToStep(idx);
              }}
              title={step.title}
              className={`h-2 rounded-full transition-all duration-200 cursor-pointer ${
                idx === currentStepIndex
                  ? 'w-6 bg-amber-800 scale-105'
                  : idx < currentStepIndex
                  ? 'w-2 bg-emerald-600'
                  : 'w-2 bg-amber-300/80 hover:bg-amber-400'
              }`}
            />
          ))}
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between border-t-2 border-dashed border-[#8b5a2b]/40 pt-3 gap-2">
          <button
            disabled={isFirst}
            onClick={() => {
              soundEngine.playBlip(420, 0.05);
              onPrevStep();
            }}
            className="py-2 px-3.5 rounded-xl border-2 border-amber-800/80 text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </button>

          <button
            onClick={() => {
              soundEngine.playBlip(350, 0.05);
              onGoToStep(0);
            }}
            className="py-1 px-2.5 rounded-lg text-[10px] font-bold text-amber-900 hover:text-amber-950 hover:bg-amber-100 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Restart Tutorial</span>
          </button>

          {isLast ? (
            <button
              onClick={() => {
                soundEngine.playGoal();
                onClose();
              }}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-lg border-2 border-emerald-950 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span>Finish & Start Playing!</span>
              <CheckCircle2 className="w-3.5 h-3.5 fill-white" />
            </button>
          ) : (
            <button
              onClick={() => {
                soundEngine.playBlip(540, 0.06);
                onNextStep();
              }}
              className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg border-2 border-blue-950 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <span>Next Step ({currentStepIndex + 2}/{TUTORIAL_STEPS.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
