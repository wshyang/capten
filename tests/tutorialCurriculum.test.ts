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

  it('verifies curriculum progression: Grid/Captains -> Energy -> Move -> Possession -> Throw -> Cut -> AoC -> Baseline -> Rest -> Momentum -> Cards -> Fouls', () => {
    expect(TUTORIAL_STEPS[0].title).toContain('Sand Court');
    expect(TUTORIAL_STEPS[1].title).toContain('Energy Pool');
    expect(TUTORIAL_STEPS[2].title).toContain('How to Move');
    expect(TUTORIAL_STEPS[3].title).toContain('No Running');
    expect(TUTORIAL_STEPS[4].title).toContain('How to Throw');
    expect(TUTORIAL_STEPS[5].title).toContain('1-Step Receiver Cut');
    expect(TUTORIAL_STEPS[6].title).toContain('Area-of-Control');
    expect(TUTORIAL_STEPS[7].title).toContain('Baseline Restart');
    expect(TUTORIAL_STEPS[8].title).toContain('Compounding Rest');
    expect(TUTORIAL_STEPS[9].title).toContain('Momentum');
    expect(TUTORIAL_STEPS[10].title).toContain('Card Targeting');
    expect(TUTORIAL_STEPS[11].title).toContain('Holding Fouls');
  });
});
