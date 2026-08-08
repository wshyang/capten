import type { Card } from '../types';

export const ALL_CARDS: Card[] = [
  // ===================== RESOURCE (RES) =====================
  {
    id: 'deep_breath',
    name: 'Deep Breath',
    dim: 'RESOURCE',
    momentumCost: 1,
    effect: 'deep_breath',
    description: '+2 rest-streak instantly to a piece, accelerating compounding regen.',
    targetType: 'FRIENDLY_PIECE',
  },
  {
    id: 'second_wind',
    name: 'Second Wind',
    dim: 'RESOURCE',
    momentumCost: 2,
    effect: 'second_wind',
    description: 'Restore +4.0 energy instantly to a chosen piece (clamped to cap).',
    targetType: 'FRIENDLY_PIECE',
  },
  {
    id: 'slow_burn',
    name: 'Slow Burn',
    dim: 'RESOURCE',
    momentumCost: 2,
    effect: 'slow_burn',
    description: '−0.5 move energy cost for chosen piece for the next 3 turns.',
    targetType: 'FRIENDLY_PIECE',
  },
  {
    id: 'drain',
    name: 'Drain',
    dim: 'RESOURCE',
    momentumCost: 2,
    effect: 'drain',
    description: '−2.0 energy to one targeted enemy piece.',
    targetType: 'ENEMY_PIECE',
  },
  {
    id: 'overclock',
    name: 'Overclock',
    dim: 'RESOURCE',
    momentumCost: 3,
    effect: 'overclock',
    description: '2× move range this turn (half energy cost); piece gets no regen next turn.',
    targetType: 'FRIENDLY_PIECE',
  },

  // ===================== RISK JUDGEMENT (RISK) =====================
  {
    id: 'insurance',
    name: 'Insurance',
    dim: 'RISK',
    momentumCost: 1,
    effect: 'insurance',
    description: 'If your next throw is intercepted, the ball is safely retained at its origin.',
    targetType: 'NONE',
  },
  {
    id: 'threaded_pass',
    name: 'Threaded Pass',
    dim: 'RISK',
    momentumCost: 2,
    effect: 'threaded_pass',
    description: 'Your next throw ignores the first enemy control cell it crosses along its path.',
    targetType: 'NONE',
  },
  {
    id: 'steady_hands',
    name: 'Steady Hands',
    dim: 'RISK',
    momentumCost: 2,
    effect: 'steady_hands',
    description: '+50% effective energy (E_att) on interception rolls for your next throw.',
    targetType: 'NONE',
  },
  {
    id: 'long_bomb',
    name: 'Long Bomb',
    dim: 'RISK',
    momentumCost: 2,
    effect: 'long_bomb',
    description: 'Double throw range for half throw energy cost this turn.',
    targetType: 'NONE',
  },
  {
    id: 'no_look_pass',
    name: 'No-Look Pass',
    dim: 'RISK',
    momentumCost: 3,
    swingEnergyCost: 3.0,
    effect: 'no_look_pass',
    description: '⚡ Swing Card: A short throw (<=4 cells) that is completely uninterceptable.',
    targetType: 'NONE',
  },

  // ===================== COMPOSURE (COMP) =====================
  {
    id: 'reset',
    name: 'Reset',
    dim: 'COMPOSURE',
    momentumCost: 1,
    effect: 'reset',
    description: "Abort & re-plan one piece's committed action with full energy restored.",
    targetType: 'FRIENDLY_PIECE',
  },
  {
    id: 'ice_in_the_veins',
    name: 'Ice in the Veins',
    dim: 'COMPOSURE',
    momentumCost: 2,
    effect: 'ice_in_the_veins',
    description: 'Negate the next debuff or disruptive card played against your team.',
    targetType: 'NONE',
  },
  {
    id: 'anchor',
    name: 'Anchor',
    dim: 'COMPOSURE',
    momentumCost: 2,
    effect: 'anchor',
    description: 'Targeted piece becomes immune to forced movement, drain, and bait this turn.',
    targetType: 'FRIENDLY_PIECE',
  },
  {
    id: 'timeout',
    name: 'Timeout',
    dim: 'COMPOSURE',
    momentumCost: 3,
    effect: 'timeout',
    description: 'Gain +15s planning timer refund and +1.5 energy across all pieces.',
    targetType: 'NONE',
  },

  // ===================== TEAMWORK (TEAM) =====================
  {
    id: 'give_and_go',
    name: 'Give-and-Go',
    dim: 'TEAMWORK',
    momentumCost: 1,
    effect: 'give_and_go',
    description: 'After passing the ball, the passer may immediately move 1 cell for free.',
    targetType: 'FRIENDLY_PIECE',
  },
  {
    id: 'spacing',
    name: 'Spacing',
    dim: 'TEAMWORK',
    momentumCost: 2,
    effect: 'spacing',
    description: 'Nudge two chosen teammates 1 cell each toward better formation for free.',
    targetType: 'TWO_FRIENDLY',
  },
  {
    id: 'screen',
    name: 'Screen',
    dim: 'TEAMWORK',
    momentumCost: 2,
    effect: 'screen',
    description: 'A chosen teammate projects +0.5 additional control across all its aura cells.',
    targetType: 'FRIENDLY_PIECE',
  },
  {
    id: 'overlap',
    name: 'Overlap',
    dim: 'TEAMWORK',
    momentumCost: 3,
    effect: 'overlap',
    description: 'Two adjacent teammates merge and double their stacked control fields this turn.',
    targetType: 'TWO_FRIENDLY',
  },

  // ===================== SPATIAL CONTROL (SPAT) =====================
  {
    id: 'bait',
    name: 'Bait',
    dim: 'SPATIAL',
    momentumCost: 1,
    effect: 'bait',
    description: 'Force an enemy piece 1 cell toward a designated empty cell.',
    targetType: 'ENEMY_PIECE',
  },
  {
    id: 'jam_the_lane',
    name: 'Jam the Lane',
    dim: 'SPATIAL',
    momentumCost: 2,
    effect: 'jam_the_lane',
    description: 'Project a temporary 1.0 control cell on any empty cell for one turn.',
    targetType: 'CELL',
  },
  {
    id: 'clamp',
    name: 'Clamp',
    dim: 'SPATIAL',
    momentumCost: 2,
    effect: 'clamp',
    description: "Halve a targeted enemy piece's control aura factors this turn.",
    targetType: 'ENEMY_PIECE',
  },
  {
    id: 'full_court_press',
    name: 'Full-Court Press',
    dim: 'SPATIAL',
    momentumCost: 3,
    swingEnergyCost: 3.0,
    effect: 'full_court_press',
    description: "⚡ Swing Card: All pieces' control fields expand +1 cell radius this turn.",
    targetType: 'NONE',
  },

  // ===================== LEADERSHIP (LEAD) =====================
  {
    id: 'tempo_change',
    name: 'Tempo Change',
    dim: 'LEADERSHIP',
    momentumCost: 1,
    effect: 'tempo_change',
    description: '+1.5 energy to each of your pieces that rested last turn.',
    targetType: 'NONE',
  },
  {
    id: 'set_the_play',
    name: 'Set the Play',
    dim: 'LEADERSHIP',
    momentumCost: 2,
    effect: 'set_the_play',
    description: 'All 4 of your pieces gain +1 cell move range this turn.',
    targetType: 'NONE',
  },
  {
    id: 'rally',
    name: 'Rally',
    dim: 'LEADERSHIP',
    momentumCost: 2,
    effect: 'rally',
    description: 'Whole team gains +25% effective energy on all interception rolls this turn.',
    targetType: 'NONE',
  },
  {
    id: 'surge',
    name: 'Surge',
    dim: 'LEADERSHIP',
    momentumCost: 3,
    swingEnergyCost: 3.0,
    effect: 'surge',
    description: '⚡ Swing Card: Whole team gains +2.0 energy boost and instant tempo dominance.',
    targetType: 'NONE',
  },
];

export const CARDS_BY_ID: Record<string, Card> = ALL_CARDS.reduce((acc, card) => {
  acc[card.id] = card;
  return acc;
}, {} as Record<string, Card>);

export const STAGE_0_MOVE_ENABLER_CARDS = ['overclock', 'set_the_play', 'surge'];

export const STAGE_2_TACTICAL_CARDS = ALL_CARDS
  .map(c => c.id)
  .filter(id => !STAGE_0_MOVE_ENABLER_CARDS.includes(id));
