export interface TutorialStep {
  id: number;
  title: string;
  subtitle: string;
  highlightTestId?: string;
  explanation: string;
  keyTakeaway: string;
  tip?: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 1,
    title: '1. The Sand Court & Captains',
    subtitle: 'The 11×11 Grid & Stationary Captain Goals',
    highlightTestId: 'court-cell-5-10',
    explanation:
      'Welcome to The Captain’s Combine! The match takes place on an 11×11 sand court. Each side commands 6 pieces (12 total on court): 5 uniform court players (numbered 1 to 5 on their jerseys) and 1 Captain standing atop a stationary wooden stool.',
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
    tip: 'Watch your pieces’ stamina meters before staging long sprints across the court!',
  },
  {
    id: 3,
    title: '3. How to Move & Movement Energy Costs',
    subtitle: 'Euclidean Pythagorean Distance: E_move = √(Δc² + Δr²)',
    highlightTestId: 'piece-p_2',
    explanation:
      'To move a piece: click any non-carrier teammate (such as P2 or P3). Reachable empty cells illuminate in blue with their exact energy cost badges (e.g. "-1.0e", "-1.4e"). Click the destination cell to stage an off-ball cut. An animated blue dashed vector arrow and ghost shadow will appear.',
    keyTakeaway:
      'Movement costs exact Euclidean distance: 1 orthogonal cell = 1.0e, 1 diagonal cell = 1.41e (√(1²+1²)), 2 orthogonal cells = 2.0e, etc. Moving consumes energy upon turn execution and resets your rest streak to 0.',
    tip: 'Pieces move in smooth, continuous straight lines. Paths blocked by other pieces are illegal.',
  },
  {
    id: 4,
    title: '4. Ball Possession & "No Running" Rule',
    subtitle: 'Advance Exclusively via Passing',
    highlightTestId: 'piece-p_1',
    explanation:
      'In official Captain’s Ball regulations: "A player holding the ball cannot run with the ball." The active ball-carrier (highlighted with a bright golden pulsing halo) cannot move to other cells. All ball progression across the court is executed exclusively by throwing.',
    keyTakeaway:
      'To advance the ball toward your Captain, you must throw to open teammates who have positioned themselves downcourt.',
    tip: 'The ball carrier is locked in place until a pass is executed or possession changes.',
  },
  {
    id: 5,
    title: '5. How to Throw & Throwing Costs (3:1 Ratio)',
    subtitle: 'E_throw = Distance / 3.0 & 100% Clean Pass Refunds',
    highlightTestId: 'throw-action-toolbar',
    explanation:
      'To throw: click your ball carrier. The Throw Action Toolbar illuminates with eligible receivers and their capture risk. Click a teammate (or their staged destination cell) on the board or toolbar. A golden throw vector arrow and ghost ball will preview the flight path.',
    keyTakeaway:
      'Throwing has a 3:1 energy efficiency ratio over moving: E_throw = Distance / 3.0 (a 6-cell cross-court throw costs only 2.0e instead of 6.0e!). Furthermore, if a throw travels through open air without crossing enemy control, the throw energy is 100% REFUNDED (0.0e cost)!',
    tip: 'Clean passes pay 0.0e stamina, rewarding patient court spacing and open passing lanes.',
  },
  {
    id: 6,
    title: '6. The 1-Step Receiver Cut Rule',
    subtitle: 'Pivot & Catch in the Same Turn (dist ≤ 1.42)',
    highlightTestId: 'stage-throw-btn-p_2',
    explanation:
      'Can a receiver cut and catch in the same turn? Yes, but ONLY up to 1 cell! A throw recipient may take at most 1 orthogonal or diagonal step (max(|Δc|, |Δr|) ≤ 1, distance ≤ 1.42).',
    keyTakeaway:
      'Moving > 1 cell (> 1.42 distance) makes that piece strictly ineligible to receive a pass in that turn. Order of reconciliation: the recipient moves first, then the throw trajectory evaluates at its new destination cell!',
    tip: 'Use 1-step cuts to slip past defending front-liners right before catching the ball.',
  },
  {
    id: 7,
    title: '7. Area-of-Control & Interceptions',
    subtitle: 'Escape Velocity & Defender Lunge Sprints',
    highlightTestId: 'control-shading-layer',
    explanation:
      'Every piece projects a watercolor Area-of-Control (AoC) wash onto adjacent cells. When a throw crosses an enemy AoC, an interception check occurs. Your thrower’s remaining stamina (E_att = E_carrier - E_throw) acts as kinetic escape velocity against the defender’s stamina (E_def).',
    keyTakeaway:
      'Rested throwers (8.0e+) face low risk (~10%), while tired throwers face heavy risk (>80%). If intercepted, the defender captures the ball and immediately lunges to the interception cell, paying the movement energy cost!',
    tip: 'Avoid throwing across dense clusters of red pirate AoC zones with low thrower energy.',
  },
  {
    id: 8,
    title: '8. Scoring & Post-Goal Baseline Restart',
    subtitle: 'Mandatory Midfield Court Pass Regulation',
    highlightTestId: 'restart-thrower-toolbar',
    explanation:
      'Completing a pass to your Captain scores 1 Goal! After a goal, possession is awarded to the conceding team at their baseline. By official tournament regulations, the restarting team MUST complete at least 1 mandatory pass to an active court player (P1–P5) before shooting to Captain.',
    keyTakeaway:
      'Direct baseline-to-Captain passes are prohibited. The initial inbound restart pass to your court player is protected from all interceptions (100% Clean)!',
    tip: 'Use the "Baseline Restart Thrower" toolbar to select which player inbounds the ball.',
  },
  {
    id: 9,
    title: '9. Compounding Rest & Energy Recovery',
    subtitle: 'E_regen = 1.0e + restStreak (Full Recharge in 3 Turns)',
    highlightTestId: 'rest-badge-p_3',
    explanation:
      'Pieces that remain stationary without moving accumulate a compounding rest streak (+{1 + streak}). Resting energy regenerates exponentially: Turn 1 of rest gives +2.0e, Turn 2 gives +3.0e, Turn 3 gives +4.0e.',
    keyTakeaway:
      'An exhausted piece (2.0e) fully recharges to 10.0e in just 3 stationary turns! Moving immediately resets the rest streak back to 0.',
    tip: 'Stationary defenders with high stamina project formidable interception walls in passing corridors.',
  },
  {
    id: 10,
    title: '10. Momentum Doubloons & 26 Tactical Cards',
    subtitle: 'The 6 Aptitude Dimensions & 3-Card Hand Limit',
    highlightTestId: 'momentum-doubloons-counter',
    explanation:
      'You earn Momentum Doubloons (+1M/turn, +2M on Captain assists, +2M to +4M on interceptions) to deploy 26 tactical cards across 6 dimensions: RESOURCE, RISK, COMPOSURE, TEAMWORK, SPATIAL, and LEADERSHIP.',
    keyTakeaway:
      'Hand limit is strictly 3 cards. If holding > 3 cards, you must deploy or discard down to 3 cards before you can commit your turn. Powerful Swing Cards (⚡) cost 3M and deduct 3.0e stamina from your highest-energy piece.',
    tip: 'Click Discard anytime on excess cards to cycle through your deck for key plays!',
  },
  {
    id: 11,
    title: '11. Direct In-UI Card Targeting & Buff Badges',
    subtitle: 'Emerald Buffs, Crimson Debuffs & Active Enchantments Bar',
    highlightTestId: 'active-tactical-buffs-bar',
    explanation:
      'Clicking PLAY on a targeted card arms in-UI targeting. Click your intended target piece or cell directly on the court. Active buffs display glowing emerald halos and duration counters (e.g. "Slow Burn (3T)", "Anchor (1T)"), while debuffs display crimson warning halos (e.g. "Drain (-2.0e)", "Clamp (-50% AoC)").',
    keyTakeaway:
      'Active team enchantments (such as Insurance, Threaded Pass, Steady Hands, Long Bomb, Rally) appear in the Active Tactical Buffs bar directly above the court!',
    tip: 'Buff durations tick down each turn automatically and expire when finished.',
  },
  {
    id: 12,
    title: '12. Holding Fouls & Opponent Tactical Action Feed',
    subtitle: 'Referee Double-Blast Whistle & Live Play-by-Play Commentary',
    highlightTestId: 'opponent-tactical-feed',
    explanation:
      'If your ball-carrier ends a turn without throwing the ball, a holding foul turnover occurs and the referee blows a double-blast pea whistle. Follow every AI movement, pass, and card play in the live Opponent Tactical Action Feed!',
    keyTakeaway:
      'Always execute a pass or throw before clicking "Commit & End Player Turn" to avoid turnovers and maintain tactical pressure.',
    tip: 'Filter the live telemetry feed anytime by "All Actions", "AI Only", or "Buffs & Debuffs"!',
  },
];
