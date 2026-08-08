import type { Attribute } from '../types';

export const SCORING_CONFIG = {
  bands: {
    developing: { min: 0, max: 3.9, label: 'Developing' as const },
    solid: { min: 4.0, max: 6.9, label: 'Solid' as const },
    strong: { min: 7.0, max: 10.0, label: 'Strong' as const },
  },
  attributeNames: {
    RESOURCE: 'Resource Management',
    RISK: 'Risk Judgement',
    COMPOSURE: 'Composure',
    TEAMWORK: 'Teamwork & Spacing',
    SPATIAL: 'Spatial Control',
    LEADERSHIP: 'Leadership & Tactics',
  } as Record<Attribute, string>,

  attributeDescriptions: {
    RESOURCE: 'Energy efficiency, rest streak compounding, and stamina discipline.',
    RISK: 'Pass danger calibration, clean-pass execution, and measured risk.',
    COMPOSURE: 'Execution quality under timer pressure and jump-ball reflex timing.',
    TEAMWORK: 'Assists to Captain, multi-piece passing chains, and screen synergy.',
    SPATIAL: 'Passing lane denial, defensive coverage, and positioning angles.',
    LEADERSHIP: 'Team posture cohesion, swing card timing, and momentum leadership.',
  } as Record<Attribute, string>,
};

export function determineSuggestedRole(scores: Record<Attribute, number>): {
  role: 'Playmaker' | 'Closer' | 'Anchor' | 'Captain';
  confidence: number;
} {
  const { RESOURCE, RISK, COMPOSURE, TEAMWORK, SPATIAL, LEADERSHIP } = scores;

  const roleScores = {
    Playmaker: TEAMWORK * 0.45 + RISK * 0.35 + SPATIAL * 0.2,
    Closer: RESOURCE * 0.4 + COMPOSURE * 0.35 + RISK * 0.25,
    Anchor: SPATIAL * 0.45 + RESOURCE * 0.35 + TEAMWORK * 0.2,
    Captain: LEADERSHIP * 0.4 + COMPOSURE * 0.3 + (RESOURCE + TEAMWORK + SPATIAL + RISK) / 4 * 0.3,
  };

  let bestRole: 'Playmaker' | 'Closer' | 'Anchor' | 'Captain' = 'Playmaker';
  let bestScore = -1;

  for (const [role, val] of Object.entries(roleScores)) {
    if (val > bestScore) {
      bestScore = val;
      bestRole = role as any;
    }
  }

  const confidence = Math.min(98, Math.max(65, Math.round(bestScore * 9.5)));
  return { role: bestRole, confidence };
}
