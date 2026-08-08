import type { Attribute, AptitudeReport, GameState } from './types';
import { determineSuggestedRole } from './config/scoring';

export function generateAptitudeReport(state: GameState): AptitudeReport {
  const events = state.eventLog;
  
  let cleanPasses = 0;
  let interceptedPasses = 0;
  let totalPasses = 0;
  let forcedDiscards = 0;
  let cardsPlayed = 0;
  let assistsToCaptain = 0;
  let interceptionsMade = 0;
  let restStreaksCompounded = 0;
  let maxRestStreak = 0;
  let totalRestStreakAccumulated = 0;
  const jumpBallMarginMs = state.jumpBall.releaseMarginMs ?? 45;
  let energySpentProductively = 0;
  const energyWasted = 0;

  for (const ev of events) {
    if (ev.side === 'PLAYER') {
      if (ev.type === 'PASS_CLEAN_REFUND') {
        cleanPasses++;
        totalPasses++;
      } else if (ev.type === 'PASS_COMPLETED') {
        totalPasses++;
      } else if (ev.type === 'PASS_INTERCEPTED') {
        interceptedPasses++;
        totalPasses++;
      } else if (ev.type === 'SCORE_GOAL') {
        assistsToCaptain++;
      } else if (ev.type === 'CARD_PLAYED') {
        cardsPlayed++;
      } else if (ev.type === 'CARD_DISCARDED') {
        if (ev.details?.wasForced) {
          forcedDiscards++;
        }
      } else if (ev.type === 'REST_COMPOUNDED') {
        restStreaksCompounded++;
        const s = Number(ev.details?.restStreak || 0);
        totalRestStreakAccumulated += s;
        if (s > maxRestStreak) maxRestStreak = s;
      } else if (ev.type === 'PIECE_MOVED') {
        energySpentProductively += Number(ev.details?.cost || 1);
      }
    } else if (ev.side === 'AI') {
      if (ev.type === 'PASS_INTERCEPTED' && ev.details?.interceptedByPieceId?.startsWith('p_')) {
        interceptionsMade++;
      }
    }
  }

  const latencies = state.timer.latencies.length > 0 ? state.timer.latencies : [12.4];
  const avgTurnPlanningLatencyMs = Math.round(
    latencies.reduce((a, b) => a + b, 0) / latencies.length
  );
  
  const meanLatency = avgTurnPlanningLatencyMs;
  const variance = latencies.reduce((sum, val) => sum + Math.pow(val - meanLatency, 2), 0) / latencies.length;
  const stdDevLatency = Math.sqrt(variance);

  const avgRestStreak = restStreaksCompounded > 0 ? (totalRestStreakAccumulated / restStreaksCompounded) : 1.5;
  const discardPenalty = Math.max(0, forcedDiscards * 0.8);
  const rawA1 = Math.max(1.0, Math.min(10.0, 
    3.5 + 
    (avgRestStreak * 1.2) + 
    (maxRestStreak * 0.4) + 
    (energySpentProductively > 10 ? 1.5 : 0.8) - 
    discardPenalty
  ));

  const cleanPassRate = totalPasses > 0 ? (cleanPasses / totalPasses) : 0.6;
  const interceptionPenalty = interceptedPasses * 1.4;
  const rawA2 = Math.max(1.0, Math.min(10.0,
    3.0 + 
    (cleanPassRate * 4.5) + 
    (cleanPasses * 1.0) - 
    interceptionPenalty + 
    (totalPasses >= 3 ? 1.2 : 0)
  ));

  const jumpBallScore = Math.max(0.5, 3.5 - (Math.abs(jumpBallMarginMs) / 75));
  const latencyConsistencyScore = Math.max(0.5, 3.5 - (stdDevLatency / 3000));
  const timerEfficiency = avgTurnPlanningLatencyMs < 20000 ? 2.5 : 1.5;
  const rawA3 = Math.max(1.0, Math.min(10.0,
    1.0 + jumpBallScore + latencyConsistencyScore + timerEfficiency
  ));

  const assistScore = assistsToCaptain * 2.8;
  const passChainScore = totalPasses * 1.1;
  const rawA4 = Math.max(1.0, Math.min(10.0,
    2.5 + assistScore + passChainScore + (cardsPlayed >= 2 ? 1.2 : 0)
  ));

  const interceptionScore = interceptionsMade * 2.2;
  const laneDenialScore = (cleanPassRate * 2.0) + (avgRestStreak * 0.8);
  const rawA5 = Math.max(1.0, Math.min(10.0,
    3.0 + interceptionScore + laneDenialScore
  ));

  const cardImpactScore = cardsPlayed * 1.3;
  const winBonus = state.score.PLAYER > state.score.AI ? 2.0 : 0.8;
  const rawA6 = Math.max(1.0, Math.min(10.0,
    2.8 + cardImpactScore + winBonus + (assistsToCaptain >= 1 ? 1.4 : 0)
  ));

  const normalizedScores: Record<Attribute, number> = {
    RESOURCE: Number(rawA1.toFixed(1)),
    RISK: Number(rawA2.toFixed(1)),
    COMPOSURE: Number(rawA3.toFixed(1)),
    TEAMWORK: Number(rawA4.toFixed(1)),
    SPATIAL: Number(rawA5.toFixed(1)),
    LEADERSHIP: Number(rawA6.toFixed(1)),
  };

  const attributePoints: Record<Attribute, number> = {
    RESOURCE: Number((rawA1 * 12).toFixed(0)),
    RISK: Number((rawA2 * 12).toFixed(0)),
    COMPOSURE: Number((rawA3 * 12).toFixed(0)),
    TEAMWORK: Number((rawA4 * 12).toFixed(0)),
    SPATIAL: Number((rawA5 * 12).toFixed(0)),
    LEADERSHIP: Number((rawA6 * 12).toFixed(0)),
  };

  const getBand = (score: number): 'Developing' | 'Solid' | 'Strong' => {
    if (score < 4.0) return 'Developing';
    if (score < 7.0) return 'Solid';
    return 'Strong';
  };

  const bands: Record<Attribute, 'Developing' | 'Solid' | 'Strong'> = {
    RESOURCE: getBand(normalizedScores.RESOURCE),
    RISK: getBand(normalizedScores.RISK),
    COMPOSURE: getBand(normalizedScores.COMPOSURE),
    TEAMWORK: getBand(normalizedScores.TEAMWORK),
    SPATIAL: getBand(normalizedScores.SPATIAL),
    LEADERSHIP: getBand(normalizedScores.LEADERSHIP),
  };

  const { role, confidence } = determineSuggestedRole(normalizedScores);

  const overallScore = Number(
    (
      (normalizedScores.RESOURCE +
        normalizedScores.RISK +
        normalizedScores.COMPOSURE +
        normalizedScores.TEAMWORK +
        normalizedScores.SPATIAL +
        normalizedScores.LEADERSHIP) /
      6
    ).toFixed(1)
  );

  const strengths: string[] = [];
  const areasForGrowth: string[] = [];

  if (normalizedScores.RESOURCE >= 6.5) {
    strengths.push('Disciplined stamina management; compounds rest streaks for high energy sustainability.');
  } else {
    areasForGrowth.push('Rest discipline: avoid unnecessary movements on off-ball pieces to let compounding regen trigger.');
  }

  if (normalizedScores.RISK >= 6.5) {
    strengths.push('Exceptional passing angle selection; frequently earns clean-pass energy refunds.');
  } else {
    areasForGrowth.push('Passing safety: look for zero-enemy control corridors or play Threaded Pass before throwing.');
  }

  if (normalizedScores.COMPOSURE >= 6.5) {
    strengths.push('Steady decision pacing and sharp reflexes during opening jump-ball contests.');
  } else {
    areasForGrowth.push('Time management: maintain consistent planning cadence without rushing end-of-timer plays.');
  }

  if (normalizedScores.TEAMWORK >= 6.5) {
    strengths.push('Masterful ball distribution; creates high-percentage assist corridors for the Captain.');
  } else {
    areasForGrowth.push('Ball circulation: connect multi-piece passing chains before feeding the final scoring target.');
  }

  if (normalizedScores.SPATIAL >= 6.5) {
    strengths.push('Formidable defensive positioning; denies enemy passing lanes with stacked control fields.');
  } else {
    areasForGrowth.push('Defensive coverage: position wing defenders along direct passing lines to force difficult interception roulettes.');
  }

  if (normalizedScores.LEADERSHIP >= 6.5) {
    strengths.push('High-leverage Momentum economy usage; timely deployment of swing cards and tactical buffs.');
  } else {
    areasForGrowth.push('Momentum utilization: cycle and deploy cards each turn to prevent forced discards.');
  }

  let headline = '';
  let summary = '';
  let tacticalDNA = '';

  switch (role) {
    case 'Playmaker':
      headline = 'Visionary Floor General & Tactical Distributor';
      summary = `Demonstrates elite vision across the 11x11 grid with a ${(cleanPassRate * 100).toFixed(0)}% clean pass rate. Threads balls through contested lanes and synchronizes assists with Captain precision.`;
      tacticalDNA = 'Aggressive lane manipulation, high-frequency ball circulation, and pinpoint delivery.';
      break;
    case 'Closer':
      headline = 'Clinical Executioner with Ice in the Veins';
      summary = `Highly efficient in converting opportunities in the final third. Operates with supreme composure under time pressure and maximizes post-throw energy reserves.`;
      tacticalDNA = 'Calculated aggression, energy preservation, and decisive scoring strikes.';
      break;
    case 'Anchor':
      headline = 'Spatial Bastion & Compounding Rest Master';
      summary = `Maintains iron-clad court positioning with an average rest streak of ${avgRestStreak.toFixed(1)}. Denies passing lanes while building insurmountable energy superiority.`;
      tacticalDNA = 'Positional patience, stacked defensive control fields, and lane denial.';
      break;
    case 'Captain':
      headline = 'Balanced Architect of Team Posture';
      summary = `Exhibits holistic mastery across all six tactical axes (${overallScore}/10). Coordinates joint 4-piece formations and orchestrates momentum swing cards with exceptional timing.`;
      tacticalDNA = 'Holistic tactical coherence, adaptive posture leadership, and clutch playmaking.';
      break;
  }

  return {
    overallScore,
    attributePoints,
    normalizedScores,
    bands,
    suggestedRole: role,
    roleMatchConfidence: confidence,
    scoutingReport: {
      headline,
      summary,
      strengths,
      areasForGrowth,
      tacticalDNA,
    },
    telemetry: {
      totalTurns: state.turn,
      cleanPasses,
      interceptedPasses,
      totalPasses,
      cleanPassRate: Number((cleanPassRate * 100).toFixed(1)),
      maxRestStreak,
      avgRestStreak: Number(avgRestStreak.toFixed(1)),
      forcedDiscards,
      cardsPlayed,
      energyWasted,
      avgTurnPlanningLatencyMs,
      jumpBallMarginMs,
      assistsToCaptain,
      interceptionsMade,
      holdingFoulsCommitted: events.filter(e => e.type === 'HOLDING_FOUL_TURNOVER' && e.side === 'PLAYER').length,
      aiDifficultyTier: state.config.mcts.tier,
    },
  };
}
