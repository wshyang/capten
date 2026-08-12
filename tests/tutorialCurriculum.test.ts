import { describe, it, expect } from 'vitest';
import { TUTORIAL_STEPS } from '../src/ui/TutorialOverlay';

describe('Tutorial Mode Curriculum & Testability (§12)', () => {
  it('contains exactly 12 progressive curriculum steps covering all core gameplay mechanics', () => {
    expect(TUTORIAL_STEPS.length).toBe(12);
  });

  it('verifies that each step has non-empty titles, subtitles, explanations, and key takeaways', () => {
    TUTORIAL_STEPS.forEach((step, idx) => {
      expect(step.id).toBe(idx + 1);
      expect(step.title.length).toBeGreaterThan(5);
      expect(step.subtitle.length).toBeGreaterThan(5);
      expect(step.explanation.length).toBeGreaterThan(20);
      expect(step.keyTakeaway.length).toBeGreaterThan(15);
      expect(step.highlightTestId).toBeDefined();
    });
  });

  it('verifies scripted walkthrough progression: Court -> Energy -> Select -> Stage cell -> Possession -> Throw -> Cut -> AoC -> Restart -> Rest -> Momentum -> Commit', () => {
    // Each entry: [expected title substring, whether the step is a required click step]
    const expected: Array<[string, boolean]> = [
      ['Sand Court', false],
      ['Energy Pool', false],
      ['Selecting a Player', true],   // click required (non-carrier piece)
      ['Staging a Destination', true], // click required (destination cell)
      ['No Running', false],
      ['Throwing to a Teammate', true], // click required (ball carrier)
      ['1-Step Receiver Cut', false],
      ['Area-of-Control', false],
      ['Scoring', false],
      ['Compounding Rest', false],
      ['Momentum', false],
      ['Committing the Turn', true],   // click required (commit button)
    ];

    expected.forEach(([titleFragment, requiresClick], idx) => {
      expect(TUTORIAL_STEPS[idx].title).toContain(titleFragment);
      if (requiresClick) {
        expect(TUTORIAL_STEPS[idx].clickTarget).toBeDefined();
        expect(TUTORIAL_STEPS[idx].clickTarget?.prompt.length).toBeGreaterThan(5);
      }
    });
  });

  it('exposes at least one step per scripted-click phase (select, stage, throw, commit)', () => {
    const clickSteps = TUTORIAL_STEPS.filter(s => !!s.clickTarget);
    expect(clickSteps.length).toBeGreaterThanOrEqual(4);
    for (const step of clickSteps) {
      expect(step.clickTarget?.testId).toBeDefined();
      expect(step.clickTarget?.prompt.length).toBeGreaterThan(5);
    }
  });
});
