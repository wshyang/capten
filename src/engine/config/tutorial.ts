import type { GameState } from '../types';

/**
 * Scripted tutorial walkthrough definitions.
 *
 * Each step describes:
 *  - What UI element to highlight (`highlightTestId`).
 *  - An OPTIONAL specific click the user should perform to advance the step
 *    (`clickTarget`). When present, the "Next" button is gated until that
 *    exact element is clicked. A visual pointer arrow is drawn to it.
 *
 * `highlightTestId` / `clickTarget.testId` may be a static string OR a function
 * that receives the live GameState and returns the correct testId. This lets us
 * resolve dynamic pieces like "whichever unit currently holds the ball" instead
 * of hard-coding `piece-p_1`.
 */
export type TestIdResolver = string | ((state: GameState) => string | undefined);

export interface TutorialClickTarget {
  /** DOM data-testid of the element the user must click to advance. */
  testId: TestIdResolver;
  /** Short prompt shown in the popup e.g. "Click on P2 now". */
  prompt: string;
  /** Optional short label rendered in the pointer badge on the board. */
  pointerLabel?: string;
}

export interface TutorialStep {
  id: number;
  title: string;
  subtitle: string;
  /** Element to visually highlight (dashed oval). */
  highlightTestId?: TestIdResolver;
  /** Optional required click to advance this step. */
  clickTarget?: TutorialClickTarget;
  explanation: string;
  keyTakeaway: string;
  tip?: string;
}

/** Resolve a TestIdResolver against the current game state. */
export function resolveTestId(
  resolver: TestIdResolver | undefined,
  state?: GameState
): string | undefined {
  if (!resolver) return undefined;
  if (typeof resolver === 'string') return resolver;
  try {
    return resolver(state as GameState);
  } catch {
    return undefined;
  }
}

/** Locate the ID of the piece currently carrying the ball, if any. */
function carrierPieceId(state?: GameState): string | undefined {
  if (!state) return undefined;
  const carrier = state.pieces.find(p => p.hasBall);
  return carrier?.id;
}

