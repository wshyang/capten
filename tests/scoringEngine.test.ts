import { describe, it, expect } from 'vitest';
import { createInitialState } from '../src/engine/setup';
import { gameReducer } from '../src/engine/reducer';
import { generateAptitudeReport } from '../src/engine/scoring';
import { determineSuggestedRole } from '../src/engine/config/scoring';

describe('Assessment & Scouting Engine (§12 & §14)', () => {
  it('maps scores to appropriate tactical role and confidence', () => {
    const playmakerRole = determineSuggestedRole({
      RESOURCE: 6.0,
      RISK: 8.5,
      COMPOSURE: 7.0,
      TEAMWORK: 9.0,
      SPATIAL: 7.5,
      LEADERSHIP: 6.5,
    });
    expect(playmakerRole.role).toBe('Playmaker');
    expect(playmakerRole.confidence).toBeGreaterThanOrEqual(65);

    const closerRole = determineSuggestedRole({
      RESOURCE: 9.0,
      RISK: 7.5,
      COMPOSURE: 9.2,
      TEAMWORK: 5.0,
      SPATIAL: 5.0,
      LEADERSHIP: 6.0,
    });
    expect(closerRole.role).toBe('Closer');

    const anchorRole = determineSuggestedRole({
      RESOURCE: 8.5,
      RISK: 4.5,
      COMPOSURE: 6.0,
      TEAMWORK: 6.5,
      SPATIAL: 9.5,
      LEADERSHIP: 5.0,
    });
    expect(anchorRole.role).toBe('Anchor');

    const captainRole = determineSuggestedRole({
      RESOURCE: 7.5,
      RISK: 7.0,
      COMPOSURE: 8.5,
      TEAMWORK: 8.0,
      SPATIAL: 7.5,
      LEADERSHIP: 9.5,
    });
    expect(captainRole.role).toBe('Captain');
  });

  it('generates full Aptitude Report with 6 radar axes, bands, and telemetry', () => {
    let state = createInitialState(789);
    state = gameReducer(state, { type: 'JUMP_BALL_RELEASE', releaseMarginMs: 25, wonBy: 'PLAYER' });
    state = gameReducer(state, { type: 'CONCEDE_OR_END' });

    const report = generateAptitudeReport(state);
    expect(report.overallScore).toBeGreaterThan(0);
    expect(report.overallScore).toBeLessThanOrEqual(10);

    expect(report.normalizedScores.RESOURCE).toBeDefined();
    expect(report.normalizedScores.RISK).toBeDefined();
    expect(report.normalizedScores.COMPOSURE).toBeDefined();
    expect(report.normalizedScores.TEAMWORK).toBeDefined();
    expect(report.normalizedScores.SPATIAL).toBeDefined();
    expect(report.normalizedScores.LEADERSHIP).toBeDefined();

    expect(report.bands.RESOURCE).toMatch(/Developing|Solid|Strong/);
    expect(report.scoutingReport.headline.length).toBeGreaterThan(5);
    expect(report.scoutingReport.strengths.length).toBeGreaterThan(0);
  });
});
