// @vitest-environment jsdom
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TutorialOverlay, TUTORIAL_STEPS } from '../../src/ui/TutorialOverlay';

describe('jsdom: <TutorialOverlay /> Component', () => {
  it('should not render anything when isOpen is false', () => {
    const { container } = render(
      <TutorialOverlay
        isOpen={false}
        currentStepIndex={0}
        onNextStep={vi.fn()}
        onPrevStep={vi.fn()}
        onGoToStep={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render step title, explanation, and step counter when open', () => {
    const firstStep = TUTORIAL_STEPS[0];
    render(
      <TutorialOverlay
        isOpen={true}
        currentStepIndex={0}
        onNextStep={vi.fn()}
        onPrevStep={vi.fn()}
        onGoToStep={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const overlay = screen.getByTestId('tutorial-step-overlay');
    expect(overlay).toBeDefined();
    expect(screen.getByText(firstStep.title)).toBeDefined();
    expect(screen.getByText(new RegExp(`Step 1 / ${TUTORIAL_STEPS.length}`))).toBeDefined();
  });

  it('should call onNextStep when Next button is clicked', () => {
    const onNextStep = vi.fn();
    render(
      <TutorialOverlay
        isOpen={true}
        currentStepIndex={0}
        onNextStep={onNextStep}
        onPrevStep={vi.fn()}
        onGoToStep={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const nextBtn = screen.getByText('Next');
    fireEvent.click(nextBtn);
    expect(onNextStep).toHaveBeenCalledTimes(1);
  });

  it('should call onPrevStep when Prev button is clicked on step index 1', () => {
    const onPrevStep = vi.fn();
    render(
      <TutorialOverlay
        isOpen={true}
        currentStepIndex={1}
        onNextStep={vi.fn()}
        onPrevStep={onPrevStep}
        onGoToStep={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const prevBtn = screen.getByText('Prev');
    fireEvent.click(prevBtn);
    expect(onPrevStep).toHaveBeenCalledTimes(1);
  });

  it('should call onClose when Exit button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TutorialOverlay
        isOpen={true}
        currentStepIndex={0}
        onNextStep={vi.fn()}
        onPrevStep={vi.fn()}
        onGoToStep={vi.fn()}
        onClose={onClose}
      />
    );

    // The overlay now exposes two close paths — a labelled "Skip Tutorial"
    // button and the icon-only X. This test asserts the labelled button
    // works; the X is a duplicate affordance with an identical onClose.
    const exitBtn = screen.getByTestId('tutorial-skip-all');
    fireEvent.click(exitBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