/** Locate a specific non-carrier PLAYER piece for the "click to move" step. */
function moveDemoPieceId(state?: GameState): string | undefined {
  if (!state) return 'piece-p_2';
  const carrierId = carrierPieceId(state);
  // Prefer P2..P5 that is NOT the carrier and NOT a captain.
  const candidate = state.pieces.find(
    p => p.side === 'PLAYER' && !p.isCaptain && p.id !== carrierId
  );
  return candidate ? `piece-${candidate.id}` : 'piece-p_2';
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: '1. The Sand Court & Captains',
    subtitle: 'The 11×11 Grid & Stationary Captain Goals',
    highlightTestId: 'court-cell-5-10',
    explanation:
      "Welcome to The Captain's Combine! The match takes place on an 11×11 sand court. Each side commands 6 pieces (12 total on court): 5 uniform court players (numbered 1 to 5 on their jerseys) and 1 Captain standing atop a stationary wooden stool.",
    keyTakeaway:
      'Player Blue scores by passing the ball to the Player Captain at (5, 10). AI Red Pirates score by passing to the AI Captain at (5, 0). Captains never leave their stools!',
    tip: 'Captains are stationary receiving targets and do not move on the court.',
  },
  {
    id: 2,
    title: '2. The Energy Pool (10.0e Stamina)',
    subtitle: 'Normalized Resource & Stamina Meter',
    highlightTestId: 'energy-gauge-p_1',
    explanation:
      'Every piece operates on a normalized stamina pool starting at 10.0e (clamped to max 10.0e). Below each character is an energy gauge with a live numeric readout. High stamina provides sprint capacity and passing escape velocity; low stamina leaves pieces vulnerable to exhaustion and interceptions.',
    keyTakeaway:
      'Energy is consumed by movement, throws across enemy zones, defender interception lunges, and tactical Swing cards. Color coding: Green (>50%), Amber (25–50%), Red (<25%).',
    tip: 'Watch your pieces\u2019 stamina meters before staging long sprints across the court!',
  },
  {
    id: 3,
    title: '3. Selecting a Player to Move',
    subtitle: 'Click any non-carrier teammate first',
    // Highlight & require a click on a real non-carrier player (not hard-coded p_2).
    highlightTestId: (s) => moveDemoPieceId(s),
    clickTarget: {
      testId: (s) => moveDemoPieceId(s),
      prompt: 'Click on this player to select them for movement.',
      pointerLabel: 'CLICK ME',
    },
    explanation:
      "To move a piece: click any non-carrier teammate. Once selected, every legal destination cell will illuminate in blue and show its exact energy cost (e.g. \"-1.0e\", \"-1.4e\").",
    keyTakeaway:
      'Movement costs exact Euclidean distance: 1 orthogonal cell = 1.0e, 1 diagonal cell = 1.41e. Moving consumes energy on turn execution and resets rest streak to 0.',
    tip: 'The ball-carrier itself cannot be moved this way — passing is the only legal way to advance the ball.',
  },
  {
    id: 4,
    title: '4. Staging a Destination Cell',
    subtitle: 'Click any highlighted blue cell to stage the move',
    // We highlight one specific reachable cell so the user has a concrete target.
    highlightTestId: 'court-cell-5-5',
    clickTarget: {
      testId: 'court-cell-5-5',
      prompt: 'Click cell (5, 5) to stage a movement to the centre of the court.',
      pointerLabel: 'CLICK HERE',
    },
    explanation:
      'After a player is selected, the reachable cells light up blue with an energy-cost badge. Click one to stage the move. A blue dashed vector and ghost shadow will appear until you commit the turn.',
    keyTakeaway:
      'Nothing happens until you press "Commit & End Player Turn" — you can freely re-stage or unstage moves before that.',
    tip: 'Paths that pass through another piece are illegal and will not be offered.',
  },
  {
    id: 5,
    title: '5. Ball Possession & "No Running"',
    subtitle: 'Advance the ball exclusively by throwing',
    // Highlight the actual carrier (whoever it is right now) — not always p_1.
    highlightTestId: (s) => {
      const id = carrierPieceId(s);
      return id ? `piece-${id}` : 'piece-p_1';
    },
    explanation:
      'In Captain\u2019s Ball, a player holding the ball cannot run with it. The active ball-carrier (highlighted with a bright golden pulsing halo) is locked in place until it throws or loses possession.',
    keyTakeaway:
      'To advance the ball toward your Captain, throw to open teammates who have positioned themselves downcourt.',
    tip: "If no PLAYER piece holds the ball right now, the halo will appear once the jump-ball resolves.",
  },
  {
    id: 6,
    title: '6. Throwing to a Teammate',
    subtitle: 'Click the ball carrier to see eligible receivers',
    highlightTestId: (s) => {
      const id = carrierPieceId(s);
      return id ? `piece-${id}` : 'throw-action-toolbar';
    },
    clickTarget: {
      testId: (s) => {
        const id = carrierPieceId(s);
        return id ? `piece-${id}` : undefined;
      },
      prompt: 'Click on your ball carrier to reveal throw targets.',
      pointerLabel: 'CLICK CARRIER',
    },
    explanation:
      'Clicking the ball carrier reveals the Throw Action Toolbar — every eligible receiver and their capture risk. Click a teammate on the board or a chip in the toolbar to preview the throw.',
    keyTakeaway:
      'Throwing uses exponential cost scaling: E_throw = (Distance^1.6) / 3.0. Passes through open air (no defender AoC) are 100% refunded!',
    tip: 'Short seam-cutting passes (1–3 cells) slip through gaps for near-zero cost.',
  },
  {
    id: 7,
    title: '7. The 1-Step Receiver Cut Rule',
    subtitle: 'Pivot & catch in the same turn (dist ≤ 1.42)',
    highlightTestId: 'stage-throw-btn-p_2',
    explanation:
      'A throw recipient may take at most 1 orthogonal or diagonal step (max(|Δc|, |Δr|) ≤ 1, distance ≤ 1.42) before catching. Longer moves make the piece ineligible to receive that turn.',
    keyTakeaway:
      'The recipient moves FIRST, then the throw trajectory evaluates at its new cell.',
    tip: 'Use 1-step cuts to slip past a defender right before catching.',
  },
  {
    id: 8,
    title: '8. Area-of-Control & Interceptions',
    subtitle: 'Extended zone defence & multiplicative risk',
    highlightTestId: 'control-shading-layer',
    explanation:
      'Every defender projects an Area-of-Control (AoC) wash onto surrounding cells. When a throw crosses enemy AoC, interception checks occur multiplicatively at each flight-path cell. Your thrower\u2019s remaining stamina acts as escape velocity against defender stamina.',
    keyTakeaway:
      'Long passes across mid-court face 55%-70% capture risk. Prefer HIGH_LOB throws, short seam cuts, or tactical cards.',
    tip: 'If intercepted, the defender captures the ball and lunges to the interception cell.',
  },
  {
    id: 9,
    title: '9. Scoring & Post-Goal Restart',
    subtitle: 'Mandatory midfield pass rule',
    highlightTestId: 'restart-thrower-toolbar',
    explanation:
      'Completing a pass to your Captain scores 1 goal! After a goal, possession is awarded to the conceding team at their baseline. The restarting team MUST complete at least 1 pass to an active court player (P1–P5) before shooting to the Captain.',
    keyTakeaway:
      'Direct baseline-to-Captain passes are prohibited. The initial inbound restart pass is protected from all interceptions.',
    tip: 'Use the "Baseline Restart Thrower" toolbar to pick which player inbounds the ball.',
  },
  {
    id: 10,
    title: '10. Compounding Rest & Recovery',
    subtitle: 'Stationary pieces regenerate exponentially',
    highlightTestId: 'rest-badge-p_3',
    explanation:
      'Pieces that remain stationary accumulate a rest streak (+{1 + streak}). Turn 1 of rest gives +2.0e, Turn 2 +3.0e, Turn 3 +4.0e — a fully exhausted piece recharges in 3 turns.',
    keyTakeaway:
      'Moving immediately resets the rest streak back to 0.',
    tip: 'Stationary defenders with high stamina project formidable interception walls.',
  },
  {
    id: 11,
    title: '11. Momentum & Tactical Cards',
    subtitle: '3-card hand limit • 6 aptitude dimensions',
    highlightTestId: 'momentum-doubloons-counter',
    explanation:
      'You earn Momentum Doubloons (+1M/turn, +2M on Captain assists, +2M to +4M on interceptions) to deploy 26 tactical cards across 6 dimensions.',
    keyTakeaway:
      'Hand limit is strictly 3 cards. If holding more, deploy or discard before ending your turn. Swing Cards (⚡) cost 3M and drain 3.0e from your highest-energy piece.',
    tip: 'Click Discard on unwanted cards to cycle your deck.',
  },
  {
    id: 12,
    title: '12. Committing the Turn',
    subtitle: 'Press Commit to resolve all staged actions',
    highlightTestId: 'commit-turn-button',
    clickTarget: {
      testId: 'commit-turn-button',
      prompt: 'Press "Commit & End Player Turn" when you are done planning.',
      pointerLabel: 'COMMIT',
    },
    explanation:
      "Once you're satisfied with your staged moves, throws, and cards, press the Commit button. Every staged action resolves in engine order, then the AI takes its turn.",
    keyTakeaway:
      "If your ball-carrier ends the turn without throwing, a holding foul is called and possession turns over. Always pass before committing when carrying!",
    tip: 'Filter the Opponent Tactical Action Feed at the bottom to follow the AI\u2019s counter-play.',
  },
];
